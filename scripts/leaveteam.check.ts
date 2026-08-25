// scripts/leaveteam.check.ts — 팀 나가기 가드가 두 경우를 가르는가
//
// 팀 삭제 경로를 만들지 않기로 했으므로(D-4: 멤버 0명이면 RLS가 감춘다) 「나가기」가
// 팀에서 빠지는 유일한 길이다. 그래서 가드가 한 칸이라도 넓으면 사람이 갇힌다.
//
//   (A) 총무가 나 혼자 + 팀원이 남아 있다  → 막아야 한다.
//       나가면 아무도 경기를 만들거나 총무를 임명할 수 없는 팀이 남는다
//   (B) 팀에 나 혼자다                     → 나갈 수 있어야 한다.
//       남을 사람이 없어서 (A)의 근거가 닿지 않는다. 막으면 혼자 만든 팀에 영영 갇힌다
//
// 화면으로는 안 갈린다 — 둘 다 「총무 = 나」라서 같은 계정으로 보면 같아 보인다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 줄끝이 CRLF라 정규식의 개행이 안 맞는다. 못 찾으면 「가드 없음」으로 실패하는데,
// 그 상태에서는 어떤 변이를 넣어도 똑같이 실패해서 변이 시험이 통째로 헛돈다 — 겪었다.
const RAW = readFileSync(new URL('../src/features/team/stores/teamStore.ts', import.meta.url), 'utf8');
const store = RAW.split('\r').join('');

// 가드 조건 그 줄을 집는다. 「파일에 members.length가 있는가」로는 다른 줄이 걸린다
const guard = store.match(/if \((.+)\) \{\n\s*set\(\{ error: '마지막 총무는 팀을 나갈 수 없어요/);
assert.ok(guard, '팀 나가기 가드를 못 찾음');
const cond = guard![1];

// (B)를 통과시키려면 혼자인지를 조건에 넣어야 한다
assert.ok(
  /!alone|members\.length > 1|length !== 1/.test(cond),
  `가드가 혼자인 팀을 구분하지 않는다: if (${cond}) — 혼자 만든 팀에서 나갈 방법이 없어진다`,
);

// (A)는 여전히 막아야 한다 — 총무 수를 안 보면 부총무 없는 팀이 주인을 잃는다
assert.ok(/adminCount <= 1|adminCount < 2/.test(cond), `가드가 마지막 총무를 안 본다: if (${cond})`);
assert.ok(/role === 'admin'/.test(cond), `가드가 내 역할을 안 본다: if (${cond})`);

// alone 판정이 멤버 수여야 한다. 총무 수로 재면 (A)와 (B)가 같은 값이 된다
const aloneDef = store.match(/const alone = ([^;]+);/);
assert.ok(aloneDef, 'alone 판정을 못 찾음');
assert.ok(
  /members\.length <= 1|members\.length < 2/.test(aloneDef![1]),
  `alone을 멤버 수로 재지 않는다: ${aloneDef![1]}`,
);

// 내보내기 쪽 가드는 그대로 — 남을 사람이 있는 상황이라 혼자인 경우가 없다
assert.ok(/마지막 총무는 내보낼 수 없어요/.test(store), '내보내기 가드가 사라졌다');

console.log('leaveteam ok');
