#!/usr/bin/env python3
"""python3 -I tools/check_writeup_asm.py [WRITEUP-asm.md] : checks every 'ADDR: instruction' line of the plain code blocks of the write-up against a fresh objdump of re/obj1.bin
(address + instruction text, whitespace-insensitive, ';' comments dropped). Needs objdump."""
import re,subprocess,sys,os
H=os.path.dirname(os.path.abspath(__file__))+'/..'
md=open(sys.argv[1] if len(sys.argv)>1 else H+'/WRITEUP-asm.md').read()
blocks=[];cur=None;lang=None
for l in md.split('\n'):
    if l.startswith('```'):
        if lang is None: lang=l[3:]; cur=[]
        else:
            if lang=='': blocks.append(cur)
            lang=None
    elif lang is not None: cur.append(l)
norm=lambda t:re.sub(r'\s+','',t.lower())
bad=tot=0
for b in blocks:
    ls=[(int(m.group(1),16),m.group(2).split(' ;')[0].strip()) for m in (re.match(r'^([0-9a-f]{6}): (.*)$',l) for l in b) if m]
    if not ls: continue
    out=subprocess.run(['objdump','-D','-b','binary','-mi386','-M','intel','--adjust-vma=0x100000','--start-address=%#x'%ls[0][0],'--stop-address=%#x'%(ls[-1][0]+16),'obj1.bin'],capture_output=True,text=True,cwd=H+'/re').stdout
    ref={int(m.group(1),16):m.group(2) for m in (re.match(r'^\s*([0-9a-f]+):\t(?:[0-9a-f ]+\t)?(.*)$',l) for l in out.split('\n')) if m}
    for a,t in ls:
        tot+=1
        if a not in ref or norm(ref[a])!=norm(t): bad+=1; print('MISMATCH %x: %r vs %r'%(a,t,ref.get(a)))
print(tot,'lines checked,',bad,'mismatches'); sys.exit(1 if bad else 0)
