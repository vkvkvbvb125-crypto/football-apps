// scripts/timerring.check.ts — 타이머 링이 추가시간에도 살아 있는지
//
// 버그: 경기 중 "+1분"을 누르면 링이 사라졌다. totalSeconds가 쿼터 길이에 고정돼 있어서
// 남은 시간이 총 시간을 넘었고, 지난 비율이 음수 → clamp로 0 → 채워진 호가 통째로 없어졌다.
//
// TimerPanel의 계산식만 그대로 옮겨 왔다 (RN 없이 돌리기 위해).
import assert from 'node:assert/strict';

/** TimerPanel과 같은 식 */
function elapsedRatio(quarterMinutes: number, addedSeconds: number, remainingSeconds: number) {
  const totalSeconds = quarterMinutes * 60 + addedSeconds;
  return totalSeconds > 0 ? Math.min(1, Math.max(0, (totalSeconds - remainingSeconds) / totalSeconds)) : 0;
}

/** 버그 시절 식 — 추가시간이 분모에 없다 */
function elapsedRatioOld(quarterMinutes: number, remainingSeconds: number) {
  const totalSeconds = quarterMinutes * 60;
  return totalSeconds > 0 ? Math.min(1, Math.max(0, (totalSeconds - remainingSeconds) / totalSeconds)) : 0;
}

// 10분 쿼터, 30초 진행 → 남은 570
assert.equal(elapsedRatio(10, 0, 570), 0.05);

// 여기서 +1분. 남은 630, 추가 60.
// 옛 식: (600-630)/600 = -0.05 → clamp 0 → 링이 사라진다. 이게 신고된 증상이다.
assert.equal(elapsedRatioOld(10, 630), 0);
// 새 식: (660-630)/660 = 0.0454… → 호가 남아 있다
const after = elapsedRatio(10, 60, 630);
assert.ok(after > 0, '추가시간 뒤에도 링이 남아야 한다');
assert.ok(Math.abs(after - 30 / 660) < 1e-9);

// 지난 시간(30초)은 그대로고 분모만 커졌다 → 비율은 조금 줄어든다. 이게 맞는 방향이다
assert.ok(after < 0.05);

// 여러 번 눌러도 0으로 죽지 않는다
let added = 0;
let remaining = 570;
for (let i = 0; i < 5; i++) {
  added += 60;
  remaining += 60;
  assert.ok(elapsedRatio(10, added, remaining) > 0, `+1분 ${i + 1}회에서 링이 사라졌다`);
}

// 경계: 쿼터 종료 시점은 꽉 찬 원
assert.equal(elapsedRatio(10, 0, 0), 1);
assert.equal(elapsedRatio(10, 180, 0), 1);
// 시작 전은 빈 원
assert.equal(elapsedRatio(10, 0, 600), 0);
// 쿼터 길이 0(입력칸을 비운 순간)에도 터지지 않는다
assert.equal(elapsedRatio(0, 0, 0), 0);

console.log('timerring.check: ok');
