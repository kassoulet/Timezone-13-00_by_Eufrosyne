"""le.py - parse DEMO.EXE's LE image (PMODE/W 1.20 does not compress it) and load objects with fixups applied.
 load(base_for_obj) -> {objno: (base, bytearray)}"""
import struct
D=open(__file__.rsplit('/',1)[0]+'/../TZ1300.EXE','rb').read()
LE=D.index(b'LE\0\0\0\0'); H=struct.unpack_from('<2sBBIHHIIIIIIIIIIIIIIIIIIIIIII',D,LE)
def u(o): return struct.unpack_from('<I',D,LE+o)[0]
NP=u(0x14);EIPO=u(0x18);EIP=u(0x1c);ESPO=u(0x20);ESP=u(0x24);PS=u(0x28);LAST=u(0x2c)
OBJT=u(0x40);NOBJ=u(0x44);PMAP=u(0x48);FPT=u(0x68);FRT=u(0x6c);IMT=u(0x70);NIM=u(0x74);IPT=u(0x78);DATA=u(0x80)
objs=[]
for i in range(NOBJ):
    vs,base,fl,pi,np_,_=struct.unpack_from('<6I',D,LE+OBJT+24*i); objs.append(dict(size=vs,base=base,flags=fl,first=pi,n=np_))
def load(bases):
    """bases: list of load addresses per object; returns bytearrays and applies fixups (offset/16:32/rel32 within the same flat model)"""
    mem=[bytearray(o['size']+0x1000) for o in objs]
    for oi,o in enumerate(objs):
        for k in range(o['n']):
            pg=o['first']-1+k; off=DATA+pg*PS; ln=PS if pg<NP-1 else LAST
            mem[oi][k*PS:k*PS+ln]=D[off:off+ln]
    # fixups
    fpt=[u(FPT+4*i) for i in range(NP+1)]
    unk=set()
    for oi,o in enumerate(objs):
        for k in range(o['n']):
            pg=o['first']-1+k; p=LE+FRT+fpt[pg]; end=LE+FRT+fpt[pg+1]
            while p<end:
                src,flg=D[p],D[p+1]; p+=2
                st=struct.unpack_from('<h',D,p)[0]; p+=2
                if flg&3!=0: unk.add(('tgt',flg&3)); break
                if flg&0x40: tob=struct.unpack_from('<H',D,p)[0]; p+=2
                else: tob=D[p]; p+=1
                if src&0xf in(7,8): # 32-bit offset (7) / self-rel 32 (8)
                    toff=struct.unpack_from('<I',D,p)[0] if flg&0x10 else struct.unpack_from('<H',D,p)[0]; p+=4 if flg&0x10 else 2
                    v=bases[tob-1]+toff; a=k*PS+st
                    if src&0xf==8: v=v-(bases[oi]+a+4)
                    if 0<=a<len(mem[oi])-4: struct.pack_into('<I',mem[oi],a,v&0xffffffff)
                elif src&0xf==6: # 16:32 ptr
                    toff=struct.unpack_from('<I',D,p)[0] if flg&0x10 else struct.unpack_from('<H',D,p)[0]; p+=4 if flg&0x10 else 2
                    a=k*PS+st; struct.pack_into('<I',mem[oi],a,(bases[tob-1]+toff)&0xffffffff) # selector part left to the program
                    unk.add(('ptr16:32',tob))
                elif src&0xf==2: unk.add(('sel',tob))
                else: unk.add(('src',src&0xf)); break
    return mem,unk
if __name__=='__main__':
    print('pages',NP,'eip obj',EIPO,hex(EIP),'esp obj',ESPO,hex(ESP),'fix size',hex(u(0x30)))
    for o in objs: print({k:hex(v) for k,v in o.items()})
    m,unk=load([0x100000,0x200000][:NOBJ]); print(unk)
