# px.py <file.png> <x> <y> — 그 좌표의 RGB를 찍는다 (stdlib만)
import sys, zlib, struct
f, X, Y = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
d = open(f, 'rb').read()
i, idat, w, h, bd, ct = 8, b'', 0, 0, 0, 0
while i < len(d):
    ln = struct.unpack('>I', d[i:i+4])[0]; typ = d[i+4:i+8]; body = d[i+8:i+8+ln]
    if typ == b'IHDR': w, h, bd, ct = *struct.unpack('>II', body[:8]), body[8], body[9]
    elif typ == b'IDAT': idat += body
    elif typ == b'IEND': break
    i += 12 + ln
ch = {0:1, 2:3, 3:1, 4:2, 6:4}[ct]
raw = zlib.decompress(idat); stride = w * ch
prev = bytearray(stride); pos = 0
for y in range(h):
    ft = raw[pos]; pos += 1
    line = bytearray(raw[pos:pos+stride]); pos += stride
    for x in range(stride):
        a = line[x-ch] if x >= ch else 0
        b = prev[x]; c = prev[x-ch] if x >= ch else 0
        if ft == 1: line[x] = (line[x] + a) & 255
        elif ft == 2: line[x] = (line[x] + b) & 255
        elif ft == 3: line[x] = (line[x] + (a + b) // 2) & 255
        elif ft == 4:
            p = a + b - c; pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
            pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            line[x] = (line[x] + pr) & 255
    if y == Y:
        o = X * ch
        print(f, f"({X},{Y})", tuple(line[o:o+3])); break
    prev = line
