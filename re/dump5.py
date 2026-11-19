import sys,struct,numpy as np
sys.path.insert(0,'/home/gautier/SynologyDrive/code/current/demoports/frs_tz13/re')
import harness as H,emucore as E
from emucore import *
d4=lambda a:struct.unpack('<i',bytes(mu.mem_read(a,4)))[0]
M=[];D=[]
def hook(uc,a,sz,_):
    ret=d4(ireg('ESP'))
    if ret!=0x10299c: return
    M.append([d4(0x231f88),H.irqs[0]]); D.append(np.frombuffer(bytes(mu.mem_read(0x200e54,0x1840)),np.uint8).copy())
mu.hook_add(UC_HOOK_CODE,hook,begin=0x100340,end=0x100340)
mu.reg_write(UC_X86_REG_EIP,E.ENTRY)
H.run_until(float(sys.argv[2]))
np.savez_compressed(sys.argv[1],meta=np.array(M),mem=np.array(D)); print('done',len(M))
