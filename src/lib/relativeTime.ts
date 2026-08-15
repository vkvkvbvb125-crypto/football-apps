// src/lib/relativeTime.ts
// "3시간 전" 같은 상대 시각. 홈의 공지 목록과 알림 패널이 같은 규칙을 써야 한다 —
// 한쪽만 "1일 전", 다른 쪽이 "어제"면 같은 항목이 화면마다 다르게 보인다.

/** 이 기간을 넘어가면 상대 시각 대신 날짜를 보여준다 — "97일 전"은 아무 의미가 없다 */
const ABSOLUTE_AFTER_DAYS = 30;

export function relativeTime(iso: string, now = Date.now()) {
  const then = new Date(iso).getTime();
  const diff = now - then;

  // 기기 시계가 조금 앞서 있거나 방금 만든 항목이면 음수가 나온다
  if (diff < 0) return '방금 전';

  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;

  const day = Math.floor(hour / 24);
  if (day <= ABSOLUTE_AFTER_DAYS) return `${day}일 전`;

  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}월 ${d.getDate()}일`
    : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}
