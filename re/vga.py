"""vga.py - minimal VGA (mode 13h + unchained mode X, planar write modes 0-2, latches, DAC, CRTC start/offset/line-compare) for Unicorn.
 install(mu, clock) : clock() -> virtual time in seconds (drives the 0x3da retrace bit and the PIT latch)."""
import struct,sys,os
from unicorn import *
from unicorn.x86_const import *
planes=[bytearray(0x10000) for _ in range(4)]
seq=[0]*8; gc=[0]*16; crtc=[0]*32; atc=[0]*32
st=dict(seqi=0,gci=0,crtci=0,atci=0,atcff=0,dacw=0,dacr=0,dacc=0,mode13=True,pitlo=None,pitrl=0x10000,latch=[0]*4,pitlatch=None,pitrd=0)
dac=bytearray(768)
log=[]
io=[0]   # in/out count: the harness charges IO_US of virtual time per port access (ISA bus ~1us)
def logw(*a):
    if len(log)<400: log.append(a)
def _wr(off,val):
    off&=0xffff
    m=seq[4]
    if m&8:   # chain-4
        planes[off&3][off>>2]=val; return
    if m&4==0:  # odd/even (ignore) -> treat as planar
        pass
    wm=gc[5]&3; ms=seq[2]&15
    bm=gc[8]; sr=gc[0]; en=gc[1]; fn=(gc[3]>>3)&3; rot=gc[3]&7; lat=st['latch']
    for p in range(4):
        if not ms>>p&1: continue
        if wm==1: planes[p][off]=lat[p]; continue
        if wm==0:
            v=((val>>rot)|(val<<(8-rot)))&0xff if rot else val
            if en>>p&1: v=0xff if sr>>p&1 else 0
        elif wm==2: v=0xff if val>>p&1 else 0
        else: v=0
        if wm!=1:
            if fn==1: v&=lat[p]
            elif fn==2: v|=lat[p]
            elif fn==3: v^=lat[p]
            b=bm if wm!=3 else bm&val
            v=(v&b)|(lat[p]&~b&0xff)
            planes[p][off]=v&0xff
def mmio_w(uc,off,size,val,_):
    if seq[4]&8:    # chain-4 fast path (mode 13h): cpu byte a -> plane a&3, offset a>>2
        for i in range(size):
            a=(off+i)&0xffff; planes[a&3][a>>2]=(val>>(8*i))&0xff
        return
    if gc[5]&3==0 and gc[1]==0 and gc[3]==0 and gc[8]==0xff:    # unchained, write mode 0, no set/reset/rotate/logic/bitmask
        ms=seq[2]&15
        for i in range(size):
            o=(off+i)&0xffff; v=(val>>(8*i))&0xff
            for p in range(4):
                if ms>>p&1: planes[p][o]=v
        return
    for i in range(size): _wr(off+i,(val>>(8*i))&0xff)
def mmio_r(uc,off,size,_):
    v=0
    for i in range(size):
        o=(off+i)&0xffff
        if seq[4]&8: b=planes[o&3][o>>2]
        else:
            st['latch']=[planes[p][o] for p in range(4)]; b=planes[gc[4]&3][o]
        v|=b<<(8*i)
    return v
def pit_counter(t):
    r=st['pitrl'] or 0x10000
    return int(r-((t*1193182.0)%r))&0xffff
