// src/features/attendance/screens/AttendanceScreen.tsx — 리디자인 적용판
// 캘린더/모달 컴포넌트(CalendarGrid, TimeWheelPicker, DeadlinePicker, PlaceSearchModal,
// PlaceDetailModal, WeatherBadge)와 store API는 기존 그대로 사용합니다.
// 경기 만들기는 홈 화면 버튼 → openCreate 파라미터로만 진입한다 (이 화면 자체엔 FAB 없음).
import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../stores/attendanceStore';
import { MonthNavigator } from '../components/MonthNavigator';
import { CalendarGrid } from '../components/CalendarGrid';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { PlaceSearchModal } from '../components/PlaceSearchModal';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { WeatherBadge } from '../components/WeatherBadge';
import { RosterSheet, type RosterMember } from '../components/RosterSheet';
import { fetchMatchWeather, weatherEmoji } from '../services/weatherService';
import type { PlaceResult } from '../services/placeService';
import type { AttendanceStatus } from '../../../types/database';
import type { MatchWithVotes } from '../services/attendanceService';

const VOTE_OPTIONS: { status: AttendanceStatus; label: string }[] = [
  { status: 'attend', label: '참석' },
  { status: 'absent', label: '불참' },
  { status: 'undecided', label: '미정' },
];

