"""harness.py - run the ORIGINAL demo (LE objects loaded by le.py) under Unicorn with a virtual clock.
 Clock: virtual time = instructions executed * NS_PER_INSN (chunks of CHUNK instructions); IRQ0 (the demo's own timer hook installed with
 int 21h/25h) is injected between chunks according to the PIT reload value, 0x3da retrace is 70 Hz of virtual time; no sound card is found
 (SB/GUS probes fail), so the music player only supplies timing.
 usage: python3 harness.py OUTDIR T0 T1 STEP   -> PNG frames (320xH, native pixel size) tNNNN.NN.png"""
import sys,os,struct,time
import emucore as E,vga
from emucore import *
NS_PER_INSN=float(os.environ.get('NS',20))
CHUNK=int(os.environ.get('CHUNK',2000))
insn=[0]
IO_US=float(os.environ.get('IO_US',1.0))
def clock(): return insn[0]*NS_PER_INSN*1e-9+vga.io[0]*IO_US*1e-6
vga.install(mu,clock)
vga.reset_mode13()
def int10(ah,al,eax):
    if ah==0:
        m=al&0x7f
        print('SETMODE %x t=%.3f'%(m,clock()))
        if m==0x13: vga.reset_mode13()
        return True
    if ah==0x10:
        if al==0x10: i=ireg('EBX')&0xff; vga.dac[i*3:i*3+3]=bytes([ireg('EDX')>>8&0x3f,ireg('ECX')>>8&0x3f,ireg('ECX')&0x3f]); return True
        if al==0x12:
            i=ireg('EBX')&0xffff; n=ireg('ECX')&0xffff; a=ireg('EDX'); b=bytes(mu.mem_read(a,n*3)); vga.dac[i*3:i*3+3*n]=bytes(x&0x3f for x in b); return True
        return True
    return False
E.INT10[0]=int10
mu.reg_write(UC_X86_REG_ES,0x24)
irqs=[0]; pending=[0.0]
def pit_period(): return (vga.st['pitrl'] or 0x10000)/1193182.0
nextirq=[None]
def inject(h):
    esp=ireg('ESP'); eip=ireg('EIP'); fl=ireg('EFLAGS')
    for v in (fl,0x08,eip):
        esp-=4; mu.mem_write(esp,struct.pack('<I',v&0xffffffff))
    w('ESP',esp); mu.reg_write(UC_X86_REG_EIP,h); mu.reg_write(UC_X86_REG_EFLAGS,fl&~0x200)
keysent=[0]
def step_one():
    if not keysent[0] and clock()>0.03: keysent[0]=1; E.getch_q.extend([0,0x50]*12+[13])   # MIDAS config: 12x Down -> 'No Sound', Enter
    eip=ireg('EIP')
    try: mu.emu_start(eip,0,count=CHUNK)
    except UcError as e: print('ERR',e,hex(ireg('EIP'))); return False
    insn[0]+=CHUNK
    if E.EXITED[0]: print('program exited (int 21h/4Ch) at t=%.2f'%clock()); return False
    mu.mem_write(0x46c,struct.pack('<I',int(clock()*18.2065)))
    h=E.vec.get(8)
    if h:
        t=clock()
        if nextirq[0] is None: nextirq[0]=t+pit_period()
        if t>=nextirq[0] and ireg('EFLAGS')&0x200:
            nextirq[0]=max(nextirq[0]+pit_period(),t-pit_period()*4) if t-nextirq[0]<pit_period()*4 else t+pit_period()
            irqs[0]+=1; inject(h)
    return True
def run_until(tend,on_frame=None,fps=70.0):
    nf=[int(clock()*fps)]
    while clock()<tend:
        if not step_one(): return False
        f=int(clock()*fps)
        if f!=nf[0]:
            nf[0]=f
            if on_frame: on_frame(clock())
    return True
def POS():
    r=lambda a:struct.unpack('<i',bytes(mu.mem_read(a,4)))[0]
    return (r(0x231f68),r(0x231f84),r(0x231f7c),r(0x231f70),r(0x231f74))   # (module 1/2, order, row, fade cmd, fade level) as last polled by 0x100340/0x100370
def checkpoint(path):
    """snapshot of guest RAM (non-zero pages of 0..32 MB + DPMI arena) + host-side state (VGA, clock, IRQ phase, vectors, file positions)"""
    E.SNAP_RANGES[:]=[(0,0xa0000),(0xb0000,0x2000000-0xb0000)]
    mu.mem_write(0xa0000,bytes(0x10000)) if False else None
    E.save_snapshot(path,extra=dict(insn=insn[0],io=vga.io[0],irqs=irqs[0],nextirq=nextirq[0],vec=dict(E.vec),keysent=keysent[0],keyq=list(E.keyq),seg={r:ireg(r) for r in ('CS','DS','ES','SS','FS','GS')},
        vga=dict(planes=[bytes(p) for p in vga.planes],seq=list(vga.seq),gc=list(vga.gc),crtc=list(vga.crtc),atc=list(vga.atc),dac=bytes(vga.dac),st=dict(vga.st))))
def restore(path):
    st=E.load_snapshot(path); x=st['extra']
    insn[0]=x['insn']; vga.io[0]=x['io']; irqs[0]=x['irqs']; nextirq[0]=x['nextirq']; E.vec.clear(); E.vec.update(x['vec']); keysent[0]=x['keysent']; E.keyq[:]=x['keyq']
    v=x['vga']
    for p,b in zip(vga.planes,v['planes']): p[:]=b
    vga.seq[:]=v['seq']; vga.gc[:]=v['gc']; vga.crtc[:]=v['crtc']; vga.atc[:]=v['atc']; vga.dac[:]=v['dac']; vga.st.update(v['st'])
    for r,v in x['seg'].items(): w(r,v)
    mu.reg_write(UC_X86_REG_EIP,st['regs']['EIP'])
if __name__=='__main__':
    from PIL import Image
    out=sys.argv[1]; t0,t1,step=map(float,sys.argv[2:5]); os.makedirs(out,exist_ok=True)
    if os.environ.get('RESUME'): restore(os.environ['RESUME'])
    else: mu.reg_write(UC_X86_REG_EIP,E.ENTRY)
    CK=os.environ.get('CKPT'); CKN=int(os.environ.get('CKN',10)); lastck=[-1]
    nxt=[t0]; T=time.time()
    def cb(t):
        if CK and int(t)%CKN==0 and int(t)>0 and int(t)!=lastck[0]: lastck[0]=int(t); os.makedirs(CK,exist_ok=True); checkpoint('%s/ck%04d.bin'%(CK,int(t)))
        if t>=nxt[0]:
            Image.fromarray(vga.frame()).save('%s/t%07.2f.png'%(out,t)); nxt[0]+=step
            print('%.2f irqs=%d eip=%x pos=%s (%.0fs host)'%(t,irqs[0],ireg('EIP'),POS(),time.time()-T),flush=True)
    run_until(t1,cb)
    for l in vga.log[:60]: print(l)
