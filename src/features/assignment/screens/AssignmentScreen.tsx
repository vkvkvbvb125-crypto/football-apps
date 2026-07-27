// src/features/assignment/screens/AssignmentScreen.tsx — 리디자인 적용판
// 기존 store/서비스 API(randomize, moveMember, addGroup, removeLastGroup) 그대로 사용.
// 타이머/스코어는 기존 TimerPanel · 리디자인된 ScoreboardPanel을 그대로 붙입니다.
import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { groupLabelsFor } from '../services/assignmentService';
import { TimerPanel } from '../../timer/components/TimerPanel';
import { ScoreboardPanel } from '../../timer/components/ScoreboardPanel';

type View3 = 'timer' | 'assign' | 'score';
const TABS: { key: View3; label: string }[] = [
  { key: 'timer', label: '타이머' },
  { key: 'assign', label: '팀 분배' },
  { key: 'score', label: '스코어' },
];

const GROUP_COLOR = [colors.green, colors.blue, colors.gold, '#C084FC', '#F87171'];

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

export function AssignmentScreen({ navigation }: BottomTabScreenProps<any>) {
  const [view, setView] = useState<View3>('assign');

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const isAdmin = activeTeam?.role === 'admin';

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);
  const updateMatchStatus = useAttendanceStore((s) => s.updateMatchStatus);

  const [quarter, setQuarter] = useState(1);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

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

  const memberOf = (teamMemberId: string) => members.find((m) => m.id === teamMemberId);
  const nameFor = (teamMemberId: string) => memberOf(teamMemberId)?.displayName ?? '멤버';

  const matchesWithAttendees = useMemo(
    () =>
      matches
        .filter((m) => m.votes.some((v) => v.status === 'attend'))
        .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime()),
    [matches]
  );

  // 타이머/스코어는 가장 가까운 경기 하나를 기준으로 동작한다 (팀 분배는 위 목록처럼 여러 경기를 동시에 다룸)
  const nearestMatch = useMemo(() => {
    if (matches.length === 0) return null;
    const now = Date.now();
    return [...matches].sort(
      (a, b) => Math.abs(new Date(a.match_date).getTime() - now) - Math.abs(new Date(b.match_date).getTime() - now)
    )[0];
  }, [matches]);

  const handleFinishMatch = () => {
    if (!nearestMatch) return;
    updateMatchStatus(nearestMatch.id, 'completed');
    navigation.navigate('Settlement');
  };

  return (
    <ScreenGradient>
      <TabHeader title="경기운영" />

      <View style={styles.segment}>
        {TABS.map((t) => {
          const on = view === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setView(t.key)}
              style={({ pressed }) => [styles.segmentItem, on && styles.segmentItemOn, pressed && styles.pressed]}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!activeTeam ? (
        <EmptyState
          emoji="👥"
          title="팀에 가입하면 경기운영을 쓸 수 있어요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {view === 'timer' ? (
            nearestMatch ? (
              <TimerPanel
                initialQuarterMinutes={nearestMatch.quarter_minutes}
                quarter={quarter}
                onQuarterEnd={() => setQuarter((q) => Math.min(4, q + 1))}
                scoreA={scoreA}
                scoreB={scoreB}
                onPressScore={() => setView('score')}
                isAdmin={!!isAdmin}
              />
            ) : (
              <EmptyState emoji="⏱️" title="운영할 경기가 없어요" subtitle="일정 탭에서 경기가 등록되면 여기서 타이머를 쓸 수 있어요" />
            )
          ) : view === 'score' ? (
            <ScoreboardPanel
              scoreA={scoreA}
              scoreB={scoreB}
              onChangeA={setScoreA}
              onChangeB={setScoreB}
              isAdmin={!!isAdmin}
              onFinish={handleFinishMatch}
            />
          ) : loading && !loaded ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />
          ) : matchesWithAttendees.length === 0 ? (
            <EmptyState
              emoji="👥"
              title="아직 분배할 경기가 없어요"
              subtitle={'참석투표가 있는 경기가 생기면\n여기서 팀을 나눌 수 있어요'}
            />
          ) : (
            <View style={{ gap: 14 }}>
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              {matchesWithAttendees.map((match) => {
                const mine = assignments.filter((a) => a.match_id === match.id);
                const labels = groupLabelsFor(match.team_count);
                const attendees = match.votes.filter((v) => v.status === 'attend').length;
                const d = new Date(match.match_date);

                return (
                  <View key={match.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.cardTitle}>
                          {d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                        </Text>
                        <Text style={styles.cardSub}>
                          참석 {attendees}명 · {labels.length}팀 · 실력 균형 자동 고려
                        </Text>
                      </View>
                      {isAdmin && (
                        <Pressable
                          onPress={() => randomize(match.id)}
                          style={({ pressed }) => [styles.shuffleChip, pressed && styles.pressed]}
                        >
                          <Ionicons name="shuffle" size={13} color={colors.green} />
                          <Text style={styles.shuffleText}>{mine.length > 0 ? '다시 분배' : '랜덤 분배'}</Text>
                        </Pressable>
                      )}
                    </View>

                    <View style={styles.groups}>
                      {labels.map((group, gi) => {
                        const tint = GROUP_COLOR[gi % GROUP_COLOR.length];
                        const list = mine.filter((a) => a.group_label === group);
                        const isLast = gi === labels.length - 1;
                        return (
                          <View key={group} style={styles.groupCol}>
                            <View style={[styles.groupHead, { backgroundColor: `${tint}17` }]}>
                              <Text style={[styles.groupTitle, { color: tint }]}>{group}팀</Text>
                              <Text style={[styles.groupCount, { color: tint }]}>{list.length}명</Text>
                              {isAdmin && isLast && labels.length > 2 && (
                                <Pressable onPress={() => removeLastGroup(match.id)} hitSlop={8}>
                                  <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
                                </Pressable>
                              )}
                            </View>

                            <View style={styles.groupBody}>
                              {list.length === 0 ? (
                                <Text style={styles.groupEmpty}>비어 있음</Text>
                              ) : (
                                list.map((a) => {
                                  const m = memberOf(a.team_member_id);
                                  return (
                                    <Pressable
                                      key={a.team_member_id}
                                      disabled={!isAdmin}
                                      hitSlop={4}
                                      onPress={() => moveMember(match.id, a.team_member_id)}
                                      style={({ pressed }) => [styles.playerRow, pressed && isAdmin && styles.pressed]}
                                    >
                                      <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{initialOf(nameFor(a.team_member_id))}</Text>
                                      </View>
                                      <Text style={styles.playerName} numberOfLines={1}>
                                        {nameFor(a.team_member_id)}
                                      </Text>
                                      {!!m?.skillTag && <Text style={styles.playerTag}>{m.skillTag}</Text>}
                                    </Pressable>
                                  );
                                })
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {isAdmin && (
                      <View style={styles.cardFoot}>
                        <Text style={styles.footHint}>이름을 탭하면 다음 팀으로 이동해요</Text>
                        {labels.length < 5 && (
                          <Pressable
                            onPress={() => addGroup(match.id)}
                            style={({ pressed }) => [styles.addGroup, pressed && styles.pressed]}
                          >
                            <Ionicons name="add" size={15} color={colors.green} />
                            <Text style={styles.addGroupText}>팀 추가</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },

  segment: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
    padding: 4,
    borderRadius: radius.button,
    backgroundColor: '#0E1512',
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentItemOn: { backgroundColor: '#1B2A22', borderColor: colors.greenDeep },
  segmentText: { color: '#7C8A85', fontSize: 12.5, fontWeight: '800' },
  segmentTextOn: { color: colors.green },

  body: { paddingHorizontal: 20, paddingBottom: 110 },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: 8 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cardSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  shuffleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1B2A22',
    borderWidth: 1,
    borderColor: '#2A3A32',
  },
  shuffleText: { color: colors.green, fontSize: 12, fontWeight: '800' },

  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  groupCol: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden',
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupTitle: { fontSize: 13, fontWeight: '800', flex: 1 },
  groupCount: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  groupBody: { paddingVertical: 4 },
  groupEmpty: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600', padding: 11 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8 },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#8FA69C', fontSize: 10, fontWeight: '800' },
  playerName: { flex: 1, color: colors.textStrong, fontSize: 12.5, fontWeight: '600' },
  playerTag: { color: colors.textFaint, fontSize: 10, fontWeight: '800' },

  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  footHint: { color: colors.textFaint, fontSize: 11, fontWeight: '600', flex: 1 },
  addGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  addGroupText: { color: colors.green, fontSize: 12, fontWeight: '800' },
});
