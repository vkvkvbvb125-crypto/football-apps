// src/features/attendance/components/ScheduleRow.tsx
// "다가오는 경기" 목록의 한 줄 — 날짜 블록 + 장소/날씨 + 참석 수 + 상태 배지
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
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { DateBlock, RowCard } from '../../../components/Surface';
import { font, radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

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

/* 테마마다 값이 다르므로 표를 함수로 바꿨다 — 모듈 최상단에서 만들면 굳는다 */
const badgeToneOf = (colors: Palette): Record<MatchBadge, { bg: string; fg: string }> => ({
  '정원 마감': { bg: 'rgba(34,197,94,0.14)', fg: colors.green },
  '마감 임박': { bg: 'rgba(210,163,76,0.16)', fg: colors.gold },
  '투표 마감': { bg: 'rgba(255,255,255,0.05)', fg: colors.textDim },
  '모집중': { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted },
});

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
  const { colors, styles } = useThemed(makeStyles);
  const tone = badgeToneOf(colors)[badge];
  return (
    <View style={styles.wrap}>
      <RowCard
        left={<DateBlock month={monthLabel} day={dayLabel} dow={dowLabel} />}
        divider
        title={timeLabel}
        sub={subLabel}
        selected={selected}
        onPress={onPress}
        accessibilityLabel={`${monthLabel} ${dayLabel}일 ${timeLabel} ${subLabel}`}
        right={
          <View style={styles.right}>
            <Text style={styles.count}>
              {confirmed}/{capacity}
            </Text>
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.badgeText, { color: tone.fg }]}>{badge}</Text>
            </View>
          </View>
        }
      />
    </View>
  );
}

// 껍데기·날짜 블록·본문은 전부 RowCard/DateBlock이 갖는다.
// 여기 남은 건 이 화면에만 있는 우측 칸(정원 카운트 + 상태 배지)뿐이다.
const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { marginBottom: 10 },
  right: { alignItems: 'flex-end', gap: 4 },
  count: { ...font.meta, ...font.num, color: colors.text, fontWeight: '800' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.chip },
  badgeText: { ...font.micro },
  });
