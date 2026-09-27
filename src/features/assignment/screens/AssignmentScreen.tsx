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
import { useScoreStore } from '../../timer/stores/scoreStore';
import { TabHeader } from '../../../components/TabHeader';
import { radius, shadow, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { formationsFor } from '../../team/positions';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { formationKey, useFormationPickStore } from '../stores/formationPickStore';
import { groupLabelsFor } from '../services/assignmentService';
import { TimerPanel } from '../../timer/components/TimerPanel';
/* 사본을 두지 않는다 — 로마자 이름을 망가뜨리던 그 규칙이었다(team/initials.ts 참고) */
import { initialOf } from '../../team/initials';
import { ScoreboardPanel } from '../../timer/components/ScoreboardPanel';
import { SoftTint } from '../../../components/BentoCard';
import { liveMatchesFrom } from '../../attendance/utils/matchWindow';

type View3 = 'timer' | 'assign' | 'score';
const TABS: { key: View3; label: string }[] = [
  { key: 'timer', label: '타이머' },
  { key: 'assign', label: '팀 분배' },
  { key: 'score', label: '스코어' },
];

// 팀 구분용 색 — 서로 구별되기만 하면 되는 범주색이다.
// 5번째로 colors.danger(#F87171)를 쓰고 있었는데, 앱의 다른 곳에서 그 색은 삭제·오류를 뜻한다.
// 5팀으로 나눈 순간 멀쩡한 한 팀이 경고색을 뒤집어썼다 — 상태색과 겹치지 않는 색으로 바꾼다.
/* 팀 구분색. 테마마다 앞의 셋이 달라진다 — 뒤의 둘은 팔레트에 없는 고정색이다
   (palette-audit.md 「판단 보류」: 5칸이 한 화면에 나란히 있어 색이 실제로 구분에 쓰인다) */
const groupColorOf = (colors: Palette) => [colors.green, colors.blue, colors.gold, '#C084FC', '#F472B6'];

/** 쿼터 수 — 경기마다 다르게 정하는 기능이 아직 없어 앱 전체가 4쿼터를 쓴다 */
const TOTAL_QUARTERS = 4;

// 유예 3시간은 utils/matchWindow.ts에 있다 — 홈 화면과 값도 근거도 한 곳에서 본다.
// 이 선을 넘긴 경기는 분배/타이머/스코어 대상에서 빠진다 — 2주 전 경기가 계속 떠 있던 원인.



export function AssignmentScreen({ navigation }: BottomTabScreenProps<any>) {
  const { colors, styles } = useThemed(makeStyles);
  const [view, setView] = useState<View3>('assign');
  /*
    고른 포메이션 — **여기서는 읽기만 한다.** 고르는 곳은 상세 화면이고,
    값은 스토어에 있다(formationPickStore). 한 값을 두 화면이 보기 때문이다.
  */
  const formationPicks = useFormationPickStore((s) => s.picks);

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const memberNames = useTeamStore((s) => s.memberNames);
  const isAdmin = activeTeam?.role === 'admin';
  const bottomPad = useTabBarPadding();

  const matches = useAttendanceStore((s) => s.matches);
  const matchesLoaded = useAttendanceStore((s) => s.loaded);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);
  const updateMatchStatus = useAttendanceStore((s) => s.updateMatchStatus);

  const [quarter, setQuarter] = useState(1);
  /*
   * 점수는 스토어가 갖는다.
   *
   * useState 둘이었고 서버에 쓰지도 읽지도 않았다 — 앱을 껐다 켜면 사라졌다.
   * 화면 로컬로 두지 않는 건 곧 홈의 「최근 경기 결과」, 정산(경기 종료 흐름),
   * 팀 탭 개인 기록의 득점이 같은 값을 읽기 때문이다. 화면마다 fetch하면 값이 갈린다.
   */
  const scoreOf = useScoreStore((st) => st.scoreOf);
  const setScore = useScoreStore((st) => st.setScore);
  const loadScores = useScoreStore((st) => st.loadScores);
  const scoreError = useScoreStore((st) => st.error);
  const clearScoreError = useScoreStore((st) => st.clearError);
  const scoreMap = useScoreStore((st) => st.byMatch);
  const scoreFailedMatchId = useScoreStore((st) => st.failedMatchId);
  const scoreLoadingMatchId = useScoreStore((st) => st.loadingMatchId);

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
  /* ⚠ 나간 사람의 분배 기록도 남는다. 이름은 memberNames에서 찾는다 */
  const nameFor = (teamMemberId: string) => memberNames.get(teamMemberId) ?? '멤버';

  const liveMatches = useMemo(() => liveMatchesFrom(matches), [matches]);

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

  // 화면에 들어오면 저장된 점수를 되찾는다 — 없으면 0에서 시작한다
  useEffect(() => {
    if (nearestMatch) loadScores(nearestMatch.id);
  }, [nearestMatch?.id]);

  const scoreA = nearestMatch ? (scoreMap[nearestMatch.id]?.A ?? 0) : 0;
  const scoreB = nearestMatch ? (scoreMap[nearestMatch.id]?.B ?? 0) : 0;

  // 경기 종료 → 정산 생성까지 한 번에 잇는다 (settlement-flow.md 총무 플로우).
  // 정산 탭에 떨궈만 두면 총무가 목록에서 그 경기를 다시 찾아 눌러야 했다.
  //
  // 상태 변경을 기다린다. 예전엔 await이 없어서 updateMatchStatus가 실패해도 정산
  // 화면으로 넘어갔다 — 스토어가 오류를 error에 담고 rethrow하지 않으니 여기서는
  // 성공과 구별할 방법도 없었다. 총무는 「종료했다」고 믿는데 경기는 open으로 남는다.
  // 그 상태가 화면에서 보이는 곳은 없다: 목록 판정은 날짜로 하고, completed가 하는
  // 일은 투표 잠금 하나뿐이라 「종료했는데 아직 투표가 열려 있다」로만 나타난다.
  //
  // 실패하면 넘어가지 않는다. 스토어가 세운 문구가 일정 화면에 뜨고, 총무는 다시
  // 누를 수 있다. 성공했을 때만 정산으로 보낸다.
  //
  // error를 읽어 판단하지 않고 반환값을 본다 — 앞선 실패가 스토어에 남아 있으면
  // 성공한 이번 것을 실패로 읽는다.
  const handleFinishMatch = async () => {
    if (!nearestMatch) return;
    const id = nearestMatch.id;
    const ok = await updateMatchStatus(id, 'completed');
    if (!ok) return;
    navigation.navigate('Settlement', { createForMatchId: id });
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
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t.label}
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
            /*
             * 세로 가운데 정렬은 「운영할 경기가 없을 때」에만.
             *
             * 한때 타이머·스코어에도 걸었다. 아래가 40~70% 비어 보인다는 이유였는데,
             * 가운데 정렬은 빈 공간을 없애는 게 아니라 위아래로 나눠 가질 뿐이다 —
             * 아래가 줄어든 만큼 세그먼트 탭과 내용 사이가 벌어져서, 탭을 눌렀는데
             * 내용이 화면 한참 아래에서 시작하는 꼴이 됐다.
             *
             * 아래가 비는 건 그 화면에 담을 게 그것뿐이라는 뜻이지 정렬 문제가 아니다.
             * 내용은 위에서 시작하는 게 맞다.
             */
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
              accessibilityRole="button"
              accessibilityLabel="이 경기를 일정에서 보기"
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
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
              onChangeA={(v) => setScore(nearestMatch.id, 'A', v)}
              onChangeB={(v) => setScore(nearestMatch.id, 'B', v)}
              isAdmin={!!isAdmin}
              onFinish={handleFinishMatch}
              /* 못 읽은 0에서 +를 누르면 1이 서버 값을 덮는다 — 그 경기만 잠근다 */
              scoreUnavailable={scoreFailedMatchId === nearestMatch.id}
              loadingScores={scoreLoadingMatchId === nearestMatch.id}
              onRetryLoad={() => loadScores(nearestMatch.id)}
              saveError={scoreError}
              onDismissError={clearScoreError}
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
                    {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
                    <SoftTint tone="green" radius={radius.card} />
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
                          accessibilityRole="button"
                          accessibilityLabel={mine.length > 0 ? '팀 다시 분배' : '팀 분배'}
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
                        const tint = groupColorOf(colors)[gi % groupColorOf(colors).length];
                        const list = mine.filter((a) => a.group_label === group);
                        const isLast = gi === labels.length - 1;
                        return (
                          <View key={group} style={styles.groupCol}>
                            {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
                            <SoftTint tone="green" radius={radius.card} />
                            {/*
                              헤더 전체가 **포메이션 상세로 가는 표적**이다(2026-09-28).
                              여기엔 원래 아무 동작이 없어서 이름 탭(「다음 팀으로 이동」)과
                              충돌이 없다. 표적이 카드 폭 절반이라 작지도 않다.

                              ⚠ **휴지통을 헤더 밖으로 뺐다.** RN이 자식 Pressable을 먼저
                                먹는 것은 맞지만 **손가락은 경계를 정확히 안 누른다** —
                                되돌릴 수 없는 삭제를 오탭 위험이 있는 자리에 두지 않는다.
                                지금은 카드 **아래**에 따로 선다.
                            */}
                            <Pressable
                              onPress={() =>
                                navigation.navigate('Formation', { matchId: match.id, group })
                              }
                              disabled={list.length === 0}
                              accessibilityRole={list.length > 0 ? 'button' : undefined}
                              accessibilityLabel={
                                list.length > 0 ? `${group}팀 포메이션 보기, ${list.length}명` : undefined
                              }
                              style={({ pressed }) => [
                                styles.groupHead,
                                { backgroundColor: `${tint}17` },
                                pressed && list.length > 0 && styles.pressed,
                              ]}
                            >
                              <Text style={[styles.groupTitle, { color: tint }]}>{group}팀</Text>
                              <Text style={[styles.groupCount, { color: tint }]}>{list.length}명</Text>
                              {/*
                                읽기 전용 배지 — 조작이 아니다. 이것이 없으면 포메이션을
                                발견할 길이 없어 서랍 25의 「조용히 사라진다」가 되돌아온다.
                              */}
                              {list.length > 0 && (
                                <>
                                  <Text style={styles.groupFormation}>
                                    {formationsFor(list.length)?.[
                                      formationPicks[formationKey(match.id, group)] ?? 0
                                    ]?.label ?? '–'}
                                  </Text>
                                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                                </>
                              )}
                            </Pressable>

                            <View style={styles.groupBody}>
                              {list.length === 0 ? (
                                /*
                                 * 한 줄로 끝낸다. 조작법("이름을 탭하면 다음 팀으로 이동해요")은
                                 * 이미 카드 맨 아래 footHint가 한 번 말한다 — 빈 칸마다 되풀이하면
                                 * 같은 문장이 화면에 다섯 번 뜨고, 그러느라 칸이 96px씩 부풀었다.
                                 */
                                <View style={styles.groupEmptyBox}>
                                  <Text style={styles.groupEmpty}>비어 있음</Text>
                                </View>
                              ) : (
                                list.map((a) => {
                                  const m = memberOf(a.team_member_id);
                                  const isMe = a.team_member_id === activeTeam.membershipId;
                                  return (
                                    <Pressable
                                      key={a.team_member_id}
                                      disabled={!isAdmin}
                                      onPress={() => moveMember(match.id, a.team_member_id)}
                                      accessibilityRole={isAdmin ? 'button' : undefined}
                                      accessibilityLabel={
                                        isAdmin
                                          ? `${nameFor(a.team_member_id)}, 탭하면 다음 팀으로 이동`
                                          : nameFor(a.team_member_id)
                                      }
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

                            {/* ⚠ 되돌릴 수 없는 삭제다. 헤더 표적과 **떨어뜨려** 둔다 */}
                            {isAdmin && isLast && labels.length > 2 && (
                              <Pressable
                                onPress={() => removeLastGroup(match.id)}
                                hitSlop={14}
                                accessibilityRole="button"
                                accessibilityLabel={`${group}팀 삭제`}
                                style={({ pressed }) => [styles.groupRemove, pressed && styles.pressed]}
                              >
                                <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
                                <Text style={styles.groupRemoveText}>팀 삭제</Text>
                              </Pressable>
                            )}
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
                            accessibilityRole="button"
                            accessibilityLabel="팀 추가"
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  pressed: { opacity: 0.8 },

  segment: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
    padding: 4,
    borderRadius: radius.button,
    backgroundColor: colors.cardAlt,
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
  segmentItemOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  segmentText: { color: colors.navIdle, fontSize: 12, fontWeight: '800' }, // #7C8A85 하드코딩 = navIdle
  segmentTextOn: { color: colors.green },

  body: { paddingHorizontal: 20 },
  bodyCentered: { flexGrow: 1, justifyContent: 'center' },
  /** 어느 경기를 운영 중인지 — 세 탭 위에 항상 붙는 카드 */
  contextCard: {
    ...shadow.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  contextText: { flex: 1, color: colors.textStrong, fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: 8 },

  card: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
    gap: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cardSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  noVoteNote: {
    color: colors.gold,
    fontSize: 11,
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
    justifyContent: 'center',
    gap: 6,
    minHeight: 46, // 33px이었다 — 이 카드의 주 동작인데 화면에서 가장 누르기 어려웠다
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shuffleText: { color: colors.green, fontSize: 12, fontWeight: '800' },

  formationBlock: { marginTop: 14, gap: 8 },
  formationTitle: { color: colors.textStrong, fontSize: 12, fontWeight: '800' },

  /* 못 그리는 인원수에 말을 거는 자리. 카드가 아니라 **한 줄**이다 —
     여기에 카드를 두면 광고나 빈 상태처럼 화면 한 칸을 차지한다 */
  formationHint: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formationHintText: { color: colors.textDim, fontSize: 12, fontWeight: '600', lineHeight: 18 },

  formationChips: { flexDirection: 'row', gap: 6 },
  formationChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  formationChipOn: { borderColor: colors.green, backgroundColor: colors.greenTint },
  formationChipText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  formationChipTextOn: { color: colors.green },
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
  /* 읽기 전용 배지 — 조작이 아니라서 팀 색을 안 쓴다(누를 수 있어 보이면 안 된다) */
  groupFormation: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  /* ⚠ 헤더 표적과 떨어뜨린 삭제 버튼. 되돌릴 수 없으니 오탭 자리에 두지 않는다 */
  groupRemove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  groupRemoveText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  /*
   * minHeight: 96이 있었다. "빈 팀도 높이를 유지해야 옆 팀과 어긋나지 않는다"는 이유였는데,
   * groups가 flexDirection:'row'라 기본 alignItems가 stretch다 — 한 줄 안의 칸들은
   * 어차피 제일 큰 칸에 맞춰 늘어난다. minHeight는 그걸 이미 해결된 문제에 두 번 건 셈이고,
   * 정작 「전부 비어 있을 때」(=분배 전, 이 화면을 여는 대부분의 순간) 5개 칸이
   * 96px씩 쌓여 화면을 빈 상자로 채웠다.
   *
   * 떼면 채워진 팀 옆의 빈 팀은 stretch로 여전히 높이가 맞고, 전부 비었을 땐 같이 낮아진다.
   */
  groupBody: { paddingVertical: 4 },
  /** 빈 팀 — 한 줄. 28px 아이콘 원과 두 줄 안내는 이 상태가 차지할 자리가 아니었다 */
  groupEmptyBox: { justifyContent: 'center', minHeight: 34, paddingHorizontal: 13 },
  // textFaint(#5F6B66)는 cardAlt(#151B17) 위에서 3.15:1 — 11px 안내문에 AA(4.5:1) 미달이다
  groupEmpty: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  // 이름을 탭해 팀을 옮기는 게 이 화면의 핵심 동작인데 행 높이가 40px이었다
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  playerName: { flex: 1, color: colors.textStrong, fontSize: 12, fontWeight: '600' },
  playerTag: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },

  // 내 이름을 목록에서 눈으로 찾아야 했다 — 배경/아바타/글씨색으로 바로 눈에 띄게 한다
  playerRowMe: { backgroundColor: colors.greenTint },
  avatarMe: { backgroundColor: colors.greenDeep },
  avatarTextMe: { color: colors.green },
  playerNameMe: { color: colors.text, fontWeight: '800' },

  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  footHint: { color: colors.textMuted, fontSize: 11, fontWeight: '600', flex: 1 },
  addGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  addGroupText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  });
