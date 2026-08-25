// scripts/voteguard.check.ts — 투표 차단이 쓰기 경로에 있는가
//
// 예전엔 마감 판정이 화면에만 있었다. MatchDetailCard의 disabled={isLocked}가 전부였고,
// 그건 버튼을 안 눌리게 할 뿐 쓰기를 막지 않는다. 부르는 경로가 하나 더 생기면
// (참석 명단 시트의 「내 응답 변경」 같은 것) 그 화면이 판정을 다시 계산해야 하고,
// 그러면 규칙이 두 곳으로 갈린다.
//
// 그래서 스토어와 화면이 **같은 함수**를 보는지를 한자리에서 묶는다. 셰브론 조건과
// 모달의 편집 권한을 한 단언으로 묶은 것과 같은 방식이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isVotingOpen, votingLockNote } from '../src/features/attendance/utils/voting';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 「가드 없음」으로 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const store = read('src/features/attendance/stores/attendanceStore.ts');
const card = read('src/features/attendance/components/MatchDetailCard.tsx');
const screen = read('src/features/attendance/screens/AttendanceScreen.tsx');

// ── 1. 판정 함수 자체 ───────────────────────────────────────────────
{
  const open = { status: 'open' as const, vote_deadline: null };
  const past = { status: 'open' as const, vote_deadline: '2020-01-01T00:00:00Z' };
  const locked = { status: 'locked' as const, vote_deadline: null };
  const done = { status: 'completed' as const, vote_deadline: null };

  assert.equal(isVotingOpen(open), true, '마감 없는 열린 경기가 막힌다');
  assert.equal(isVotingOpen(past), false, '마감 시각이 지났는데 열려 있다');
  assert.equal(isVotingOpen(locked), false);
  assert.equal(isVotingOpen(done), false);

  // 마감 없음은 「안 지남」이다 — null을 「지남」으로 보면 마감을 안 정한 팀이 전부 막힌다
  assert.equal(isVotingOpen({ status: 'open', vote_deadline: null }), true);

  assert.equal(votingLockNote(open, false), null, '열린 경기에 잠금 사유가 붙는다');
  assert.equal(votingLockNote(done, false), '종료된 경기예요');
  assert.equal(votingLockNote(locked, false), '총무가 투표를 마감했어요');
  // 총무에게만 되돌리는 방법을 덧붙인다
  assert.ok(votingLockNote(past, true)!.includes('마감 시각을 바꿀 수 있어요'));
  assert.ok(!votingLockNote(past, false)!.includes('마감 시각을 바꿀 수 있어요'));
}

// ── 2. 쓰기 경로가 그 함수를 본다 ───────────────────────────────────
{
  const vote = store.slice(store.indexOf('vote: async (matchId, status)'));
  const body = vote.slice(0, vote.indexOf('\n  },'));
  assert.ok(/isVotingOpen\(match\)/.test(body), 'vote()가 마감을 안 본다 — 쓰기가 화면 밖에서 뚫린다');
  assert.ok(/throw new Error/.test(body), 'vote()가 조용히 return한다 — 호출자가 실패를 모른다');
  assert.ok(/votingLockNote\(/.test(body), '막은 이유를 안 만든다 — 화면에 띄울 문구가 없다');
  assert.ok(/set\(\{ error: reason \}\)/.test(body), '이유를 스토어 error에 안 넣는다 — 화면이 못 그린다');
}

// ── 3. 화면과 스토어가 같은 함수를 본다 ─────────────────────────────
// 한쪽만 다른 조건으로 바뀌면 여기서 걸린다.
{
  assert.ok(/const isLocked = !isVotingOpen\(selectedMatch\)/.test(screen),
    '화면이 다른 방식으로 잠금을 판정한다 — 스토어와 갈린다');
  assert.ok(/disabled=\{p\.isLocked\}/.test(card), '카드가 잠금을 무시하고 버튼을 연다');
}

// ── 4. 총무 예외가 없다 ─────────────────────────────────────────────
//
// 홈의 「총무는 마감 뒤에도 경기를 관리한다」(isAdmin || voteOpen)는 **이동 버튼** 조건이고
// 라벨이 「경기 관리」다. 투표 권한이 아니다. 그 주석을 보고 「총무는 마감 후에도 투표한다」로
// 오독해 isAdmin ||를 붙이면 화면과 스토어가 갈린다.
{
  const vote = store.slice(store.indexOf('vote: async (matchId, status)'));
  const body = vote.slice(0, vote.indexOf('\n  },'));
  // 이 부정 단언은 body 안에 「isAdmin ||」를 넣어 실패하는 것을 확인했다
  assert.ok(!/isAdmin \|\|/.test(body), 'vote() 가드에 총무 예외가 붙었다 — 화면은 여전히 막는다');
  assert.ok(!/role === 'admin' \|\|/.test(body), 'vote() 가드에 총무 예외가 붙었다');
  // 화면 쪽에도 없어야 한다
  const lockLine = screen.match(/const isLocked = [^;]+;/);
  assert.ok(lockLine && !/isAdmin/.test(lockLine[0]),
    `화면의 잠금 판정에 총무 예외가 붙었다: ${lockLine?.[0]}`);
}

// ── 5. 던진 것을 호출부가 받는다 ────────────────────────────────────
// 안 받으면 unhandled rejection이 된다.
{
  assert.ok(/vote\(selectedMatch\.id, status\)\.catch\(/.test(screen),
    'onVote가 vote()의 실패를 안 받는다 — unhandled rejection이 된다');
}

console.log('voteguard ok');
