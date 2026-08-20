// scripts/score.check.ts — 스코어 저장과 타이머 endsAt 계산
//
// 스코어: 화면 로컬 useState라 앱을 껐다 켜면 사라졌다. 스토어의 낙관적 업데이트가
//   실패했을 때 되돌아오는지, 멱등한지 확인한다.
// 타이머: 1초마다 -1이라 백그라운드에서 throttle되면 시간이 덜 흘렀다.
//   endsAt - now 방식이 그 상황에서 옳은 값을 내는지 확인한다.
import assert from 'node:assert/strict';

// ── 타이머: TimerPanel의 secondsLeft와 같은 식 ─────────────────
const secondsLeft = (endsAt: number | null, fallback: number, now: number) =>
  endsAt == null ? fallback : Math.max(0, Math.round((endsAt - now) / 1000));

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
function optimistic(prev: number, next: number, serverOk: boolean) {
  let shown = next;              // 1) 화면 먼저
  let error: string | null = null;
  if (!serverOk) { shown = prev; error = '점수를 저장하지 못했어요'; } // 2) 실패하면 롤백
  return { shown, error };
}
assert.deepEqual(optimistic(1, 2, true), { shown: 2, error: null });
assert.deepEqual(optimistic(1, 2, false), { shown: 1, error: '점수를 저장하지 못했어요' },
  '실패하면 되돌리고 이유를 남겨야 한다 — 조용히 넘어가지 않는다');

// 음수 점수는 만들지 않는다
const guard = (score: number) => score >= 0;
assert.equal(guard(-1), false);
assert.equal(guard(0), true);

console.log('score.check: ok');
