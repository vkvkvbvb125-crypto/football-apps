import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { TabHeader } from '../../../components/TabHeader';
import { WeatherBadge } from '../../attendance/components/WeatherBadge';
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
        {latestAnnouncement && (
          <Pressable style={styles.card} onPress={() => navigation.navigate('Team')}>
            <Text style={styles.cardLabel}>공지</Text>
            <Text style={styles.announceTitle} numberOfLines={1}>
              {latestAnnouncement.title}
            </Text>
            <Text style={styles.announceBody} numberOfLines={1}>
              {latestAnnouncement.body}
            </Text>
          </Pressable>
        )}

        {nextMatch ? (
          <View style={styles.card}>
            <View style={styles.matchHeaderRow}>
              <Text style={styles.cardLabel}>다음 경기</Text>
              <Text style={styles.dDayBadge}>{formatDDay(nextMatch.match_date)}</Text>
            </View>
            <Text style={styles.matchLine}>
              {formatMatchDate(nextMatch.match_date).dateLabel} · {nextMatch.location ?? '장소 미정'} ·{' '}
              {formatMatchDate(nextMatch.match_date).timeLabel}
            </Text>
            <WeatherBadge
              latitude={nextMatch.latitude}
              longitude={nextMatch.longitude}
              matchDateIso={nextMatch.match_date}
            />
            <Text style={styles.attendeeCount}>
              참석 {nextMatch.votes.filter((v) => v.status === 'attend').length}명
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>등록된 경기가 없어요</Text>
            <Text style={styles.emptySubtitle}>새 경기가 등록되면 여기에 보여드릴게요</Text>
          </View>
        )}

        {nudge && (
          <Pressable style={styles.nudgeCard} onPress={nudge.onPress}>
            <Text style={styles.nudgeText} numberOfLines={1}>
              {nudge.text}
            </Text>
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
  card: {
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 6,
  },
  cardLabel: {
    color: '#8A9490',
    fontSize: 12,
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
  matchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dDayBadge: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '800',
  },
  matchLine: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  attendeeCount: {
    marginTop: 4,
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyEmoji: {
    fontSize: 28,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#8A9490',
    fontSize: 12,
  },
  nudgeCard: {
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#22302A',
  },
  nudgeText: {
    color: '#D2A34C',
    fontSize: 13,
    fontWeight: '700',
  },
});
