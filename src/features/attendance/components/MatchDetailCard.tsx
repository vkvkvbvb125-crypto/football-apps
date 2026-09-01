// src/features/attendance/components/MatchDetailCard.tsx
// 캘린더에서 선택한 경기의 상세 카드
// - 장소 미정 배너 (location_pending)
// - 날씨 (MatchWeatherBlock — D-day 규칙은 그쪽에서 처리)
// - 참석 현황 바 + 투표 버튼 (정원 차면 "대기 신청" / "대기 N번")
// - 대기 명단
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { MatchWeatherBlock, type MatchWeather } from './MatchWeatherBlock';
import { attendButtonLabel, type CapacityResult } from '../utils/capacity';
import type { AttendanceStatus } from '../../../types/database';
import { SoftTint } from '../../../components/BentoCard';

export interface WaitlistEntry {
  position: number;
  name: string;
  isMe?: boolean;
}

interface Props {
  headline: string; // "7월 28일 (화) 20:00"
  ddayLabel: string; // "D-2" | "TODAY"
  /** 20260806 마이그레이션 전이면 없다 */
  matchType?: string | null;
  placeLabel: string; // "풋살장 A구장" | "장소 미정"
  venueKind: 'indoor' | 'outdoor' | 'pending';
  /** 구장 이름을 눌러 지도를 연다. 좌표가 없으면 부모가 안 넘긴다 */
  onOpenPlace?: () => void;
  daysUntil: number;
  timeLabel: string;
  weather: MatchWeather | null;
  capacity: number;
  capacityResult: CapacityResult;
  memberCount: number;
  deadlineLabel?: string; // "D-1"
  myVote?: AttendanceStatus | null;
  isLocked?: boolean;
  /** 투표가 잠긴 이유 — 총무가 마감했는지, 시간이 지났는지 */
  lockNote?: string;
  isAdmin: boolean;
  waitlist: WaitlistEntry[];
  weatherDecision?: 'keep' | 'indoor' | null;
  onVote: (status: AttendanceStatus) => void;
  /** anchorY = ⋮ 버튼 아래쪽 화면 좌표. 팝오버를 버튼 밑에 띄우려면 이 값이 필요하다 */
  onOpenMenu?: (anchorY: number) => void;
  onPickVenue?: () => void;
  onKeepOutdoor?: () => void;
  onFindIndoor?: () => void;
  /**
   * 참석 명단 열기. 주면 카드 맨 아래에 푸터 줄이 붙는다.
   *
   * 예전엔 이 링크가 카드 밖에서 오른쪽에 혼자 떠 있었다 — 어느 경기의 명단인지 카드와
   * 묶여 보이지 않았고, 카드와 목록 사이에 44px짜리 빈 줄이 하나 더 생겼다.
   */
  onOpenRoster?: () => void;
}

/* 테마마다 값이 다르므로 표를 함수로 바꿨다 — 모듈 최상단에서 만들면 굳는다 */
const venueTagOf = (colors: Palette) =>
  ({
    indoor: { label: '실내', bg: 'rgba(96,165,250,0.14)', fg: colors.blue },
    outdoor: { label: '실외', bg: colors.neutralTint, fg: colors.textMuted },
    pending: { label: '미정', bg: colors.goldTint, fg: colors.gold },
  }) as const;

