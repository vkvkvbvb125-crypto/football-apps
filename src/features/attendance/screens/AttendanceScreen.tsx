// src/features/attendance/screens/AttendanceScreen.tsx — 리디자인 v3 (캘린더 + 상세카드 + 이후 일정 목록)
// 캘린더/모달 컴포넌트(CalendarGrid, TimeWheelPicker, DeadlinePicker, PlaceSearchModal)와
// store API는 기존 그대로 사용합니다.
// 경기 만들기는 홈 화면 버튼 → openCreate 파라미터로만 진입한다 (이 화면 자체엔 FAB 없음).
//
// 정원/대기명단은 utils/capacity.ts로 서버 데이터 없이 계산한다 (팀 전체 공통 DEFAULT_CAPACITY=12).
// 실내/실외 태그는 place_category 텍스트에 "실내"가 포함되는지로 추정한다 — 정확한 실내/실외 컬럼이
// 없어서 나온 최선의 근사치이며, 이전 로직(항상 실외로 간주)보다는 낫지만 완벽하지 않다.
// 날씨 실내구장 변경 "결정"은 이 세션 로컬 상태로만 유지되고(새로고침하면 사라짐), 결정 시
// 팀 전체에게 알림만 실제로 발송한다 — 다른 기기에 "이미 결정됨" 상태가 동기화되진 않는다.
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
import { useAuthStore } from '../../auth/stores/authStore';
import { useAttendanceStore } from '../stores/attendanceStore';
import { notifyTeam } from '../../notifications/services/pushService';
import { MonthNavigator } from '../components/MonthNavigator';
import { CalendarGrid } from '../components/CalendarGrid';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { PlaceSearchModal } from '../components/PlaceSearchModal';
import { RosterSheet, type RosterMember } from '../components/RosterSheet';
import { MatchDetailCard, type WaitlistEntry } from '../components/MatchDetailCard';
import { toMatchWeatherBlockData } from '../components/MatchWeatherBlock';
import { ScheduleRow, resolveBadge } from '../components/ScheduleRow';
import { CreateMatchSheet, type CreateMatchPayload, type VenueOption } from '../components/CreateMatchSheet';
import { resolveCapacity } from '../utils/capacity';
import { fetchMatchWeather, type MatchWeather as ServiceWeather } from '../services/weatherService';
import { fetchPartnerVenues, venueMeta } from '../services/venueService';
import type { PlaceResult } from '../services/placeService';
import type { MatchWithVotes } from '../services/attendanceService';

