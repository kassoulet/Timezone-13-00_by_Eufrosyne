# usage: python3 run.py TAG CYCLES DISPLAYNUM DURATION INTERVAL  (cycles: e.g. fixed 100000 | max)
import sys,os,time,subprocess
tag,cyc,dn,dur,iv=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4]),float(sys.argv[5])
S=os.path.dirname(os.path.abspath(__file__)); d=f'{S}/{tag}'; os.makedirs(d+'/cap',exist_ok=True)
open(d+'/d.conf','w').write(f"""[sdl]
fullscreen=false
output=surface
[dosbox]
machine=svga_s3
captures={d}/cap
memsize=64
[cpu]
core=normal
cputype=pentium
cycles={cyc}
[sblaster]
sbtype=none
[autoexec]
mount c {S}/game
c:
TZ1300.EXE
""")
env=dict(os.environ,DISPLAY=':'+dn)
xv=subprocess.Popen(['Xvfb',':'+dn,'-screen','0','1024x768x24'])
time.sleep(2)
db=subprocess.Popen(['timeout',str(int(dur+60)),'dosbox-x','-conf',d+'/d.conf','-nomenu'],env=env,stdout=open(d+'/db.log','w'),stderr=subprocess.STDOUT)
def sh(c): subprocess.run(c,shell=True,env=env)
try:
    time.sleep(12)
    for i in range(12): sh('xdotool key Down'); time.sleep(0.15)
    sh('xdotool key Return'); t0=time.time(); log=open(d+'/times.txt','w')
    k=0
    while time.time()-t0<dur:
        t=time.time()-t0; sh(f'import -window root {d}/cap/s_{k:04d}.png'); log.write(f'{k} {t:.3f}\n'); log.flush(); k+=1
        time.sleep(max(0,iv-(time.time()-t0-t)))
finally:
    db.terminate(); time.sleep(1); xv.terminate()
