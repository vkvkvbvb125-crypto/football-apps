// src/features/attendance/screens/AttendanceScreen.tsx — 리디자인 v3 (캘린더 + 상세카드 + 다가오는 경기 목록)
// 캘린더/모달 컴포넌트(CalendarGrid, TimeWheelPicker, DeadlinePicker, PlaceSearchModal)와
// store API는 기존 그대로 사용합니다.
// 참석 투표는 이 화면에만 있다 — 홈은 참여 현황만 보여주고 focusDate 파라미터로 여기 보낸다.
// 경기 만들기는 이 화면에만 있다 — 「다가오는 경기」 헤더의 버튼과 빈 날짜의 "이 날짜에 경기 만들기".
// 홈에는 만드는 입구를 두지 않는다(홈은 다음 경기 하나만 보여주는 자리다).
//
// 정원/대기명단은 utils/capacity.ts로 서버 데이터 없이 계산한다 (팀 전체 공통 DEFAULT_CAPACITY=12).
// 실내/실외 태그는 place_category 텍스트에 "실내"가 포함되는지로 추정한다 — 정확한 실내/실외 컬럼이
// 없어서 나온 최선의 근사치이며, 이전 로직(항상 실외로 간주)보다는 낫지만 완벽하지 않다.
// 날씨 실내구장 변경 "결정"은 이 세션 로컬 상태로만 유지되고(새로고침하면 사라짐), 결정 시
// 팀 전체에게 알림만 실제로 발송한다 — 다른 기기에 "이미 결정됨" 상태가 동기화되진 않는다.
import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { confirmAction } from '../../../components/Dialog';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { colors, font, radius, shadow } from '../../../theme';
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
import { createResultLabel } from '../utils/createResult';
import { isVotingOpen, votingLockNote } from '../utils/voting';
import { matchDateTimeLabel, matchLabel } from '../utils/matchLabel';
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
/** 시각을 버린 새 Date — 원본을 변형하지 않는다(Date#setHours는 제자리 변형이라 위험하다) */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function daysUntilOf(iso: string): number {
  const a = new Date(iso);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/**
 * 방금 만든 경기가 처음부터 잠겨 있으면 안 된다.
 *
 * "경기 1일 전"은 마감을 경기 날짜에서만 빼서 정한다. 그래서 오늘 경기를 오늘 만들면
 * 마감이 어제가 되고, 아무도 한 번도 투표할 수 없는 경기가 생긴다.
 *
 * 지난 마감은 킥오프까지 늦춘다. 킥오프마저 지났다면(이미 시작한 경기를 뒤늦게 등록)
 * 마감을 걸지 않는다 — 어떤 시각을 넣어도 이미 지난 시각이라 잠기기 때문이다.
 * 이 경우 총무가 메뉴에서 직접 마감한다.
 */
function votableDeadline(deadlineIso: string | null, matchDateIso: string): string | null {
  if (!deadlineIso) return null;
  if (new Date(deadlineIso).getTime() >= Date.now()) return deadlineIso;
  return new Date(matchDateIso).getTime() > Date.now() ? matchDateIso : null;
}

/** 수정/삭제 팝오버 높이 (항목 2개 + 구분선) — 화면 밖으로 밀리는지 판단하는 데만 쓴다 */
const POPOVER_HEIGHT = 92;

/** ⋮ 버튼 바로 아래. 아래 공간이 모자라면 버튼 위로 뒤집는다 */
function popoverTop(anchorY: number) {
  const screenH = Dimensions.get('window').height;
  const below = anchorY + 12;
  if (below + POPOVER_HEIGHT <= screenH - 16) return below;
  return Math.max(16, anchorY - POPOVER_HEIGHT - 30);
}

/*
 * 경기 카드 우상단 배지.
 *
 * 지난 경기를 D+1로 적고 있었다. D-2는 "이틀 남았다"로 바로 읽히는데 D+1은
 * "하루 지났다"인지 "하루 뒤"인지 헷갈린다 — 지나간 경기라는 사실이 배지의 요점인데
 * 그게 안 드러났다. 지난 것은 며칠인지가 아니라 끝났다는 것이 정보다.
 */
function ddayLabel(iso: string) {
  const diff = daysUntilOf(iso);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return 'TODAY';
  return '종료';
}

function monthOffsetFor(date: Date): number {
  const now = new Date();
  return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
}

export function AttendanceScreen({ navigation, route }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const bottomPad = useTabBarPadding();

  const matches = useAttendanceStore((s) => s.matches);
  const loaded = useAttendanceStore((s) => s.loaded);
  const loading = useAttendanceStore((s) => s.loading);
  const error = useAttendanceStore((s) => s.error);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);
  const createMatch = useAttendanceStore((s) => s.createMatch);
  const createMatches = useAttendanceStore((s) => s.createMatches);
  const lastCreateResult = useAttendanceStore((s) => s.lastCreateResult);
  const clearCreateResult = useAttendanceStore((s) => s.clearCreateResult);
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
    /*
     * 「경기 만들기」는 캘린더에서 고른 날짜로 만든다.
     *
     * 그런데 이 버튼은 「다가오는 경기」 헤더에 있는 전체 동작이라, 사용자는 지금 어떤
     * 날짜가 골라져 있는지 신경 쓰지 않는다. 어제 경기 카드를 보다가 누르면 어제로
     * 만들어지고, 그 경기는 만들자마자 「다가오는 경기」에서 빠진다 —
     * "오늘로 만들었는데 일정이 없다고 뜬다"가 이 경로다.
     *
     * 지난 날짜가 골라져 있으면 오늘로 옮긴다. 캘린더 선택도 같이 움직여서
     * 시트에 적히는 날짜와 화면이 어긋나지 않는다.
     */
    const today = startOfDay(new Date());
    if (startOfDay(selectedDate).getTime() < today.getTime()) setSelectedDate(today);
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

  // 홈에서 "투표하러 가기"로 넘어올 때 그 경기 날짜를 펴준다 —
  // 이게 없으면 다음 경기가 오늘이 아닐 때 빈 날짜로 떨어져서 투표할 카드가 안 보인다.
  useEffect(() => {
    const iso = (route.params as { focusDate?: string } | undefined)?.focusDate;
    if (!iso) return;
    setSelectedDate(new Date(iso));
    navigation.setParams({ focusDate: undefined });
  }, [route.params]);

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

  const handleDelete = async (matchId: string) => {
    const ok = await confirmAction({
      title: '경기 취소',
      message: '이 경기를 취소하시겠어요? 투표/정산/분배 기록도 함께 삭제됩니다.',
      confirmLabel: '취소하기',
      destructive: true,
    });
    if (ok) deleteMatch(matchId);
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

  const handleCreateSubmit = async (payload: CreateMatchPayload) => {
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
          voteDeadline:
            deadlineOffsetMs != null
              ? votableDeadline(new Date(d.getTime() - deadlineOffsetMs).toISOString(), d.toISOString())
              : null,
        };
      });
      return createMatches(inputs);
    }
    return createMatch({
      ...base,
      matchDate: payload.matchDate,
      voteDeadline: votableDeadline(payload.voteDeadline, payload.matchDate),
    });
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

  /* 홈 경기 카드도 같은 시트에 같은 라벨을 넘긴다 — 포맷은 matchLabel 유틸이 갖는다 */
  const rosterMatchLabel = useMemo(
    () => (rosterMatch ? matchLabel(rosterMatch.match_date, rosterMatch.location) : ''),
    [rosterMatch],
  );

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

          {/*
            반복 생성 결과 — 건너뛴 건 실패가 아니라서 오류(빨강)로 띄우지 않는다.
            총무가 궁금한 건 개수가 아니라 「어느 날짜가 빠졌나」다. 셋까지는 날짜를
            적고, 그보다 많으면 화면이 문장으로 덮이므로 개수로 요약한다.
          */}
          {!!lastCreateResult && (
            <Pressable onPress={clearCreateResult} accessibilityRole="button" style={styles.createNote}>
              <Ionicons name="checkmark-circle-outline" size={15} color={colors.green} />
              <Text style={styles.createNoteText}>{createResultLabel(lastCreateResult)}</Text>
            </Pressable>
          )}

          <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
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
                const isLocked = !isVotingOpen(selectedMatch);
                const lockNote = votingLockNote(selectedMatch, isAdmin ?? false) ?? undefined;
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
                      headline={matchDateTimeLabel(d)}
                      ddayLabel={ddayLabel(selectedMatch.match_date)}
                      matchType={selectedMatch.match_type}
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
                      lockNote={lockNote}
                      isAdmin={isAdmin ?? false}
                      waitlist={waitlistEntriesFor(cap.waitlist)}
                      weatherDecision={weatherDecisions[selectedMatch.id] ?? null}
                      onVote={(status) => vote(selectedMatch.id, status)}
                      onOpenMenu={(anchorY) => {
                        setActionAnchorY(anchorY);
                        setActionMatch(selectedMatch);
                      }}
                      onPickVenue={() => handleOpenEdit(selectedMatch)}
                      onKeepOutdoor={() => setWeatherDecision(selectedMatch, 'keep')}
                      onFindIndoor={() => setWeatherDecision(selectedMatch, 'indoor')}
                      // 카드 밖에 떠 있던 「명단 보기」를 카드 푸터로 넣었다 (MatchDetailCard 참고)
                      onOpenRoster={() => setRosterMatch(selectedMatch)}
                    />
                  </View>
                );
              })()
            ) : upcomingMatches.length > 0 ? (
              // 경기가 하나도 없을 땐 아래 "다가오는 경기" 빈 상태가 같은 말을 한다 — 두 번 쓰지 않는다
              <View style={styles.noMatchHint}>
                <Text style={styles.noMatchHintText}>이 날짜엔 경기가 없어요</Text>
                {/* 골랐는데 만들 방법이 없으면 막다른 길이다 — 지난 날짜는 만들 수 없으니 제외한다.
                    Date#setHours를 직접 쓰면 state를 그 자리에서 변형시켜버리므로 시작점 복사본으로 비교한다. */}
                {isAdmin && startOfDay(selectedDate).getTime() >= startOfDay(new Date()).getTime() && (
                  <Pressable
                    onPress={handleOpenCreate}
                    accessibilityRole="button"
                    accessibilityLabel="이 날짜에 경기 만들기"
                    style={({ pressed }) => [styles.noMatchCta, pressed && styles.pressed]}
                  >
                    <Ionicons name="add" size={14} color={colors.green} />
                    <Text style={styles.noMatchCtaText}>이 날짜에 경기 만들기</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            <View style={styles.scheduleSection}>
              <View style={styles.scheduleHead}>
                {/* "이후"라고 하면 오늘 경기가 빠진 것처럼 읽힌다 — 목록은 오늘 0시부터 담는다.
                    오늘 저녁 경기도 아직 안 치른 경기라 여기 있는 게 맞다. */}
                <Text style={styles.scheduleTitle}>다가오는 경기</Text>
                {/*
                  0은 적지 않는다.
                  「다가오는 경기 0경기」가 떠 있는데 바로 위 상세 카드에 경기가 보이면
                  모순으로 읽힌다 — 상세 카드는 캘린더에서 고른 날짜를 보여주고 목록은
                  다가오는 것만 담기 때문이다. 없다는 말은 바로 아래 빈 상태가 이미 한다.
                */}
                {upcomingMatches.length > 0 && (
                  <Text style={styles.scheduleCount}>{upcomingMatches.length}경기</Text>
                )}
                <View style={{ flex: 1 }} />
                {/* 경기가 0건이어도 이 버튼은 뜬다 — 새 팀이 첫 경기를 만드는 유일한 입구다 */}
                {isAdmin && (
                  <Pressable
                    onPress={handleOpenCreate}
                    accessibilityRole="button"
                    accessibilityLabel="경기 만들기"
                    // 상자는 36인데 눌리는 범위는 44 — createChip 주석 참고
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={({ pressed }) => [styles.createChip, pressed && styles.pressed]}
                  >
                    <Ionicons name="add" size={14} color={colors.green} />
                    <Text style={styles.createChipText}>경기 만들기</Text>
                  </Pressable>
                )}
              </View>

              {upcomingMatches.length === 0 ? (
                /*
                  같은 0이라도 뜻이 둘이다.
                  경기가 하나도 없는 것과, 만든 경기가 전부 지난 것은 다른 상태인데
                  둘 다 "아직 등록된 경기가 없어요"로 적고 있었다. 경기를 다섯 개 만들어 둔
                  사람에게 하나도 없다고 말하니 방금 만든 게 사라진 것처럼 보였다.
                  (upcomingMatches는 오늘 0시 이후만 담는다 — 어제 경기는 여기 안 들어온다.)
                */
                <EmptyState
                  compact
                  emoji="🗓️"
                  title={matches.length === 0 ? '아직 등록된 경기가 없어요' : '다가오는 경기가 없어요'}
                  subtitle={
                    matches.length > 0
                      ? `지난 경기 ${matches.length}개는 위 달력에서 볼 수 있어요.${
                          isAdmin ? '\n새 경기는 날짜를 고르고 만들면 돼요' : ''
                        }`
                      : isAdmin
                        ? '날짜를 고르고 첫 경기를 만들어 보세요.\n만들면 팀원에게 참석 투표가 열려요'
                        : '총무가 경기를 만들면 여기에 보여드릴게요'
                  }
                  actionLabel={isAdmin ? (matches.length === 0 ? '첫 경기 만들기' : '새 경기 만들기') : undefined}
                  onAction={isAdmin ? handleOpenCreate : undefined}
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
                accessibilityRole="button"
                accessibilityLabel="수정 취소"
                style={({ pressed }) => [styles.modalCancel, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleEditSubmit}
                accessibilityRole="button"
                accessibilityLabel="경기 수정 저장"
                style={({ pressed }) => [styles.modalSubmit, pressed && styles.pressed]}
              >
                <Text style={styles.modalSubmitText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 수정/삭제 팝오버 */}
      <Modal visible={!!actionMatch} transparent animationType="fade" onRequestClose={() => setActionMatch(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setActionMatch(null)}>
          <View style={[styles.popover, { top: popoverTop(actionAnchorY) }]}>
            <Pressable
              style={({ pressed }) => [styles.popoverItem, pressed && styles.pressed]}
              accessibilityRole="menuitem"
              accessibilityLabel="경기 수정"
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
              style={({ pressed }) => [styles.popoverItem, pressed && styles.pressed]}
              accessibilityRole="menuitem"
              accessibilityLabel="경기 삭제"
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
  /** 반복 생성 결과 — 오류가 아니라 알림이라 초록 */
  createNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  createNoteText: { flex: 1, color: colors.textBody, fontSize: 12, fontWeight: '600' },
  weatherLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  weatherLoadingText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  calendarCard: {
    ...shadow.card,
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    paddingVertical: 8,
  },

  // gap 8은 떠 있던 「명단 보기」 줄과의 간격이었다 — 그 줄이 카드 안으로 들어가 자식이 하나뿐이다
  detailWrap: { paddingHorizontal: 20, paddingTop: 16 },

  noMatchHint: {
    ...shadow.card,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: 10,
  },
  // textFaint(#5F6B66)는 card(#18201B) 위 3.2:1로 AA 미달 — 날짜를 골랐을 때 뜨는 유일한 설명이다
  noMatchHintText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  noMatchCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  noMatchCtaText: { color: colors.green, fontSize: 12, fontWeight: '800' },

  scheduleSection: { paddingHorizontal: 20, paddingTop: 22 },
  /*
   * 제목과 목록 사이가 34px이었다.
   *
   * 이 행의 높이는 제일 큰 자식인 칩이 정한다. 칩이 46이고 제목은 15px(줄 상자 22)인데
   * baseline 정렬이라 제목이 행 위쪽에 붙는다 — 제목 아래로 24px이 그냥 빈다.
   * 거기에 marginBottom 10이 더해진 값이었다.
   *
   * 칩을 36으로 낮춰 죽은 공간을 12로 줄이고(제목이 17이 된 뒤 값), marginBottom은 8.
   * 합 20px — 홈의 섹션 헤더(21px)와 같은 간격이다.
   */
  scheduleHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  createChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center', // 부모가 baseline 정렬이라 칩은 따로 세로 중앙을 잡아준다
    gap: 5,
    /*
     * 46이었다 — 12px 글씨를 담기엔 두꺼워서 섹션 헤더에서 칩이 제목을 눌렀다.
     * 46은 원래 31에서 올린 값인데, 그때 문제는 표적이 작다는 것이었지
     * 칩이 얇다는 게 아니었다. 그래서 상자는 36으로 낮추고 모자란 8px은
     * hitSlop으로 채운다 — 눌리는 범위는 44 그대로고 보이는 것만 얇아진다.
     */
    minHeight: 36,
    // 13이었다 — 높이를 46에서 36으로 내리니 좌우가 상대적으로 좁아 보였다.
    // 알약은 양 끝이 둥글어서 같은 여백이라도 사각 버튼보다 좁게 읽힌다.
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  createChipText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  /*
   * 15였다 — 홈의 섹션 제목은 17이라 탭을 옮기면 같은 층의 제목이 작아졌다.
   * font.title(17)이 그 층의 토큰이다. font.section(15)은 카드 제목 쪽이라 여기 쓸 게 아니었다.
   */
  scheduleTitle: { ...font.title, color: colors.text },
  scheduleCount: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, // textDim은 화면 배경 위 3.9:1

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    ...shadow.overlay,
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
    backgroundColor: colors.neutralFill,
    marginBottom: 10,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  // 폼 라벨은 대비를 양보할 자리가 아니다 — textDim은 card 위 3.78:1로 AA 미달이었다
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4 },
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
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  modalSubmit: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
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
    borderCurve: 'continuous',
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
