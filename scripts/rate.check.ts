// scripts/rate.check.ts — 팀 참석률 정의
//
// 홈의 통계 타일과 팀 화면 통계가 같은 함수를 쓴다. 정의가 갈리면 같은 팀에서
// 값이 다르게 나오고, 그때 어느 쪽이 맞는지 알 방법이 없다.
import assert from 'node:assert/strict';
import { monthlyAttendanceRate, formatRate } from '../src/features/attendance/utils/attendanceRate.ts';

const now = new Date('2026-08-19T12:00:00+09:00');
const M = (d: string, n: number) => ({ matchDate: d, attendCount: n });
const old3 = [{ joinedAt: '2026-01-01' }, { joinedAt: '2026-01-01' }, { joinedAt: '2026-01-01' }];

// 기본: 이번 달 지난 경기 2개, 3명 팀, 각 2명 참석 → 4/6
{
  const r = monthlyAttendanceRate([M('2026-08-10T20:00:00+09:00', 2), M('2026-08-17T20:00:00+09:00', 2)], old3, now);
  assert.equal(r.attended, 4);
  assert.equal(r.slots, 6);
  assert.equal(formatRate(r), '67%');
}

// 앞으로 있을 경기는 세지 않는다 — 만들자마자 참석률이 떨어지면 안 된다
{
  const r = monthlyAttendanceRate(
    [M('2026-08-10T20:00:00+09:00', 3), M('2026-08-25T20:00:00+09:00', 0)], old3, now);
  assert.equal(r.matchCount, 1, '미래 경기가 분모에 들어갔다');
  assert.equal(formatRate(r), '100%');
}

// 지난달 경기는 빠진다
assert.equal(monthlyAttendanceRate([M('2026-07-20T20:00:00+09:00', 3)], old3, now).matchCount, 0);

// 새 멤버가 지난 경기의 분모를 늘리지 않는다
{
  const withNewbie = [...old3, { joinedAt: '2026-08-18T00:00:00+09:00' }];
  const r = monthlyAttendanceRate([M('2026-08-10T20:00:00+09:00', 3)], withNewbie, now);
  assert.equal(r.slots, 3, '8/18 가입자가 8/10 경기 분모에 들어갔다');
  assert.equal(formatRate(r), '100%');
}
// 그 뒤 경기부터는 포함된다
{
  const withNewbie = [...old3, { joinedAt: '2026-08-18T00:00:00+09:00' }];
  assert.equal(monthlyAttendanceRate([M('2026-08-19T09:00:00+09:00', 3)], withNewbie, now).slots, 4);
}
// joinedAt을 모르면 처음부터 있던 것으로 — 분모를 줄여 참석률을 부풀리지 않는다
assert.equal(monthlyAttendanceRate([M('2026-08-10T20:00:00+09:00', 1)], [{}, {}], now).slots, 2);

// 셀 경기가 없으면 0%가 아니라 "-"
{
  const r = monthlyAttendanceRate([], old3, now);
  assert.equal(r.rate, null);
  assert.equal(formatRate(r), '-');
}
// 응답 수가 멤버 수를 넘어도 100%를 넘기지 않는다
assert.equal(formatRate(monthlyAttendanceRate([M('2026-08-10T20:00:00+09:00', 99)], old3, now)), '100%');

console.log('rate.check: ok');

// ── 개인 참석률 (최근 3개월) ─────────────────────────────────
import { memberAttendanceRate, formatMemberRate, MEMBER_RATE_MONTHS } from '../src/features/attendance/utils/attendanceRate.ts';

const MM = (d: string, ids: string[]) => ({ matchDate: d, attendIds: ids });
const me = { id: 'u1', joinedAt: '2026-01-01' };

assert.equal(MEMBER_RATE_MONTHS, 3);

// 3개월 안, 5경기 중 4번 참석 → 80%
{
  const ms = ['2026-06-01','2026-07-01','2026-07-15','2026-08-01','2026-08-10']
    .map((d,i)=>MM(`${d}T20:00:00+09:00`, i===2?[]:['u1']));
  const r = memberAttendanceRate(ms, me, now);
  assert.equal(r.slots, 5);
  assert.equal(r.attended, 4);
  assert.equal(formatMemberRate(r), '3개월 80%', '라벨에 기준이 보여야 한다');
}
// 3개월 밖은 빠진다
assert.equal(memberAttendanceRate([MM('2026-01-05T20:00:00+09:00', ['u1'])], me, now).slots, 0);
// 앞으로 있을 경기도 빠진다
assert.equal(memberAttendanceRate([MM('2026-08-25T20:00:00+09:00', [])], me, now).slots, 0);

// 표본 3회 미만이면 퍼센트 대신 "-" — 신규 멤버가 한 번 빠지고 0%로 찍히면 오해다
{
  const ms = [MM('2026-08-10T20:00:00+09:00', []), MM('2026-08-17T20:00:00+09:00', [])];
  const r = memberAttendanceRate(ms, { id: 'u1', joinedAt: '2026-08-05' }, now);
  assert.equal(r.slots, 2);
  assert.equal(r.rate, null);
  assert.equal(formatMemberRate(r), '-');
}
// 딱 3회부터는 퍼센트를 낸다
{
  const ms = ['2026-08-01','2026-08-10','2026-08-17'].map(d=>MM(`${d}T20:00:00+09:00`, ['u1']));
  assert.equal(formatMemberRate(memberAttendanceRate(ms, me, now)), '3개월 100%');
}
// 가입 전 경기는 분모에서 빠진다
{
  const ms = ['2026-06-01','2026-08-01','2026-08-10','2026-08-17'].map(d=>MM(`${d}T20:00:00+09:00`, ['u2']));
  const late = { id: 'u2', joinedAt: '2026-07-20' };
  assert.equal(memberAttendanceRate(ms, late, now).slots, 3, '가입 전 6/1 경기가 분모에 들어갔다');
}

console.log('rate.check(member): ok');