export function MatchDetailCard(p: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const menuRef = useRef<View>(null);
  const tag = venueTagOf(colors)[p.venueKind];
  const { attendCount, absentCount, pendingCount, isFull, myWaitPosition } = p.capacityResult;
  /*
   * 진행바 분모는 정원이다.
   *
   * memberCount(팀 멤버 수)를 쓰고 있었다. 바로 옆에 「정원 12명」이라 적어 두고
   * 분모만 다른 값이라, 1명 팀에서 한 명이 참석하면 바가 100%로 꽉 찼다.
   * 화면에서 눈으로 검산할 수 있는 어긋남이라 더 나쁘다.
   */
  const total = Math.max(1, p.capacity);

  // 라벨은 공용 함수가 만든다. 같은 삼항식을 여기 베껴 두고 있었는데, 그러면
  // 「대기 N번」이라는 말을 만드는 자리가 둘이 된다 — 한쪽만 고치면 화면마다 다른 말을 한다
  const attendLabel = attendButtonLabel(p.capacityResult, p.myVote);

  /*
   * 알약 세 개의 상태.
   *
   *   응답 전       셋 다 아웃라인 — 무엇도 고르지 않았다는 게 보여야 한다
   *   응답 후       고른 것만 채우고 나머지는 한 단 내린다(dimmed)
   *   마감          고른 것은 또렷하게 두고 나머지만 더 내린다
   *
   * 예전엔 마감일 때 opacity 0.4를 세 칸 전부에 걸었다. 그러면 내가 고른 항목까지
   * 흐려져서 "마감된 뒤에 내가 뭘 골랐더라"를 확인할 수 없었다. 마감은 못 바꾼다는
   * 뜻이지 내 답을 지우는 게 아니다.
   */
  const pill = (status: AttendanceStatus, label: string) => {
    const on = p.myVote === status;
    const answered = p.myVote != null;
    // 고르지 않은 칸만 내린다 — 고른 칸은 어느 상태에서도 또렷하다
    const dimmed = !on && (p.isLocked || answered);
    return (
      <Pressable
        key={status}
        disabled={p.isLocked}
        onPress={() => p.onVote(status)}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: p.isLocked }}
        style={[
          styles.pill,
          on && status === 'attend' && styles.pillAttend,
          on && status === 'absent' && styles.pillAbsent,
          on && status === 'undecided' && styles.pillUndecided,
          dimmed && styles.pillDim,
        ]}
      >
        <Text
          style={[
            styles.pillText,
            dimmed && styles.pillTextDim,
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
      {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
      <SoftTint tone="green" radius={radius.card} />
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{p.headline}</Text>
            {/*
              지난 경기 배지는 초록이 아니다.
              초록은 「지금 중요한 것」에 쓰는 색인데, 끝난 경기는 그 반대다.
              D-2·TODAY만 초록으로 두고 「종료」는 중립으로 내린다.
            */}
            <View style={[styles.dday, p.daysUntil < 0 && styles.ddayDone]}>
              <Text style={[styles.ddayText, p.daysUntil < 0 && styles.ddayTextDone]}>{p.ddayLabel}</Text>
            </View>
            {!!p.matchType && (
              <View style={styles.typeChip}>
                <Text style={styles.typeChipText}>{p.matchType}</Text>
              </View>
            )}
          </View>
          {/*
            구장 이름을 누르면 지도가 뜬다 — 58ff35f에서 빠졌던 진입로다.

            옛 일정 목록에는 `{!!match.location && <Pressable onPress={() => setDetailMatch(match)}>`
            가 있었는데, 이 카드로 재설계하면서 안 옮겨졌다. 그 커밋 diff에
            「PlaceDetailModal … 은 기존 그대로 사용합니다」가 삭제로 찍혀 있다 —
            빼기로 한 게 아니라 이관 누락이다. 컴포넌트는 그대로 살아 있었다.

            onOpenPlace가 없거나 장소가 없으면 안 누르게 둔다. 좌표가 없는 경기
            (장소 미정)에서도 모달은 열리지만 이름만 나오고 지도는 안 그려지는데,
            그건 「눌렀더니 아무것도 없다」로 읽힌다. 카드가 그 판단을 하지 않고
            부모가 넘길지 말지로 정한다 — 좌표가 있는지는 부모가 안다.
          */}
          {p.onOpenPlace ? (
            <Pressable
              onPress={p.onOpenPlace}
              hitSlop={4}
              accessibilityRole="button"
              /* 안의 글자가 구장 이름뿐이라 그것만 읽으면 「눌러서 뭘 하는지」를 모른다 */
              accessibilityLabel={`${p.placeLabel} 지도 보기`}
              style={styles.placeRow}
            >
              <Ionicons name="location-outline" size={12} color={colors.green} />
              <Text style={[styles.place, styles.placeLink]} numberOfLines={1}>
                {p.placeLabel}
              </Text>
              <View style={[styles.venueTag, { backgroundColor: tag.bg }]}>
                <Text style={[styles.venueTagText, { color: tag.fg }]}>{tag.label}</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.placeRow}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={styles.place} numberOfLines={1}>
                {p.placeLabel}
              </Text>
              <View style={[styles.venueTag, { backgroundColor: tag.bg }]}>
                <Text style={[styles.venueTagText, { color: tag.fg }]}>{tag.label}</Text>
              </View>
            </View>
          )}
        </View>
        {p.isAdmin && (
          // 팝오버는 전체 화면 Modal 안에 절대 위치로 뜬다 — 그래서 화면 좌표(measureInWindow)가 필요하다.
          // 카드 안 좌표나 탭 지점을 넘기면 스크롤 위치에 따라 엉뚱한 곳에 뜬다.
          <Pressable
            ref={menuRef}
            onPress={() => menuRef.current?.measureInWindow((_x, y, _w, h) => p.onOpenMenu?.(y + h))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="더보기"
          >
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
            <Pressable onPress={p.onPickVenue} hitSlop={6} accessibilityRole="button">
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

      {/* 흐려진 버튼만으로는 고장인지 마감인지 알 수 없다 — 이유를 적어준다 */}
      {p.isLocked && !!p.lockNote && <Text style={styles.lockNote}>{p.lockNote}</Text>}

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

      {/* 푸터 — 카드가 끝나는 자리에서 명단으로 보낸다. 위 구분선이 투표 영역과 가른다 */}
      {!!p.onOpenRoster && (
        <Pressable
          onPress={p.onOpenRoster}
          accessibilityRole="button"
          accessibilityLabel="참석 명단 보기"
          style={({ pressed }) => [styles.rosterFoot, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.rosterFootLabel}>참석자 {attendCount}명</Text>
          <Text style={styles.rosterFootLink}>명단 보기</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
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
  dday: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(34,197,94,0.14)' },
  ddayText: { color: colors.green, fontSize: 10, fontWeight: '800' },
  ddayDone: { backgroundColor: colors.neutralTint },
  ddayTextDone: { color: colors.textMuted },
  typeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  place: { color: colors.textMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  venueTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  venueTagText: { fontSize: 10, fontWeight: '800' },
  /* 누를 수 있는 구장 이름 — 초록으로만 표시한다. 밑줄은 이 앱의 어휘가 아니다 */
  placeLink: { color: colors.green },

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
  pendingText: { flex: 1, color: colors.gold, fontSize: 11, fontWeight: '600', lineHeight: 17 },
  pendingCta: { color: colors.gold, fontSize: 11, fontWeight: '800' },

  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  countMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lockNote: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: -2 },
  track: { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  fillAttend: { backgroundColor: colors.green },
  fillAbsent: { backgroundColor: colors.neutralFill },

  /*
   * 명단 푸터. 카드 안쪽 여백을 뚫고 카드 폭 전체를 쓰도록 marginHorizontal을 음수로 준다 —
   * 구분선이 안쪽에서 끊기면 푸터가 아니라 또 하나의 블록으로 읽힌다.
   * (카드 padding이 16이라 -16. 대신 자기 paddingHorizontal 16으로 글자 자리를 되돌린다.)
   */
  rosterFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    marginHorizontal: -16,
    marginBottom: -16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  rosterFootLabel: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  rosterFootLink: { color: colors.textBody, fontSize: 12, fontWeight: '700' },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /** 고르지 않은 칸 — 마감이든 응답 후든 한 단 내린다. 0.4는 너무 지워서 0.55다 */
  pillDim: { opacity: 0.55 },
  pillTextDim: { color: colors.textMuted },
  pillAttend: { backgroundColor: colors.green, borderColor: colors.green },
  pillAbsent: { backgroundColor: colors.neutralFill, borderColor: colors.neutralFill },
  pillUndecided: { backgroundColor: 'rgba(210,163,76,0.16)', borderColor: colors.goldLine },
  pillText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },

  waitBox: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 2 },
  waitHead: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  waitTitle: { color: colors.gold, fontSize: 11, fontWeight: '800' },
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
  waitName: { flex: 1, color: colors.textBody, fontSize: 12, fontWeight: '600' },
  waitNote: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  });
