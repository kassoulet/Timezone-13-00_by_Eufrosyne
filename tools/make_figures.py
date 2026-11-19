#!/usr/bin/env python3
"""python3 -I tools/make_figures.py : builds the figures of the write-ups into figures/ (run `node tools/make_figures.mjs` first for the port screenshots and fade_level.json).
Needs numpy, pillow, matplotlib. Reads web/assets/TZ1300.DAT, tz13_mesh.bin, tz13_3d.bin (the extracted data the port uses)."""
import os,json,struct
import numpy as np
from PIL import Image
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
H=os.path.dirname(os.path.abspath(__file__))+'/..';F=H+'/figures/';A=H+'/web/assets/'
plt.rcParams.update({'figure.dpi':110,'savefig.dpi':120,'font.size':9})
# ---- 1. the 13 DAT images (8-bit palettes)
d=open(A+'TZ1300.DAT','rb').read();p=0;imgs=[]
while p+32<=len(d) and d[p:p+6]==b'mhwanh':
    w,h=struct.unpack('>HH',d[p+8:p+12]);pal=np.frombuffer(d[p+32:p+800],np.uint8).reshape(256,3);pix=np.frombuffer(d[p+800:p+800+w*h],np.uint8).reshape(h,w)
    imgs.append((w,h,pal,pix));p+=800+w*h
print(len(imgs),'images')
fig,axs=plt.subplots(3,5,figsize=(13,8.4))
for i,a in enumerate(axs.ravel()):
    a.axis('off')
    if i<len(imgs):
        w,h,pal,pix=imgs[i]
        if w==1:a.imshow(pal.reshape(1,256,3),aspect=40);a.set_title('%d: 1x1, palette only (scenes 1,3,5,7)'%i,fontsize=8)
        else:a.imshow(pal[pix],aspect=1.2 if w==320 else 1);a.set_title('%d: %dx%d'%(i,w,h),fontsize=8)
fig.tight_layout();fig.savefig(F+'art_dat_images.png');plt.close(fig)
# ---- 2. meshes as wire frames (header: [nv,nf,offsets...]; x,y,z at int index off/4 of words 2,3,4; faces a,b,c = words 10,11,12)
def mesh(a,off=0):
    m=np.frombuffer(a[off:],np.int32);nv,nf=m[0],m[1];ar=lambda k:m[m[k]>>2:(m[k]>>2)+(nv if k<5 else nf)]
    return np.stack([ar(2),ar(3),ar(4)],1).astype(float),np.stack([ar(10),ar(11),ar(12)],1)
mb=open(A+'tz13_mesh.bin','rb').read();
L=['scene 3: big shell','scene 2: object','scene 3: points only','scene 5: centre','scene 1: tunnel','scene 4: object','scene 7: tunnel']
M=[('mesh %d, %s'%(i,L[i]),mesh(mb,o)) for i,o in enumerate([0,0xacc0,0xecc0,0x11540,0x1b580,0x206a0,0x260e0])]
fig,axs=plt.subplots(2,4,figsize=(13,6.6))
for a in axs.ravel():a.axis('off')
for a,(n,(v,f)) in zip(axs.ravel(),M):
    ok=f.max()<len(v)
    a.set_title('%s: %d verts, %d faces'%(n,len(v),len(f)),fontsize=8);a.set_aspect('equal');a.axis('off')
    if not ok:continue
    # view from the side-ish: project (x,z) for long tunnels (y is the long axis), else (x,y)
    ext=v.max(0)-v.min(0);ax_=[0,2] if ext[1]>1.5*max(ext[0],ext[2]) else [0,1]
    P=v[:,ax_];segs=np.concatenate([P[f[:,[0,1]]],P[f[:,[1,2]]],P[f[:,[2,0]]]]);a.add_collection(LineCollection(segs,lw=0.2,color='#246'));a.autoscale()
fig.tight_layout();fig.savefig(F+'art_meshes_wire.png');plt.close(fig)
# ---- 3. scene contact sheets
def sheet(names,out,cols=3):
    rows=(len(names)+cols-1)//cols;fig,axs=plt.subplots(rows,cols,figsize=(cols*4.2,rows*3.3))
    for a in np.atleast_1d(axs).ravel():a.axis('off')
    for a,(n,t) in zip(np.atleast_1d(axs).ravel(),names):a.imshow(Image.open(F+n+'.png'));a.set_title('%s (%s)'%(n,t),fontsize=8)
    fig.tight_layout();fig.savefig(F+out);plt.close(fig)
sheet([('s0_logo','8.3 s'),('s1_tunnel_intro','20.3 s'),('s1_tunnel_title','30.3 s'),('s2_landscape_tunnel','65.3 s'),('s3_two_meshes','95.3 s'),('s4_landscape_mesh','120.3 s')],'scenes_1.png')
sheet([('s5_swarm_a','140.3 s'),('s5_swarm_b','165.3 s'),('s6_landscape_rot','190.3 s'),('s7_tunnel_glows','216.3 s'),('s8_ending_a','ending +7 s'),('s8_ending_b','ending +20 s')],'scenes_2.png')
# ---- 4. fade level over the run
if os.path.exists(F+'fade_level.json'):
    j=json.load(open(F+'fade_level.json'));fig,ax=plt.subplots(2,1,figsize=(12,4.6),gridspec_kw={'height_ratios':[4,1]})
    t=np.arange(len(j['aumax']))*j['dt'];ax[0].plot(t,j['aumax'],lw=0.5,color='#246');ax[0].set_ylabel('level (DAC offset)');ax[0].set_xlabel('AUMAX time (s)')
    for s,n in [(14.58,'1'),(53.33,'2'),(80,'3'),(106.67,'4'),(133.33,'5'),(173.33,'6'),(203.33,'7')]:ax[0].axvline(s,color='#c44',lw=0.6);ax[0].text(s+0.5,200,n,color='#c44')
    ax[0].set_ylim(-270,270);t2=np.arange(len(j['pilips']))*j['dt'];ax[1].plot(t2,j['pilips'],lw=0.8,color='#246');ax[1].set_xlabel('PILIPS time (s) - ending');ax[1].set_ylim(-270,10)
    fig.tight_layout();fig.savefig(F+'fade_level.png');plt.close(fig)
