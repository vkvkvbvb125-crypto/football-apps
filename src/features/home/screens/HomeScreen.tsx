// src/features/home/screens/HomeScreen.tsx
// 리디자인 적용본. 기존 store/service는 그대로 사용하고 UI만 교체했습니다.
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { TabHeader } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../../settlement/stores/settlementStore';
import { fetchMatchWeather, weatherEmoji } from '../../attendance/services/weatherService';
import type { MatchWithVotes } from '../../attendance/services/attendanceService';
import type { AttendanceStatus } from '../../../types/database';

const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;
const UPCOMING_LIMIT = 4;
const RING_SIZE = 82;
const RING_STROKE = 6;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

const VOTE_OPTIONS: { status: AttendanceStatus; label: string }[] = [
  { status: 'attend', label: '참석' },
  { status: 'absent', label: '불참' },
  { status: 'undecided', label: '미정' },
];

function dayDiff(iso: string) {
  const a = new Date(iso);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function ddayLabel(iso: string) {
  const d = dayDiff(iso);
  return d === 0 ? 'TODAY' : d > 0 ? `D-${d}` : `D+${-d}`;
}

/** 경기 날씨 한 줄 (기존 weatherService 그대로 사용) */
function useMatchWeather(match?: MatchWithVotes | null) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    if (!match || match.latitude == null || match.longitude == null) return;
    const hours = (new Date(match.match_date).getTime() - Date.now()) / 3600000;
    if (hours > 240 || hours < -3) return;

    let cancelled = false;
    fetchMatchWeather(match.latitude, match.longitude, match.match_date)
      .then((weather) => {
        if (cancelled || !weather.available) return;
        if (weather.range === 'mid') {
          const rain = weather.amWeather?.includes('비') || weather.pmWeather?.includes('비');
          setText(`${rain ? '🌧️' : '⛅'} ${weather.minTemp}~${weather.maxTemp}°C`);
        } else {
          const emoji = weatherEmoji(weather.precipitationType ?? '0', weather.sky ?? '1');
          setText(`${emoji} ${weather.temperature}°C`);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [match?.id, match?.latitude, match?.longitude, match?.match_date]);

  return text;
}

function MatchWeatherText({ match }: { match: MatchWithVotes }) {
  const text = useMatchWeather(match);
  if (!text) return null;
  return <Text style={styles.rowMeta}>{text}</Text>;
}

export function HomeScreen({ navigation }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);
  const vote = useAttendanceStore((s) => s.vote);

  const settlements = useSettlementStore((s) => s.settlements);
  const loadSettlements = useSettlementStore((s) => s.loadSettlements);

  useEffect(() => {
    if (!activeTeam) return;
    loadMatches();
    loadMembers();
    loadSettlements();
  }, [activeTeam?.team.id]);

  if (!activeTeam) return null;

  const isAdmin = activeTeam.role === 'admin';
  const now = Date.now();

  const upcoming = useMemo(
    () =>
      matches
        .filter((m) => new Date(m.match_date).getTime() >= now - NEXT_MATCH_GRACE_MS)
        .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime()),
    [matches]
  );

  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1, 1 + UPCOMING_LIMIT);
  const nextWeather = useMatchWeather(next);

  const total = Math.max(1, members.length);
  const attend = next ? next.votes.filter((v) => v.status === 'attend').length : 0;
  const absent = next ? next.votes.filter((v) => v.status === 'absent').length : 0;
  const pending = Math.max(0, members.length - attend - absent);
  const pct = Math.min(1, attend / total);
  const myVote = next?.votes.find((v) => v.team_member_id === activeTeam.membershipId)?.status ?? null;

  // 이번 달 참석률 (내 기준 / 총무는 팀 평균)
  const monthRate = useMemo(() => {
    const thisMonth = matches.filter((m) => {
      const d = new Date(m.match_date);
      const t = new Date();
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
    });
    if (thisMonth.length === 0) return 0;
    if (isAdmin) {
      const sum = thisMonth.reduce(
        (acc, m) => acc + m.votes.filter((v) => v.status === 'attend').length / total,
        0
      );
      return Math.round((sum / thisMonth.length) * 100);
    }
    const mine = thisMonth.filter((m) =>
      m.votes.some((v) => v.team_member_id === activeTeam.membershipId && v.status === 'attend')
    ).length;
    return Math.round((mine / thisMonth.length) * 100);
  }, [matches, isAdmin, total]);

  // 회비: 총무는 내 미납액, 팀원은 미입금 인원
  const dues = useMemo(() => {
    const payments = settlements.flatMap((s) => s.payments.map((p) => ({ ...p, s })));
    if (isAdmin) {
      const unpaid = payments.filter((p) => !p.is_paid).length;
      return { value: String(unpaid), unit: '명', label: '미입금' };
    }
    const mine = payments.filter((p) => p.team_member_id === activeTeam.membershipId && !p.is_paid);
    const amount = mine.reduce((t, p) => t + (p.s.per_person_amount ?? 0), 0);
    return { value: amount.toLocaleString(), unit: '원', label: '내 미납 회비' };
  }, [settlements, isAdmin]);

  const voteHint =
    myVote === 'attend'
      ? '참석으로 투표했어요 · 언제든 변경 가능'
      : myVote === 'absent'
        ? '불참으로 투표했어요'
        : myVote === 'undecided'
          ? '미정으로 표시했어요'
          : '아직 투표하지 않았어요';

  return (
    <ScreenGradient>
      <TabHeader title="홈" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {next ? (
          <LinearGradient
            colors={['#16281D', '#0F1B15', '#0D1512']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Image
              source={require('../../../../assets/축구공.png')}
              style={styles.heroBall}
              resizeMode="contain"
            />

            <View style={styles.heroTopRow}>
              <View style={styles.ddayBadge}>
                <Text style={styles.ddayText}>{ddayLabel(next.match_date)}</Text>
              </View>
              <Text style={styles.heroLabel}>다음 경기</Text>
              <View style={styles.spacer} />
              {!!nextWeather && (
                <View style={styles.weatherChip}>
                  <Text style={styles.weatherText}>{nextWeather}</Text>
                </View>
              )}
            </View>

            <View style={styles.heroMain}>
              <View style={styles.heroMainLeft}>
                <Text style={styles.heroTime}>
                  {new Date(next.match_date).toLocaleTimeString('ko-KR', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.heroDate}>
                  {new Date(next.match_date).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                  })}
                </Text>
                <View style={styles.heroPlaceRow}>
                  <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.heroPlace} numberOfLines={1}>
                    {next.location ?? '장소 미정'}
                  </Text>
                </View>
              </View>

              <View style={styles.ring}>
                <Svg width={RING_SIZE} height={RING_SIZE}>
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_R}
                    stroke="#1E3427"
                    strokeWidth={RING_STROKE}
                    fill="none"
                  />
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_R}
                    stroke={colors.green}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${RING_C} ${RING_C}`}
                    strokeDashoffset={RING_C * (1 - pct)}
                    fill="none"
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                  />
                </Svg>
                <View style={styles.ringCenter}>
                  <Text style={styles.ringNum}>{attend}</Text>
                  <Text style={styles.ringDen}>/ {members.length}명</Text>
                </View>
              </View>
            </View>

            {isAdmin ? (
              <View style={styles.heroFooter}>
                <View style={styles.heroFooterRow}>
                  <Text style={styles.heroFooterMeta}>
                    미확인 {pending}명
                    {next.vote_deadline ? ` · 투표 마감 ${ddayLabel(next.vote_deadline)}` : ''}
                  </Text>
                  <Text style={styles.heroFooterPct}>{Math.round(pct * 100)}% 모집</Text>
                </View>
                <View style={styles.heroActionRow}>
                  <Pressable
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                    onPress={() => navigation.navigate('Attendance')}
                  >
                    <Text style={styles.primaryButtonText}>참석 현황 보기</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                    onPress={() => navigation.navigate('Attendance', { openCreate: true })}
                  >
                    <Ionicons name="add" size={20} color={colors.textStrong} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.heroFooter}>
                <Text style={styles.heroFooterMeta}>{voteHint}</Text>
                <View style={styles.voteRow}>
                  {VOTE_OPTIONS.map((opt) => {
                    const on = myVote === opt.status;
                    return (
                      <Pressable
                        key={opt.status}
                        onPress={() => vote(next.id, opt.status)}
                        style={({ pressed }) => [
                          styles.votePill,
                          on && opt.status === 'attend' && styles.votePillAttend,
                          on && opt.status === 'absent' && styles.votePillAbsent,
                          on && opt.status === 'undecided' && styles.votePillUndecided,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.votePillText,
                            on && opt.status === 'attend' && styles.votePillTextDark,
                            on && opt.status === 'absent' && styles.votePillTextLight,
                            on && opt.status === 'undecided' && styles.votePillTextGold,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </LinearGradient>
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.emptyTitle}>예정된 경기가 없어요</Text>
            <Text style={styles.emptySubtitle}>
              {isAdmin ? '새 경기를 만들어 참석 투표를 시작해보세요' : '총무가 경기를 만들면 여기에 보여드릴게요'}
            </Text>
            {isAdmin && (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, styles.emptyButton, pressed && styles.pressed]}
                onPress={() => navigation.navigate('Attendance', { openCreate: true })}
              >
                <Text style={styles.primaryButtonText}>경기 만들기</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>이번 달 참석률</Text>
            <View style={styles.tileValueRow}>
              <Text style={styles.tileValue}>{monthRate}</Text>
              <Text style={styles.tileUnit}>%</Text>
            </View>
            <View style={styles.tileTrack}>
              <View style={[styles.tileFill, { width: `${monthRate}%` }]} />
            </View>
          </View>

          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{dues.label}</Text>
            <View style={styles.tileValueRow}>
              <Text style={styles.tileValue}>{dues.value}</Text>
              <Text style={styles.tileUnit}>{dues.unit}</Text>
            </View>
            <Pressable onPress={() => navigation.navigate('Settlement')} hitSlop={6}>
              <Text style={styles.tileLink}>{isAdmin ? '정산 관리' : '입금 계좌 보기'} →</Text>
            </Pressable>
          </View>
        </View>

        {later.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>이후 일정</Text>
              <Pressable onPress={() => navigation.navigate('Attendance')} hitSlop={8}>
                <Text style={styles.sectionLink}>전체보기 ›</Text>
              </Pressable>
            </View>

            {later.map((m) => {
              const d = new Date(m.match_date);
              const a = m.votes.filter((v) => v.status === 'attend').length;
              const chip =
                a >= members.length
                  ? { text: '정원 마감', bg: 'rgba(74,222,128,0.14)', fg: colors.green }
                  : members.length - a <= 2
                    ? { text: '마감 임박', bg: 'rgba(210,163,76,0.16)', fg: colors.gold }
                    : { text: '모집중', bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted };

              return (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  onPress={() => navigation.navigate('Attendance')}
                >
                  <View style={styles.rowDate}>
                    <Text style={styles.rowMon}>{d.getMonth() + 1}월</Text>
                    <Text style={styles.rowDay}>{d.getDate()}</Text>
                    <Text style={styles.rowDow}>
                      {d.toLocaleDateString('ko-KR', { weekday: 'short' }).replace('요일', '')}
                    </Text>
                  </View>
                  <View style={styles.rowDivider} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTime}>
                      {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </Text>
                    <View style={styles.rowMetaRow}>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {m.location ?? '장소 미정'}
                      </Text>
                      <MatchWeatherText match={m} />
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowCount}>
                      {a}/{members.length}
                    </Text>
                    <View style={[styles.rowChip, { backgroundColor: chip.bg }]}>
                      <Text style={[styles.rowChipText, { color: chip.fg }]}>{chip.text}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 110, gap: 14 },
  pressed: { opacity: 0.85 },
  spacer: { flex: 1 },

  hero: {
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: '#24352B',
    padding: 18,
    overflow: 'hidden',
    gap: 14,
  },
  heroBall: {
    position: 'absolute',
    width: 300,
    height: 300,
    right: -118,
    top: -60,
    opacity: 0.13,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ddayBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.green },
  ddayText: { color: colors.bgRoot, fontSize: 11, fontWeight: '800' },
  heroLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  weatherChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  weatherText: { color: colors.textBody, fontSize: 11, fontWeight: '600' },

  heroMain: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  heroMainLeft: { flex: 1, gap: 5 },
  heroTime: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  heroDate: { color: colors.textStrong, fontSize: 14, fontWeight: '600' },
  heroPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroPlace: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },

  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNum: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  ringDen: { color: colors.textDim, fontSize: 10, fontWeight: '700' },

  heroFooter: {
    gap: 9,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  heroFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroFooterMeta: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  heroFooterPct: { color: colors.green, fontSize: 11.5, fontWeight: '700' },
  heroActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  primaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: '#2A3A32',
    alignItems: 'center',
    justifyContent: 'center',
  },

  voteRow: { flexDirection: 'row', gap: 8 },
  votePill: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  votePillAttend: { backgroundColor: colors.green, borderColor: colors.green },
  votePillAbsent: { backgroundColor: colors.neutralFill, borderColor: '#48584F' },
  votePillUndecided: { backgroundColor: 'rgba(210,163,76,0.16)', borderColor: '#6B5426' },
  votePillText: { color: colors.textMuted, fontSize: 13.5, fontWeight: '800' },
  votePillTextDark: { color: colors.bgRoot },
  votePillTextLight: { color: colors.textStrong },
  votePillTextGold: { color: colors.gold },

  emptyHero: {
    borderRadius: radius.hero,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 6,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emptySubtitle: { color: colors.textMuted, fontSize: 12.5, fontWeight: '500', lineHeight: 19 },
  emptyButton: { marginTop: 10, flex: 0 },

  tileRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.tile,
    padding: 14,
    gap: 6,
  },
  tileLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  tileValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  tileUnit: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tileTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  tileFill: { height: '100%', borderRadius: 2, backgroundColor: colors.green },
  tileLink: { color: colors.gold, fontSize: 11, fontWeight: '700' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  sectionLink: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.tile,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  rowDate: { width: 44, alignItems: 'center', gap: 1 },
  rowMon: { color: colors.green, fontSize: 10, fontWeight: '800' },
  rowDay: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  rowDow: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  rowDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  rowBody: { flex: 1, gap: 3 },
  rowTime: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowCount: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rowChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  rowChipText: { fontSize: 10, fontWeight: '800' },
});