interface SelectedPlace {
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function ddayLabel(iso: string) {
  const a = new Date(iso);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  return diff === 0 ? 'TODAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

export function AttendanceScreen({ navigation, route }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);

  const matches = useAttendanceStore((s) => s.matches);
  const loaded = useAttendanceStore((s) => s.loaded);
  const loading = useAttendanceStore((s) => s.loading);
  const error = useAttendanceStore((s) => s.error);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);
  const createMatch = useAttendanceStore((s) => s.createMatch);
  const updateMatch = useAttendanceStore((s) => s.updateMatch);
  const deleteMatch = useAttendanceStore((s) => s.deleteMatch);
  const vote = useAttendanceStore((s) => s.vote);

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [actionMatch, setActionMatch] = useState<MatchWithVotes | null>(null);
  const [actionAnchorY, setActionAnchorY] = useState(0);
  const [timeText, setTimeText] = useState('19:00');
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [quarterMinutesText, setQuarterMinutesText] = useState('10');
  const [deadlineText, setDeadlineText] = useState('');
  const [detailMatch, setDetailMatch] = useState<MatchWithVotes | null>(null);
  const [rosterMatch, setRosterMatch] = useState<MatchWithVotes | null>(null);
  const [calendarWeather, setCalendarWeather] = useState<Record<string, string>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);

  const isAdmin = activeTeam?.role === 'admin';

  useEffect(() => {
    if (activeTeam) loadMatches();
  }, [activeTeam?.team.id]);

  const visibleMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [monthOffset]);

  const markedDates = useMemo(() => new Set(matches.map((m) => dateKey(new Date(m.match_date)))), [matches]);

  // 캘린더 날씨 (기존 로직 그대로)
  useEffect(() => {
    interface WeatherTarget {
      dateKey: string;
      latitude: number;
      longitude: number;
      matchDateIso: string;
    }
    const targets: WeatherTarget[] = [];
    const today = new Date();
    for (let i = 0; i <= 10; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() + i);
      const key = dateKey(day);
      const matchOnDay = matches.find((m) => {
        const d = new Date(m.match_date);
        return dateKey(d) === key && m.latitude != null && m.longitude != null;
      });
      if (matchOnDay) {
        targets.push({
          dateKey: key,
          latitude: matchOnDay.latitude as number,
          longitude: matchOnDay.longitude as number,
          matchDateIso: matchOnDay.match_date,
        });
      } else if (activeTeam?.team.home_latitude != null && activeTeam?.team.home_longitude != null) {
        const noon = new Date(day);
        noon.setHours(12, 0, 0, 0);
        targets.push({
          dateKey: key,
          latitude: activeTeam.team.home_latitude,
          longitude: activeTeam.team.home_longitude,
          matchDateIso: noon.toISOString(),
        });
      }
    }
    if (targets.length === 0) {
      setCalendarWeather({});
      setWeatherLoading(false);
      return;
    }
    let cancelled = false;
    let pending = targets.length;
    setCalendarWeather({});
    setWeatherLoading(true);
    targets.forEach((t) => {
      fetchMatchWeather(t.latitude, t.longitude, t.matchDateIso)
        .then((weather) => {
          if (cancelled || !weather.available) return;
          const emoji =
            weather.range === 'mid'
              ? weather.amWeather?.includes('비') || weather.pmWeather?.includes('비')
                ? '🌧️'
                : '⛅'
              : weatherEmoji(weather.precipitationType ?? '0', weather.sky ?? '1');
          setCalendarWeather((prev) => ({ ...prev, [t.dateKey]: emoji }));
        })
        .catch(() => {})
        .finally(() => {
          pending -= 1;
          if (pending === 0 && !cancelled) setWeatherLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [matches, activeTeam]);

  const monthMatches = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    return matches
      .filter((m) => {
        const d = new Date(m.match_date);
        return (
          d.getFullYear() === visibleMonth.year && d.getMonth() === visibleMonth.month && d.getTime() >= startOfToday
        );
      })
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
  }, [matches, visibleMonth]);

  const handleOpenCreate = () => {
    setEditingMatchId(null);
    setTimeText('19:00');
    setSelectedPlace(null);
    setQuarterMinutesText('10');
    setDeadlineText('');
    setModalVisible(true);
  };

  useEffect(() => {
    if (isAdmin && (route.params as { openCreate?: boolean } | undefined)?.openCreate) {
      handleOpenCreate();
      navigation.setParams({ openCreate: undefined });
    }
  }, [route.params, isAdmin]);

  const handleOpenEdit = (match: MatchWithVotes) => {
    const d = new Date(match.match_date);
    setSelectedDate(d);
    setEditingMatchId(match.id);
    setTimeText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setSelectedPlace(
      match.location
        ? {
            name: match.location,
            category: match.place_category,
            address: match.address,
            latitude: match.latitude,
            longitude: match.longitude,
          }
        : null
    );
    setQuarterMinutesText(String(match.quarter_minutes));
    setDeadlineText(
      match.vote_deadline ? new Date(match.vote_deadline).toISOString().slice(0, 16).replace('T', ' ') : ''
    );
    setModalVisible(true);
  };

  const handleDelete = (matchId: string) => {
    const message = '이 경기를 취소하시겠어요? 투표/정산/분배 기록도 함께 삭제됩니다.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) deleteMatch(matchId);
      return;
    }
    Alert.alert('경기 취소', message, [
      { text: '아니오', style: 'cancel' },
      { text: '취소하기', style: 'destructive', onPress: () => deleteMatch(matchId) },
    ]);
  };

  const handleSubmit = () => {
    if (!timeText.trim()) return;
    const matchDate = new Date(selectedDate);
    const [hours, minutes] = timeText.trim().split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
    matchDate.setHours(hours, minutes, 0, 0);

    let voteDeadline: string | null = null;
    if (deadlineText.trim()) {
      const d = new Date(deadlineText.trim().replace(' ', 'T') + ':00');
      if (!Number.isNaN(d.getTime())) voteDeadline = d.toISOString();
    }

    const payload = {
      matchDate: matchDate.toISOString(),
      location: selectedPlace?.name ?? '',
      address: selectedPlace?.address ?? null,
      latitude: selectedPlace?.latitude ?? null,
      longitude: selectedPlace?.longitude ?? null,
      placeCategory: selectedPlace?.category ?? null,
      voteDeadline,
      quarterMinutes: Number(quarterMinutesText) || 10,
    };

    if (editingMatchId) updateMatch(editingMatchId, payload);
    else createMatch(payload);
    setModalVisible(false);
  };

  const rosterMembers: RosterMember[] = useMemo(() => {
    if (!rosterMatch) return [];
    return members.map((m) => {
      const v = rosterMatch.votes.find((vote) => vote.team_member_id === m.id);
      return {
        id: m.id,
        name: m.displayName,
        position: m.skillTag ? `실력 ${m.skillTag}` : null,
        role: m.role,
        status: v?.status ?? 'pending',
        isMe: m.id === activeTeam?.membershipId,
      };
    });
  }, [rosterMatch, members, activeTeam]);

  const rosterMatchLabel = useMemo(() => {
    if (!rosterMatch) return '';
    const d = new Date(rosterMatch.match_date);
    const base = `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} ${d.toLocaleTimeString(
      'ko-KR',
      { hour: '2-digit', minute: '2-digit', hour12: false }
    )}`;
    return rosterMatch.location ? `${base} · ${rosterMatch.location}` : base;
  }, [rosterMatch]);

  return (
    <ScreenGradient>
      <TabHeader title="일정" />

      {!activeTeam ? (
        <EmptyState
          emoji="🗓️"
          title="팀에 가입하면 일정이 표시돼요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : (
        <View style={{ flex: 1 }}>
          {weatherLoading && (
            <View style={styles.weatherLoading}>
              <ActivityIndicator size="small" color={colors.green} />
              <Text style={styles.weatherLoadingText}>날씨 조회 중…</Text>
            </View>
          )}

          <MonthNavigator offset={monthOffset} onChange={setMonthOffset} />
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.calendarCard}>
              <CalendarGrid
                year={visibleMonth.year}
                month={visibleMonth.month}
                selectedDate={selectedDate}
                markedDates={markedDates}
                weatherByDate={calendarWeather}
                onSelectDate={setSelectedDate}
              />
            </View>

            <View style={styles.list}>
              {loading && !loaded ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={colors.green} />
              ) : monthMatches.length === 0 ? (
                <EmptyState
                  emoji="🗓️"
                  title="이 달엔 등록된 경기가 없어요"
                  subtitle="홈 화면의 경기 만들기 버튼으로 새 경기를 만들어보세요"
                />
              ) : (
                monthMatches.map((match) => {
                  const myVote = match.votes.find((v) => v.team_member_id === activeTeam.membershipId)?.status;
                  const deadlinePassed = match.vote_deadline ? new Date(match.vote_deadline) < new Date() : false;
                  const isLocked = match.status !== 'open' || deadlinePassed;
                  const attend = match.votes.filter((v) => v.status === 'attend').length;
                  const absent = match.votes.filter((v) => v.status === 'absent').length;
                  const pending = Math.max(0, members.length - attend - absent);
                  const total = Math.max(1, members.length);
                  const d = new Date(match.match_date);

                  return (
                    <View key={match.id} style={styles.card}>
                      <View style={styles.cardHead}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={styles.titleRow}>
                            <Text style={styles.cardTitle}>
                              {d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}{' '}
                              {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </Text>
                            <View style={[styles.chip, isLocked ? styles.chipLocked : styles.chipOpen]}>
                              <Text style={[styles.chipText, { color: isLocked ? colors.textMuted : colors.green }]}>
                                {isLocked ? '투표 마감' : ddayLabel(match.match_date)}
                              </Text>
                            </View>
                          </View>
                          {!!match.location && (
                            <Pressable onPress={() => setDetailMatch(match)} hitSlop={4}>
                              <Text style={styles.cardPlace} numberOfLines={1}>
                                {match.location}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        {isAdmin && (
                          <Pressable
                            hitSlop={8}
                            onPress={(e) => {
                              setActionAnchorY(e.nativeEvent.pageY);
                              setActionMatch(match);
                            }}
                          >
                            <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                          </Pressable>
                        )}
                      </View>

                      <WeatherBadge
                        latitude={match.latitude}
                        longitude={match.longitude}
                        matchDateIso={match.match_date}
                      />

                      <View style={{ gap: 7 }}>
                        <View style={styles.countRow}>
                          <Text style={styles.countText}>
                            참석 {attend} · 불참 {absent} · 미투표 {pending}
                          </Text>
                          <Pressable onPress={() => setRosterMatch(match)} hitSlop={6}>
                            <Text style={styles.rosterLink}>명단 보기 ›</Text>
                          </Pressable>
                        </View>
                        <View style={styles.track}>
                          <View style={[styles.fillAttend, { width: `${(attend / total) * 100}%` }]} />
                          <View style={[styles.fillAbsent, { width: `${(absent / total) * 100}%` }]} />
                        </View>
                      </View>

                      <View style={styles.voteRow}>
                        {VOTE_OPTIONS.map((opt) => {
                          const on = myVote === opt.status;
                          return (
                            <Pressable
                              key={opt.status}
                              disabled={isLocked}
                              onPress={() => vote(match.id, opt.status)}
                              style={({ pressed }) => [
                                styles.votePill,
                                on && opt.status === 'attend' && styles.votePillAttend,
                                on && opt.status === 'absent' && styles.votePillAbsent,
                                on && opt.status === 'undecided' && styles.votePillUndecided,
                                isLocked && styles.votePillDisabled,
                                pressed && !isLocked && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.votePillText,
                                  on && opt.status === 'attend' && { color: colors.bgRoot },
                                  on && opt.status === 'absent' && { color: colors.textStrong },
                                  on && opt.status === 'undecided' && { color: colors.gold },
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 경기 만들기/수정 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 경기 {editingMatchId ? '수정' : '만들기'}
            </Text>

            <Text style={styles.fieldLabel}>경기 시간</Text>
            <TimeWheelPicker value={timeText} onChange={setTimeText} />

            <Text style={styles.fieldLabel}>장소</Text>
            <PlaceSearchModal
              value={selectedPlace}
              onSelect={(place: PlaceResult) =>
                setSelectedPlace({
                  name: place.name,
                  category: place.category,
                  address: place.address,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
            />

            <Text style={styles.fieldLabel}>쿼터 시간(분)</Text>
            <TextInput
              style={styles.input}
              placeholder="10"
              placeholderTextColor={colors.placeholder}
              value={quarterMinutesText}
              onChangeText={setQuarterMinutesText}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>투표 마감 (선택)</Text>
            <DeadlinePicker
              value={deadlineText}
              onChange={setDeadlineText}
              matchDate={selectedDate}
              matchTime={timeText}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={({ pressed }) => [styles.modalCancel, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable onPress={handleSubmit} style={({ pressed }) => [styles.modalSubmit, pressed && styles.pressed]}>
                <Text style={styles.modalSubmitText}>{editingMatchId ? '저장' : '만들기'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 수정/삭제 팝오버 */}
      <Modal visible={!!actionMatch} transparent animationType="fade" onRequestClose={() => setActionMatch(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setActionMatch(null)}>
          <View style={[styles.popover, { top: actionAnchorY + 12 }]}>
            <Pressable
              style={styles.popoverItem}
              onPress={() => {
                if (actionMatch) handleOpenEdit(actionMatch);
                setActionMatch(null);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color={colors.textStrong} />
              <Text style={styles.popoverText}>수정</Text>
            </Pressable>
            <View style={styles.popoverDivider} />
            <Pressable
              style={styles.popoverItem}
              onPress={() => {
                if (actionMatch) handleDelete(actionMatch.id);
                setActionMatch(null);
              }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.popoverText, { color: colors.danger }]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {detailMatch && (
        <PlaceDetailModal
          visible
          onClose={() => setDetailMatch(null)}
          name={detailMatch.location ?? ''}
          category={detailMatch.place_category}
          address={detailMatch.address}
          latitude={detailMatch.latitude}
          longitude={detailMatch.longitude}
        />
      )}

      <RosterSheet
        visible={!!rosterMatch}
        onClose={() => setRosterMatch(null)}
        matchLabel={rosterMatchLabel}
        capacity={members.length}
        deadlineLabel={rosterMatch?.vote_deadline ? ddayLabel(rosterMatch.vote_deadline) : undefined}
        members={rosterMembers}
        isAdmin={isAdmin ?? false}
      />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 8 },
  weatherLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  weatherLoadingText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  scroll: { paddingBottom: 110 },
  calendarCard: {
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  list: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  chipOpen: { backgroundColor: 'rgba(74,222,128,0.14)' },
  chipLocked: { backgroundColor: 'rgba(255,255,255,0.06)' },
  chipText: { fontSize: 10, fontWeight: '800' },
  cardPlace: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },

  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  rosterLink: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  track: { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  fillAttend: { backgroundColor: colors.green },
  fillAbsent: { backgroundColor: colors.neutralFill },

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
  votePillDisabled: { opacity: 0.4 },
  votePillText: { color: colors.textMuted, fontSize: 13.5, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 24,
    paddingTop: 12,
    gap: 10,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2C3833',
    marginBottom: 10,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  fieldLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.inputBg,
  },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  modalCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  modalSubmit: {
    flex: 1,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  modalSubmitText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },

  popover: {
    position: 'absolute',
    right: 20,
    width: 160,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  popoverText: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  popoverDivider: { height: 1, backgroundColor: colors.border },
});
