// scripts/optimistic.check.ts — 낙관 반영과 롤백
//
// 화면으로는 거의 안 갈린다. 성공할 때는 낙관 반영이 있든 없든 결과가 같고(재조회가
// 덮는다), 틀린 롤백은 「다음 재조회까지만」 틀려서 눈으로 보면 지나간다.
//
// 여기서 보는 것은 세 가지다:
//   1. putMyVote가 내 행 말고 아무것도 안 건드리는가 (참석 수·대기 순번이 전부 여기서 파생된다)
//   2. 되돌릴 값을 어디서 얻는가 (연타로 깔린 낙관 행을 그대로 되돌리면 서버에 없는 값이 남는다)
//   3. 스토어가 그 순서대로 부르는가 (반영 → castVote → 실패면 롤백, 성공이면 재조회)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MatchWithVotes, VoteRow } from '../src/features/attendance/services/attendanceService';
import {
  OPTIMISTIC_ID_PREFIX,
  isOptimisticVote,
  makeOptimisticVote,
  putMyVote,
  rollbackTarget,
} from '../src/features/attendance/utils/optimisticVote';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const store = read('src/features/attendance/stores/attendanceStore.ts');
const screen = read('src/features/attendance/screens/AttendanceScreen.tsx');

const vrow = (member: string, status: VoteRow['status'], updated: string, id = `srv-${member}`): VoteRow => ({
  id,
  match_id: 'M1',
  team_member_id: member,
  status,
  updated_at: updated,
});

const fixture = (): MatchWithVotes[] =>
  [
    {
      id: 'M1',
      capacity: 12,
      votes: [
        vrow('a', 'attend', '2026-08-01T10:00:00Z'),
        vrow('me', 'absent', '2026-08-01T11:00:00Z'),
        vrow('b', 'attend', '2026-08-01T12:00:00Z'),
      ],
    },
    { id: 'M2', capacity: 12, votes: [vrow('me', 'attend', '2026-08-02T10:00:00Z')] },
  ] as unknown as MatchWithVotes[];

// ── 1. putMyVote — 내 행 하나만 ─────────────────────────────────────
{
  const before = fixture();
  const row = vrow('me', 'attend', '2026-08-01T11:00:00Z');
  const after = putMyVote(before, 'M1', 'me', row);

  // 자리를 지킨다. 지웠다 뒤에 붙이면 updated_at이 같은 표들 사이에서 선착순이 흔들린다
  assert.equal(after[0].votes.findIndex((v) => v.team_member_id === 'me'), 1, '내 행이 있던 자리에 안 놓인다');
  assert.equal(after[0].votes.length, 3, '행 개수가 변했다');
  assert.equal(after[0].votes[1].status, 'attend');

  // 남의 표를 안 건드린다
  assert.deepEqual(after[0].votes[0], before[0].votes[0], '남의 표가 바뀌었다');
  assert.deepEqual(after[0].votes[2], before[0].votes[2], '남의 표가 바뀌었다');

  // 다른 경기는 객체 그대로 — 참조까지 같아야 쓸데없는 리렌더가 안 난다
  assert.equal(after[1], before[1], '상관없는 경기가 새 객체로 바뀐다');

  // votes 말고 다른 칸을 건드리면 안 된다
  const { votes: _av, ...aRest } = after[0] as MatchWithVotes & Record<string, unknown>;
  const { votes: _bv, ...bRest } = before[0] as MatchWithVotes & Record<string, unknown>;
  assert.deepEqual(aRest, bRest, 'votes 말고 다른 칸까지 바뀌었다 — 정원·대기는 votes에서 파생된다');

  // 원본을 안 고친다
  assert.equal(before[0].votes[1].status, 'absent', '원본 배열을 제자리에서 고쳤다');
}

