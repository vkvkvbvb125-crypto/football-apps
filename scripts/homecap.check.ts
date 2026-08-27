// scripts/homecap.check.ts — 홈 카드의 정원·대기
//
// 홈이 참석 인원을 **손으로 세고 있었다.** votes.filter(attend).length — 정원을 안 본다.
// 그래서 정원 12에 15명이 참석하면 홈은 「참석 15」, 일정 화면은 「참석 12」로 같은
// 경기에 두 숫자가 떴다(resolveCapacity의 attendCount는 min(참석, 정원)이다).
//
// 진행바는 더 나빴다. 분모가 멤버 수라 1명 팀에서 그 한 명이 참석하면 바가 꽉 찼다 —
// 「정원 12명」이라고 적힌 카드 옆에서다. MatchDetailCard가 이미 같은 이유로 고친
// 계산인데(:70-76 「memberCount를 쓰고 있었다」), 홈에 고치기 전 버전이 남아 있었다.
// 화면에서 눈으로 검산할 수 있는 어긋남이라 더 나쁘다는 그 판단이 여기에도 그대로 든다.
//
// 붙드는 것:
//   1. 홈이 공용 계산을 쓰는가 (손계산으로 돌아가면 값이 다시 갈린다)
//   2. 두 화면의 진행바 분모가 같은가 (같은 모양이 두 뜻이 되는 게 이 항목의 핵심이다)
//   3. 「대기 N번」을 만드는 자리가 하나인가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlyMatch } from './lib/anchor.ts';
import { resolveCapacity, attendButtonLabel } from '../src/features/attendance/utils/capacity.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const home = read('src/features/home/screens/HomeScreen.tsx');
const card = read('src/features/attendance/components/MatchDetailCard.tsx');
const util = read('src/features/attendance/utils/capacity.ts');

// ── 1. 홈이 공용 계산을 쓴다 ────────────────────────────────────────
{
  assert.ok(/import \{ resolveCapacity \}/.test(home), '홈이 resolveCapacity를 안 쓴다 — 손으로 세면 일정 화면과 값이 갈린다');
  assert.ok(/resolveCapacity\(next\.votes, capacity, members\.length, activeTeam\.membershipId\)/.test(home),
    '홈이 resolveCapacity를 부르지 않거나 인자가 다르다');

  // 손계산 회귀 — 값을 만드는 그 줄을 집어서 본다
  const counts = ['attendCount', 'absentCount', 'undecidedCount'];
  for (const name of counts) {
    const line = onlyMatch(home, new RegExp(`const ${name} = .+`), `${name} 계산`);
    assert.ok(/cap\?\./.test(line), `홈이 ${name}를 손으로 센다: ${line.trim()}`);
    assert.ok(!/votes\.filter/.test(line), `홈이 ${name}를 votes.filter로 센다: ${line.trim()}`);
  }
}

// ── 2. 두 화면의 진행바 분모가 같다 ────────────────────────────────
//
// 이게 이 검사의 이유다. 한쪽만 바뀌면 같은 모양의 바가 두 뜻이 되는데, 화면에서는
// 둘 다 「초록이 얼마나 찼나」로만 보여서 어느 쪽이 맞는지 알 방법이 없다.
{
  const homeRate = onlyMatch(home, /const fillRate = .+/, '홈 진행바');
  const cardRate = onlyMatch(card, /const total = .+/, '카드 진행바');
  assert.ok(/capacity/.test(homeRate), `홈 진행바 분모가 정원이 아니다: ${homeRate.trim()}`);
  assert.ok(/p\.capacity/.test(cardRate), `카드 진행바 분모가 정원이 아니다: ${cardRate.trim()}`);
  assert.ok(!/members\.length|voteTotal/.test(homeRate), `홈 진행바 분모가 멤버 수로 돌아갔다: ${homeRate.trim()}`);

  // 1명 팀에서 100%가 안 나온다 — 분모가 멤버 수였을 때의 증상이다
  const solo = resolveCapacity([{ team_member_id: 'me', status: 'attend' }], 12, 1, 'me');
  assert.equal(solo.attendCount, 1);
  assert.ok(solo.attendCount / 12 < 0.1, '1명 팀에서 바가 꽉 찬다');

  // 정원을 넘겨도 표시 인원은 정원까지다 — 홈과 일정이 같은 수를 적는 근거
  const over = resolveCapacity(
    Array.from({ length: 15 }, (_, i) => ({ team_member_id: `m${i}`, status: 'attend' as const })),
    12,
    15,
    'm14'
  );
  assert.equal(over.attendCount, 12, '정원을 넘긴 참석이 그대로 세어진다');
  assert.equal(over.myWaitPosition, 3, '대기 순번이 틀리다');
}

// ── 3. 「대기 N번」을 만드는 자리는 하나다 ──────────────────────────
//
// 공용 함수가 있는데 MatchDetailCard가 같은 삼항식을 베껴 쓰고 있었다. 공유 단위가
// 없어서가 아니라 뽑아 둔 것을 안 써서 생긴 중복이다.
{
  assert.equal(attendButtonLabel({ myWaitPosition: 2 } as never, 'attend'), '대기 2번');
  assert.equal(attendButtonLabel({ myWaitPosition: 0, isFull: true } as never, 'absent'), '대기 신청');
  assert.equal(attendButtonLabel({ myWaitPosition: 0, isFull: false } as never, null), '참석');

  assert.ok(/attendButtonLabel\(p\.capacityResult, p\.myVote\)/.test(card), '카드가 공용 라벨 함수를 안 쓴다');
  // 삼항식 사본이 돌아왔는가 — 근거 주석에는 「대기 N번」이 남아야 하므로 코드 꼴을 본다
  assert.ok(!/`대기 \$\{myWaitPosition\}번`/.test(card), '카드에 라벨 삼항식 사본이 돌아왔다');

  // 홈은 버튼이 아니라 안내다. 문구가 달라서 함수를 공유하지 않는다 —
  // 나누는 것은 계산(myWaitPosition)이지 문자열이 아니다
  assert.ok(/cap\.myWaitPosition > 0 &&/.test(home), '홈이 대기 순번을 안 그린다');
  assert.ok(/대기 \{cap\.myWaitPosition\}번이에요/.test(home), '홈의 대기 안내 문구가 없다');

  // 승격 함수는 지웠다 — 대기는 매번 정렬로 다시 계산되니 승격 대상을 고를 일이 없다
  assert.ok(!/export function nextPromotion/.test(util), 'nextPromotion이 돌아왔다 — 대기는 저장된 상태가 아니다');
}

console.log('homecap ok');
