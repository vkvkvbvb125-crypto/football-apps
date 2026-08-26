// src/features/attendance/utils/upcoming.ts
// 「다가오는 경기」를 고르는 식. AttendanceScreen 안에 있던 것을 그대로 옮겼다.
//
// 옮긴 이유는 검사 때문이다. upcoming.check가 「AttendanceScreen의 필터와 같은 식」이라며
// 같은 계산을 자기 파일 안에 다시 써 놓고 그 사본을 시험하고 있었다. 화면의 식이 바뀌어도
// 검사는 자기 사본을 보고 통과한다 — 깨진 적이 없는 게 아니라 깨질 수가 없었다.
//
// 식은 손대지 않았다. 값이 이전과 같은지만 확인했고, 개선은 하지 않는다.

/**
 * 오늘 0시 이후의 경기를 시간순으로.
 *
 * 경계가 「지금」이 아니라 「오늘 0시」다. 저녁 8시 경기를 밤 9시에 열어도 그날 안에는
 * 목록에 남는다 — 오늘 있었던 경기가 목록에서 사라지면 방금 끝난 것을 확인할 데가 없다.
 *
 * now를 인자로 받는다. 화면은 new Date()를 넣고, 검사는 고정 시각을 넣는다.
 */
export function upcomingFrom<T extends { match_date: string }>(list: T[], now: Date): T[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  return list
    .filter((m) => new Date(m.match_date).getTime() >= startOfToday)
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
}
