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
for (const n of [1, 2, 3, 8, 9, 14]) {
  const hint = formationHint(n);
  assert.ok(hint && hint.text.length > 0, `${n}명일 때 안내 문구가 없다 — 화면이 조용히 빈다`);
}
/*
  ⚠ **0명은 예외다 — 말을 걸면 안 된다.** 아직 나누기 전이라는 뜻이고,
    화면에는 이미 「비어 있음」과 「전체 팀원으로 분배」가 있다. 안내까지 넣었더니
    경기마다 두 줄씩(A팀·B팀) 쌓여 화면이 덮였다(2026-09-28 기기에서 봤다).
*/
assert.equal(formationHint(0), null, '0명에는 안내를 그리지 않는다 — 아직 안 나눈 것이지 적은 것이 아니다');
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

/* ── ⑷ 상세 화면이 안내를 삼키지 않는가 ────────────────────────── */
/*
  ⚠ 2026-09-28에 **자리가 옮겨졌다.** 안내는 이제 분배 카드가 아니라
    포메이션 상세 화면이 그린다. 단언도 같이 옮긴다 — 안 옮기면 옛 파일을 보며
    통과해 버리고, 정작 새 화면이 조용히 비어도 모른다.
*/
const detail = strip(readFileSync('src/features/assignment/screens/FormationScreen.tsx', 'utf8'));
assert.ok(
  /formationHint\(/.test(detail),
  `FormationScreen이 formationHint를 안 쓴다 — 범위 밖에서 다시 조용히 비게 된다(서랍 25)`
);

/* ── ⑹ 고르는 자리는 **한 곳**이다 ──────────────────────────────── */
/*
  칩(조작)이 분배 카드에도 있으면 선택 상태가 둘로 갈리고 어느 쪽이 진짜인지 모른다.
  카드에는 **읽기 전용 배지**만 둔다.
*/
const card = strip(readFileSync('src/features/assignment/screens/AssignmentScreen.tsx', 'utf8'));
assert.ok(
  !/=>\s*s\.pick\b/.test(card),
  `AssignmentScreen이 포메이션 **고르기 동작을 구독한다**. 고르는 자리는 FormationScreen ` +
    `하나여야 한다 — 두 곳에 두면 선택 상태가 갈리고 어느 쪽이 진짜인지 모른다`
);
assert.ok(
  /formationKey\(/.test(card),
  `AssignmentScreen이 읽기 전용 배지를 안 그린다 — 그러면 포메이션을 발견할 길이 없다(서랍 25)`
);

/* ── ⑺ 코트가 강조색 초록을 쓰지 않는가 ────────────────────────── */
/*
  ⚠ 스펙 §02 「모든 배경에 Green 금지」. 코트 면이 채도 높은 초록이면
    강조해야 할 CTA·활성 탭·**선택된 칩**의 초록이 바탕에 섞인다.
    코트는 greenTrack(가라앉은 초록) + greenLine(옅은 선)으로만 그린다.
*/
const field = strip(readFileSync('src/features/assignment/components/FormationView.tsx', 'utf8'));
/*
  ⚠ **면만 본다.** §02는 「모든 **배경**에 Green 금지」다. 칩의 「나」 표시처럼
    점으로 찍는 강조는 앱 전체가 초록으로 통일돼 있어(playerRowMe) 그것까지 막으면
    오히려 어긋난다. 막아야 할 것은 **코트 면이 채도 높은 초록이 되는 것**이다 —
    그러면 CTA·활성 탭·선택된 칩의 초록이 바탕에 섞인다.
*/
const loudBg = [...field.matchAll(/backgroundColor:\s*colors\.(green|greenBright|greenCore|greenGlow)\b/g)].map(
  (m) => m[0]
);
assert.deepEqual(
  loudBg,
  [],
  `코트 면에 강조색 초록을 썼다(스펙 §02: 모든 배경에 Green 금지). ` +
    `면은 greenTrack, 선은 greenLine이다:\n  ` + loudBg.join('\n  ')
);
assert.ok(
  /backgroundColor:\s*colors\.greenTrack\b/.test(field),
  `코트 면이 greenTrack이 아니다 — 가라앉은 초록이어야 선수 이름과 강조색이 산다`
);

/* ── ⑸ 상세 화면의 헤더 표기 ───────────────────────────────────── */
/*
  ⚠ 전에는 「6명 · 골키퍼 포함」이라 배지(2-2-1=5)와 숫자가 안 맞아
    읽는 사람이 하나를 잃었다. 「골키퍼 1 · 필드 N」이면 두 숫자가 서로 검산된다.
*/
const view = strip(readFileSync('src/features/assignment/screens/FormationScreen.tsx', 'utf8'));
assert.ok(
  /골키퍼 1 · 필드/.test(view),
  `FormationScreen 헤더가 「골키퍼 1 · 필드 N」이 아니다`
);
assert.ok(
  !/명 · 골키퍼 포함/.test(view),
  `헤더가 「N명 · 골키퍼 포함」으로 돌아갔다. 배지는 골키퍼를 뺀 숫자라 ` +
    `2+2+1=5와 6이 나란히 놓여 읽는 사람이 하나를 잃는다`
);

const total = keys.reduce((n, k) => n + FORMATIONS[k].length, 0);
console.log(`formation ✓ 4~7명 후보 ${total}개: 라벨합+1 = 키 = rows합, 골키퍼 1명 · 범위 밖 안내 있음`);
