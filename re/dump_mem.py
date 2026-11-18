"""dump_mem.py CKPT OUT.bin : loads a harness checkpoint (guest RAM) and writes obj2 (0x200000..0x3d1810) so tables can be inspected / exported."""
import sys,numpy as np
import harness as H,emucore as E
from emucore import *
E.load_snapshot(sys.argv[1])
open(sys.argv[2],'wb').write(bytes(mu.mem_read(0x200000,0x1d1810)))
