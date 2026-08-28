// src/features/attendance/utils/matchWindow.ts
// 「지금 다루는 경기인가」와 그 여집합 「끝났는가」.
//
// 유예 3시간이 두 파일에 각자 선언돼 있었다. 값도 같고 주석이 서로를 가리키며
// 「같은 기준」이라고 적어 두기까지 했는데, 값은 각자 들고 있었다:
//
//   AssignmentScreen  const MATCH_GRACE_MS = 3 * 60 * 60 * 1000;
//                     // 킥오프 3시간 뒤까지는 "운영 중"으로 본다 (홈 화면 NEXT_MATCH_GRACE_MS와 같은 기준)
//   HomeScreen        const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;
//                     // 킥오프 3시간 뒤까지는 "다음 경기"로 본다 (경기운영 탭 MATCH_GRACE_MS와 같은 기준)
//
// 주석 둘을 여기로 옮겼다. 왜 3시간인지가 값 옆에 있어야 다음에 그 값을 바꾸는 사람이
// 두 화면을 다 본다. 한쪽만 바꾸면 홈의 「다음 경기」와 경기운영의 「운영 중」이 갈리고,
// 갈렸다는 사실은 어디에도 안 남는다.
//
// ── 정산은 이것의 여집합이다 ────────────────────────────────────────
//
// 정산 미등록 카드는 `match_date < now`로 골랐다. 유예를 안 쓰니 경계가 3시간 어긋났고,
// 그 사이에 한 경기가 두 화면에서 다르게 읽혔다:
//
//   킥오프 10분 뒤 — 경기운영: 「운영 중」(타이머가 돈다)
//                    정산:     「정산 미등록」(끝났으니 정산해라)
//
// 같은 순간에 「하는 중」과 「끝났다」가 동시에 뜬다. 경계를 하나로 두면 사라진다.
// 끝났다 = 지금 다루는 경기가 아니다. 정의를 둘로 두지 않는다.
//
// ── 일정 목록은 여기 안 들어온다 ────────────────────────────────────
//
// upcomingFrom은 「오늘 0시 이후인가」다. 비슷해 보이지만 다른 물음이라 안 모았다 —
// 저녁 8시 경기를 밤 11시 30분에 보면 유예로는 「끝났다」(3.5시간 경과)이고
// 날 단위로는 「오늘 것이니 목록에 남긴다」다. 둘 다 맞고, 합치면 한쪽이 틀린다.
// 「몇 시간 지났나」와 「오늘 것인가」는 다른 질문이다.

/**
 * 킥오프 3시간 뒤까지는 「지금 다루는 경기」로 본다.
 *
 * 경기가 끝나자마자 화면에서 사라지면 방금 뛴 경기의 타이머·스코어·명단에 닿을 수 없다.
 * 풋살 한 경기가 대개 1~2시간이라 3시간이면 뒤풀이까지 덮는다.
 */
export const MATCH_GRACE_MS = 3 * 60 * 60 * 1000;

/** 이 시각 이후에 시작하는 경기가 「지금 다루는 경기」다 */
export function liveSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - MATCH_GRACE_MS);
}

/** 지금 다루는 경기인가 — 경기운영의 「운영 중」, 홈의 「다음 경기」 */
export function isLiveMatch<T extends { match_date: string }>(match: T, now: Date = new Date()): boolean {
  return new Date(match.match_date).getTime() >= liveSince(now).getTime();
}

/** 지금 다루는 경기들만, 가까운 순서로 */
export function liveMatchesFrom<T extends { match_date: string }>(list: T[], now: Date = new Date()): T[] {
  return list
    .filter((m) => isLiveMatch(m, now))
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
}
