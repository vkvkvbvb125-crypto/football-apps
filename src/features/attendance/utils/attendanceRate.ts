// src/features/attendance/utils/attendanceRate.ts
// 팀 참석률 — 홈의 통계 타일과 팀 화면 통계가 같은 함수를 본다.
//
// 참석률은 정의가 갈리는 지표다. 두 화면이 각자 계산하면 같은 팀인데 값이 다르게
// 나오고, 그때 어느 쪽이 맞는지 알 방법이 없다. 정의를 여기 한 곳에 못 박는다.
//
// ── 정의 ────────────────────────────────────────────────────
//   분자  이번 달 「이미 치른」 경기의 '참석' 응답 수
//   분모  그 경기들 각각에 대해, 경기 시점에 팀에 있던 멤버 수의 합
//
// 기본안(분모 = 경기 수 × 현재 멤버 수)에서 두 가지를 바꿨다.
//
//  1) 앞으로 있을 경기를 뺀다.
//     닷새 뒤 경기는 아직 아무도 투표하지 않았을 수 있다. 그걸 분모에 넣으면
//     경기를 만들자마자 참석률이 떨어진다 — 아직 일어나지 않은 일로 팀을 깎는 셈이다.
//
//  2) 분모를 「그 경기 시점의 멤버 수」로 잡는다.
//     현재 멤버 수를 쓰면 오늘 들어온 사람이 이번 달 지난 경기 전부의 분모를 늘린다.
//     세 명이던 팀에 한 명이 오면 지난 참석률이 이유 없이 25% 떨어진다.
//     joined_at을 모르면(옛 데이터) 그 사람은 처음부터 있었던 것으로 본다 — 분모를
//     줄이는 쪽이 아니라 늘리는 쪽이라 참석률을 부풀리지 않는다.

export interface RateMatch {
  /** ISO */
  matchDate: string;
  /** 이 경기의 '참석' 응답 수 */
  attendCount: number;
}

export interface RateMember {
  /** ISO. 모르면 undefined — 처음부터 있었던 것으로 본다 */
  joinedAt?: string | null;
}

export interface AttendanceRate {
  /** 0~1. 셀 경기가 없으면 null — 0%와 "아직 없음"은 다르다 */
  rate: number | null;
  attended: number;
  slots: number;
  matchCount: number;
}

/** 같은 달인가 (로컬 기준) */
function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function monthlyAttendanceRate(
  matches: RateMatch[],
  members: RateMember[],
  now = new Date()
): AttendanceRate {
  let attended = 0;
  let slots = 0;
  let matchCount = 0;

  for (const m of matches) {
    const d = new Date(m.matchDate);
    if (!sameMonth(d, now)) continue;
    if (d.getTime() > now.getTime()) continue; // 아직 안 치른 경기

    const eligible = members.filter((mem) => {
      if (!mem.joinedAt) return true;
      return new Date(mem.joinedAt).getTime() <= d.getTime();
    }).length;

    if (eligible === 0) continue;
    matchCount += 1;
    slots += eligible;
    // 응답이 멤버 수를 넘을 수 없다 — 게스트나 탈퇴자 표가 섞여도 100%를 넘기지 않는다
    attended += Math.min(m.attendCount, eligible);
  }

  return { rate: slots === 0 ? null : attended / slots, attended, slots, matchCount };
}

/** "67%" — 셀 것이 없으면 "-" */
export function formatRate(r: AttendanceRate): string {
  return r.rate == null ? '-' : `${Math.round(r.rate * 100)}%`;
}

// ── 개인 참석률 ────────────────────────────────────────────
//
// 범위는 최근 3개월이다.
//
//   이번 달만  주 1회면 표본이 4경기다. 한 번 빠지면 75% — 개인 지표로 쓰기엔 흔들림이 크다
//   전체       3년 전 기록이 지금 상태를 가린다. 오래 활동한 사람이 불리하다
//
// 대상 경기가 3회 미만이면 퍼센트를 내지 않는다. 갓 들어온 사람이 한 번 빠지고
// 0%로 찍히면 사실이 아니라 오해를 만든다. 화면은 그때 "-"를 쓴다.

/** 화면에 적는 기준 — 라벨에 기간을 붙여야 총무가 다른 값과 헷갈리지 않는다 */
export const MEMBER_RATE_MONTHS = 3;
/** 이 미만이면 퍼센트를 내지 않는다 */
const MIN_SAMPLE = 3;

export interface MemberRateMatch {
  matchDate: string;
  /** 이 경기에서 '참석'을 누른 사람들의 team_member_id */
  attendIds: string[];
}

/**
 * 한 사람의 최근 3개월 참석률.
 *
 * 분모는 그 사람이 팀에 있던 동안 치른 경기 수다 — 가입 전 경기는 빠진다.
 * 팀 평균(monthlyAttendanceRate)과 기간이 다른 건 의도다: 팀 지표는 "이번 달 어땠나",
 * 개인 지표는 "요즘 꾸준한가"를 말한다.
 */
export function memberAttendanceRate(
  matches: MemberRateMatch[],
  member: { id: string; joinedAt?: string | null },
  now = new Date()
): AttendanceRate {
  const from = new Date(now);
  from.setMonth(from.getMonth() - MEMBER_RATE_MONTHS);
  const joined = member.joinedAt ? new Date(member.joinedAt).getTime() : -Infinity;

  let attended = 0;
  let slots = 0;
  for (const m of matches) {
    const t = new Date(m.matchDate).getTime();
    if (t < from.getTime() || t > now.getTime()) continue; // 기간 밖 · 아직 안 치른 경기
    if (t < joined) continue; // 가입 전
    slots += 1;
    if (m.attendIds.includes(member.id)) attended += 1;
  }

  // 표본이 모자라면 비율을 내지 않는다 — 0%와 "아직 모른다"는 다르다
  const rate = slots < MIN_SAMPLE ? null : attended / slots;
  return { rate, attended, slots, matchCount: slots };
}

/** "3개월 82%" — 기준이 안 보이면 다른 값과 비교할 때 헷갈린다 */
export function formatMemberRate(r: AttendanceRate): string {
  return r.rate == null ? '-' : `${MEMBER_RATE_MONTHS}개월 ${Math.round(r.rate * 100)}%`;
}
