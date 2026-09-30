/*
  **큰 값 자리에 「-」만 남기지 않는다.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  팀 홈의 참여율 타일이 경기 전에는 「-」였다. **고장으로 읽힌다** —
  큰 숫자 자리에 작대기 하나만 있으면 「값이 없다」가 아니라 「못 불러왔다」로 보인다
  (2026-09-30 지적). 「다음 경기」도 같은 모양이었다.

  ⚠ **공용 `formatRate`는 그대로 둔다.** 그건 멤버 줄처럼 좁은 자리에서도 쓰이고
    거기서는 「-」가 맞다 — 한 줄에 이름·포지션과 나란히 서는 자리에 문장을 넣을 수 없다.
    **큰 타일에서만** 말을 바꾼다. 그래서 이 검사는 `formatRate`를 안 본다.

  ⚠ **이 검사가 잡는 것은 「이 모양」 하나뿐이다.** 「빈 값이 고장으로 보인다」는
    종류의 다음 자리는 또 못 잡는다 — 화면을 봐야 안다. 그래도 걸어 두는 이유는
    **이미 두 자리에서 같은 일이 있었기 때문**이다(참여율·다음 경기).
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(p, 'utf8'));

const NL = String.fromCharCode(10);

/* ── ⑴ StatTile에 「값 없음」을 작게 적을 수단이 있는가 ─────────── */
const surface = read('src/components/Surface.tsx');
assert.ok(
  /muted\?: boolean;/.test(surface),
  `StatTile에 muted가 없다 — 값이 아직 없을 때 큰 숫자 자리에 「-」만 남는다`
);
assert.ok(
  /statValueMuted:/.test(surface),
  `muted일 때 쓸 스타일이 없다 — 작게 적지 않으면 안내가 숫자만큼 무거워져 ` +
    `옆 타일의 진짜 숫자와 나란히 비교되는 것처럼 보인다`
);

/* ── ⑵ 큰 자리에 「-」를 그대로 찍는 곳이 없는가 ────────────────── */
/*
  ⚠ **파일을 열거한다.** 저장소 전체에서 「-」를 찾으면 날씨(`${min}~${max}°`)처럼
    복합 문자열 안의 정당한 자리까지 걸린다 — 거기서는 「-」가 맞다.
    여기서 보는 것은 **큰 값 한 칸을 통째로 차지하는 자리**다.
*/
const BIG_VALUE_FILES = [
  'src/features/team/components/TeamHomeTab.tsx',
  'src/features/home/screens/HomeScreen.tsx',
];
const bad: string[] = [];
for (const f of BIG_VALUE_FILES) {
  const src = read(f);
  for (const line of src.split(NL)) {
    /* `?? '-'` · `: '-'` · `{'-'}` — 한 칸을 통째로 「-」로 채우는 모양 */
    if (/\?\?\s*'-'|:\s*'-'\s*[,)}]|\{'-'\}/.test(line)) {
      bad.push(f + ': ' + line.trim().slice(0, 70));
    }
  }
}
assert.deepEqual(
  bad,
  [],
  `큰 값 자리에 「-」만 찍는다 — 「못 불러왔다」로 읽힌다. 무엇이 없는지 말로 적어라 ` +
    `(예: 「경기 후 표시」·「예정 없음」):${NL}  ` + bad.join(NL + '  ')
);

/* ── ⑶ 참여율 타일이 실제로 말을 쓰는가 ────────────────────────── */
/*
  ⑵는 부정 단언이라 **자리를 통째로 지워도 통과한다.** 존재 쪽도 같이 본다.
*/
for (const f of BIG_VALUE_FILES) {
  const src = read(f);
  if (!/StatTile/.test(src)) continue;
  assert.ok(
    /경기 후 표시/.test(src),
    `${f}의 참여율 타일이 값 없을 때 안내 문구를 안 쓴다`
  );
  assert.ok(
    /muted=\{/.test(src),
    `${f}가 StatTile에 muted를 안 넘긴다 — 안내가 큰 숫자 크기로 나온다`
  );
}

console.log('emptyvalue ✓ 큰 값 자리에 「-」가 없다 · 안내는 작게 적는다');
