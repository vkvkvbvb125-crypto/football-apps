// src/features/assignment/screens/AssignmentScreen.tsx — 리디자인 적용판
// 기존 store/서비스 API(randomize, moveMember, addGroup, removeLastGroup) 그대로 사용.
// 타이머/스코어는 기존 TimerPanel · 리디자인된 ScoreboardPanel을 그대로 붙입니다.
import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { FormationView } from '../components/FormationView';
import { formationFor } from '../../team/positions';
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

/** 쿼터 수 — 경기마다 다르게 정하는 기능이 아직 없어 앱 전체가 4쿼터를 쓴다 */
const TOTAL_QUARTERS = 4;

// 킥오프 3시간 뒤까지는 "운영 중"으로 본다 (홈 화면 NEXT_MATCH_GRACE_MS와 같은 기준).
// 이 선을 넘긴 경기는 분배/타이머/스코어 대상에서 빠진다 — 2주 전 경기가 계속 떠 있던 원인.
const MATCH_GRACE_MS = 3 * 60 * 60 * 1000;

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

export function AssignmentScreen({ navigation }: BottomTabScreenProps<any>) {
  const [view, setView] = useState<View3>('assign');

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const isAdmin = activeTeam?.role === 'admin';
  const bottomPad = useTabBarPadding();

  const matches = useAttendanceStore((s) => s.matches);
  const matchesLoaded = useAttendanceStore((s) => s.loaded);
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

  const liveMatches = useMemo(() => {
    const from = Date.now() - MATCH_GRACE_MS;
    return matches
      .filter((m) => new Date(m.match_date).getTime() >= from)
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
  }, [matches]);

  /**
   * 투표가 없는 경기도 보여준다.
   *
   * 예전엔 "참석" 투표가 하나라도 있어야 목록에 올렸는데, 그러면 급하게 잡아 바로 뛰는 경기는
   * 경기운영 탭이 통째로 비어 버린다 — 정작 그때가 팀을 나눠야 하는 순간이다.
   * 대신 투표가 없다는 사실을 카드에 적고, 전체 팀원으로 나눌지 총무가 고르게 한다.
   */
  const operableMatches = liveMatches;

  /**
   * 운영할 경기가 없으면 세 탭(타이머/팀 분배/스코어)이 전부 빈 화면이다 —
   * 눌러볼 이유가 없는 탭을 셋이나 보여주는 대신, 세그먼트를 감추고 안내 하나만 둔다.
   */
  const hasMatch = liveMatches.length > 0;

  // 타이머/스코어는 다가오는 경기 하나를 기준으로 동작한다 (팀 분배는 위 목록처럼 여러 경기를 동시에 다룸).
  // 절대 시간차로 고르면 지난 경기가 뽑혀서 끝난 경기의 타이머를 돌리게 된다.
  const nearestMatch = liveMatches[0] ?? null;

  // 경기 종료 → 정산 생성까지 한 번에 잇는다 (settlement-flow.md 총무 플로우).
  // 정산 탭에 떨궈만 두면 총무가 목록에서 그 경기를 다시 찾아 눌러야 했다.
  const handleFinishMatch = () => {
    if (!nearestMatch) return;
    updateMatchStatus(nearestMatch.id, 'completed');
    navigation.navigate('Settlement', { createForMatchId: nearestMatch.id });
  };

  return (
    <ScreenGradient>
      <TabHeader title="경기운영" />

      {!!activeTeam && hasMatch && (
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
      )}

      {!activeTeam ? (
        <EmptyState
          emoji="👥"
          title="팀에 가입하면 경기운영을 쓸 수 있어요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: bottomPad },
            // 운영할 경기가 없으면 내용이 한 덩어리뿐이라 위에 붙고 아래로 500px 넘게 빈다.
            // 그럴 때만 남는 공간을 채워 세로 가운데로 보낸다 (목록이 있을 땐 위에서 시작해야 한다).
            !hasMatch && styles.bodyCentered,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* 어느 경기를 운영 중인지는 세 탭 모두에서 보여야 한다 —
              팀 분배에서만 빠져 있어서 "지금 나누는 게 어느 경기지"를 알 수 없었다.
              누르면 일정 탭의 그 경기로 간다. */}
          {!!nearestMatch && (
            <Pressable
              onPress={() =>
                navigation.navigate('Attendance', { focusDate: new Date(nearestMatch.match_date).toISOString() })
              }
              style={({ pressed }) => [styles.contextCard, pressed && styles.pressed]}
            >
              <Ionicons name="location-outline" size={15} color={colors.green} />
              <Text style={styles.contextText} numberOfLines={1}>
                {new Date(nearestMatch.match_date).toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}{' '}
                {new Date(nearestMatch.match_date).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
                {nearestMatch.location ? ` · ${nearestMatch.location}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </Pressable>
          )}

          {!matchesLoaded ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />
          ) : !hasMatch ? (
            // 세 탭을 각자 비워 두는 대신 한 번만 말한다 — 여기서 할 일은 일정 탭에 있다
            <EmptyState
              emoji="⚽"
              title="운영할 경기가 없어요"
              subtitle={
                isAdmin
                  ? '일정 탭에서 경기를 만들면\n타이머 · 팀 분배 · 스코어를 여기서 씁니다'
                  : '총무가 경기를 만들면\n타이머 · 팀 분배 · 스코어를 여기서 씁니다'
              }
              actionLabel={isAdmin ? '일정에서 경기 만들기' : undefined}
              onAction={isAdmin ? () => navigation.navigate('Attendance') : undefined}
            />
          ) : view === 'timer' && nearestMatch ? (
            <TimerPanel
              initialQuarterMinutes={nearestMatch.quarter_minutes}
              quarter={quarter}
              onQuarterEnd={() => setQuarter((q) => Math.min(4, q + 1))}
              scoreA={scoreA}
              scoreB={scoreB}
              onPressScore={() => setView('score')}
              isAdmin={!!isAdmin}
              matchInfo={{
                quarterMinutes: nearestMatch.quarter_minutes,
                totalQuarters: TOTAL_QUARTERS,
                teamCount: nearestMatch.team_count,
              }}
            />
          ) : view === 'score' && nearestMatch ? (
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
          ) : (
            <View style={{ gap: 14 }}>
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              {operableMatches.map((match) => {
                const mine = assignments.filter((a) => a.match_id === match.id);
                const labels = groupLabelsFor(match.team_count);
                const attendees = match.votes.filter((v) => v.status === 'attend').length;
                // 투표가 아직 없다 — 전체 팀원으로 나눌지 총무가 고른다
                const noVotes = attendees === 0;
                const absentees = match.votes.filter((v) => v.status === 'absent').length;
                const d = new Date(match.match_date);

                return (
                  <View key={match.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.cardTitle}>
                          {d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                        </Text>
                        <Text style={styles.cardSub}>
                          {noVotes
                            ? `참석 투표 없음 · ${labels.length}팀`
                            : `참석 ${attendees}명 · ${labels.length}팀 · 실력 균형 자동 고려`}
                        </Text>
                      </View>
                      {isAdmin && (
                        <Pressable
                          onPress={() => randomize(match.id, noVotes)}
                          style={({ pressed }) => [styles.shuffleChip, pressed && styles.pressed]}
                        >
                          <Ionicons name="shuffle" size={13} color={colors.green} />
                          <Text style={styles.shuffleText}>
                            {mine.length > 0 ? '다시 분배' : noVotes ? '전체 팀원으로 분배' : '랜덤 분배'}
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    {/* 누가 나뉘는지 밝힌다 — 투표 안 한 사람까지 들어가는 건 알고 눌러야 한다 */}
                    {noVotes && mine.length === 0 && (
                      <Text style={styles.noVoteNote}>
                        아직 참석 투표한 사람이 없어요. 지금 나누면 팀원 전체
                        {absentees > 0 ? ` (불참 ${absentees}명 제외)` : ''}로 나눕니다.
                      </Text>
                    )}

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
                                // 빈 팀도 카드 높이를 유지한다 — "비어 있음" 한 줄이면 칸이 찌그러져
                                // 옆 팀과 높이가 안 맞고, 여기에 넣으라는 안내도 안 된다
                                <View style={styles.groupEmptyBox}>
                                  <View style={styles.groupEmptyIcon}>
                                    <Ionicons name="person-add-outline" size={14} color={colors.textDim} />
                                  </View>
                                  <Text style={styles.groupEmpty}>
                                    {isAdmin ? '이름을 탭해서\n여기로 옮기세요' : '아직 배정된\n선수가 없어요'}
                                  </Text>
                                </View>
                              ) : (
                                list.map((a) => {
                                  const m = memberOf(a.team_member_id);
                                  const isMe = a.team_member_id === activeTeam.membershipId;
                                  return (
                                    <Pressable
                                      key={a.team_member_id}
                                      disabled={!isAdmin}
                                      hitSlop={4}
                                      onPress={() => moveMember(match.id, a.team_member_id)}
                                      style={({ pressed }) => [
                                        styles.playerRow,
                                        isMe && styles.playerRowMe,
                                        pressed && isAdmin && styles.pressed,
                                      ]}
                                    >
                                      <View style={[styles.avatar, isMe && styles.avatarMe]}>
                                        <Text style={[styles.avatarText, isMe && styles.avatarTextMe]}>
                                          {initialOf(nameFor(a.team_member_id))}
                                        </Text>
                                      </View>
                                      <Text style={[styles.playerName, isMe && styles.playerNameMe]} numberOfLines={1}>
                                        {nameFor(a.team_member_id)}
                                        {isMe ? ' (나)' : ''}
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

                    {/* 포메이션 — 팀이 갈린 직후가 "누가 어디 서지"를 묻는 순간이다.
                        5·6명일 때만 그린다(features/team/positions.ts). 그 밖의 인원수는
                        표준 배치가 없어 억지로 그리면 실제 경기와 안 맞는다. */}
                    {labels.map((group) => {
                      const list = mine.filter((a) => a.group_label === group);
                      if (!formationFor(list.length)) return null;
                      return (
                        <View key={`formation-${group}`} style={styles.formationBlock}>
                          <Text style={styles.formationTitle}>{group}팀 포메이션</Text>
                          <FormationView
                            players={list.map((a) => ({
                              id: a.team_member_id,
                              name: nameFor(a.team_member_id),
                              position: memberOf(a.team_member_id)?.position ?? null,
                            }))}
                          />
                        </View>
                      );
                    })}

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

  body: { paddingHorizontal: 20 },
  bodyCentered: { flexGrow: 1, justifyContent: 'center' },
  /** 어느 경기를 운영 중인지 — 세 탭 위에 항상 붙는 카드 */
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contextText: { flex: 1, color: colors.textStrong, fontSize: 12.5, fontWeight: '700' },
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
  noVoteNote: {
    color: colors.gold,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 17,
    backgroundColor: colors.goldTint,
    borderRadius: radius.button,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
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

  formationBlock: { marginTop: 14, gap: 8 },
  formationTitle: { color: colors.textStrong, fontSize: 12.5, fontWeight: '800' },
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
  groupBody: { paddingVertical: 4, minHeight: 96 },
  /** 빈 팀 — 아이콘 + 안내. 옆 팀과 높이가 어긋나지 않게 최소 높이를 준다 */
  groupEmptyBox: { alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 18, paddingHorizontal: 8 },
  groupEmptyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
  },
  groupEmpty: { color: colors.textFaint, fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
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

  // 내 이름을 목록에서 눈으로 찾아야 했다 — 배경/아바타/글씨색으로 바로 눈에 띄게 한다
  playerRowMe: { backgroundColor: colors.greenTint },
  avatarMe: { backgroundColor: colors.greenDeep },
  avatarTextMe: { color: colors.green },
  playerNameMe: { color: colors.text, fontWeight: '800' },

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
