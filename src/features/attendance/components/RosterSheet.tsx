// src/features/attendance/components/RosterSheet.tsx
// 참석 명단 시트 — 필터(전체/참석/불참/미투표) + 개별 독촉 + 일괄 독촉
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors } from '../../../theme';

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
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.head}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.title}>참석 명단</Text>
              <Text style={styles.subtitle}>{matchLabel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingBottom: 26,
  },
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
