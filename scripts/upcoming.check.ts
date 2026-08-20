// scripts/upcoming.check.ts — 「다가오는 경기」 빈 상태가 거짓말하지 않는가
//
// 버그: 경기를 5개 만들어 뒀는데 목록이 "아직 등록된 경기가 없어요"라고 했다.
// upcomingMatches가 오늘 0시 이후만 담는데, 빈 상태 문구는 그 0을
// "경기가 하나도 없음"으로만 해석했다 — 방금 만든 게 사라진 것처럼 보인다.
import assert from 'node:assert/strict';

/** AttendanceScreen의 필터와 같은 식 */
function upcoming(dates: string[], now: Date) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  return dates.filter((d) => new Date(d).getTime() >= startOfToday);
}
/** 빈 상태 제목 — 화면과 같은 분기 */
function emptyTitle(total: number) {
  return total === 0 ? '아직 등록된 경기가 없어요' : '다가오는 경기가 없어요';
}

const now = new Date('2026-08-19T10:00:00+09:00');
const past = ['2026-08-14T20:00:00+09:00', '2026-08-15T20:00:00+09:00', '2026-08-18T20:00:00+09:00'];

// 신고된 상황: 지난 경기만 셋
assert.equal(upcoming(past, now).length, 0, '지난 경기는 다가오는 경기가 아니다');
assert.equal(emptyTitle(past.length), '다가오는 경기가 없어요');
assert.notEqual(emptyTitle(past.length), '아직 등록된 경기가 없어요', '경기가 있는데 없다고 말하면 안 된다');

// 진짜로 하나도 없을 때만 "아직 등록된 경기가 없어요"
assert.equal(emptyTitle(0), '아직 등록된 경기가 없어요');

// 오늘 경기는 시각이 지났어도 다가오는 경기다 (0시 기준)
assert.equal(upcoming(['2026-08-19T08:00:00+09:00'], now).length, 1, '오늘 아침 경기가 빠지면 안 된다');
// 자정 직전에 만든 내일 경기
assert.equal(upcoming(['2026-08-20T00:30:00+09:00'], now).length, 1);
// 어제 23:59는 빠진다
assert.equal(upcoming(['2026-08-18T23:59:00+09:00'], now).length, 0);

console.log('upcoming.check: ok');

// ── 경기 만들기가 지난 날짜로 새지 않는가 ─────────────────────────
// 신고: "오늘 날짜로 만들었는데 일정이 없다고 뜬다".
// 실제로는 캘린더에 8/18이 골라져 있는 상태에서 「경기 만들기」를 눌러 8/18로 만들어졌고,
// 그 경기는 만들자마자 upcoming 필터(오늘 0시 이후) 밖으로 떨어졌다.

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** handleOpenCreate와 같은 보정 */
function openDate(selected: Date, now: Date) {
  const today = day(now);
  return day(selected).getTime() < today.getTime() ? today : selected;
}
/** 시트의 isPastDate와 같은 판정 */
const isPast = (selected: Date, now: Date) => day(selected).getTime() < day(now).getTime();

const today19 = new Date('2026-08-19T10:00:00+09:00');

// 어제가 골라져 있어도 오늘로 열린다
assert.equal(day(openDate(new Date('2026-08-18T20:00:00+09:00'), today19)).getDate(), 19);
// 그렇게 만든 경기는 다가오는 경기에 남는다 — 신고된 증상이 사라지는 지점
{
  const opened = openDate(new Date('2026-08-18T20:00:00+09:00'), today19);
  const made = new Date(opened);
  made.setHours(20, 0, 0, 0);
  assert.equal(upcoming([made.toISOString()], today19).length, 1, '만든 경기가 목록에 남아야 한다');
}
// 미래 날짜는 건드리지 않는다
assert.equal(day(openDate(new Date('2026-08-25T20:00:00+09:00'), today19)).getDate(), 25);
// 오늘은 지난 날짜가 아니다 — 오늘 저녁 경기를 오늘 아침에 만드는 건 흔하다
assert.equal(isPast(new Date('2026-08-19T06:00:00+09:00'), today19), false);
assert.equal(isPast(new Date('2026-08-18T23:59:00+09:00'), today19), true);

console.log('upcoming.check(create): ok');
