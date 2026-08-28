// scripts/matchwindow.check.ts — 「지금 다루는 경기」의 경계는 하나다
//
// 유예 3시간이 두 파일에 각자 있었다. 값도 같고 주석이 서로를 「같은 기준」이라 가리키기까지
// 했는데 값은 각자였다 — 한쪽만 바꾸면 갈리고, 갈렸다는 사실이 어디에도 안 남는다.
//
// 그리고 정산만 유예가 없어서 경계가 3시간 어긋나 있었다. 그 사이에 한 경기가 두 화면에서
// 「운영 중」과 「끝났으니 정산해라」로 동시에 읽혔다.
//
// 붙드는 것:
//   1. 경계가 한 곳에서 나오는가 (사본이 돌아오면 갈린다)
//   2. 여집합이 같은 경계를 쓰는가 (정산이 자기 now를 다시 만들면 3시간이 다시 벌어진다)
//   3. 일정 목록은 여기 안 들어왔는가 (다른 물음이라 모으면 한쪽이 틀린다)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlyMatch } from './lib/anchor.ts';
import { MATCH_GRACE_MS, isLiveMatch, liveSince, liveMatchesFrom } from '../src/features/attendance/utils/matchWindow.ts';
import { upcomingFrom } from '../src/features/attendance/utils/upcoming.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const assign = read('src/features/assignment/screens/AssignmentScreen.tsx');
const home = read('src/features/home/screens/HomeScreen.tsx');
const store = read('src/features/settlement/stores/settlementStore.ts');

// ── 1. 경계가 한 곳에서 나온다 ──────────────────────────────────────
{
  assert.equal(MATCH_GRACE_MS, 3 * 60 * 60 * 1000, '유예가 3시간이 아니다');

  // 사본 회귀 — 값을 만드는 그 줄이 화면에 다시 생기면 잡는다
  for (const [name, src] of [['경기운영', assign], ['홈', home]] as const) {
    assert.ok(!/const \w*GRACE\w*_MS = /.test(src), `${name}에 유예 상수 사본이 돌아왔다`);
    assert.ok(/liveMatchesFrom\(matches\)/.test(src), `${name}이 공용 경계를 안 쓴다`);
  }

  // 킥오프 3시간 경계 — 안쪽은 살아 있고 바깥은 끝났다
  const now = new Date('2026-08-20T20:00:00Z');
  const at = (h: number) => ({ match_date: new Date(now.getTime() - h * 3600_000).toISOString() });
  assert.equal(isLiveMatch(at(0), now), true, '킥오프 순간이 「지금 다루는 경기」가 아니다');
  assert.equal(isLiveMatch(at(2), now), true, '2시간 뒤가 빠졌다');
  assert.equal(isLiveMatch(at(2.99), now), true, '경계 안쪽이 빠졌다');
  assert.equal(isLiveMatch(at(3.01), now), false, '3시간을 넘겼는데 남아 있다');
  // 미래 경기도 「다루는 경기」다 — 홈의 「다음 경기」가 그것이다
  assert.equal(isLiveMatch({ match_date: new Date(now.getTime() + 86400_000).toISOString() }, now), true);

  // 가까운 순서로 준다 — 홈이 [0]을 「다음 경기」로 쓴다
  const sorted = liveMatchesFrom([at(-48), at(-2), at(2)], now).map((m) => m.match_date);
  assert.deepEqual(sorted, [at(2).match_date, at(-2).match_date, at(-48).match_date].sort(), '가까운 순서가 아니다');
}

// ── 2. 정산은 같은 경계의 여집합이다 ────────────────────────────────
//
// 자기 now를 다시 만들면 3시간이 다시 벌어진다. 그때 화면에서 보이는 것은
// 「경기 중인데 정산하라고 뜬다」뿐이고, 왜인지는 안 보인다.
{
  const q = onlyMatch(store, /\.lt\('match_date', [^)]+\)/, '정산 경계');
  assert.ok(/liveSince\(\)/.test(q), `정산이 공용 경계를 안 쓴다: ${q}`);
  assert.ok(!/new Date\(\)\.toISOString\(\)/.test(q), `정산이 자기 now를 만든다: ${q}`);

  // 여집합인가 — 한쪽이 참이면 다른 쪽은 거짓이어야 한다
  const now = new Date('2026-08-20T20:00:00Z');
  const cut = liveSince(now).getTime();
  for (const h of [0, 1, 2.99, 3.01, 10]) {
    const m = { match_date: new Date(now.getTime() - h * 3600_000).toISOString() };
    const live = isLiveMatch(m, now);
    const finished = new Date(m.match_date).getTime() < cut;
    assert.notEqual(live, finished, `${h}시간 전 경기가 「다루는 중」과 「끝났다」 둘 다이거나 둘 다 아니다`);
  }
}

// ── 3. 일정 목록은 다른 물음이다 ────────────────────────────────────
//
// 「몇 시간 지났나」와 「오늘 것인가」는 다르다. 모으면 한쪽이 틀린다.
{
  // 저녁 8시 경기를 밤 11시 30분에 보면 — 유예로는 끝났고, 날 단위로는 남는다
  const now = new Date(2026, 7, 20, 23, 30);
  const evening = { match_date: new Date(2026, 7, 20, 20, 0).toISOString() };
  assert.equal(isLiveMatch(evening, now), false, '3.5시간 지났는데 유예 안에 있다');
  assert.equal(upcomingFrom([evening], now).length, 1, '오늘 경기가 일정 목록에서 사라졌다');

  // 그래서 일정은 이 유틸을 안 쓴다
  const up = read('src/features/attendance/utils/upcoming.ts');
  assert.ok(/setHours\(0, 0, 0, 0\)/.test(up), '일정 목록이 날 단위가 아니게 됐다');
  assert.ok(!/matchWindow|MATCH_GRACE_MS/.test(up), '일정 목록이 유예 경계로 합쳐졌다 — 다른 물음이다');
}

console.log('matchwindow ok');