// 신규 삽입 / 삭제
{
  const before = fixture();
  const added = putMyVote(before, 'M1', 'c', vrow('c', 'undecided', '2026-08-03T10:00:00Z'));
  assert.equal(added[0].votes.length, 4, '없던 행이 안 붙는다');
  assert.equal(added[0].votes[3].team_member_id, 'c', '새 행은 뒤에 붙는다');

  const removed = putMyVote(before, 'M1', 'me', null);
  assert.equal(removed[0].votes.length, 2, 'null인데 안 지운다');
  assert.ok(!removed[0].votes.some((v) => v.team_member_id === 'me'), '내 행이 남아 있다');
  // 없는 사람을 지우라고 하면 그 경기를 새로 만들지 않는다
  assert.equal(putMyVote(before, 'M1', 'nobody', null)[0], before[0], '없는 행을 지우면서 객체를 새로 만든다');
}

// ── 2. updated_at — 새로 찍을 때만 now ──────────────────────────────
//
// 서버는 재투표에서 이 칸을 안 올린다(트리거 없음, castVote 페이로드에 없음).
// now로 통일하면 낙관 반영에서 대기 맨 뒤로 갔다가 재조회에서 원래 순번으로 튄다.
{
  const now = new Date('2026-08-20T09:00:00Z');
  const prev = vrow('me', 'absent', '2026-08-01T11:00:00Z');

  const changed = makeOptimisticVote('M1', 'me', 'attend', prev, now);
  assert.equal(changed.updated_at, prev.updated_at, '바꾸는데 updated_at을 now로 덮는다 — 대기 순번이 튄다');
  assert.equal(changed.status, 'attend');
  assert.deepEqual(changed.replaced, prev, '덮은 원래 값을 안 들고 있다 — 연타 롤백이 깨진다');

  const fresh = makeOptimisticVote('M1', 'me', 'attend', null, now);
  assert.equal(fresh.updated_at, now.toISOString(), '새로 찍는데 updated_at이 now가 아니다');
  assert.equal(fresh.replaced, null);
}

// ── 3. 낙관 행 id 접두사는 계약이다 ─────────────────────────────────
//
// 서버 행의 id는 지금도 읽는 곳이 없다. 낙관 행의 id는 다르다 — 롤백이 이걸로
// 「아직 서버에 없는 행」을 판별한다. 접두사가 바뀌면 판별이 조용히 깨진다.
{
  assert.equal(OPTIMISTIC_ID_PREFIX, 'optimistic:', '낙관 행 접두사가 바뀌었다 — 롤백 판별이 깨진다');
  const made = makeOptimisticVote('M1', 'me', 'attend', null);
  assert.ok(made.id.startsWith('optimistic:'), '낙관 행 id가 약속한 접두사로 시작하지 않는다');
  assert.equal(isOptimisticVote(made), true, '자기가 만든 낙관 행을 낙관 행으로 못 알아본다');

  // 서버에서 온 행을 낙관 행으로 오인하면, 실패 시 남의 진짜 값을 지운다
  assert.equal(isOptimisticVote(vrow('me', 'attend', 'x', '4f1c8e0a-0000-4000-8000-000000000000')), false);
}

// ── 4. 되돌릴 값 — 연타 두 경우가 다 닫히는가 ───────────────────────
{
  const server = vrow('me', 'absent', '2026-08-01T11:00:00Z');

  // (가) 원래 행이 있는 사람이 연타
  const o1 = makeOptimisticVote('M1', 'me', 'attend', rollbackTarget(server));
  const o2 = makeOptimisticVote('M1', 'me', 'undecided', rollbackTarget(o1));
  assert.deepEqual(
    rollbackTarget(o2),
    server,
    '연타 뒤 되돌리면 서버 값으로 안 간다 — 둘 다 실패하면 있던 행이 사라진다'
  );

  // (나) 원래 행이 없던 사람이 연타
  const p1 = makeOptimisticVote('M1', 'me', 'attend', rollbackTarget(null));
  const p2 = makeOptimisticVote('M1', 'me', 'absent', rollbackTarget(p1));
  assert.equal(rollbackTarget(p2), null, '연타 뒤 되돌리면 서버에 없는 행이 남는다');

  assert.equal(rollbackTarget(undefined), null, '행이 없을 때 undefined가 새어 나간다');

  // 되돌린 상태가 처음과 같아야 한다 — 값이 아니라 결과로 본다
  const start = fixture();
  const optimistic = putMyVote(start, 'M1', 'me', o1);
  const rolled = putMyVote(optimistic, 'M1', 'me', rollbackTarget(o1));
  assert.deepEqual(rolled[0].votes, start[0].votes, '롤백 후 상태가 원래와 다르다');
}

