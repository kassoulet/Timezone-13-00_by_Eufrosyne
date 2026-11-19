"""mk_sincos.py [MEM.bin]: re/sincos.i32 = the engine's sin/cos tables (4096 x int32 each: int(sin(a)*32768) and int(cos(a)*32768), a += double 0x3f5921fb54524552 per entry, as 0x102570 builds them).
With MEM.bin (obj2 dump of the emulator after init, e.g. re/dump_mem.py output) it first asserts the tables at 0x333210 / 0x300110 are identical. tools/checksin.mjs compares Math.sin/cos against the file. Run from re/."""
import sys,math,struct
step=struct.unpack('<d',struct.pack('<Q',0x3f5921fb54524552))[0]; a=0.0; S=[];C=[]
for i in range(4096): S.append(int(math.sin(a)*32768)); C.append(int(math.cos(a)*32768)); a+=step
if len(sys.argv)>1:
    m=open(sys.argv[1],'rb').read(); assert list(struct.unpack_from('<4096i',m,0x333210-0x200000))==S and list(struct.unpack_from('<4096i',m,0x300110-0x200000))==C; print('identical to the emulator tables')
open('sincos.i32','wb').write(struct.pack('<4096i',*S)+struct.pack('<4096i',*C))