def install(mu,clock):
    mu.mmio_map(0xa0000,0x10000,mmio_r,None,mmio_w,None)
    def _in(uc,port,size,_):
        io[0]+=1
        if port==0x3da:
            t=clock(); ph=(t*70.0)%1.0     # 70 Hz; vertical retrace = last 8 % of the frame; display enable inverted outside
            r=0
            if ph>0.92: r|=8
            if ph>0.92 or (ph*400)%1.0>0.9: r|=1
            st['atcff']=0; return r
        if port==0x40:
            c=st['pitlatch'] if st['pitlatch'] is not None else pit_counter(clock())
            st['pitrd']^=1
            if st['pitrd']: return c&0xff
            st['pitlatch']=None; return c>>8
        if port==0x3c5: return seq[st['seqi']&7]
        if port==0x3cf: return gc[st['gci']&15]
        if port==0x3d5: return crtc[st['crtci']&31]
        if port==0x3c9:
            v=dac[st['dacr']]; st['dacr']=(st['dacr']+1)%768; return v
        if port==0x60: return 0
        return 0
    def _out(uc,port,size,val,_):
        io[0]+=1
        if size==2 and port in(0x3c4,0x3ce,0x3d4):
            _out(uc,port,1,val&0xff,_); _out(uc,port+1,1,val>>8,_); return
        if port==0x3c4: st['seqi']=val&7
        elif port==0x3c5:
            seq[st['seqi']&7]=val&0xff
            if st['seqi']==4: logw('seq4',val)
        elif port==0x3ce: st['gci']=val&15
        elif port==0x3cf: gc[st['gci']]=val&0xff; logw('gc%d'%st['gci'],val)
        elif port==0x3d4: st['crtci']=val&31
        elif port==0x3d5:
            crtc[st['crtci']]=val&0xff
            if st['crtci'] not in(0xc,0xd): logw('crtc%x'%st['crtci'],val)
        elif port==0x3c8: st['dacw']=(val&0xff)*3
        elif port==0x3c7: st['dacr']=(val&0xff)*3
        elif port==0x3c9:
            dac[st['dacw']%768]=val&0x3f; st['dacw']+=1
        elif port==0x3c0:
            if st['atcff']==0: st['atci']=val&0x1f
            else: atc[st['atci']]=val&0xff
            st['atcff']^=1
        elif port==0x3c2: logw('misc',val)
        elif port==0x43:
            if val&0x30==0: st['pitlatch']=pit_counter(clock()); st['pitrd']=0
            elif val==0x34: st['pitlo']=None
        elif port==0x40:
            if st['pitlo'] is None: st['pitlo']=val&0xff
            else: st['pitrl']=(st['pitlo']|(val&0xff)<<8)
    mu.hook_add(UC_HOOK_INSN,_in,None,1,0,UC_X86_INS_IN)
    mu.hook_add(UC_HOOK_INSN,_out,None,1,0,UC_X86_INS_OUT)
def int10(ah,al,eax,mu=None):
    return False
def reset_mode13():
    for p in planes: p[:]=bytes(0x10000)
    seq[:]=[0,3,0xf,0,0xe,0,0,0]; gc[:]=[0]*16; gc[5]=0x40; gc[8]=0xff
    crtc[:]=[0]*32; crtc[0x13]=0x28; crtc[0x14]=0x40; crtc[0x17]=0xa3; crtc[9]=0x41; crtc[0x12]=0x8f; crtc[7]=0x1f; crtc[0x18]=0xff
def frame_idx():
    """(H,320) uint8 palette indices of what the CRT shows (see frame()) and the DAC (768 B, 6-bit)"""
    import numpy as np
    start=(crtc[0xc]<<8|crtc[0xd]); stride=crtc[0x13]*2
    vde=(crtc[0x12]|((crtc[7]>>1&1)<<8)|((crtc[7]>>6&1)<<9))+1; sl=(crtc[9]&0x1f)+1; h=vde if sl==1 else vde//sl
    xs=np.arange(320); P=np.array(planes); out=np.zeros((h,320),np.uint8)
    for y in range(h): out[y]=P[xs&3,(start+y*stride+(xs>>2))&0xffff]
    return out,bytes(dac)
def frame():
    """RGB 320xH image (H = visible lines, scan doubled when max-scanline=1) of what the CRT shows now. returns (H,W,3) bytes"""
    import numpy as np
    pal=np.frombuffer(bytes(dac),dtype=np.uint8).reshape(256,3).astype(np.uint16)
    pal=((pal<<2)|(pal>>4)).astype(np.uint8)
    start=(crtc[0xc]<<8|crtc[0xd])
    stride=crtc[0x13]*2
    if crtc[0x14]&0x40 and seq[4]&8: stride=crtc[0x13]*8//4*1   # dword mode: offset counts dwords (4 bytes/step) -> bytes per plane row = offset*2
    stride=crtc[0x13]*2
    vde=(crtc[0x12]|((crtc[7]>>1&1)<<8)|((crtc[7]>>6&1)<<9))+1
    sl=(crtc[9]&0x1f)+1
    h=vde//sl if sl>0 else vde
    if sl==1: h=vde
    lc=(crtc[0x18]|((crtc[7]>>4&1)<<8)|((crtc[9]>>6&1)<<9))//sl if True else 0
    pan=(atc[0x13]&7)//2 if atc[0x10]&0x20==0 else 0
    out=np.zeros((h,320,3),np.uint8)
    xs=np.arange(320)
    P=np.array(planes)
    for y in range(h):
        base=0 if (lc<h and y>lc) else start
        yy=y if base==start else y-lc-1
        a=(base+yy*stride+(xs>>2))&0xffff
        out[y]=pal[P[xs&3,a]]
    return out
