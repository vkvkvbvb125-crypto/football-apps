// scripts/teamprofile.check.ts — 팀 프로필 표시 줄
//
// 요일 인덱스가 두 체계다: team_settings.default_weekdays는 0=월, JS Date.getDay()는
// 0=일. 한 번 섞이면 표시가 하루씩 밀린 채로 조용히 굴러간다 — 화면에 "매주 화요일"이
// 뜨는데 실제 경기는 수요일이면 아무도 버그로 신고하지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEEKDAYS, regularLabel } from '../src/features/team/weekdays.ts';
import { recentAvgHeadcount } from '../src/features/attendance/utils/attendanceRate.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 0=월 ───────────────────────────────────────────────────────
// DB에서 수요일을 저장하면 [2]가 들어간다 (실측 2026-08-22)
assert.equal(WEEKDAYS[0], '월');
assert.equal(WEEKDAYS[2], '수');
assert.equal(WEEKDAYS[6], '일');
assert.equal(regularLabel([2], '20:00:00'), '매주 수요일 20:00');

// 복수 요일 — teams에 단일 int를 두지 않은 이유
assert.equal(regularLabel([1, 3], '20:00:00'), '매주 화·목요일 20:00');
// 순서가 뒤집혀 저장돼도 월→일 순으로 읽는다
assert.equal(regularLabel([3, 1], '20:00'), '매주 화·목요일 20:00');

// 요일이 없으면 시간만으로는 뜻이 없다
assert.equal(regularLabel([], '20:00:00'), null);
assert.equal(regularLabel(null, '20:00:00'), null);
// 시간만 없으면 요일까지는 말할 수 있다
assert.equal(regularLabel([2], null), '매주 수요일');
// 범위 밖 값이 섞여도 배열 밖을 읽지 않는다
assert.equal(regularLabel([2, 9], '20:00'), '매주 수요일 20:00');

// ── 평균 인원은 placeholder 전용 ────────────────────────────────
{
  const now = new Date('2026-08-23T12:00:00+09:00');
  const at = (iso: string, n: number) => ({ matchDate: iso, attendCount: n });
  // 이미 치른 경기만 — 앞으로 있을 경기는 아직 아무도 투표 안 했을 수 있다
  assert.equal(
    recentAvgHeadcount([at('2026-08-05T20:00:00+09:00', 10), at('2026-09-05T20:00:00+09:00', 0)], now),
    10
  );
  // 3개월 밖은 뺀다
  assert.equal(recentAvgHeadcount([at('2026-01-05T20:00:00+09:00', 30), at('2026-08-05T20:00:00+09:00', 10)], now), 10);
  // 표본이 없으면 null — 0명과 "아직 없음"은 다르다
  assert.equal(recentAvgHeadcount([], now), null);
  assert.equal(recentAvgHeadcount([at('2026-08-05T20:00:00+09:00', 11), at('2026-08-12T20:00:00+09:00', 12)], now), 12);

  // 자동값은 placeholder로만 — 저장 경로에 실리면 안 된다
  const screen = read('src/features/team/screens/TeamSettingsScreen.tsx');
  assert.ok(/placeholder={headcountHint}/.test(screen), '자동 계산값이 placeholder로 안 간다');
  assert.ok(/최근 경기 평균/.test(screen), '자동값이라는 표시가 없다 — 저장된 값처럼 보인다');
  assert.ok(!/avgHeadcount: autoHeadcount/.test(screen), '자동 계산값을 저장한다');
  // CHECK 제약(1..99) 밖은 보내기 전에 막는다
  assert.ok(/next < 1 \|\| next > 99/.test(screen), '범위 가드가 없다 — DB가 23514로 거절한다');
}

// ── 프로필 저장은 칸별로 나간다 ─────────────────────────────────
{
  const svc = read('src/features/team/services/teamService.ts');
  // 즉시 저장 3개가 매번 6칸을 보내면 남의 최신 값을 화면의 낡은 값으로 덮는다
  assert.ok(/PROFILE_COLUMN/.test(svc), '팀 프로필이 다시 전 칸 전송이다');
  assert.ok(/if \(Object\.keys\(patch\)\.length === 0\) return;/.test(svc), '빈 patch도 UPDATE를 날린다');
  // DB에 없는 컬럼 — 실리면 프로필 저장 전체가 실패한다
  for (const dead of ['regular_weekday', 'regular_time']) {
    assert.ok(!svc.includes(dead), `${dead}는 teams에 없다 (마이그레이션에서 뺐다)`);
    assert.ok(!read('src/types/database.ts').includes(dead), `${dead}가 타입에 남아 있다`);
  }
}

// ── 빈 프로필 안내는 총무만 ────────────────────────────────────
{
  /*
   * 파일이 갈라지면서 둘이 다른 곳에 있다 — 읽는 대상만 나눈다.
   *   "채워주세요" 안내   팀 홈 탭
   *   프로필 표시 줄      부모(배너 안이라 탭 위에 있다)
   */
  const homeTab = read('src/features/team/components/TeamHomeTab.tsx');
  const home = read('src/features/team/screens/TeamHomeScreen.tsx');
  assert.ok(
    /isAdmin && profileBits\.length === 0/.test(homeTab),
    '팀원에게도 "채워주세요"가 뜬다 — 채울 권한이 없는 사람에게 할 일을 만든다'
  );
  assert.ok(/profileBits\.length > 0 &&/.test(home), '빈 줄이 자리를 차지한다');
  assert.ok(!/미설정/.test(home.slice(home.indexOf('profileBits'), home.indexOf('profileBits') + 900)),
    '빈 항목을 "미설정"으로 채운다 — 줄이 정보가 아니라 빈칸 목록이 된다');
}

console.log('teamprofile.check: ok');
