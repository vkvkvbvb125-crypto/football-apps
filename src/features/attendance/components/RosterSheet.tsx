// src/features/attendance/components/RosterSheet.tsx
// 참석 명단 시트 — 필터(전체/참석/불참/미투표) + 개별 독촉 + 일괄 독촉
//
// 손잡이/제목 부분을 끌어 올리면 화면 상단까지 펴지고, 내리면 원래 높이로 돌아온다.
// 명단이 길어질수록 좁은 시트에서 스크롤만 하게 되는데, 그때 화면을 다 쓰라고 만든 것이다.
// 제스처 라이브러리를 새로 넣지 않고 내장 PanResponder를 쓴다 — 스냅 두 개짜리에 의존성을 늘릴 이유가 없다.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { colors } from '../../../theme';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 이 속도 이상으로 튕기면 끈 거리와 상관없이 그 방향으로 붙인다 */
const FLING_VY = 0.5;

/**
 * 손을 뗐을 때 펼침으로 갈지 접힘으로 갈지.
 *
 * 순수 함수로 빼둔 이유는 제스처를 자동으로 재현하기 어려워서다 — 판단 규칙만은 따로 검증할 수 있다.
 */
export function shouldExpand(endHeight: number, vy: number, collapsedH: number, expandedH: number) {
  if (vy < -FLING_VY) return true; // 위로 튕김
  if (vy > FLING_VY) return false; // 아래로 튕김
  return endHeight > (collapsedH + expandedH) / 2;
}

export type VoteStatus = 'attend' | 'absent' | 'undecided' | 'pending';

export interface RosterMember {
  id: string;
  name: string;
  position?: string | null;
  attendanceRate?: number | null;
  role?: 'admin' | 'member';
  status: VoteStatus;
  isMe?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  matchLabel: string; // "7월 28일 (화) 20:00 · 풋살장 A구장"
  capacity: number;
  deadlineLabel?: string; // "D-1"
  members: RosterMember[];
  isAdmin: boolean;
  onPoke?: (memberId: string) => void;
  onPokeAll?: () => void;
  /**
   * 마감돼서 못 바꾸는 상태.
   *
   * 스토어의 vote()가 이미 막는다. 그래도 화면이 따로 막는 이유는 둘이 다른 일을 하기
   * 때문이다 — 스토어는 쓰기를 거절하고, 화면은 「지금은 안 된다」를 누르기 전에 보여준다.
   * 판정은 두 곳 다 isVotingOpen 하나에서 나온다(부르는 화면이 계산해 넘긴다).
   */
  isLocked?: boolean;
  /** 막힌 이유. 문구는 votingLockNote가 만든다 — 여기서 새로 짓지 않는다 */
  lockNote?: string;
  /**
   * 확정 시 호출. 실패하면 던진다.
   *
   * pending은 못 넘긴다 — 「아직 안 찍음」은 사람이 고를 수 있는 값이 아니라
   * 행이 없다는 뜻이다. 타입으로 막아 둔다.
   */
  onVote?: (status: Exclude<VoteStatus, 'pending'>) => Promise<void>;
}

const LABEL: Record<VoteStatus, string> = {
  attend: '참석',
  absent: '불참',
  undecided: '미정',
  pending: '미투표',
};

const TONE: Record<VoteStatus, { bg: string; fg: string }> = {
  attend: { bg: 'rgba(34,197,94,0.14)', fg: colors.green },
  absent: { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted },
  undecided: { bg: 'rgba(210,163,76,0.16)', fg: colors.gold },
  pending: { bg: 'rgba(210,163,76,0.10)', fg: colors.gold },
};

type TabKey = 'all' | 'attend' | 'absent' | 'pending';

/**
 * 하단 버튼의 네 갈래.
 *
 * pending(행 없음)과 undecided(미정으로 찍음)를 갈라 적는다. 시트 탭은 둘을 「미투표」로
 * 묶는데(총무가 독촉할 대상이 같다), 버튼은 내 상태를 말하는 자리라 다르다 —
 * 「아직 안 찍었어요」와 「미정으로 찍었어요」는 나에게 다른 사실이다.
 */
const MY_VOTE_LABEL: Record<VoteStatus, string> = {
  pending: '참석 여부 응답하기',
  attend: '내 응답: 참석 · 변경하기',
  absent: '내 응답: 불참 · 변경하기',
  undecided: '내 응답: 미정 · 변경하기',
};

