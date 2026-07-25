import { useEffect, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { groupLabelsFor } from '../services/assignmentService';
import { TimerPanel } from '../../timer/components/TimerPanel';
import { ScoreboardPanel } from '../../timer/components/ScoreboardPanel';
import { EmbeddedNavBar } from '../../../navigation/EmbeddedNavBar';

export function AssignmentScreen({ navigation }: BottomTabScreenProps<any>) {
  const [view, setView] = useState<'assign' | 'timer' | 'score'>('assign');
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
  const addGroup = useAssignmentStore((s) => s.addGroup);
  const removeLastGroup = useAssignmentStore((s) => s.removeLastGroup);

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
      <TabHeader title="경기운영" titleSize={16} iconSize={18} />
      <View style={styles.viewToggleRow}>
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
        <Pressable
          style={({ pressed }) => [
            styles.viewToggle,
            styles.viewToggleDivider,
            view === 'assign' && styles.viewToggleActive,
            pressed && styles.pressedOpacity,
          ]}
          onPress={() => setView('assign')}
        >
          <Text style={[styles.viewToggleText, view === 'assign' && styles.viewToggleTextActive]}>팀 분배</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.viewToggle,
            styles.viewToggleDivider,
            view === 'score' && styles.viewToggleActive,
            pressed && styles.pressedOpacity,
          ]}
          onPress={() => setView('score')}
        >
          <Text style={[styles.viewToggleText, view === 'score' && styles.viewToggleTextActive]}>스코어</Text>
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
      ) : (
        <ScrollView contentContainerStyle={styles.bodyContent}>
          {view === 'timer' ? (
            <TimerPanel />
          ) : view === 'score' ? (
            <ScoreboardPanel />
          ) : loading && !loaded ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#4ADE80" />
          ) : matchesWithAttendees.length === 0 ? (
            <EmptyState
              emoji="👥"
              title="아직 분배할 경기가 없어요"
              subtitle={'참석투표가 있는 경기가 생기면\n여기서 팀을 나눌 수 있어요'}
            />
          ) : (
            <View style={styles.list}>
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

                    {(() => {
                      const groupLabels = groupLabelsFor(match.team_count);
                      return (
                        <View style={styles.groupsRow}>
                          {groupLabels.map((group, groupIndex) => {
                            const isLastGroup = groupIndex === groupLabels.length - 1;
                            return (
                              <View key={group} style={styles.groupColumn}>
                                <View style={styles.groupHeader}>
                                  <Text style={styles.groupTitle}>{group}팀</Text>
                                  {isAdmin && isLastGroup && groupLabels.length > 2 && (
                                    <Pressable onPress={() => removeLastGroup(match.id)} hitSlop={8}>
                                      <Ionicons name="trash-outline" size={14} color="#8A9490" />
                                    </Pressable>
                                  )}
                                </View>
                                {matchAssignments
                                  .filter((a) => a.group_label === group)
                                  .map((a) => (
                                    <Pressable
                                      key={a.team_member_id}
                                      disabled={!isAdmin}
                                      style={({ pressed }) => [
                                        styles.memberChip,
                                        pressed && isAdmin && styles.pressedOpacity,
                                      ]}
                                      hitSlop={6}
                                      onPress={() => moveMember(match.id, a.team_member_id)}
                                    >
                                      <Text style={styles.memberName}>{nameFor(a.team_member_id)}</Text>
                                    </Pressable>
                                  ))}
                              </View>
                            );
                          })}
                          {isAdmin && groupLabels.length < 5 && (
                            <Pressable
                              style={({ pressed }) => [styles.addGroupChip, pressed && styles.pressedOpacity]}
                              onPress={() => addGroup(match.id)}
                            >
                              <Ionicons name="add" size={16} color="#4ADE80" />
                              <Text style={styles.addGroupText}>팀 추가</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.embeddedNavWrap}>
            <EmbeddedNavBar />
          </View>
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
    height: 26,
    marginHorizontal: 11,
    marginTop: 9,
    marginBottom: 13,
    borderRadius: 6,
    backgroundColor: '#0E1715',
    borderWidth: 1,
    borderColor: 'rgba(62, 85, 79, 0.35)',
    overflow: 'hidden',
  },
  viewToggle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleDivider: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(62, 85, 79, 0.35)',
  },
  viewToggleActive: {
    margin: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(27, 79, 45, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(60, 150, 90, 0.5)',
  },
  viewToggleText: {
    color: '#87918F',
    fontWeight: '600',
    fontSize: 11,
  },
  viewToggleTextActive: {
    color: '#6ED78E',
  },
  bodyContent: {
    paddingHorizontal: 11,
    paddingBottom: 20,
  },
  embeddedNavWrap: {
    marginTop: 14,
  },
  list: {
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
    backgroundColor: '#4ADE80',
  },
  randomizeButtonText: {
    color: '#0F1512',
    fontWeight: '700',
    fontSize: 12,
  },
  groupsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  groupColumn: {
    flexBasis: '45%',
    flexGrow: 1,
    gap: 6,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  groupTitle: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 13,
  },
  addGroupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4ADE80',
    alignSelf: 'flex-start',
  },
  addGroupText: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 12,
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
