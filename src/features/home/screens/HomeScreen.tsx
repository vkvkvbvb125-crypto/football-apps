import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { fetchMatchWeather, weatherEmoji } from '../../attendance/services/weatherService';
import type { MatchWithVotes } from '../../attendance/services/attendanceService';

const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;
const UPCOMING_LIMIT = 5;

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  const dateLabel = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const timeLabel = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { dateLabel, timeLabel };
}

function MatchWeatherChip({ match }: { match: MatchWithVotes }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    if (match.latitude == null || match.longitude == null) return;
    const hoursUntilMatch = (new Date(match.match_date).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 240 || hoursUntilMatch < -3) return;

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
  }, [match.id, match.latitude, match.longitude, match.match_date]);

  if (!text) return null;
  return <Text style={styles.matchMeta}>{text}</Text>;
}

export function HomeScreen({ navigation }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  useEffect(() => {
    if (!activeTeam) return;
    loadMatches();
    loadMembers();
  }, [activeTeam?.team.id]);

  if (!activeTeam) return null;

  const now = Date.now();
  const upcomingMatches = matches
    .filter((m) => new Date(m.match_date).getTime() >= now - NEXT_MATCH_GRACE_MS)
    .slice(0, UPCOMING_LIMIT);

  return (
    <ScreenGradient>
      <TabHeader title="홈" />
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={['#2D5F3E', '#173A26']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.greetingCard}>
          <Image
            source={require('../../../../assets/축구공.png')}
            style={styles.greetingIcon}
            resizeMode="contain"
          />
          <Text style={styles.greetingTitle}>즐거운 풋살,{'\n'}오늘도 함께!</Text>
          <Text style={styles.greetingSubtitle}>오늘도 멋진 경기를 즐겨보세요</Text>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>다가오는 경기</Text>
          <Pressable style={styles.sectionLinkRow} onPress={() => navigation.navigate('Attendance')} hitSlop={8}>
            <Text style={styles.sectionLink}>전체보기</Text>
            <Ionicons name="chevron-forward" size={14} color="#8A9490" />
          </Pressable>
        </View>

        {upcomingMatches.length === 0 ? (
          <View style={styles.matchCard}>
            <Text style={styles.emptyTitle}>등록된 경기가 없어요</Text>
            <Text style={styles.emptySubtitle}>새 경기가 등록되면 여기에 보여드릴게요</Text>
          </View>
        ) : (
          upcomingMatches.map((match) => {
            const { dateLabel, timeLabel } = formatMatchDate(match.match_date);
            const attendCount = match.votes.filter((v) => v.status === 'attend').length;
            return (
              <Pressable
                key={match.id}
                style={({ pressed }) => [styles.matchCard, pressed && styles.matchCardPressed]}
                onPress={() => navigation.navigate('Attendance')}
              >
                <Text style={styles.matchDate}>
                  {dateLabel} {timeLabel}
                </Text>
                <Text style={styles.matchLocation}>{match.location ?? '장소 미정'}</Text>
                <View style={styles.matchMetaRow}>
                  <MatchWeatherChip match={match} />
                  <Text style={styles.matchAttend}>
                    참여 {attendCount}/{members.length}명
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}

        <Pressable style={styles.createButton} onPress={() => navigation.navigate('Attendance')}>
          <Text style={styles.createButtonText}>경기 만들기</Text>
          <Ionicons name="add" size={18} color="#0F1512" />
        </Pressable>
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 100,
  },
  greetingCard: {
    borderRadius: 18,
    padding: 20,
    overflow: 'hidden',
    gap: 4,
  },
  greetingIcon: {
    position: 'absolute',
    width: 190,
    height: 190,
    right: -30,
    bottom: -40,
    opacity: 0.95,
  },
  greetingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
  },
  greetingSubtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionLink: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  matchCard: {
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 4,
  },
  matchCardPressed: {
    opacity: 0.85,
  },
  matchDate: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  matchLocation: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  matchMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchMeta: {
    color: '#8A9490',
    fontSize: 12,
  },
  matchAttend: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySubtitle: {
    marginTop: 2,
    color: '#8A9490',
    fontSize: 12,
  },
  createButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4ADE80',
    borderRadius: 999,
    paddingVertical: 14,
  },
  createButtonText: {
    color: '#0F1512',
    fontSize: 15,
    fontWeight: '800',
  },
});
