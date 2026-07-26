// src/features/attendance/components/MatchDetailCard.tsx
// 캘린더에서 선택한 경기의 상세 카드
// - 장소 미정 배너 (location_pending)
// - 날씨 (MatchWeatherBlock — D-day 규칙은 그쪽에서 처리)
// - 참석 현황 바 + 투표 버튼 (정원 차면 "대기 신청" / "대기 N번")
// - 대기 명단
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';
import { MatchWeatherBlock, type MatchWeather } from './MatchWeatherBlock';
import type { CapacityResult } from '../utils/capacity';
import type { AttendanceStatus } from '../../../types/database';

export interface WaitlistEntry {
  position: number;
  name: string;
  isMe?: boolean;
}

interface Props {
  headline: string; // "7월 28일 (화) 20:00"
  ddayLabel: string; // "D-2" | "TODAY"
  placeLabel: string; // "풋살장 A구장" | "장소 미정"
  venueKind: 'indoor' | 'outdoor' | 'pending';
  daysUntil: number;
  timeLabel: string;
  weather: MatchWeather | null;
  capacity: number;
  capacityResult: CapacityResult;
  memberCount: number;
  deadlineLabel?: string; // "D-1"
  myVote?: AttendanceStatus | null;
  isLocked?: boolean;
  isAdmin: boolean;
  waitlist: WaitlistEntry[];
  weatherDecision?: 'keep' | 'indoor' | null;
  onVote: (status: AttendanceStatus) => void;
  onOpenMenu?: () => void;
  onPickVenue?: () => void;
  onKeepOutdoor?: () => void;
  onFindIndoor?: () => void;
}

const VENUE_TAG = {
  indoor: { label: '실내', bg: 'rgba(96,165,250,0.14)', fg: '#60A5FA' },
  outdoor: { label: '실외', bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted },
  pending: { label: '미정', bg: 'rgba(210,163,76,0.14)', fg: colors.gold },
} as const;

export function MatchDetailCard(p: Props) {
  const tag = VENUE_TAG[p.venueKind];
  const { attendCount, absentCount, pendingCount, isFull, myWaitPosition } = p.capacityResult;
  const total = Math.max(1, p.memberCount);

  const attendLabel =
    myWaitPosition > 0 ? `대기 ${myWaitPosition}번` : isFull && p.myVote !== 'attend' ? '대기 신청' : '참석';

  const pill = (status: AttendanceStatus, label: string) => {
    const on = p.myVote === status;
    return (
      <Pressable
        key={status}
        disabled={p.isLocked}
        onPress={() => p.onVote(status)}
        style={[
          styles.pill,
          on && status === 'attend' && styles.pillAttend,
          on && status === 'absent' && styles.pillAbsent,
          on && status === 'undecided' && styles.pillUndecided,
          p.isLocked && { opacity: 0.4 },
        ]}
      >
        <Text
          style={[
            styles.pillText,
            on && status === 'attend' && { color: colors.bgRoot },
            on && status === 'absent' && { color: colors.textStrong },
            on && status === 'undecided' && { color: colors.gold },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{p.headline}</Text>
            <View style={styles.dday}>
              <Text style={styles.ddayText}>{p.ddayLabel}</Text>
            </View>
          </View>
          <View style={styles.placeRow}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.place} numberOfLines={1}>
              {p.placeLabel}
            </Text>
            <View style={[styles.venueTag, { backgroundColor: tag.bg }]}>
              <Text style={[styles.venueTagText, { color: tag.fg }]}>{tag.label}</Text>
            </View>
          </View>
        </View>
        {p.isAdmin && (
          <Pressable onPress={p.onOpenMenu} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textDim} />
          </Pressable>
        )}
      </View>

      {p.venueKind === 'pending' && (
        <View style={styles.pending}>
          <Text style={styles.pendingText}>
            장소 미정으로 투표 중이에요. 마감 후 예상 인원 기준으로 구장을 추천해드려요.
          </Text>
          {p.isAdmin && (
            <Pressable onPress={p.onPickVenue} hitSlop={6}>
              <Text style={styles.pendingCta}>구장 정하기 ›</Text>
            </Pressable>
          )}
        </View>
      )}

      <MatchWeatherBlock
        weather={p.weather}
        daysUntil={p.daysUntil}
        timeLabel={p.timeLabel}
        isOutdoor={p.venueKind === 'outdoor'}
        isAdmin={p.isAdmin}
        decision={p.weatherDecision}
        onKeep={p.onKeepOutdoor}
        onFindIndoor={p.onFindIndoor}
      />

      <View style={{ gap: 7 }}>
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            참석 {attendCount} · 불참 {absentCount} · 미투표 {pendingCount}
          </Text>
          <Text style={styles.countMeta}>
            정원 {p.capacity}명{p.deadlineLabel ? ` · 마감 ${p.deadlineLabel}` : ''}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fillAttend, { width: `${(attendCount / total) * 100}%` }]} />
          <View style={[styles.fillAbsent, { width: `${(absentCount / total) * 100}%` }]} />
        </View>
      </View>

      <View style={styles.pillRow}>
        {pill('attend', attendLabel)}
        {pill('absent', '불참')}
        {pill('undecided', '미정')}
      </View>

      {p.waitlist.length > 0 && (
        <View style={styles.waitBox}>
          <View style={styles.waitHead}>
            <Text style={styles.waitTitle}>대기 명단</Text>
            <Text style={styles.waitSub}>정원이 차서 자동으로 대기 처리됐어요</Text>
          </View>
          {p.waitlist.map((w) => (
            <View key={`${w.position}-${w.name}`} style={styles.waitRow}>
              <View style={styles.waitPos}>
                <Text style={styles.waitPosText}>{w.position}</Text>
              </View>
              <Text style={styles.waitName}>{w.isMe ? `${w.name} (나)` : w.name}</Text>
              <Text style={styles.waitNote}>{w.position === 1 ? '취소 시 자동 참석' : '대기 중'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  dday: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(74,222,128,0.14)' },
  ddayText: { color: colors.green, fontSize: 10, fontWeight: '800' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  place: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  venueTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  venueTagText: { fontSize: 9.5, fontWeight: '800' },

  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(210,163,76,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(210,163,76,0.22)',
  },
  pendingText: { flex: 1, color: colors.gold, fontSize: 11.5, fontWeight: '600', lineHeight: 17 },
  pendingCta: { color: colors.gold, fontSize: 11, fontWeight: '800' },

  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  countMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  fillAttend: { backgroundColor: colors.green },
  fillAbsent: { backgroundColor: colors.neutralFill },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  pillAttend: { backgroundColor: colors.green, borderColor: colors.green },
  pillAbsent: { backgroundColor: colors.neutralFill, borderColor: '#48584F' },
  pillUndecided: { backgroundColor: 'rgba(210,163,76,0.16)', borderColor: '#6B5426' },
  pillText: { color: colors.textMuted, fontSize: 13.5, fontWeight: '800' },

  waitBox: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 2 },
  waitHead: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  waitTitle: { color: colors.gold, fontSize: 11.5, fontWeight: '800' },
  waitSub: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 9 },
  waitPos: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(210,163,76,0.16)',
  },
  waitPosText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  waitName: { flex: 1, color: '#C9D3CF', fontSize: 12.5, fontWeight: '600' },
  waitNote: { color: '#5F6B66', fontSize: 11, fontWeight: '600' },
});