// ── 5. 스토어가 그 순서대로 부르는가 ────────────────────────────────
{
  const vote = store.slice(store.indexOf('vote: async (matchId, status)'));
  const body = vote.slice(0, vote.indexOf('\n  },'));

  const iOpt = body.indexOf('makeOptimisticVote(');
  const iCast = body.indexOf('await castVoteRequest(');
  const iCatch = body.indexOf('} catch (err) {');
  const iLoad = body.indexOf('await get().loadMatches()');

  assert.ok(iOpt > 0, '낙관 반영을 안 한다 — castVote만 부른다');
  assert.ok(iOpt < iCast, '낙관 반영이 castVote 뒤에 있다 — 기다린 뒤에 그리면 낙관이 아니다');
  assert.ok(iCatch > 0 && iLoad > iCatch, 'loadMatches가 try 안에 있다 — 재조회 실패가 쓰기 성공을 롤백한다');

  const rollback = body.slice(iCatch, iLoad);
  assert.ok(/putMyVote\(get\(\)\.matches, matchId, me, prev\)/.test(rollback), '실패해도 안 되돌린다');
  assert.ok(/error: toUserMessage\(/.test(rollback), '실패했는데 문구를 안 세운다 — 눌러도 아무 일이 없어 보인다');
  // 실패 경로에서 재조회하면 error: null로 밀려 방금 세운 문구가 지워진다
  assert.ok(!/loadMatches/.test(rollback), '실패 경로에서 재조회한다 — 방금 세운 문구가 지워진다');
  assert.ok(/return;/.test(rollback), '롤백 후 계속 흘러 재조회까지 간다');

  // 되돌릴 값을 현재 상태에서 얻는다. 열 때 찍어둔 배열을 복원하면 그 사이 도착한
  // 남의 최신 표가 사라진다 — 낙관 반영 중 화면 진입 이펙트가 loadMatches를 부르는 경로다.
  // (부정 단언 — body 안에 아래 문자열을 넣어 실패하는 것을 확인했다)
  assert.ok(
    !/set\(\{ matches: (snapshot|prevMatches|backup) \}\)/.test(body),
    '롤백이 배열 스냅샷 복원으로 돌아갔다 — 남의 최신 표를 덮는다'
  );
  assert.ok(/rollbackTarget\(/.test(body), '되돌릴 값을 낙관 행 판별 없이 정한다 — 연타에서 틀린 값이 남는다');

  // 성공 뒤에는 재조회가 마지막이어야 낙관 행이 서버 진실로 덮인다
  assert.ok(
    body.slice(iLoad).indexOf('putMyVote') < 0,
    '재조회 뒤에 낙관 행을 다시 얹는다 — 서버 진실이 안 남는다'
  );
}

// ── 6. ⓪-a 회귀 — 시트가 store에서 파생되는가 ───────────────────────
//
// 낙관 반영은 store.matches를 고친다. 명단 시트가 열 때의 스냅샷을 들고 있던 시절로
// 돌아가면, 스토어를 아무리 고쳐도 시트에는 안 비친다. ①이 그 파생에 기대고 있다.
{
  assert.ok(
    /const \[rosterMatchId, setRosterMatchId\] = useState<string \| null>\(null\)/.test(screen),
    '명단 시트가 경기 객체를 상태로 다시 들고 있다 — 낙관 반영이 시트에 안 비친다'
  );
  assert.ok(
    /const rosterMatch = useMemo\(\s*\(\) => \(rosterMatchId \? matches\.find\(\(m\) => m\.id === rosterMatchId\) \?\? null : null\)/.test(
      screen
    ),
    '명단 시트가 볼 경기를 matches에서 파생하지 않는다'
  );
}

console.log('optimistic ok');
