"""s3mtime.py MODULE.S3M -> JSON [[order,row,seconds],...] at every row start (speed Axx, tempo Txx, break Cxx, jump Bxx, row delay SEx; loop SBx ignored)"""
import struct,sys,json
def timeline(path):
    d=open(path,'rb').read()
    n,ni,npat=struct.unpack('<HHH',d[0x20:0x26]); orders=list(d[0x60:0x60+n])
    pp=[struct.unpack('<H',d[0x60+n+2*ni+2*i:][:2])[0]*16 for i in range(npat)]
    def pat(i):
        if i>=len(pp) or not pp[i]: return [[] for _ in range(64)]   # missing pattern = 64 empty rows
        o=pp[i]+2; rows=[]
        for r in range(64):
            ev=[]
            while True:
                b=d[o]; o+=1
                if b==0: break
                ch=b&31
                if b&32: o+=2
                if b&64: o+=1
                cmd=inf=0
                if b&128: cmd,inf=d[o],d[o+1]; o+=2
                ev.append((cmd,inf))
            rows.append(ev)
        return rows
    P={}
    speed,tempo=d[0x31],d[0x32]; t=0.0; out=[]; oi=0; row=0; seen=set()
    while oi<n and (oi,row) not in seen:
        if orders[oi]==255: break
        if orders[oi]>=254: oi+=1; continue
        seen.add((oi,row)); p=P[orders[oi]] if orders[oi] in P else P.setdefault(orders[oi],pat(orders[oi]))
        out.append((oi,row,round(t,4))); brk=None; jmp=None; delay=0
        for cmd,inf in p[row]:
            c=chr(64+cmd) if cmd else ''
            if c=='A' and inf: speed=inf
            elif c=='T' and inf>=32: tempo=inf
            elif c=='B': jmp=inf
            elif c=='C': brk=(inf>>4)*10+(inf&15)
            elif c=='S' and inf>>4==0xE: delay=inf&15
        t+=(speed*(1+delay))*2.5/tempo
        if jmp is not None: oi,row=jmp,(brk or 0)
        elif brk is not None: oi,row=oi+1,brk
        else:
            row+=1
            if row>=64: oi,row=oi+1,0
    return out,t
if __name__=='__main__':
    o,t=timeline(sys.argv[1]); print(json.dumps(o)); print('total',t,file=sys.stderr)
