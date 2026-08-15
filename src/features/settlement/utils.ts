// src/features/settlement/utils.ts
// 정산 카드 제목/부제 — 원본 경기 정보가 남아있으면 그걸로, 없으면 메모로 폴백.
// SettlementScreen과 홈의 정산 카드가 같은 규칙을 써야 해서 분리했다.
import type { MatchWithVotes } from '../attendance/services/attendanceService';
import type { Settlement } from './stores/settlementStore';

export function settlementTitle(s: Settlement, matches: MatchWithVotes[]) {
  const m = matches.find((mm) => mm.id === s.matchId);
  if (m) {
    const d = new Date(m.match_date);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 경기`;
  }
  return s.memo || '정산';
}

/**
 * "20:00 · 풋살몬스터" — 언제·어디서.
 *
 * 시간을 함께 쓰는 이유: 제목이 "8월 7일 경기"뿐이면 같은 날 경기가 둘일 때 카드가
 * 똑같이 보여 어느 쪽을 정산했는지 알 수 없다(실제로 겪었다).
 *
 * 참여 인원과 한 문자열로 합치지 않는다 — 합치면 장소가 길 때 인원까지 잘린다.
 */
export function whereLabel(matchDate: string, location: string | null) {
  const time = new Date(matchDate).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return location ? `${time} · ${location}` : time;
}

export function settlementPlace(s: Settlement, matches: MatchWithVotes[]) {
  const m = matches.find((mm) => mm.id === s.matchId);
  return m ? whereLabel(m.match_date, m.location) : '장소 미정';
}
