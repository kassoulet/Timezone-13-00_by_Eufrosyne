"""export_oracle.py ORACLE.npz OUT.json [RET OUTPREFIX]: JSON with timer-callback records [n,order,row,fadeLevel] and effect-frame records [ret,n,order,row,level,palptr];
with RET (e.g. 0x1097dd) also OUTPREFIX.idx.bin (N x 64000 palette indices) and OUTPREFIX.pal.bin (N x 768 DAC bytes, 6-bit) of the frames returning to RET."""
import sys,json,numpy as np
z=np.load(sys.argv[1]); m=z['meta']
json.dump({'timer':m[m[:,0]==0x10039c][:,[1,2,3,5]].tolist(),'frames':m[m[:,0]!=0x10039c][:,[0,1,2,3,5,6]].tolist()},open(sys.argv[2],'w'))
if len(sys.argv)>4:
    s=np.where(m[:,0]==int(sys.argv[3],0))[0]
    z['idx'][s].tofile(sys.argv[4]+'.idx.bin'); z['pal'][s].tofile(sys.argv[4]+'.pal.bin'); print(len(s),'frames')
