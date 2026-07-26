// src/features/attendance/components/ScheduleRow.tsx
// "이후 일정" 목록의 한 줄 — 날짜 블록 + 장소/날씨 + 참석 수 + 상태 배지
//
// 배지 규칙 (한 곳에서만 정의한다):
//   정원 마감 : confirmed >= capacity
//   마감 임박 : 남은 자리 <= 2  (정원까지 2자리 이하)
//   투표 마감 : vote_deadline 지남 또는 status !== 'open'
//   모집중    : 그 외
//
// capacity는 matches 테이블에 컬럼이 없으므로 아래 순서로 결정한다:
//   1) match.capacity (컬럼을 추가했다면)
//   2) venue.capacity (제휴구장 정원)
//   3) DEFAULT_CAPACITY (팀 설정값 없을 때의 최종 폴백)
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors } from '../../../theme';

export const DEFAULT_CAPACITY = 12;

export type MatchBadge = '정원 마감' | '마감 임박' | '투표 마감' | '모집중';

export function resolveCapacityValue(match: { capacity?: number | null; venue_capacity?: number | null }): number {
  return match.capacity ?? match.venue_capacity ?? DEFAULT_CAPACITY;
}

export function resolveBadge(p: {
  confirmed: number;
  capacity: number;
  voteDeadline?: string | null;
  status?: string | null;
}): MatchBadge {
  const closed = p.status !== 'open' || (p.voteDeadline ? new Date(p.voteDeadline) < new Date() : false);
  if (closed) return '투표 마감';
  if (p.confirmed >= p.capacity) return '정원 마감';
  if (p.capacity - p.confirmed <= 2) return '마감 임박';
  return '모집중';
}

const BADGE_TONE: Record<MatchBadge, { bg: string; fg: string }> = {
  '정원 마감': { bg: 'rgba(74,222,128,0.14)', fg: colors.green },
  '마감 임박': { bg: 'rgba(210,163,76,0.16)', fg: colors.gold },
  '투표 마감': { bg: 'rgba(255,255,255,0.05)', fg: '#6F7B76' },
  '모집중': { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted },
};

interface Props {
  monthLabel: string; // "8월"
  dayLabel: string; // "4"
  dowLabel: string; // "화"
  timeLabel: string; // "20:00"
  subLabel: string; // "풋살장 C구장 · 맑음 27°" / "장소 미정 · 투표 먼저 진행"
  confirmed: number;
  capacity: number;
  badge: MatchBadge;
  selected?: boolean;
  onPress?: () => void;
}

export function ScheduleRow({
  monthLabel,
  dayLabel,
  dowLabel,
  timeLabel,
  subLabel,
  confirmed,
  capacity,
  badge,
  selected,
  onPress,
}: Props) {
  const tone = BADGE_TONE[badge];
  return (
    <Pressable onPress={onPress} style={[styles.row, selected && styles.rowOn]}>
      <View style={styles.dateBlock}>
        <Text style={styles.month}>{monthLabel}</Text>
        <Text style={styles.day}>{dayLabel}</Text>
        <Text style={styles.dow}>{dowLabel}</Text>
      </View>
      <View style={styles.divider} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={styles.time}>{timeLabel}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subLabel}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.count}>
          {confirmed}/{capacity}
        </Text>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{badge}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowOn: { backgroundColor: 'rgba(74,222,128,0.06)', borderColor: '#2F4A3A' },
  dateBlock: { width: 42, alignItems: 'center', gap: 1 },
  month: { color: colors.green, fontSize: 10, fontWeight: '800' },
  day: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  dow: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  time: { color: colors.textStrong, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sub: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  count: { color: colors.text, fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
