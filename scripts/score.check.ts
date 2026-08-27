// scripts/score.check.ts — 스코어 저장과 타이머 endsAt 계산
//
// 스코어: 화면 로컬 useState라 앱을 껐다 켜면 사라졌다. 스토어의 낙관적 업데이트가
//   실패했을 때 되돌아오는지, 멱등한지 확인한다.
// 타이머: 1초마다 -1이라 백그라운드에서 throttle되면 시간이 덜 흘렀다.
//   endsAt - now 방식이 그 상황에서 옳은 값을 내는지 확인한다.
//
// 예전엔 두 계산을 **다시 써 놓고** 그 사본을 시험했다. 화면이나 스토어가 바뀌어도
// 검사는 자기 사본을 보고 통과한다 — 깨진 적이 없는 게 아니라 깨질 수가 없었다.
// 타이머 식은 화면이 쓰는 함수를 그대로 부르고, 스토어의 낙관 반영·롤백은 스토어
// 소스를 집어서 본다(순수 함수로 뺄 수 있는 모양이 아니다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { secondsLeft } from '../src/features/timer/utils/timer.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const store = readFileSync(new URL('../src/features/timer/stores/scoreStore.ts', import.meta.url), 'utf8')
  .split('\r')
  .join('');

const t0 = 1_700_000_000_000;
const endsAt = t0 + 600_000; // 10분 뒤

assert.equal(secondsLeft(endsAt, 600, t0), 600);
assert.equal(secondsLeft(endsAt, 600, t0 + 60_000), 540, '1분 뒤 540초');

// 핵심: 3분간 백그라운드로 tick이 아예 안 돌아도 복귀 순간 옳다.
// 옛 방식(1초마다 -1)이라면 tick이 0번 돌았으니 600 그대로였을 것이다.
assert.equal(secondsLeft(endsAt, 600, t0 + 180_000), 420, '3분 잠갔다 오면 420초여야 한다');
assert.notEqual(secondsLeft(endsAt, 600, t0 + 180_000), 600);

// 지나간 뒤에는 음수가 아니라 0
assert.equal(secondsLeft(endsAt, 600, t0 + 900_000), 0);
// 멈춰 있으면(endsAt 없음) 확정된 남은 시간을 그대로
assert.equal(secondsLeft(null, 317, t0 + 999_999), 317);
// +1분은 도착 시각을 미룬다
assert.equal(secondsLeft(endsAt + 60_000, 600, t0 + 60_000), 600, '+1분 뒤 남은 시간이 늘어야 한다');

