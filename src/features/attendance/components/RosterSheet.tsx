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
import { Text } from '../../../components/nativeText';
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
}

const LABEL: Record<VoteStatus, string> = {
  attend: '참석',
  absent: '불참',
  undecided: '미정',
  pending: '미투표',
};

const TONE: Record<VoteStatus, { bg: string; fg: string }> = {
  attend: { bg: 'rgba(74,222,128,0.14)', fg: colors.green },
  absent: { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted },
  undecided: { bg: 'rgba(210,163,76,0.16)', fg: colors.gold },
  pending: { bg: 'rgba(210,163,76,0.10)', fg: colors.gold },
};

type TabKey = 'all' | 'attend' | 'absent' | 'pending';

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
}: Props) {
  const [tab, setTab] = useState<TabKey>('all');
  const [poked, setPoked] = useState<Record<string, boolean>>({});
  const [pokedAll, setPokedAll] = useState(false);

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
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#2C3833', marginBottom: 12 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
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
  tabOn: { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: '#2F4A3A' },
  tabText: { color: '#7C8A85', fontSize: 11.5, fontWeight: '800' },
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
  avatarAttend: { backgroundColor: 'rgba(74,222,128,0.14)' },
  avatarDefault: { backgroundColor: '#1E2A25' },
  avatarText: { fontSize: 11, fontWeight: '800' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.textStrong, fontSize: 13.5, fontWeight: '700' },
  adminBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(210,163,76,0.14)' },
  adminBadgeText: { color: colors.gold, fontSize: 9.5, fontWeight: '800' },
  meta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },

  statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10.5, fontWeight: '800' },

  poke: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  pokeDone: { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'transparent' },
  pokeText: { color: '#C9D3CF', fontSize: 10.5, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#5F6B66', fontSize: 12.5, fontWeight: '600' },

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
  pokeAllDone: { backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: '#2F4A3A' },
  pokeAllText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },
});
