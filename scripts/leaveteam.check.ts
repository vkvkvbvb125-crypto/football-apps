// scripts/leaveteam.check.ts — 팀 나가기 규칙이 **어디에 있는가**
//
// ── 이 검사의 전제가 2026-09-18에 통째로 바뀌었다 ──────────────────
// 예전 판본은 `teamStore.leaveTeam` 안의 **클라이언트 가드 모양**을 못 박았다:
//
//     if (!alone && activeTeam.role === 'admin' && adminCount <= 1) { … }
//
// 두 경우를 가르는 조건이 맞는지를 한 줄씩 봤다:
//
//   (A) 총무가 나 혼자 + 팀원이 남아 있다  → 막아야 한다.
//       나가면 아무도 경기를 만들거나 총무를 임명할 수 없는 팀이 남는다
//   (B) 팀에 나 혼자다                     → 나갈 수 있어야 한다.
//       남을 사람이 없어서 (A)의 근거가 닿지 않는다
//
// **(A)/(B)의 구분은 지금도 옳다.** 바뀐 것은 그 판정이 **어디서 도는가**다.
//
// ⚠ **클라이언트에만 있는 규칙은 규칙이 아니었다.** 앱을 거치지 않으면 그냥 통과했고,
//   실제로 DELETE는 RLS에 막혀 **200에 0행**으로 조용히 실패하고 있었다(2026-09-18 실측).
//   화면은 성공한 척 홈으로 돌아갔다. 지금은 `leave_team()` RPC가 서버에서 판정한다:
//
//       혼자면      → 팀 해체(teams 삭제, 딸린 것은 CASCADE)
//       마지막 총무 → P0001로 거절, 문구를 그대로 올려 보낸다
//       그 외       → left_at을 찍는다(소프트 삭제)
//
// ── 그래서 이 검사는 무엇을 보나 ──────────────────────────────────
// 규칙 자체는 DB에 있어 여기서 못 본다(스키마는 저장소에 없다 — AGENTS.md).
// **볼 수 있는 것은 「클라이언트가 그 규칙을 다시 들고 있지 않은가」다.**
//
// ⚠ 두 곳에 두면 언젠가 갈리고, 갈리면 **화면이 거짓말하는 쪽**이 이긴다 —
//   클라이언트가 통과시키면 서버가 막아도 사용자는 「눌렀는데 아무 일도 안 났다」를 본다.
//   반대로 클라이언트가 막으면 서버가 허용해도 사용자는 영영 못 나간다.
//
// ⚠ 「RPC를 부르는가 · 오류를 삼키지 않는가」는 memberview.check ⑶이 본다.
//   여기서 또 보지 않는다 — 같은 것을 두 검사가 보면 한쪽을 고칠 때 다른 쪽이 남는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 줄끝이 CRLF라 정규식의 개행이 안 맞는다. 못 찾으면 「없음」으로 실패하는데,
// 그 상태에서는 어떤 변이를 넣어도 똑같이 실패해서 변이 시험이 통째로 헛돈다 — 겪었다.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const store = read('src/features/team/stores/teamStore.ts');

/* ── ① 클라이언트가 마지막-총무 규칙을 다시 들고 있지 않은가 ────── */
{
  const from = store.indexOf('leaveTeam: async');
  assert.ok(from > 0, 'teamStore의 leaveTeam을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라');
  const nextKey = store.slice(from + 1).search(new RegExp('\\n  [a-zA-Z][A-Za-z0-9_]*: '));
  assert.ok(nextKey > 0, 'leaveTeam 다음 액션을 못 찾았다 — 스토어 모양이 바뀌었나');
  const body = store.slice(from, from + 1 + nextKey);

  for (const [pattern, what] of [
    [/adminCount/, '총무 수를 센다'],
    [/const alone\b/, 'alone을 판정한다'],
    [/마지막 총무는 팀을 나갈 수 없어요/, '거절 문구를 들고 있다'],
  ] as const) {
    assert.ok(
      !pattern.test(body),
      `teamStore.leaveTeam이 ${what} — 규칙이 서버(leave_team RPC)와 두 곳에 있게 된다. ` +
        `갈리면 화면이 거짓말한다: 클라이언트가 통과시키면 서버가 막아도 「아무 일도 안 났다」로 보이고, ` +
        `클라이언트가 막으면 서버가 허용해도 영영 못 나간다`
    );
  }
}

/* ── ② 내보내기(강퇴) 가드는 클라이언트에 남아 있어야 한다 ──────── */
/*
  ⚠ 나가기와 **다른 자리다.** 강퇴는 총무가 남을 사람을 고르는 동작이라 혼자인 경우가
    없고, DELETE 정책(team_members_delete_admin)이 총무에게 열려 있어 조용히 실패하지도
    않는다. 그래서 서버로 옮기지 않았다 — 옮길 이유가 없는 것을 옮기면 일만 는다.
*/
assert.ok(/마지막 총무는 내보낼 수 없어요/.test(store), '내보내기 가드가 사라졌다');

console.log('leaveteam ok — 나가기 규칙은 서버에 있고 클라이언트가 복제하지 않는다');