// ── 스코어: 낙관적 업데이트 되돌리기 ───────────────────────────
//
// 스토어 소스를 본다. 여기 사본을 두면 스토어가 롤백을 빼도 검사는 자기 사본을 보고
// 통과한다 — 그게 이 파일이 고쳐진 이유다. attendanceStore의 vote()를 optimistic.check가
// 보는 방식과 같다.
{
  const from = store.indexOf('setScore: async (matchId, squadLabel, score)');
  assert.ok(from > 0, 'setScore를 못 찾았다');
  const body = store.slice(from, store.indexOf('\n  },', from));

  const iPrev = body.indexOf('const prev =');
  const iShow = body.indexOf('[squadLabel]: score');
  const iCall = body.indexOf('await upsertScore(');
  const iCatch = body.indexOf('} catch (e) {');

  assert.ok(iPrev >= 0, '되돌릴 값을 미리 잡아두지 않는다');
  assert.ok(iShow > iPrev && iShow < iCall, '화면 반영이 서버 호출 뒤에 있다 — 낙관이 아니다');
  assert.ok(iCatch > iCall, '실패를 받는 자리가 없다');

  const rollback = body.slice(iCatch);
  assert.ok(/\[squadLabel\]: prev/.test(rollback), '실패해도 안 되돌린다');
  assert.ok(/error: toUserMessage\(/.test(rollback), '실패했는데 이유를 안 남긴다 — 조용히 넘어간다');

  // 음수 점수는 만들지 않는다. 화면 반영보다 앞에 있어야 화면에도 안 들어간다
  const iGuard = body.indexOf('if (score < 0) return;');
  assert.ok(iGuard >= 0, '음수 점수를 막지 않는다');
  assert.ok(iGuard < iShow, '음수 가드가 화면 반영 뒤에 있다 — -1이 한 번 그려진다');
}

// ── 읽기 실패: 「못 읽은 0」과 「진짜 0」이 갈리는가 ────────────────
//
// 예전엔 loadScores가 실패를 삼키고 byMatch에 키를 안 만들었다. 그러면 scoreOf도 화면도
// 0을 돌려줘서 첫 경기(진짜 0)와 구별할 수 없었고, 그 0에서 +를 누르면 1이 서버의 5를
// 덮었다 — upsertScore가 최종값을 보내기 때문이다. 「스코어 초기화」는 읽지도 않고 0을 보낸다.
//
// 주석이 「0에서 시작하고 다음 저장에서 맞춰진다」였는데 맞춰지는 게 아니라 덮어쓴다.
// 틀린 전제가 정상성을 보증하고 있던 자리다.
{
  const from = store.indexOf('loadScores: async (matchId)');
  assert.ok(from > 0, 'loadScores를 못 찾았다');
  const body = store.slice(from, store.indexOf('\n  },', from));

  // 실패를 기록한다. 삼키면 원래 상태로 돌아간다
  assert.ok(/failedMatchId: matchId/.test(body), '읽기 실패를 기록하지 않는다 — 「못 읽은 0」이 「진짜 0」과 같아진다');
  /*
    읽기 실패에는 error를 세우지 않는다. 화면이 전용 문구를 따로 그리기 때문에,
    여기서 error까지 세우면 같은 사건이 두 줄이 된다 — 실제로 그렇게 떴다.
    삼키는 게 아니라 말하는 자리가 하나인 것이다(failedMatchId + 전용 문구).
  */
  const catchBody = body.slice(body.indexOf('} catch (e) {'));
  assert.ok(catchBody.length > 0, 'loadScores의 catch를 못 찾았다');
  assert.ok(!/error:/.test(catchBody), '읽기 실패가 error까지 세운다 — 화면에 같은 사건이 두 줄로 뜬다');
  // 시작할 때는 지운다 — 앞선 실패 문구가 남아 있으면 새로 읽는 중에도 붉은 줄이 뜬다
  assert.ok(/set\(\{ loadingMatchId: matchId, failedMatchId: null, error: null \}\)/.test(body),
    '다시 읽기 시작할 때 앞선 실패 표시를 안 지운다');
  // 다시 읽기 시작하면 지운다 — 안 지우면 성공해도 잠긴 채다
  assert.ok(/failedMatchId: null/.test(body), '다시 읽을 때 실패 표시를 안 지운다');

  // 스토어도 쓰기를 거절한다. 화면이 막는 것과는 다른 일이다
  const setFrom = store.indexOf('setScore: async (matchId, squadLabel, score)');
  const setBody = store.slice(setFrom, store.indexOf('\n  },', setFrom));
  const guard = setBody.indexOf("get().failedMatchId === matchId");
  const write = setBody.indexOf('await upsertScore(');
  assert.ok(guard > 0, '못 읽은 경기에도 쓴다 — 새 호출부가 생기면 그 경로로 서버 값이 덮인다');
  assert.ok(guard < write, '가드가 쓰기 뒤에 있다');
}

// ── 화면: 점수만 잠기고 타이머는 돈다 ──────────────────────────────
{
  const panel = readFileSync(new URL('../src/features/timer/components/ScoreboardPanel.tsx', import.meta.url), 'utf8')
    .split('\r')
    .join('');
  const screen = readFileSync(new URL('../src/features/assignment/screens/AssignmentScreen.tsx', import.meta.url), 'utf8')
    .split('\r')
    .join('');

  // +/− 넷과 초기화가 다 막힌다. 하나라도 열려 있으면 그 버튼으로 덮인다
  assert.equal(
    (panel.match(/disabled=\{locked\}/g) ?? []).length,
    5,
    '못 읽은 상태에서 열려 있는 점수 버튼이 있다 (+/− 넷과 초기화, 다섯이어야 한다)'
  );
  assert.ok(/const locked = scoreUnavailable \|\| loadingScores;/.test(panel), '잠금 판정이 없다');

  /*
    타이머는 안 막는다 — 이 화면의 주 기능이고 점수는 곁이다.

    처음엔 panel(ScoreboardPanel)에서 이걸 찾았는데 TimerPanel은 screen(AssignmentScreen)이
    그린다. 엉뚱한 파일을 뒤지느라 변이가 샜다 — 부정 단언은 「없다」를 보는 것이라
    대상이 틀려도 늘 통과한다.
    (주입해서 실패를 확인했다: screen의 TimerPanel에 disabled를 넣으면 잡힌다)
  */
  const timer = screen.slice(screen.indexOf('<TimerPanel'), screen.indexOf('/>', screen.indexOf('<TimerPanel')));
  assert.ok(timer.length > 0, 'TimerPanel을 못 찾았다');
  assert.ok(!/disabled|scoreUnavailable|scoreFailedMatchId/.test(timer), '점수를 못 읽었다고 타이머까지 막는다');

  // 다시 읽기는 사람이 누른다
  assert.ok(/onRetryLoad=\{\(\) => loadScores\(nearestMatch\.id\)\}/.test(screen), '재시도가 loadScores를 안 부른다');
  // 자동 재시도를 넣지 않는다 — 경기 중 몇 분이고 열려 있는 화면이다
  assert.ok(!/setInterval|setTimeout\([^)]*loadScores/.test(screen), '자동 재시도가 붙었다 — 배경 폴링이 배터리를 먹는다');

  // 그 경기만 잠근다. 다른 경기를 못 읽었다고 이 경기가 잠기면 안 된다
  assert.ok(/scoreUnavailable=\{scoreFailedMatchId === nearestMatch\.id\}/.test(screen), '실패를 경기별로 안 가린다');
}

console.log('score.check: ok');