interface SelectedPlace {
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function daysUntilOf(iso: string): number {
  const a = new Date(iso);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function ddayLabel(iso: string) {
  const diff = daysUntilOf(iso);
  return diff === 0 ? 'TODAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

function monthOffsetFor(date: Date): number {
  const now = new Date();
  return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
}

export function AttendanceScreen({ navigation, route }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const myUserId = useAuthStore((s) => s.session?.user.id);

  const matches = useAttendanceStore((s) => s.matches);
  const loaded = useAttendanceStore((s) => s.loaded);
  const loading = useAttendanceStore((s) => s.loading);
  const error = useAttendanceStore((s) => s.error);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);
  const createMatch = useAttendanceStore((s) => s.createMatch);
  const createMatches = useAttendanceStore((s) => s.createMatches);
  const updateMatch = useAttendanceStore((s) => s.updateMatch);
  const deleteMatch = useAttendanceStore((s) => s.deleteMatch);
  const vote = useAttendanceStore((s) => s.vote);

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [actionMatch, setActionMatch] = useState<MatchWithVotes | null>(null);
  const [actionAnchorY, setActionAnchorY] = useState(160);
  const [timeText, setTimeText] = useState('19:00');
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [quarterMinutesText, setQuarterMinutesText] = useState('10');
  const [deadlineText, setDeadlineText] = useState('');
  const [rosterMatch, setRosterMatch] = useState<MatchWithVotes | null>(null);
  const [matchWeatherById, setMatchWeatherById] = useState<Record<string, ServiceWeather>>({});
  const [weatherDecisions, setWeatherDecisions] = useState<Record<string, 'keep' | 'indoor'>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [partnerVenues, setPartnerVenues] = useState<VenueOption[]>([]);

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

  // 경기별 상세 날씨(matchWeatherById) — 캘린더에는 더 이상 날씨를 표시하지 않고
  // MatchDetailCard/ScheduleRow에서만 쓴다. 팀 대표 좌표 기반 fallback은 실제
  // 경기가 없는 날짜엔 더 이상 조회하지 않는다(캘린더 표시가 사라졌으니 의미가 없다).
  useEffect(() => {
    const targets = matches
      .filter((m) => {
        const hours = (new Date(m.match_date).getTime() - Date.now()) / 3600000;
        return m.latitude != null && m.longitude != null && hours <= 240 && hours >= -3;
      })
      .map((m) => ({ matchId: m.id, latitude: m.latitude as number, longitude: m.longitude as number, matchDateIso: m.match_date }));

    if (targets.length === 0) {
      setMatchWeatherById({});
      setWeatherLoading(false);
      return;
    }
    let cancelled = false;
    let pending = targets.length;
    setMatchWeatherById({});
    setWeatherLoading(true);
    targets.forEach((t) => {
      fetchMatchWeather(t.latitude, t.longitude, t.matchDateIso)
        .then((weather) => {
          if (cancelled || !weather.available) return;
          setMatchWeatherById((prev) => ({ ...prev, [t.matchId]: weather }));
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
  }, [matches]);

  const upcomingMatches = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    return matches
      .filter((m) => new Date(m.match_date).getTime() >= startOfToday)
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
  }, [matches]);

  const selectedMatch = useMemo(
    () => matches.find((m) => dateKey(new Date(m.match_date)) === dateKey(selectedDate)) ?? null,
    [matches, selectedDate]
  );

  const venueKindOf = (match: MatchWithVotes): 'indoor' | 'outdoor' | 'pending' => {
    if (!match.location) return 'pending';
    return match.place_category?.includes('실내') ? 'indoor' : 'outdoor';
  };

  const waitlistEntriesFor = (memberIds: string[]): WaitlistEntry[] =>
    memberIds.map((id, i) => ({
      position: i + 1,
      name: members.find((m) => m.id === id)?.displayName ?? '멤버',
      isMe: id === activeTeam?.membershipId,
    }));

  const handleOpenCreate = () => {
    setCreateSheetVisible(true);
    // 제휴구장 테이블은 아직 데이터가 없어서 대부분 빈 배열로 돌아오지만, 실제 쿼리라서
    // 나중에 구장 데이터를 채워 넣으면 코드 변경 없이 바로 뜬다.
    fetchPartnerVenues(selectedDate)
      .then((venues) =>
        setPartnerVenues(
          venues.map((v) => ({
            id: v.id,
            name: v.name,
            isIndoor: v.isIndoor,
            isPartner: v.isPartner,
            meta: venueMeta(v),
            capacity: v.maxPlayers,
            slots: v.slots.map((s) => ({ timeRange: `${s.startTime}-${s.endTime}`, available: s.isAvailable })),
          }))
        )
      )
      .catch(() => setPartnerVenues([]));
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

  const handleEditSubmit = () => {
    if (!editingMatchId || !timeText.trim()) return;
    const matchDate = new Date(selectedDate);
    const [hours, minutes] = timeText.trim().split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
    matchDate.setHours(hours, minutes, 0, 0);

    let voteDeadline: string | null = null;
    if (deadlineText.trim()) {
      const d = new Date(deadlineText.trim().replace(' ', 'T') + ':00');
      if (!Number.isNaN(d.getTime())) voteDeadline = d.toISOString();
    }

    updateMatch(editingMatchId, {
      matchDate: matchDate.toISOString(),
      location: selectedPlace?.name ?? '',
      address: selectedPlace?.address ?? null,
      latitude: selectedPlace?.latitude ?? null,
      longitude: selectedPlace?.longitude ?? null,
      placeCategory: selectedPlace?.category ?? null,
      voteDeadline,
      quarterMinutes: Number(quarterMinutesText) || 10,
    });
    setModalVisible(false);
  };

  const handleCreateSubmit = (payload: CreateMatchPayload) => {
    const base = {
      location: payload.locationPending ? '' : (payload.locationText ?? ''),
      address: payload.locationPending ? null : payload.address,
      latitude: payload.locationPending ? null : payload.latitude,
      longitude: payload.locationPending ? null : payload.longitude,
      placeCategory: payload.locationPending ? null : payload.placeCategory,
      quarterMinutes: payload.quarterMinutes,
      locationPending: payload.locationPending,
    };

    if (payload.repeatWeekly && payload.repeatCount > 1) {
      const firstMatchDate = new Date(payload.matchDate);
      const deadlineOffsetMs = payload.voteDeadline
        ? firstMatchDate.getTime() - new Date(payload.voteDeadline).getTime()
        : null;

      const inputs = Array.from({ length: payload.repeatCount }, (_, i) => {
        const d = new Date(firstMatchDate);
        d.setDate(d.getDate() + i * 7);
        return {
          ...base,
          matchDate: d.toISOString(),
          voteDeadline: deadlineOffsetMs != null ? new Date(d.getTime() - deadlineOffsetMs).toISOString() : null,
        };
      });
      createMatches(inputs);
    } else {
      createMatch({ ...base, matchDate: payload.matchDate, voteDeadline: payload.voteDeadline });
    }
  };

  const setWeatherDecision = (match: MatchWithVotes, decision: 'keep' | 'indoor') => {
    setWeatherDecisions((prev) => ({ ...prev, [match.id]: decision }));
    if (!activeTeam) return;
    const dateLabel = new Date(match.match_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const body =
      decision === 'indoor'
        ? `${dateLabel} 경기 장소가 실내구장으로 변경될 예정이에요`
        : `${dateLabel} 경기는 예정대로 진행돼요`;
    notifyTeam(activeTeam.team.id, `${activeTeam.team.name} 우천 안내`, body, myUserId).catch(() => {
      // 알림 전송 실패는 조용히 무시 (화면에는 이미 결정이 반영됨)
    });
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
                onSelectDate={setSelectedDate}
              />
            </View>

            {loading && !loaded ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={colors.green} />
            ) : selectedMatch ? (
              (() => {
                const myVote = selectedMatch.votes.find((v) => v.team_member_id === activeTeam.membershipId)?.status;
                const deadlinePassed = selectedMatch.vote_deadline
                  ? new Date(selectedMatch.vote_deadline) < new Date()
                  : false;
                const isLocked = selectedMatch.status !== 'open' || deadlinePassed;
                const cap = resolveCapacity(
                  selectedMatch.votes,
                  selectedMatch.capacity,
                  members.length,
                  activeTeam.membershipId
                );
                const d = new Date(selectedMatch.match_date);
                return (
                  <View style={styles.detailWrap}>
                    <MatchDetailCard
                      headline={`${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                      ddayLabel={ddayLabel(selectedMatch.match_date)}
                      placeLabel={selectedMatch.location ?? '장소 미정'}
                      venueKind={venueKindOf(selectedMatch)}
                      daysUntil={daysUntilOf(selectedMatch.match_date)}
                      timeLabel={d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      weather={toMatchWeatherBlockData(matchWeatherById[selectedMatch.id] ?? null)}
                      capacity={selectedMatch.capacity}
                      capacityResult={cap}
                      memberCount={members.length}
                      deadlineLabel={
                        selectedMatch.vote_deadline ? ddayLabel(selectedMatch.vote_deadline) : undefined
                      }
                      myVote={myVote}
                      isLocked={isLocked}
                      isAdmin={isAdmin ?? false}
                      waitlist={waitlistEntriesFor(cap.waitlist)}
                      weatherDecision={weatherDecisions[selectedMatch.id] ?? null}
                      onVote={(status) => vote(selectedMatch.id, status)}
                      onOpenMenu={() => {
                        setActionAnchorY(160);
                        setActionMatch(selectedMatch);
                      }}
                      onPickVenue={() => handleOpenEdit(selectedMatch)}
                      onKeepOutdoor={() => setWeatherDecision(selectedMatch, 'keep')}
                      onFindIndoor={() => setWeatherDecision(selectedMatch, 'indoor')}
                    />
                    <Pressable onPress={() => setRosterMatch(selectedMatch)} hitSlop={6} style={styles.rosterLinkRow}>
                      <Text style={styles.rosterLinkText}>명단 보기 ›</Text>
                    </Pressable>
                  </View>
                );
              })()
            ) : (
              <View style={styles.noMatchHint}>
                <Text style={styles.noMatchHintText}>이 날짜엔 경기가 없어요</Text>
              </View>
            )}

            <View style={styles.scheduleSection}>
              <View style={styles.scheduleHead}>
                <Text style={styles.scheduleTitle}>이후 일정</Text>
                <Text style={styles.scheduleCount}>{upcomingMatches.length}경기</Text>
              </View>

              {upcomingMatches.length === 0 ? (
                <EmptyState
                  emoji="🗓️"
                  title="아직 등록된 경기가 없어요"
                  subtitle="홈 화면의 경기 만들기 버튼으로 새 경기를 만들어보세요"
                />
              ) : (
                upcomingMatches.map((match) => {
                  const cap = resolveCapacity(match.votes, match.capacity, members.length, activeTeam.membershipId);
                  const badge = resolveBadge({
                    confirmed: cap.attendCount,
                    capacity: match.capacity,
                    voteDeadline: match.vote_deadline,
                    status: match.status,
                  });
                  const d = new Date(match.match_date);
                  const blockWeather = toMatchWeatherBlockData(matchWeatherById[match.id] ?? null);
                  const subLabel = !match.location
                    ? '장소 미정 · 투표 먼저 진행'
                    : blockWeather
                      ? `${match.location} · ${blockWeather.stateText} ${blockWeather.temp}`
                      : match.location;

                  return (
                    <ScheduleRow
                      key={match.id}
                      monthLabel={`${d.getMonth() + 1}월`}
                      dayLabel={String(d.getDate())}
                      dowLabel={d.toLocaleDateString('ko-KR', { weekday: 'short' })}
                      timeLabel={d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      subLabel={subLabel}
                      confirmed={cap.attendCount}
                      capacity={match.capacity}
                      badge={badge}
                      selected={dateKey(d) === dateKey(selectedDate)}
                      onPress={() => {
                        setSelectedDate(d);
                        setMonthOffset(monthOffsetFor(d));
                      }}
                    />
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 경기 수정 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 경기 수정
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
              <Pressable onPress={handleEditSubmit} style={({ pressed }) => [styles.modalSubmit, pressed && styles.pressed]}>
                <Text style={styles.modalSubmitText}>저장</Text>
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

      <RosterSheet
        visible={!!rosterMatch}
        onClose={() => setRosterMatch(null)}
        matchLabel={rosterMatchLabel}
        capacity={rosterMatch?.capacity ?? 12}
        deadlineLabel={rosterMatch?.vote_deadline ? ddayLabel(rosterMatch.vote_deadline) : undefined}
        members={rosterMembers}
        isAdmin={isAdmin ?? false}
      />

      <CreateMatchSheet
        key={selectedDate.toISOString()}
        visible={createSheetVisible}
        onClose={() => setCreateSheetVisible(false)}
        selectedDate={selectedDate}
        defaults={undefined}
        venues={partnerVenues}
        onSubmit={handleCreateSubmit}
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

  detailWrap: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  rosterLinkRow: { alignSelf: 'flex-end', paddingHorizontal: 2 },
  rosterLinkText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },

  noMatchHint: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  noMatchHintText: { color: colors.textFaint, fontSize: 12.5, fontWeight: '600' },

  scheduleSection: { paddingHorizontal: 20, paddingTop: 22 },
  scheduleHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  scheduleTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  scheduleCount: { color: colors.textDim, fontSize: 12, fontWeight: '700' },

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