/** 고를 수 있는 값 — pending은 여기 없다 */
const CHOICES = ['attend', 'absent', 'undecided'] as const;

/** 체크가 뜨고 시트가 닫히기까지. 애니메이션보다 길어야 결과를 읽고 닫힌다 */
const DONE_CLOSE_MS = 400;

export function RosterSheet({
  visible,
  onClose,
  matchLabel,
  capacity,
  deadlineLabel,
  members,
  isAdmin,
  onPoke,
  onPokeAll,
  isLocked,
  lockNote,
  onVote,
}: Props) {
  const [tab, setTab] = useState<TabKey>('all');
  const [poked, setPoked] = useState<Record<string, boolean>>({});
  const [pokedAll, setPokedAll] = useState(false);

  // ── 내 응답 바꾸기 ──────────────────────────────────────────
  /** 알약이 펼쳐져 있는가. 접혀 있을 때는 버튼 하나만 보인다 */
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<(typeof CHOICES)[number] | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * 실패 문구를 스토어가 아니라 여기 담는다.
   *
   * 스토어 error를 구독하면 loadMatches()가 시작할 때 error를 null로 밀어서, 화면 진입
   * 이펙트 한 번에 방금 뜬 문구가 사라진다. 문구 자체는 스토어가 만든 것을 그대로 쓴다 —
   * 여기서 새로 지으면 카드 경로와 시트 경로가 다른 말을 한다.
   */
  const [voteError, setVoteError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const checkScale = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  /**
   * 이 칸의 높이. 알약을 펼치면 자란다.
   *
   * 시트 높이는 처음 한 번 재고 굳는다(collapsedH). 그래서 이 칸이 자라도 시트는 그대로고,
   * flex:1인 명단이 그만큼 줄어든다 — 1명짜리 팀에서 펼치면 그 한 줄이 통째로 사라졌다.
   * 자란 만큼 시트를 키워서 명단을 원래 크기로 둔다.
   */
  const myVoteH = useRef(0);

  // ── 끌어 올리기/내리기 ──────────────────────────────────────
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /** 펼쳤을 때 — 상태바 아래까지 */
  const expandedH = screenH - insets.top - 8;
  /**
   * 접었을 때 — 처음 열렸을 때의 자연스러운 높이를 그대로 쓴다.
   * 숫자를 미리 정해두면 지금 보이는 위치가 바뀐다. 내리면 "원래 그 자리"로 돌아와야 한다.
   */
  const [collapsedH, setCollapsedH] = useState<number | null>(null);
  const heightAnim = useRef(new Animated.Value(0)).current;
  /** 지금 값을 동기적으로 알아야 드래그 시작점을 잡을 수 있다 (Animated.Value는 읽기가 비동기다) */
  const currentH = useRef(0);
  const dragStartH = useRef(0);

  useEffect(() => {
    const id = heightAnim.addListener(({ value }) => {
      currentH.current = value;
    });
    return () => heightAnim.removeListener(id);
  }, [heightAnim]);

  // 닫으면 다음에 열 경기의 명단 길이에 맞춰 다시 재도록 되돌린다
  useEffect(() => {
    if (!visible) setCollapsedH(null);
  }, [visible]);

  const snapTo = (expand: boolean) => {
    if (collapsedH == null) return;
    Animated.timing(heightAnim, {
      toValue: expand ? expandedH : collapsedH,
      duration: 220,
      useNativeDriver: false, // height는 네이티브 드라이버로 못 돌린다
    }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 세로로 확실히 끌 때만 잡는다 — 탭이나 가로 움직임을 가로채면 닫기 버튼이 안 눌린다
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          heightAnim.stopAnimation();
          dragStartH.current = currentH.current;
        },
        onPanResponderMove: (_e, g) => {
          if (collapsedH == null) return;
          // 위로 끌면 dy가 음수 — 그만큼 키운다
          heightAnim.setValue(clamp(dragStartH.current - g.dy, collapsedH, expandedH));
        },
        onPanResponderRelease: (_e, g) => {
          if (collapsedH == null) return;
          const ended = clamp(dragStartH.current - g.dy, collapsedH, expandedH);
          snapTo(shouldExpand(ended, g.vy, collapsedH, expandedH));
        },
      }),
    [collapsedH, expandedH, heightAnim]
  );

  /** 아래 칸이 자라거나 줄어든 만큼 시트 높이를 따라 옮긴다 */
  const growSheet = (delta: number) => {
    if (collapsedH == null || delta === 0) return;
    setCollapsedH(collapsedH + delta);
    const next = clamp(currentH.current + delta, 0, expandedH);
    currentH.current = next;
    // 높이가 움직이는 것도 동작이다 — 「동작 줄이기」면 그냥 바뀐 값으로 놓는다
    if (reduceMotion) heightAnim.setValue(next);
    else Animated.timing(heightAnim, { toValue: next, duration: 180, useNativeDriver: false }).start();
  };

  const counts = useMemo(() => {
    const by = (k: VoteStatus) => members.filter((m) => m.status === k).length;
    return {
      all: members.length,
      attend: by('attend'),
      absent: by('absent'),
      pending: by('pending') + by('undecided'),
    };
  }, [members]);

  const shown = useMemo(
    () =>
      members.filter((m) => {
        if (tab === 'all') return true;
        if (tab === 'pending') return m.status === 'pending' || m.status === 'undecided';
        return m.status === tab;
      }),
    [members, tab]
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: `전체 ${counts.all}` },
    { key: 'attend', label: `참석 ${counts.attend}` },
    { key: 'absent', label: `불참 ${counts.absent}` },
    { key: 'pending', label: `미투표 ${counts.pending}` },
  ];

  const handlePoke = (m: RosterMember) => {
    setPoked((p) => ({ ...p, [m.id]: true }));
    onPoke?.(m.id);
  };

  const handlePokeAll = () => {
    setPokedAll(true);
    onPokeAll?.();
  };

  /** 지금 내 응답. 두 화면 다 members에 isMe를 채워서 넘긴다 */
  const myStatus: VoteStatus = members.find((m) => m.isMe)?.status ?? 'pending';

  // 닫으면 되돌린다 — 안 그러면 다음에 연 경기에 앞 경기의 선택과 실패 문구가 남는다
  useEffect(() => {
    if (visible) return;
    setPicking(false);
    setChoice(null);
    setSaving(false);
    setVoteError(null);
    setDone(false);
    checkScale.setValue(0);
  }, [visible]);

  /**
   * 저장된 뒤 — 체크를 띄우고 스스로 닫는다.
   *
   * 확인 버튼을 하나 더 두지 않는다. 방금 「확인」을 눌렀는데 또 누르라고 하면
   * 저장이 안 된 것처럼 읽힌다.
   *
   * 「동작 줄이기」가 켜져 있으면 커지는 동작만 건너뛰고 체크는 그대로 띄운다.
   * 시간까지 없애면 눌렀는데 아무것도 안 보이고 닫히는 것이 된다.
   */
  useEffect(() => {
    if (!done) return;
    if (reduceMotion) checkScale.setValue(1);
    else Animated.timing(checkScale, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    const t = setTimeout(onClose, DONE_CLOSE_MS);
    return () => clearTimeout(t);
  }, [done, reduceMotion]);

  /**
   * 고르는 것과 저장하는 것을 나눈다.
   *
   * 알약이 명단 바로 아래라 스크롤하다 스치기 쉽고, 투표는 남에게 보이는 값이다 —
   * 잘못 눌린 한 표가 총무의 인원 집계에 그대로 들어간다.
   *
   * 낙관 반영과 롤백은 vote()가 한다. 여기서 또 하면 규칙이 두 곳으로 갈리고,
   * 시트가 닫힌 뒤에는 되돌릴 주체가 없어진다.
   */
  const submit = async () => {
    if (!choice || saving || !onVote) return;
    setSaving(true);
    setVoteError(null);
    try {
      await onVote(choice);
    } catch (e) {
      setVoteError(e instanceof Error ? e.message : '저장하지 못했어요');
      setSaving(false);
      return;
    }
    setSaving(false);
    setDone(true);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            // 재기 전에는 내용에 맞춰 자라게 두고(=지금 모습 그대로), 잰 뒤부터 우리가 높이를 쥔다
            collapsedH == null ? styles.sheetAuto : { height: heightAnim, maxHeight: expandedH },
          ]}
          onLayout={(e) => {
            if (collapsedH != null) return;
            const h = e.nativeEvent.layout.height;
            heightAnim.setValue(h);
            currentH.current = h;
            setCollapsedH(h);
          }}
        >
          {/* 끌기는 이 위쪽 영역에서만 받는다 — 명단 위에서 받으면 스크롤을 빼앗는다 */}
          <View {...pan.panHandlers}>
            {/* 손잡이를 톡 눌러도 접히고 펴진다. 끌기는 5px 넘게 움직여야 잡히므로 탭과 겹치지 않는다 */}
            <Pressable
              onPress={() => collapsedH != null && snapTo(currentH.current < (collapsedH + expandedH) / 2)}
              hitSlop={12}
              accessibilityLabel="명단 시트 크기 바꾸기"
            >
              <View style={styles.handle} />
            </Pressable>

            <View style={styles.head}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.title}>참석 명단</Text>
                {/*
                  경기 요약은 뒤 카드와 중복이 아니다 — 이 시트가 모달이라 열리는 순간
                  그 카드가 가려진다. 여기 없으면 「지금 보는 명단이 어느 경기 것인지」를
                  기억에 의존하게 되고, 경기가 둘 이상인 팀에서는 그게 안 된다.

                  문구는 matchLabel 유틸이 만든다. 부르는 곳이 둘(홈 경기 카드, 일정 화면)
                  이라 각자 만들면 같은 경기가 화면마다 다르게 적힌다.
                */}
                <Text style={styles.subtitle}>{matchLabel}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.close}>닫기</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.tabs}>
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, on && styles.tabOn]}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {shown.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>해당하는 멤버가 없어요</Text>
              </View>
            ) : (
              shown.map((m) => {
                const waiting = m.status === 'pending' || m.status === 'undecided';
                const showPoke = isAdmin && waiting && !m.isMe;
                const done = poked[m.id] || pokedAll;
                const tone = TONE[m.status];
                return (
                  <View key={m.id} style={styles.row}>
                    <View
                      style={[styles.avatar, m.status === 'attend' ? styles.avatarAttend : styles.avatarDefault]}
                    >
                      <Text style={[styles.avatarText, { color: m.status === 'attend' ? colors.green : '#8FA69C' }]}>
                        {m.name.slice(1)}
                      </Text>
                    </View>

                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{m.isMe ? `${m.name} (나)` : m.name}</Text>
                        {m.role === 'admin' && (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>총무</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.meta}>
                        {[m.position, m.attendanceRate != null ? `참석률 ${m.attendanceRate}%` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>

                    <View style={[styles.statusChip, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.statusText, { color: tone.fg }]}>{LABEL[m.status]}</Text>
                    </View>

                    {showPoke && (
                      <Pressable
                        onPress={() => handlePoke(m)}
                        style={[styles.poke, done && styles.pokeDone]}
                        hitSlop={4}
                      >
                        <Text style={[styles.pokeText, done && { color: colors.green }]}>
                          {done ? '전송됨' : '독촉'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.footer}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.footerTitle}>
                참석 {counts.attend} / 정원 {capacity}명
              </Text>
              <Text style={styles.footerSub}>
                {counts.pending > 0
                  ? `미투표 ${counts.pending}명${deadlineLabel ? ` · 마감 ${deadlineLabel}` : ''}`
                  : '전원 투표 완료'}
              </Text>
            </View>
            {isAdmin && counts.pending > 0 && (
              <Pressable onPress={handlePokeAll} style={[styles.pokeAll, pokedAll && styles.pokeAllDone]}>
                <Text style={[styles.pokeAllText, pokedAll && { color: colors.green }]}>
                  {pokedAll ? '알림을 보냈어요' : `미투표 ${counts.pending}명 독촉`}
                </Text>
              </Pressable>
            )}
          </View>

          {/*
            내 응답 — 명단을 보다가 「나 불참으로 바꿔야지」가 되는 자리가 여기다.
            일정 화면으로 나가서 카드를 다시 찾을 이유가 없다.

            요약 줄을 대체하지 않고 아래에 붙인다. 「참석 N / 정원 M」은 명단 전체의
            정보이고 이건 내 것이라, 같은 줄에 있으면 둘 다 안 읽힌다.

            접힌 버튼은 아웃라인이다. 총무에게는 바로 위에 초록 「독촉」이 있어서,
            둘 다 초록이면 무엇이 주된 행동인지가 사라진다. 초록은 「확인」 하나뿐이다.
          */}
          {!!onVote && (
            <View
              style={styles.myVote}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                const d = h - myVoteH.current;
                myVoteH.current = h;
                // 첫 측정은 collapsedH에 이미 들어 있다 — growSheet가 그때는 아무것도 안 한다
                growSheet(d);
              }}
            >
              {done ? (
                <View style={styles.doneRow}>
                  <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.green} />
                  </Animated.View>
                  <Text style={styles.doneText}>{choice ? `${LABEL[choice]}으로 저장했어요` : '저장했어요'}</Text>
                </View>
              ) : picking ? (
                <>
                  <View style={styles.choiceRow}>
                    {CHOICES.map((k) => {
                      const on = choice === k;
                      return (
                        <Pressable
                          key={k}
                          onPress={() => setChoice(k)}
                          disabled={saving}
                          style={[styles.choice, on && styles.choiceOn]}
                        >
                          <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{LABEL[k]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {!!voteError && <Text style={styles.voteError}>{voteError}</Text>}

                  <View style={styles.confirmRow}>
                    <Pressable onPress={() => setPicking(false)} disabled={saving} style={styles.cancel}>
                      <Text style={styles.cancelText}>취소</Text>
                    </Pressable>
                    <Pressable
                      onPress={submit}
                      disabled={!choice || saving}
                      style={[styles.confirm, (!choice || saving) && styles.confirmOff]}
                    >
                      <Text style={[styles.confirmText, (!choice || saving) && styles.confirmTextOff]}>
                        {saving ? '저장 중…' : '확인'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setChoice(myStatus === 'pending' ? null : myStatus);
                      setPicking(true);
                    }}
                    disabled={isLocked}
                    style={[styles.change, isLocked && styles.changeOff]}
                  >
                    <Text style={[styles.changeText, isLocked && styles.changeTextOff]}>
                      {MY_VOTE_LABEL[myStatus]}
                    </Text>
                  </Pressable>
                  {isLocked && !!lockNote && <Text style={styles.lockNote}>{lockNote}</Text>}
                </>
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingBottom: 26,
  },
  /** 높이를 재기 전 한 프레임 — 예전과 같은 상한을 그대로 써서 첫 모습이 바뀌지 않게 한다 */
  sheetAuto: { maxHeight: '86%' },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.neutralFill, marginBottom: 12 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  close: { color: colors.textDim, fontSize: 13, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 4,
    borderRadius: 13,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  tabOn: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: colors.greenDeep },
  tabText: { color: '#7C8A85', fontSize: 11, fontWeight: '800' },
  tabTextOn: { color: colors.green },

  list: { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#161F1B',
  },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarAttend: { backgroundColor: 'rgba(34,197,94,0.14)' },
  avatarDefault: { backgroundColor: '#1E2A25' },
  avatarText: { fontSize: 11, fontWeight: '800' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  adminBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(210,163,76,0.14)' },
  adminBadgeText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  meta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },

  statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },

  poke: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pokeDone: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'transparent' },
  pokeText: { color: '#C9D3CF', fontSize: 10, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footerTitle: { color: colors.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  footerSub: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  pokeAll: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  pokeAllDone: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: colors.greenDeep },
  pokeAllText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },

  myVote: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },

  /** 접힌 버튼 — 아웃라인. 위의 초록 「독촉」과 겹치지 않게 한다 */
  change: {
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  /**
   * 마감된 상태.
   *
   * 아웃라인에 opacity만 걸면 테두리까지 흐려져서 「버튼인데 못 누른다」가 아니라
   * 「무슨 칸이 하나 있다」로 읽힌다. 테두리와 면을 중립색으로 내리고 글자만 흐린다.
   */
  changeOff: { borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  changeText: { color: colors.green, fontSize: 13, fontWeight: '800' },
  changeTextOff: { color: colors.textFaint },
  lockNote: { color: colors.textDim, fontSize: 11, fontWeight: '600', textAlign: 'center' },

  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  choiceOn: { borderColor: colors.greenDeep, backgroundColor: 'rgba(34,197,94,0.12)' },
  choiceText: { color: colors.textDim, fontSize: 13, fontWeight: '800' },
  choiceTextOn: { color: colors.green },

  confirmRow: { flexDirection: 'row', gap: 8 },
  cancel: {
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.textDim, fontSize: 13, fontWeight: '800' },
  confirm: { flex: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
  /** 아직 고르지 않았거나 저장 중 — 초록을 빼서 「지금은 누를 게 아니다」로 만든다 */
  confirmOff: { backgroundColor: colors.neutralFill },
  confirmText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },
  confirmTextOff: { color: colors.textFaint },

  voteError: { color: colors.danger, fontSize: 11, fontWeight: '700', textAlign: 'center' },

  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46 },
  doneText: { color: colors.green, fontSize: 13, fontWeight: '800' },
});
