// src/features/team/components/TeamSwitchSheet.tsx
// 팀 전환 — 여러 팀에 속했을 때 보고 있는 팀을 바꾼다.
//
// 이게 없어서 두 번째 팀에 영원히 못 들어갔다. 가입은 초대 코드로 되는데(join_team_by_invite)
// activeTeam이 항상 memberships[0]이라, 두 팀째부터는 목록에만 있고 열 방법이 없었다.
// TeamStartScreen이 「팀은 나중에 여러 개 만들 수도 있어요」라고 이미 안내하던 상태였다.
//
// 팀이 하나면 이 시트를 아예 열지 않는다 — 고를 게 없는 목록은 「왜 눌렀지」가 된다.
// 그 판단은 부르는 쪽(TeamHomeScreen)이 한다.
import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import type { TeamMembership } from '../services/teamService';

interface Props {
  visible: boolean;
  onClose: () => void;
  memberships: TeamMembership[];
  activeTeamId: string | null;
  onSelect: (teamId: string) => void;
  /** 팀 만들기 / 참여 화면으로 — 부르는 쪽이 네비게이션을 안다 */
  onCreateOrJoin: () => void;
}

/** 로고가 없을 때 쓰는 두 글자 — 팀명이 한 글자면 그대로 한 글자다 */
function initials(name: string) {
  const trimmed = name.trim();
  return trimmed.slice(0, 2) || '팀';
}

export function TeamSwitchSheet({
  visible,
  onClose,
  memberships,
  activeTeamId,
  onSelect,
  onCreateOrJoin,
}: Props) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.overlayTap}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.headBtn} />
            <Text style={styles.title}>팀 선택</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.headBtn} accessibilityRole="button" accessibilityLabel="닫기">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* 팀이 많아지면 목록만 늘어난다 — 아래 「새 팀」 줄이 밀려나지 않게 목록만 스크롤한다 */}
          <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
            {memberships.map((m) => {
              const active = m.team.id === activeTeamId;
              return (
                <Pressable
                  key={m.team.id}
                  onPress={() => {
                    // 같은 팀을 다시 고르면 스토어가 무시하지만, 시트는 닫아야 한다
                    if (!active) onSelect(m.team.id);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${m.team.name}${active ? ' (현재 팀)' : ''}`}
                  style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
                >
                  {m.team.logo_url ? (
                    <Image source={{ uri: m.team.logo_url }} style={styles.emblem} />
                  ) : (
                    <View style={[styles.emblem, styles.emblemFallback]}>
                      <Text style={styles.emblemText}>{initials(m.team.name)}</Text>
                    </View>
                  )}

                  <View style={styles.rowBody}>
                    <Text style={styles.teamName} numberOfLines={1}>
                      {m.team.name}
                    </Text>
                    <View style={[styles.roleBadge, m.role === 'admin' && styles.roleBadgeAdmin]}>
                      <Text style={[styles.roleText, m.role === 'admin' && styles.roleTextAdmin]}>
                        {/* 역할 뱃지 — 반대말이 「총무」다 */}
                        {m.role === 'admin' ? '총무' : '팀원'}
                      </Text>
                    </View>
                  </View>

                  {/* 체크는 현재 팀에만. 빈 자리를 남겨 두면 이름 폭이 팀마다 달라진다 */}
                  <View style={styles.checkSlot}>
                    {active && <Ionicons name="checkmark" size={20} color={colors.green} />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={() => {
              onClose();
              onCreateOrJoin();
            }}
            accessibilityRole="button"
            accessibilityLabel="새 팀 만들기 또는 초대 코드로 참여"
            style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
          >
            <View style={styles.addIcon}>
              <Ionicons name="add" size={18} color={colors.green} />
            </View>
            <Text style={styles.addText}>새 팀 만들기 / 초대 코드로 참여</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.bgScreen,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingBottom: 28,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  // 팀 5개쯤부터 스크롤이 생긴다 — 그 아래로는 화면을 다 먹지 않게 막는다
  list: { maxHeight: 340 },
  listBody: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: { borderColor: colors.green },
  pressed: { opacity: 0.6 },

  emblem: { width: 40, height: 40, borderRadius: 20 },
  emblemFallback: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  emblemText: { color: colors.textBody, fontSize: 14, fontWeight: '800' },

  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamName: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },

  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleBadgeAdmin: { borderColor: colors.green },
  roleText: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
  roleTextAdmin: { color: colors.green },

  checkSlot: { width: 20, alignItems: 'center' },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  addText: { flex: 1, color: colors.textBody, fontSize: 14, fontWeight: '600' },
  });
