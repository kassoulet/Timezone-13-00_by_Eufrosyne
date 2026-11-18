dis () 
{ 
    objdump -D -b binary -mi386 -M intel --adjust-vma=0x100000 --start-address=$1 --stop-address=$2 obj1.bin | sed 's/\t[0-9a-f ]*\t/\t/' | tail -n +8 | cut -c1-70
}
