import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../stores/attendanceStore';
import { MonthNavigator } from '../components/MonthNavigator';
import { CalendarGrid } from '../components/CalendarGrid';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { PlaceSearchModal } from '../components/PlaceSearchModal';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { WeatherBadge } from '../components/WeatherBadge';
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

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function AttendanceScreen({ navigation, route }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
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

  useEffect(() => {
    if (activeTeam) loadMatches();
  }, [activeTeam?.team.id]);

  const isAdmin = activeTeam?.role === 'admin';

  const visibleMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [monthOffset]);

  const markedDates = useMemo(() => new Set(matches.map((m) => dateKey(new Date(m.match_date)))), [matches]);

  const [calendarWeather, setCalendarWeather] = useState<Record<string, string>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);

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
    let pendingCount = targets.length;
    setCalendarWeather({});
    setWeatherLoading(true);
    // 날짜마다 도착하는 대로 바로 반영 - 전부 모아서 한번에 갱신하면 동시성 제한 때문에
    // 가장 늦게 끝나는 날짜만큼 화면이 안 바뀌는 것처럼 보인다.
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
          pendingCount -= 1;
          if (pendingCount === 0 && !cancelled) setWeatherLoading(false);
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
    setDeadlineText(match.vote_deadline ? new Date(match.vote_deadline).toISOString().slice(0, 16).replace('T', ' ') : '');
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

    if (editingMatchId) {
      updateMatch(editingMatchId, payload);
    } else {
      createMatch(payload);
    }
    setModalVisible(false);
  };

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
        <View style={styles.body}>
          {weatherLoading && (
            <View style={styles.weatherLoadingRow}>
              <ActivityIndicator size="small" color="#4ADE80" />
              <Text style={styles.weatherLoadingText}>날씨 조회 중...</Text>
            </View>
          )}

          <MonthNavigator offset={monthOffset} onChange={setMonthOffset} />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <CalendarGrid
              year={visibleMonth.year}
              month={visibleMonth.month}
              selectedDate={selectedDate}
              markedDates={markedDates}
              weatherByDate={calendarWeather}
              onSelectDate={setSelectedDate}
            />
            <View style={styles.list}>
            {loading && !loaded ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#4ADE80" />
            ) : monthMatches.length === 0 ? (
              <EmptyState
                emoji="🗓️"
                title="이 달엔 등록된 경기가 없어요"
                subtitle="홈 화면의 경기 만들기 버튼으로 새 경기를 만들어보세요"
              />
            ) : (
              monthMatches.map((match) => {
                const myVote = match.votes.find((v) => v.team_member_id === activeTeam.membershipId);
                const deadlinePassed = match.vote_deadline ? new Date(match.vote_deadline) < new Date() : false;
                const isLocked = match.status !== 'open' || deadlinePassed;
                const counts = {
                  attend: match.votes.filter((v) => v.status === 'attend').length,
                  absent: match.votes.filter((v) => v.status === 'absent').length,
                  undecided: match.votes.filter((v) => v.status === 'undecided').length,
                };

                return (
                  <View key={match.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardDate}>
                        {new Date(match.match_date).toLocaleString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <View style={styles.cardHeaderRight}>
                        {isLocked && <Text style={styles.lockedTag}>투표 마감</Text>}
                        {isAdmin && (
                          <Pressable
                            onPress={(e) => {
                              setActionAnchorY(e.nativeEvent.pageY);
                              setActionMatch(match);
                            }}
                            hitSlop={8}
                          >
                            <Ionicons name="ellipsis-vertical" size={18} color="#8A9490" />
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {match.location && (
                      <Pressable onPress={() => setDetailMatch(match)}>
                        <Text style={styles.cardLocation} numberOfLines={1} ellipsizeMode="tail">
                          {match.location}
                        </Text>
                      </Pressable>
                    )}

                    <WeatherBadge
                      latitude={match.latitude}
                      longitude={match.longitude}
                      matchDateIso={match.match_date}
                    />

                    <Text style={styles.countsText}>
                      참석 {counts.attend} · 불참 {counts.absent} · 미정 {counts.undecided}
                    </Text>

                    <View style={styles.voteRow}>
                      {VOTE_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.status}
                          disabled={isLocked}
                          onPress={() => vote(match.id, opt.status)}
                          style={({ pressed }) => [
                            styles.voteChip,
                            myVote?.status === opt.status && styles.voteChipActive,
                            isLocked && styles.voteChipDisabled,
                            pressed && !isLocked && styles.pressedOpacity,
                          ]}
                        >
                          <Text style={[styles.voteChipText, myVote?.status === opt.status && styles.voteChipTextActive]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
            </View>
          </ScrollView>
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 경기 {editingMatchId ? '수정' : '만들기'}
            </Text>

            <Text style={styles.fieldLabel}>경기 시간</Text>
            <TimeWheelPicker value={timeText} onChange={setTimeText} />

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
            <TextInput
              style={styles.input}
              placeholder="쿼터 시간(분)"
              placeholderTextColor="#5A625E"
              value={quarterMinutesText}
              onChangeText={setQuarterMinutesText}
              keyboardType="number-pad"
            />
            <Text style={styles.fieldLabel}>인원 마감 (선택)</Text>
            <DeadlinePicker value={deadlineText} onChange={setDeadlineText} matchDate={selectedDate} matchTime={timeText} />

            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable style={styles.modalCreateButton} onPress={handleSubmit}>
                <Text style={styles.modalCreateText}>{editingMatchId ? '저장' : '만들기'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!actionMatch} transparent animationType="fade" onRequestClose={() => setActionMatch(null)}>
        <Pressable style={styles.actionOverlay} onPress={() => setActionMatch(null)}>
          <View style={[styles.actionPopover, { top: actionAnchorY + 12 }]}>
            <Pressable
              style={styles.actionOption}
              onPress={() => {
                if (actionMatch) handleOpenEdit(actionMatch);
                setActionMatch(null);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color="#E7ECE9" />
              <Text style={styles.actionOptionText}>수정</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable
              style={styles.actionOption}
              onPress={() => {
                if (actionMatch) handleDelete(actionMatch.id);
                setActionMatch(null);
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#F87171" />
              <Text style={[styles.actionOptionText, styles.actionOptionTextDanger]}>삭제</Text>
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
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  pressedOpacity: {
    opacity: 0.7,
  },
  errorText: {
    color: '#F87171',
    textAlign: 'center',
    marginTop: 8,
  },
  weatherLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  weatherLoadingText: {
    color: '#8A9490',
    fontSize: 12,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardDate: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  lockedTag: {
    color: '#8A9490',
    fontSize: 11,
    fontWeight: '600',
  },
  cardLocation: {
    marginTop: 4,
    color: '#8A9490',
    fontSize: 13,
  },
  countsText: {
    marginTop: 10,
    color: '#8A9490',
    fontSize: 12,
  },
  voteRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  voteChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  voteChipActive: {
    backgroundColor: '#4ADE80',
    borderColor: '#4ADE80',
  },
  voteChipDisabled: {
    opacity: 0.4,
  },
  voteChipText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  voteChipTextActive: {
    color: '#0F1512',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#141A17',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldLabel: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1B231F',
  },
  modalCancelText: {
    color: '#8A9490',
    fontWeight: '600',
  },
  modalCreateButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#4ADE80',
  },
  modalCreateText: {
    color: '#0F1512',
    fontWeight: '700',
  },
  actionOverlay: {
    flex: 1,
  },
  actionPopover: {
    position: 'absolute',
    right: 20,
    width: 160,
    backgroundColor: '#141A17',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22302A',
    overflow: 'hidden',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.4)',
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionOptionText: {
    color: '#E7ECE9',
    fontSize: 14,
    fontWeight: '600',
  },
  actionOptionTextDanger: {
    color: '#F87171',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#22302A',
  },
});
