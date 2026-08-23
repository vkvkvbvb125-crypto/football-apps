// scripts/settingswipe.check.ts — 팀 설정 저장이 안 건드린 칸을 지우지 않는가
//
// 실제로 지워진 적이 있다. 2026-08-22, 계좌 세 칸(은행/계좌번호/예금주)이 null이 됐다.
// 사슬은 이랬다:
//   1) fetchMemberProfiles가 400을 냄 (team_member_stats 임베드 — FK 없는 집계 뷰)
//   2) Promise.all이라 fetchTeamSettings 결과까지 같이 버려짐
//   3) catch가 삼켜서 폼이 빈 기본값으로 뜸 — "아직 설정 안 한 팀"과 구분 불가
//   4) 저장이 12칸을 전부 실어 보냄 → 읽지도 못한 계좌를 null로 덮음
// 각 고리마다 검사를 하나씩 둔다. 하나만 되살아나도 다시 지워진다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffSettings, settingsToRow, hhmm, type TeamSettings } from '../src/features/team/utils/teamSettingsPatch.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const saved: TeamSettings = {
  teamId: 't1',
  defaultWeekdays: [2],
  defaultTime: '20:00',
  defaultVenueId: null,
  defaultCapacity: 12,
  feeMode: 'per_match',
  defaultFee: null,
  bankName: '카카오뱅크',
  accountNo: '3333140994816',
  accountHolder: '김범준',
  guestAllowed: true,
  guestFee: null,
  joinApprovalRequired: false,
};
/** 화면이 저장 시 만드는 객체 — 폼이 들고 있는 11칸 전부 */
const formOf = (s: TeamSettings) => ({
  defaultWeekdays: s.defaultWeekdays,
  defaultTime: s.defaultTime,
  defaultCapacity: s.defaultCapacity,
  feeMode: s.feeMode,
  defaultFee: s.defaultFee,
  bankName: s.bankName,
  accountNo: s.accountNo,
  accountHolder: s.accountHolder,
  guestAllowed: s.guestAllowed,
  guestFee: s.guestFee,
  joinApprovalRequired: s.joinApprovalRequired,
});

// ── ④ 요일 하나 바꿔도 계좌는 payload에 안 실린다 ──────────────
{
  const patch = diffSettings({ ...formOf(saved), defaultWeekdays: [2, 4] }, saved);
  assert.deepEqual(Object.keys(patch), ['defaultWeekdays'], '바뀐 칸 말고 다른 게 실렸다');

  const row = settingsToRow('t1', patch);
  for (const c of ['bank_name', 'account_no', 'account_holder']) {
    assert.ok(!(c in row), `${c}가 payload에 실렸다 — 저장하면 지워진다`);
  }
  assert.deepEqual(row, { team_id: 't1', default_weekdays: [2, 4] });
}

// 아무것도 안 바꾸면 아예 안 보낸다
assert.deepEqual(diffSettings(formOf(saved), saved), {});
// 요일은 화면이 매번 새 배열을 만든다 — 참조로 비교하면 늘 "바뀜"이 되고,
// 그러면 실제로 안 바꾼 저장에서도 payload가 생긴다
assert.deepEqual(diffSettings({ ...formOf(saved), defaultWeekdays: [2] }, saved), {});

// null로 "지우는" 건 사용자가 실제로 비웠을 때만 — 그땐 실려야 한다
{
  const patch = diffSettings({ ...formOf(saved), accountNo: null }, saved);
  assert.deepEqual(patch, { accountNo: null }, '사용자가 비운 칸은 실려야 한다');
  assert.ok('account_no' in settingsToRow('t1', patch));
}

// 아직 설정 안 한 팀(base === null)은 전부 보낸다 — 덮어쓸 값이 없다
assert.equal(Object.keys(diffSettings(formOf(saved), null)).length, 11);

// DB "20:00:00" vs 폼 "20:00" — 정규화 안 하면 매번 바뀐 걸로 잡힌다
assert.equal(hhmm('20:00:00'), '20:00');
assert.deepEqual(diffSettings(formOf(saved), { ...saved, defaultTime: hhmm('20:00:00') }), {});

// ── ①② 로드는 설정과 멤버를 따로 받는다 ────────────────────────
{
  const s = read('src/features/team/screens/TeamSettingsScreen.tsx');
  assert.ok(
    !/Promise\.all\(\[fetchTeamSettings/.test(s),
    '설정과 멤버가 다시 한 Promise.all에 묶였다 — 멤버가 깨지면 설정도 같이 버려진다'
  );
  // ③ 로드 실패는 "설정 없는 팀"과 다르게 취급한다
  assert.ok(/setLoadError\(/.test(s), '로드 실패를 구분하지 않는다');
  assert.ok(/if \(!teamId \|\| loadError\) return;/.test(s), '로드 실패 상태에서도 저장이 눌린다');
  assert.ok(/loadError \?/.test(s), '로드 실패 시 저장 버튼이 그대로 보인다');
  // 저장 실패가 조용히 사라지지 않는다
  assert.ok(/setSaveError\(toUserMessage\(/.test(s), '저장 실패가 화면에 안 뜬다');
}

// ── ① 참석률 임베드는 FK가 없어 400이 난다 ─────────────────────
{
  const s = read('src/features/team/services/memberProfileService.ts');
  assert.ok(!/team_member_stats\s*\(/.test(s), 'FK 없는 집계 뷰를 다시 임베드했다 — PGRST200 400');
  assert.ok(/from\('team_member_stats'\)/.test(s), '참석률을 아예 안 가져온다');
}

console.log('settingswipe.check: ok');
