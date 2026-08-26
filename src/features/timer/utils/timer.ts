// src/features/timer/utils/timer.ts
// 타이머의 순수 계산. TimerPanel 안에 있던 식을 그대로 옮긴 것이다.
//
// 옮긴 이유는 검사 때문이다. timerring.check와 score.check가 「TimerPanel과 같은 식」이라며
// 같은 계산을 자기 파일 안에 다시 써 놓고 그 사본을 시험하고 있었다. TimerPanel의 식이
// 바뀌어도 검사는 자기 사본을 보고 통과한다 — 깨진 적이 없는 게 아니라 깨질 수가 없었다.
// 한 곳에 두고 화면과 검사가 같은 것을 본다.
//
// 식은 손대지 않았다. 값이 이전과 같은지만 확인했고, 개선은 하지 않는다.

/**
 * endsAt으로부터 남은 초 — 음수는 0으로.
 *
 * endsAt이 없으면(=아직 시작 전이거나 멈춰 있으면) 들고 있던 값을 그대로 돌려준다.
 * now를 인자로 받는다 — 화면은 Date.now()를 넣고, 검사는 고정 시각을 넣는다.
 */
export function secondsLeft(endsAt: number | null, fallback: number, now: number): number {
  return endsAt == null ? fallback : Math.max(0, Math.round((endsAt - now) / 1000));
}

/**
 * 쿼터 총 시간.
 *
 * 추가시간이 분모에 들어간다. 예전엔 쿼터 길이에 고정돼 있어서 「+1분」을 누르면
 * 남은 시간이 총 시간을 넘었고, 비율이 음수가 되어 링이 통째로 사라졌다.
 */
export function totalSecondsOf(quarterMinutes: number, addedSeconds: number): number {
  return quarterMinutes * 60 + addedSeconds;
}

/**
 * 링이 찬 비율 — 「지나간 시간」만큼이다.
 *
 * clamp는 안전망이지 대책이 아니다. 위의 분모가 추가시간을 품게 된 지금은 음수가 될
 * 일이 없다. 예전엔 clamp가 「링이 엉뚱하게 그려지는」 증상만 덮고 원인은 놔뒀다.
 */
export function elapsedRatioOf(totalSeconds: number, remainingSeconds: number): number {
  return totalSeconds > 0 ? Math.min(1, Math.max(0, (totalSeconds - remainingSeconds) / totalSeconds)) : 0;
}
