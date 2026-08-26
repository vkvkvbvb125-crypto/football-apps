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

console.log('score.check: ok');
