import { useEffect, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { TimerPanel } from '../../timer/components/TimerPanel';

const GROUPS = ['A', 'B'];

export function AssignmentScreen({ navigation }: BottomTabScreenProps<any>) {
  const [view, setView] = useState<'assign' | 'timer'>('assign');
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const isAdmin = activeTeam?.role === 'admin';

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const assignments = useAssignmentStore((s) => s.assignments);
  const loaded = useAssignmentStore((s) => s.loaded);
  const loading = useAssignmentStore((s) => s.loading);
  const error = useAssignmentStore((s) => s.error);
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments);
  const randomize = useAssignmentStore((s) => s.randomize);
  const moveMember = useAssignmentStore((s) => s.moveMember);

  useEffect(() => {
    if (!activeTeam) return;
    (async () => {
      await loadMatches();
      await loadAssignments();
    })();
  }, [activeTeam?.team.id]);

  const nameFor = (teamMemberId: string) => members.find((m) => m.id === teamMemberId)?.displayName ?? '멤버';

  const matchesWithAttendees = matches.filter((m) => m.votes.some((v) => v.status === 'attend'));

  return (
    <ScreenGradient>
      <TabHeader title="분배" />
      <View style={styles.viewToggleRow}>
        <Pressable
          style={({ pressed }) => [
            styles.viewToggle,
            view === 'assign' && styles.viewToggleActive,
            pressed && styles.pressedOpacity,
          ]}
          onPress={() => setView('assign')}
        >
          <Text style={[styles.viewToggleText, view === 'assign' && styles.viewToggleTextActive]}>분배</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.viewToggle,
            view === 'timer' && styles.viewToggleActive,
            pressed && styles.pressedOpacity,
          ]}
          onPress={() => setView('timer')}
        >
          <Text style={[styles.viewToggleText, view === 'timer' && styles.viewToggleTextActive]}>타이머</Text>
        </Pressable>
      </View>

      {!activeTeam ? (
        <EmptyState
          emoji="👥"
          title="팀에 가입하면 팀분배가 표시돼요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : view === 'timer' ? (
        <ScrollView>
          <TimerPanel />
        </ScrollView>
      ) : loading && !loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#39D98A" />
      ) : matchesWithAttendees.length === 0 ? (
        <EmptyState
          emoji="👥"
          title="아직 분배할 경기가 없어요"
          subtitle={'참석투표가 있는 경기가 생기면\n여기서 팀을 나눌 수 있어요'}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {matchesWithAttendees.map((match) => {
            const matchAssignments = assignments.filter((a) => a.match_id === match.id);

            return (
              <View key={match.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>
                    {new Date(match.match_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                  </Text>
                  {isAdmin && (
                    <Pressable
                      style={({ pressed }) => [styles.randomizeButton, pressed && styles.pressedOpacity]}
                      onPress={() => randomize(match.id)}
                    >
                      <Text style={styles.randomizeButtonText}>
                        {matchAssignments.length > 0 ? '다시 분배' : '랜덤 분배'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {matchAssignments.length === 0 ? (
                  <Text style={styles.waitingText}>아직 분배되지 않았어요</Text>
                ) : (
                  <View style={styles.groupsRow}>
                    {GROUPS.map((group) => (
                      <View key={group} style={styles.groupColumn}>
                        <Text style={styles.groupTitle}>{group}팀</Text>
                        {matchAssignments
                          .filter((a) => a.group_label === group)
                          .map((a) => (
                            <Pressable
                              key={a.team_member_id}
                              disabled={!isAdmin}
                              style={({ pressed }) => [styles.memberChip, pressed && isAdmin && styles.pressedOpacity]}
                              hitSlop={6}
                              onPress={() => moveMember(match.id, a.team_member_id, group === 'A' ? 'B' : 'A')}
                            >
                              <Text style={styles.memberName}>{nameFor(a.team_member_id)}</Text>
                            </Pressable>
                          ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  pressedOpacity: {
    opacity: 0.7,
  },
  viewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  viewToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  viewToggleActive: {
    backgroundColor: '#39D98A',
    borderColor: '#39D98A',
  },
  viewToggleText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  viewToggleTextActive: {
    color: '#0B0F0D',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  errorText: {
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 8,
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
  cardDate: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  randomizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#39D98A',
  },
  randomizeButtonText: {
    color: '#0B0F0D',
    fontWeight: '700',
    fontSize: 12,
  },
  waitingText: {
    marginTop: 12,
    color: '#5A625E',
    fontSize: 12,
  },
  groupsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  groupColumn: {
    flex: 1,
    gap: 6,
  },
  groupTitle: {
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  memberChip: {
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1B231F',
  },
  memberName: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});
