import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { TabHeader } from '../../../components/TabHeader';
import { WeatherBadge } from '../../attendance/components/WeatherBadge';
import { ParticleSphere } from '../../assignment/components/ParticleSphere';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { usePollsStore } from '../../polls/stores/pollsStore';

const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  const dateLabel = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const timeLabel = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { dateLabel, timeLabel };
}

function formatDDay(iso: string) {
  const diffMs = new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const days = Math.round(diffMs / 86400000);
  if (days <= 0) return '오늘';
  return `D-${days}`;
}

export function HomeScreen({ navigation }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);

  const polls = usePollsStore((s) => s.polls);
  const loadPolls = usePollsStore((s) => s.loadPolls);

  useEffect(() => {
    if (!activeTeam) return;
    loadMatches();
    loadAnnouncements();
    loadPolls();
  }, [activeTeam?.team.id]);

  if (!activeTeam) return null;

  const now = Date.now();
  const nextMatch = matches.find((m) => new Date(m.match_date).getTime() >= now - NEXT_MATCH_GRACE_MS);
  const latestAnnouncement = announcements[0] ?? null;

  const myVoteOnNextMatch = nextMatch?.votes.find((v) => v.team_member_id === activeTeam.membershipId);
  const openUnansweredPoll = polls.find(
    (p) =>
      (p.deadline == null || new Date(p.deadline).getTime() > now) &&
      !p.responses.some((r) => r.team_member_id === activeTeam.membershipId)
  );

  let nudge: { text: string; onPress: () => void } | null = null;
  if (nextMatch && !myVoteOnNextMatch) {
    nudge = { text: '다음 경기 투표에 참여해주세요', onPress: () => navigation.navigate('Attendance') };
  } else if (openUnansweredPoll) {
    nudge = {
      text: `새 투표에 참여해주세요: ${openUnansweredPoll.question}`,
      onPress: () => navigation.navigate('Team'),
    };
  }

  return (
    <ScreenGradient>
      <TabHeader title="홈" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ParticleSphere />
          <LinearGradient
            colors={['rgba(15,21,18,0)', 'rgba(15,21,18,0.55)', 'rgba(15,21,18,0.97)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow} numberOfLines={1}>
              {activeTeam.team.name}
            </Text>
            {nextMatch ? (
              <>
                <Text style={styles.heroDDay}>{formatDDay(nextMatch.match_date)}</Text>
                <Text style={styles.heroMatchLine}>
                  {formatMatchDate(nextMatch.match_date).dateLabel} · {nextMatch.location ?? '장소 미정'} ·{' '}
                  {formatMatchDate(nextMatch.match_date).timeLabel}
                </Text>
                <WeatherBadge
                  latitude={nextMatch.latitude}
                  longitude={nextMatch.longitude}
                  matchDateIso={nextMatch.match_date}
                />
                <Text style={styles.heroAttendee}>
                  참석 {nextMatch.votes.filter((v) => v.status === 'attend').length}명
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.heroEmptyTitle}>등록된 경기가 없어요</Text>
                <Text style={styles.heroEmptySubtitle}>새 경기가 등록되면 여기에 보여드릴게요</Text>
              </>
            )}
          </View>
        </View>

        {latestAnnouncement && (
          <Pressable style={styles.card} onPress={() => navigation.navigate('Team')}>
            <View style={styles.cardIconChip}>
              <Ionicons name="megaphone-outline" size={16} color="#4ADE80" />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardLabel}>공지</Text>
              <Text style={styles.announceTitle} numberOfLines={1}>
                {latestAnnouncement.title}
              </Text>
              <Text style={styles.announceBody} numberOfLines={1}>
                {latestAnnouncement.body}
              </Text>
            </View>
          </Pressable>
        )}

        {nudge && (
          <Pressable style={styles.card} onPress={nudge.onPress}>
            <View style={[styles.cardIconChip, styles.cardIconChipWarn]}>
              <Ionicons name="alert-circle-outline" size={16} color="#D2A34C" />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.nudgeText} numberOfLines={2}>
                {nudge.text}
              </Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 12,
  },
  hero: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  heroContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    gap: 4,
  },
  heroEyebrow: {
    color: '#B9C2BD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroDDay: {
    color: '#4ADE80',
    fontSize: 34,
    fontWeight: '800',
    marginTop: 2,
  },
  heroMatchLine: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  heroAttendee: {
    marginTop: 2,
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  heroEmptyTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  heroEmptySubtitle: {
    marginTop: 2,
    color: '#8A9490',
    fontSize: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#22302A',
  },
  cardIconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74,222,128,0.15)',
  },
  cardIconChipWarn: {
    backgroundColor: 'rgba(210,163,76,0.15)',
  },
  cardTextCol: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    color: '#8A9490',
    fontSize: 11,
    fontWeight: '600',
  },
  announceTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  announceBody: {
    color: '#8A9490',
    fontSize: 12,
  },
  nudgeText: {
    color: '#D2A34C',
    fontSize: 13,
    fontWeight: '700',
  },
});
