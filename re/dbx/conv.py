# usage: python3 -I conv.py TAG  -> TAG/lum.bin (N*64000 bytes luma at 320x200 nearest sample points) + TAG/rgb.bin
import sys,glob,numpy as np
from PIL import Image
tag=sys.argv[1]; fs=sorted(glob.glob(f'{sys.argv[2]}/{tag}/cap/s_*.png'))
xs=((np.arange(320)+.5)*3.2).astype(int); ys=((np.arange(200)+.5)*3.84).astype(int)
out=open(f'{sys.argv[2]}/{tag}/lum.bin','wb')
for f in fs:
    a=np.asarray(Image.open(f).convert('RGB'))[np.ix_(ys,xs)].astype(float)
    out.write((a@[.3,.59,.11]).astype(np.uint8).tobytes())
print(len(fs))
