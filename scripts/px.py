# px.py <file.png> <x> <y> — 그 좌표의 RGB를 찍는다
#
# ── 왜 있나 ────────────────────────────────────────────────────────
# 「흰색은 아닌 것 같다」로 끝나는 확인이 이 저장소에서 반복됐다.
# 스크린샷을 눈으로 보고 판단하면 **단정이 되지 측정이 안 된다** — 화면을 봤다는 것과
# 값을 읽었다는 것은 다르고, 틀려도 출력이 같다(anchor.ts 「잴 수 있는데 안 쟀다」).
#
# 이 파일은 그 자리를 **숫자로** 바꾼다. 의존성이 없다 — zlib·struct만 쓴다.
# ffmpeg도 Pillow도 없는 이 환경에서 쓸 수 있는 유일한 수단이라 남겼다.
#
# ── 어디에 쓰나 — 눈으로는 못 가르는 자리들 ────────────────────────
#
#   스플래시 이음매   걷히는 사이에 흰/빈 프레임이 끼는가.
#                     2026-09-15에 이걸로 갈랐다 —
#                     (11,15,13) → (147,153,150) → (194,199,197) → (228,234,231).
#                     가운데 둘이 크로스페이드 중간이라는 것이 **색으로** 보였다.
#                     눈으로는 「어두웠다가 밝아진다」까지밖에 안 나온다.
#
#   그라데이션 밴딩   계단이 있는가, 몇 단인가. 배경만 있는 열을 위→아래로 훑어
#                     Δ가 어디서 튀는지 본다. 사람 눈은 밴딩을 **있다/없다**로만 읽고,
#                     그 판단이 화면 밝기와 방 조명에 흔들린다.
#                     (서랍 1번이 여덟 번 근거가 안 됐던 자리다)
#
#   색 대비           글자색과 배경색을 각각 읽어 명도비를 계산한다.
#                     「읽히긴 한다」는 통과 기준이 될 수 없다.
#
#   투명도·겹침       반투명 겹이 실제로 얼마나 덮는가. 디자인 값(opacity 0.6)과
#                     화면에 나온 값은 부모의 겹침·블렌드 때문에 자주 다르다.
#
#   테마 판별         지금 화면이 라이트인가 다크인가. 스크린샷 파일 크기로는 안 갈린다
#                     (라이트 홈 586KB vs 다크 홈 606KB — 겹친다).
#                     배경 한 점을 읽으면 끝난다.
#
# ── 쓰는 법 ────────────────────────────────────────────────────────
#   adb exec-out screencap -p > f.png
#   python scripts/px.py f.png 20 1200      # 배경 한 점
#
# ⚠ 좌표는 **원본 픽셀**이다(이 프로젝트 기기는 1080x2400).
#   스크린샷을 축소해서 보고 그 좌표를 쓰면 엉뚱한 점을 읽는다.
# ⚠ 한 점만 읽는다. 「영역의 평균」이 필요하면 여러 점을 찍어 눈으로 견줘라 —
#   평균을 내는 순간 계단이 뭉개져서 밴딩을 못 본다.
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
