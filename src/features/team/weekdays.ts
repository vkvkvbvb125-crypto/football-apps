// src/features/team/weekdays.ts
// 요일 표기 한 곳.
//
// team_settings.default_weekdays는 0=월 … 6=일이다. DB 스키마 주석이 그렇고, 실제
// 저장값으로도 확인했다 — 수요일을 저장하면 [2]가 들어간다.
//
// ⚠ JS의 Date.getDay()는 0=일이다. 둘은 다른 체계고, 변환 함수를 만들지 않는다.
//   변환이 있으면 어느 쪽 인덱스인지 호출부마다 헷갈리고, 한 번 틀리면 표시가
//   하루씩 밀린 채로 조용히 굴러간다. default_weekdays는 이 배열로만 읽는다.

/** default_weekdays 인덱스 순서 (0=월) */
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

/**
 * 「매주 수요일 20:00」 / 「매주 화·목요일 20:00」.
 *
 * 요일이 없으면 null — 시간만 있는 「매주 20:00」은 뜻이 없다.
 * 시간이 없으면 요일까지만 적는다.
 */
export function regularLabel(weekdays: number[] | null | undefined, time: string | null | undefined): string | null {
  const days = (weekdays ?? []).filter((d) => d >= 0 && d < WEEKDAYS.length);
  if (days.length === 0) return null;

  const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAYS[d]);
  const label = `매주 ${names.join('·')}요일`;
  const hhmm = time?.slice(0, 5);
  return hhmm ? `${label} ${hhmm}` : label;
}
