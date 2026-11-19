"""mk_assets3d.py: copies the static data the 3D scenes read out of the relocated objects into web/assets/tz13_3d.bin:
 mesh 4 (the tunnel, 0x21edb8: 260 vertices / 516 faces, header + int32 arrays, 20768 bytes) + the 128x128 glow sprite (0x1037dc, 16384 bytes).  Run from re/."""
o1=open('obj1.bin','rb').read(); o2=open('obj2.bin','rb').read()
mesh=o2[0x21edb8-0x200000:][:20768]; spr=o1[0x1037dc-0x100000:][:16384]
open('../web/assets/tz13_3d.bin','wb').write(mesh+spr); print(len(mesh)+len(spr))
# all 7 meshes (pointer table 0x260de8 -> 0x203838, 0x20e4f8, 0x2124f8, 0x214d78, 0x21edb8, 0x223ed8, 0x229918; contiguous, 176512 bytes) for the other scenes (+0x80 bytes: mesh 6 normal-z array runs past its end, the original reads the data after it)
open('../web/assets/tz13_mesh.bin','wb').write(o2[0x203838-0x200000:0x22ea38-0x200000])
