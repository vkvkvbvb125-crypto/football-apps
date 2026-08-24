// scripts/deleteui.check.ts — 탈퇴 화면이 서버 판정을 그대로 전하는가
//
// 왜 못 지우는지는 서버가 정하고 화면은 문장으로 바꾸기만 한다. 그 변환에 분기가 있어서
// (위임 / 미납 / 둘 다 / 이유 없음) 여기서 본다.
//
// 실제 흐름은 계정을 지워야 확인되고 마이그레이션이 배포돼야 도는데, describeBlockers는
// 순수 함수라 그냥 부를 수 있다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeBlockers, type DeletionStatus } from '../src/features/settings/services/accountBlockers';

const team = (over: Partial<DeletionStatus['admin_teams'][number]> = {}) => ({
  team_id: 't1', team_name: '테스트팀', members: 5, other_admins: 0,
  unpaid_team: 0, needs_handover: true, ...over,
});

// ── 1. 위임이 필요하면 갈 곳을 준다 ─────────────────────────────────
{
  const { message, handoverTeam } = describeBlockers({
    uid: 'u1', can_delete: false, unpaid_own: 0, admin_teams: [team()],
  } as DeletionStatus);
  assert.ok(message.includes('「테스트팀」'), '어느 팀인지 안 알려준다');
  assert.ok(message.includes('총무를 넘겨야'), '무엇을 해야 하는지 안 알려준다');
  assert.equal(handoverTeam?.team_id, 't1', '갈 곳이 없다 — 「총무 넘기러 가기」가 안 뜬다');
}

// ── 2. 팀 미납은 막지 않고 인수인계 맥락으로만 붙는다 ────────────────
{
  const { message } = describeBlockers({
    uid: 'u1', can_delete: false, unpaid_own: 0, admin_teams: [team({ unpaid_team: 3 })],
  } as DeletionStatus);
  assert.ok(message.includes('미정산 3건'), '팀 미정산 건수를 안 알려준다');
  assert.ok(message.includes('다음 총무가 이어받'), '인수인계 맥락이 없다 — 막는 조건으로 읽힌다');
  // 팀 미납이 「내가 내야 한다」로 읽히면 안 된다
  assert.ok(!/입금하지 않은/.test(message), '팀 미납을 본인 채무처럼 말한다');
}

// ── 3. 본인 미납만이면 갈 곳이 없다 ─────────────────────────────────
// 송금은 앱 밖에서 하므로 보낼 화면이 없다. 억지로 어딘가 보내면 헛걸음이 된다.
{
  const { message, handoverTeam } = describeBlockers({
    uid: 'u1', can_delete: false, unpaid_own: 2, admin_teams: [],
  } as DeletionStatus);
  assert.ok(message.includes('2건'), '본인 미납 건수를 안 알려준다');
  assert.equal(handoverTeam, null, '보낼 화면이 없는데 「가기」를 띄운다');
}

// ── 4. 둘 다면 위임을 먼저 말한다 ───────────────────────────────────
// 미납은 본인이 송금하면 끝나지만 위임은 상대가 필요해서 더 오래 걸린다.
{
  const { message } = describeBlockers({
    uid: 'u1', can_delete: false, unpaid_own: 1, admin_teams: [team()],
  } as DeletionStatus);
  assert.ok(message.indexOf('총무를 넘겨야') < message.indexOf('입금하지 않은'),
    '미납을 위임보다 먼저 말한다 — 더 오래 걸리는 쪽이 뒤로 밀린다');
}

// ── 5. 이유를 모를 때도 빈 대화상자를 띄우지 않는다 ─────────────────
// no_auth가 여기로 온다. 아무 말도 없으면 사용자는 앱이 고장 난 줄 안다.
{
  const { message } = describeBlockers({ uid: null, can_delete: false, reason: 'no_auth' } as DeletionStatus);
  assert.ok(message.trim().length > 0, '이유 없이 거절하면서 아무 말도 안 한다');
  assert.ok(message.includes('다시 로그인'), '무엇을 하라는 건지 없다');
}

// ── 6. 화면이 판정을 다시 계산하지 않는다 ───────────────────────────
// 규칙이 두 벌이면 화면은 된다고 하고 서버는 거절한다 (D-5와 같은 이유).
{
  const s = readFileSync(new URL('../src/features/settings/screens/MySettingsScreen.tsx', import.meta.url), 'utf8');
  assert.ok(s.includes('!status.can_delete'), '서버 판정(can_delete)을 안 본다');
  assert.ok(!/unpaid_own\s*[><]/.test(s), '화면에서 미납 건수를 다시 판단한다');
  assert.ok(!/needs_handover\s*(&&|\|\||===)/.test(s), '화면에서 위임 조건을 다시 판단한다');

  // 판정이 안 되면 지우면 안 된다 — 거절 분기 뒤에 return이 있어야 한다
  const gate = s.indexOf('if (!status.can_delete)');
  const del = s.indexOf('await deleteAccount()');
  assert.ok(gate !== -1 && del !== -1 && gate < del, '판정보다 삭제가 먼저 온다');
  assert.ok(/return;\s*\n\s*}/.test(s.slice(gate, del)), '거절하고도 삭제로 흘러간다');
}

console.log('deleteui ok');
