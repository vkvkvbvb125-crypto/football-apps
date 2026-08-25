// src/features/attendance/utils/matchLabel.ts
// "8월 26일 (화) 20:00 · 강남 풋살장" — 경기 한 줄 요약.
//
// RosterSheet의 matchLabel을 만드는 곳이 둘이었다(홈 경기 카드, 일정 화면). 같은 문자열을
// 각자 만들고 있었고, 한쪽 포맷만 바뀌면 같은 경기가 두 화면에서 다르게 적힌다 —
// 「내 기록」과 멤버 행이 같은 값을 다르게 적어 검산이 안 되던 것과 같은 구조다.
//
// hour12: false를 명시한다. 빼면 기기 설정에 따라 「오후 8:00」이 되어, 같은 앱 안에서
// 어떤 사람은 24시간제로 어떤 사람은 12시간제로 본다.
//
// 장소가 없으면 「· 」를 붙이지 않는다. 「20:00 · 」로 끝나면 뭔가 잘린 것처럼 보인다.

/** 날짜·시간까지만 — 장소를 따로 쓰고 싶은 자리용 */
export function matchDateTimeLabel(matchDate: string | Date): string {
  const d = matchDate instanceof Date ? matchDate : new Date(matchDate);
  const day = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${time}`;
}

/** 날짜·시간 · 장소 */
export function matchLabel(matchDate: string | Date, location: string | null | undefined): string {
  const base = matchDateTimeLabel(matchDate);
  return location ? `${base} · ${location}` : base;
}
