"""글자 노드의 bounds를 받아 **그 글자를 감싸는 버튼**의 bounds를 낸다.

⚠ 왜 따로 있나 — kbmeasure.sh는 글자 노드를 재고 있었다. 글자는 버튼 안에
  **가운데 정렬로** 들어 있어 위아래 여백만큼 작다. Login에서 47px 갈렸고
  (글자 하단 1365 / 버튼 하단 1412), **글자만 보이고 버튼 아래가 키보드에
  물린 상태를 통과로 읽었다.**

⚠ 버튼 글자(한글)를 인자로 안 받는다. Git Bash → 윈도 파이썬 사이에서 코드페이지를
  타서 깨진다. 받는 것은 **숫자 네 개**뿐이라 그 문제가 안 생긴다.

    python scripts/lib/btnbounds.py <dump.xml> <x1> <y1> <x2> <y2>
    → bounds="[63,1260][1017,1412]"
"""
import io
import re
import sys

xml, lx1, ly1, lx2, ly2 = sys.argv[1], *map(int, sys.argv[2:6])
s = io.open(xml, encoding='utf-8').read()

best = None
for n in re.findall(r'<node[^>]*>', s):
    if 'clickable="true"' not in n:
        continue
    m = re.search(r'bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"', n)
    if not m:
        continue
    x1, y1, x2, y2 = map(int, m.groups())
    # 글자를 온전히 감싸는가. ⚠ 잘려서 뒤집힌 값도 그대로 두고 **감싸기만** 본다 —
    #   잘림 판정은 kbmeasure.sh가 한다. 여기서 걸러내면 그 판정이 사라진다.
    if x1 <= lx1 and y1 <= ly1 and x2 >= lx2 and y2 >= ly2:
        area = (x2 - x1) * (y2 - y1)
        if best is None or area < best[0]:
            best = (area, x1, y1, x2, y2)

# ⚠ 감싸는 clickable이 없으면 **글자 자신**을 낸다. 없는 것을 지어내지 않는다 —
#   버튼이 Pressable이 아니라 Text에 onPress를 단 자리가 있을 수 있다.
print('bounds="[%d,%d][%d,%d]"' % (best[1:] if best else (lx1, ly1, lx2, ly2)))
