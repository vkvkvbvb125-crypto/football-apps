/*
  포메이션 **표기 규칙**을 산수로 붙든다.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  키와 라벨이 **서로 다른 것을 센다.**

      키(4·5·6·7)  = 팀 인원 **골키퍼 포함**
      label        = 골키퍼를 **뺀** 필드 배치

  그래서 6번 키의 라벨은 「2-2-1」(=5)이다. 규칙을 안 적어 두면 다음 사람이
  「2-2」를 4명 칸에 넣을지 5명 칸에 넣을지 갈리지 않는다 —
  서랍이 「표기 통일이 먼저다」라고 경고한 자리가 여기다.

  ⚠ **사람 기억 대신 산수로 본다:**

      label의 숫자 합 + 1  ==  키
      rows의 길이 합       ==  키          (골키퍼가 rows 안에 있다)
      rows 안의 GOLEIRO    ==  정확히 하나

  셋이 서로를 검산한다. 하나만 틀려도 걸린다.

  ⚠ **화면 헤더도 같이 붙든다.** 전에는 「6명 · 골키퍼 포함」이라 배지(2-2-1=5)와
    숫자가 안 맞았다. 「골키퍼 1 · 필드 N」으로 바꿨고, 그 표현이 되살아나면 FAIL이다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMATIONS, formationHint, formationsFor } from '../src/features/team/positions';

/*
  ⚠ **주석을 걷어내고 본다.** 2026-09-28에 이 검사가 **자기 앵커에 걸렸다** —
    FormationView의 해명 주석에 옛 문구(「6명 · 골키퍼 포함」)를 인용해 뒀는데
    그걸 「되돌아갔다」로 읽었다. 이 저장소에서 여러 번 겪은 덫이다:
    **해명 주석은 검사 대상이 아니다.**
*/
const strip = (t: string) =>
  t
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const keys = Object.keys(FORMATIONS).map(Number).sort((a, b) => a - b);

/* ── ⑴ 커버 범위 — 4~7 ──────────────────────────────────────────── */
assert.deepEqual(
  keys,
  [4, 5, 6, 7],
  `FORMATIONS의 키가 4·5·6·7이 아니다: ${keys.join(', ')}\n` +
    `3명 이하는 배치랄 것이 없고(골키퍼+2) 8명 이상은 풋살이 아니다. ` +
    `범위를 넓히려면 안내 문구(formationHint)와 판정 목록도 같이 고쳐라`
);

/* ── ⑵ 산수 셋 ──────────────────────────────────────────────────── */
const bad: string[] = [];
for (const key of keys) {
  const options = FORMATIONS[key];
  assert.ok(options.length >= 1, `${key}명 후보가 비었다`);

  const seen = new Set<string>();
  for (const { label, rows } of options) {
    if (seen.has(label)) bad.push(`${key}명: 라벨 「${label}」이 두 번 나온다`);
    seen.add(label);

    const labelSum = label.split('-').reduce((n, part) => n + Number(part), 0);
    if (labelSum + 1 !== key) {
      bad.push(`${key}명 「${label}」: 라벨 합 ${labelSum} + 골키퍼 1 = ${labelSum + 1} ≠ ${key}`);
    }

    const rowSum = rows.reduce((n, row) => n + row.length, 0);
    if (rowSum !== key) bad.push(`${key}명 「${label}」: rows 합 ${rowSum} ≠ ${key}`);

    const keepers = rows.flat().filter((p) => p === 'GOLEIRO').length;
    if (keepers !== 1) bad.push(`${key}명 「${label}」: 골키퍼가 ${keepers}명이다 (정확히 하나여야 한다)`);
  }
}
assert.deepEqual(
  bad,
  [],
  `포메이션 표기가 어긋난다. **키는 골키퍼 포함, label은 골키퍼 제외**다 ` +
    `(positions.ts 표기 규칙):\n  ` + bad.join('\n  ')
);

/* ── ⑶ 범위 밖에는 **말을 한다** ────────────────────────────────── */
/*
  ⚠ 서랍 25가 이것이었다 — 못 그리는 인원수에서 블록이 통째로 사라져
    「그런 기능이 있는지조차 모른다」가 됐다.
*/
for (const n of [0, 1, 2, 3, 8, 9, 14]) {
  const hint = formationHint(n);
  assert.ok(hint && hint.text.length > 0, `${n}명일 때 안내 문구가 없다 — 화면이 조용히 빈다`);
}
for (const n of keys) {
  assert.equal(formationHint(n), null, `${n}명은 그릴 수 있는데 안내가 나온다`);
  assert.ok(formationsFor(n), `${n}명 후보를 못 가져온다`);
}

/*
  ⚠ **많을 때와 적을 때의 답이 다르다.**
    많으면 팀을 더 나누면 되고 그건 총무만 할 수 있다 → adminOnly
    적으면 할 일이 없다 → 팀원에게도 보인다
*/
assert.equal(formationHint(8)?.adminOnly, true, `8명 안내는 총무 전용이어야 한다 — 팀 나누기는 총무만 한다`);
assert.equal(formationHint(3)?.adminOnly, false, `3명 안내는 모두에게 보여야 한다 — 나누는 것이 답이 아니라 할 일이 없다`);

/* ── ⑷ 화면이 안내를 삼키지 않는가 ──────────────────────────────── */
const screen = strip(readFileSync('src/features/assignment/screens/AssignmentScreen.tsx', 'utf8'));
assert.ok(
  /formationHint\(/.test(screen),
  `AssignmentScreen이 formationHint를 안 쓴다 — 범위 밖에서 다시 조용히 비게 된다(서랍 25)`
);

/* ── ⑸ 헤더 표기 ────────────────────────────────────────────────── */
const view = strip(readFileSync('src/features/assignment/components/FormationView.tsx', 'utf8'));
assert.ok(
  /골키퍼 1 · 필드/.test(view),
  `FormationView 헤더가 「골키퍼 1 · 필드 N」이 아니다`
);
assert.ok(
  !/명 · 골키퍼 포함/.test(view),
  `헤더가 「N명 · 골키퍼 포함」으로 돌아갔다. 배지는 골키퍼를 뺀 숫자라 ` +
    `2+2+1=5와 6이 나란히 놓여 읽는 사람이 하나를 잃는다`
);

const total = keys.reduce((n, k) => n + FORMATIONS[k].length, 0);
console.log(`formation ✓ 4~7명 후보 ${total}개: 라벨합+1 = 키 = rows합, 골키퍼 1명 · 범위 밖 안내 있음`);
