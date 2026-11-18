#!/usr/bin/env python3
"""oracle.py OUT.npz TMAX: per-frame ORACLE. Hooks 0x100340 (= 'poll MIDAS position', called at the end of every effect frame, after the frame is in VGA memory,
and also from the timer callback 0x100370 -> skipped by return address 0x100397). Stores per frame: ret address (which effect), frame counter [0x231f88],
order/row [0x231f84]/[0x231f7c], fade cmd/level [0x231f70]/[0x231f74], palette ptr [0x231f78], virtual clock, irq count, indexed 320x200 CRT image and the 768-byte DAC."""
import sys,struct,numpy as np
import harness as H,emucore as E,vga
from emucore import *
out=sys.argv[1]; tmax=float(sys.argv[2])
d4=lambda a:struct.unpack('<i',bytes(mu.mem_read(a,4)))[0]
M=[]; IX=[]; PAL=[]
def hook(uc,a,sz,_):
    ret=d4(ireg('ESP'))
    if ret==0x100397: return
    ix,pal=vga.frame_idx()
    M.append([ret&0xffffffff,d4(0x231f88),d4(0x231f84),d4(0x231f7c),d4(0x231f70),d4(0x231f74),d4(0x231f78),H.irqs[0],int(H.clock()*1e6)])
    IX.append(np.array(ix,np.uint8).reshape(-1)); PAL.append(np.frombuffer(bytes(pal),np.uint8).copy())
mu.hook_add(UC_HOOK_CODE,hook,begin=0x100340,end=0x100340)
mu.reg_write(UC_X86_REG_EIP,E.ENTRY)
H.run_until(tmax)
np.savez_compressed(out,meta=np.array(M,np.int64),idx=np.array(IX),pal=np.array(PAL)); print(len(M),'frames; clock',H.clock())
