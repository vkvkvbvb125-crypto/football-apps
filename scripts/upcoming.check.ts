// scripts/upcoming.check.ts — 「다가오는 경기」 빈 상태가 거짓말하지 않는가
//
// 버그: 경기를 5개 만들어 뒀는데 목록이 "아직 등록된 경기가 없어요"라고 했다.
// upcomingMatches가 오늘 0시 이후만 담는데, 빈 상태 문구는 그 0을
// "경기가 하나도 없음"으로만 해석했다 — 방금 만든 게 사라진 것처럼 보인다.
//
// 예전엔 이 파일이 「AttendanceScreen의 필터와 같은 식」이라며 계산을 다시 써 놓고
// 그 사본을 시험했다. 화면의 식이 바뀌어도 검사는 자기 사본을 보고 통과한다 —
// 깨진 적이 없는 게 아니라 깨질 수가 없었다. 지금은 화면이 쓰는 함수를 그대로 부른다.
//
// 문구 쪽은 함수로 빼지 않았다. matches.length와 isAdmin으로 제목·부제·버튼이 함께
// 갈리는 한 덩어리라, 제목만 떼면 한 판단이 두 곳으로 나뉜다. 그래서 화면 소스를
// 집어서 본다 — score.check가 scoreStore를 보는 방식과 같다. 사본만 아니면 된다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upcomingFrom } from '../src/features/attendance/utils/upcoming.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const screen = readFileSync(new URL('../src/features/attendance/screens/AttendanceScreen.tsx', import.meta.url), 'utf8')
  .split('\r')
  .join('');

/** 화면이 넘기는 모양대로 감싼다 — 여기서 거르지 않는다 */
const upcoming = (dates: string[], now: Date) =>
  upcomingFrom(dates.map((d) => ({ match_date: d })), now).map((m) => m.match_date);

const now = new Date('2026-08-19T10:00:00+09:00');
const past = ['2026-08-14T20:00:00+09:00', '2026-08-15T20:00:00+09:00', '2026-08-18T20:00:00+09:00'];

// ── 1. 고르는 식 ────────────────────────────────────────────────────
// 신고된 상황: 지난 경기만 셋
assert.equal(upcoming(past, now).length, 0, '지난 경기는 다가오는 경기가 아니다');

// 오늘 경기는 시각이 지났어도 다가오는 경기다 (0시 기준)
assert.equal(upcoming(['2026-08-19T08:00:00+09:00'], now).length, 1, '오늘 아침 경기가 빠지면 안 된다');

// 경계 — 오늘 0시 정각은 들어오고, 어제 23:59:59는 안 들어온다
assert.equal(upcoming(['2026-08-19T00:00:00+09:00'], now).length, 1, '오늘 0시 정각이 빠진다');
assert.equal(upcoming(['2026-08-18T23:59:59+09:00'], now).length, 0, '어제 밤 경기가 들어온다');

// 시간순으로 준다 — 목록이 뒤죽박죽이면 「다음 경기」가 첫 줄이 아니게 된다
assert.deepEqual(
  upcoming(['2026-08-21T20:00:00+09:00', '2026-08-19T20:00:00+09:00', '2026-08-20T20:00:00+09:00'], now),
  ['2026-08-19T20:00:00+09:00', '2026-08-20T20:00:00+09:00', '2026-08-21T20:00:00+09:00'],
  '시간순으로 정렬하지 않는다'
);

// ── 2. 빈 상태 문구 — 화면 소스를 집어서 본다 ───────────────────────
//
// 「같은 0이라도 뜻이 둘」이라는 판단이 화면에 남아 있는지를 본다. 여기 사본을 두면
// 화면이 한 문구로 되돌아가도 검사는 자기 사본을 보고 통과한다 — 그게 이 파일이 고쳐진 이유다.
{
  const from = screen.indexOf('{upcomingMatches.length === 0 ? (');
  assert.ok(from > 0, '빈 상태 분기를 못 찾았다');
  const block = screen.slice(from, screen.indexOf('</EmptyState>', from) + 1 || from + 1600);

  // 두 문구가 갈려 있어야 한다. 가르는 기준은 upcomingMatches가 아니라 matches다 —
  // upcomingMatches는 이미 0이라 아무것도 못 가른다.
  assert.ok(
    /title=\{matches\.length === 0 \? '아직 등록된 경기가 없어요' : '다가오는 경기가 없어요'\}/.test(block),
    '빈 상태 제목이 같은 0을 두 뜻으로 가르지 않는다 — 경기를 만들어 둔 사람에게 하나도 없다고 말한다'
  );

  // 지난 경기가 어디 있는지 알려준다. 「없어요」로 끝나면 방금 만든 게 사라진 것처럼 보인다
  assert.ok(/지난 경기 \$\{matches\.length\}개는 위 달력에서 볼 수 있어요/.test(block),
    '지난 경기가 어디 있는지 안 알려준다');

  // 총무에게만 만들기 버튼. 팀원에게 주면 눌러도 아무것도 못 한다
  assert.ok(/actionLabel=\{isAdmin \?/.test(block), '만들기 버튼이 역할을 안 본다');
}

console.log('upcoming.check: ok');
