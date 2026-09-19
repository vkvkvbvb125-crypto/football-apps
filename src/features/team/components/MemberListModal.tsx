import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { confirmAction } from '../../../components/Dialog';
import { Ionicons } from '@expo/vector-icons';
import type { SkillTag } from '../../../types/database';
import type { TeamMemberWithProfile } from '../services/teamService';
import { nextPosition, positionLabel, toPosition, type Position } from '../positions';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

const SKILL_CYCLE: (SkillTag | null)[] = ['상', '중', '하', null];

function nextSkillTag(current: SkillTag | null): SkillTag | null {
  const index = SKILL_CYCLE.indexOf(current);
  return SKILL_CYCLE[(index + 1) % SKILL_CYCLE.length];
}

function skillLabel(tag: SkillTag | null): string {
  return tag ?? '미지정';
}

interface MemberListModalProps {
  visible: boolean;
  members: TeamMemberWithProfile[];
  selfMemberId: string;
  isAdmin: boolean;
  onClose: () => void;
  onChangeSkillTag: (teamMemberId: string, skillTag: SkillTag | null) => void;
  onChangePosition: (teamMemberId: string, position: Position | null) => void;
  onPromote: (teamMemberId: string) => void;
  onRemove: (teamMemberId: string) => void;
}

export function MemberListModal({
  visible,
  members,
  selfMemberId,
  isAdmin,
  onClose,
  onChangeSkillTag,
  onChangePosition,
  onPromote,
  onRemove,
}: MemberListModalProps) {
  const { colors, styles } = useThemed(makeStyles);
  /*
    ⚠ **마지막 총무 검사를 여기 두지 않는다.** 규칙은 `remove_member()` RPC가 든다.
      전에는 여기와 `teamStore`에 **두 벌**이 있었고 서버에는 없었다 —
      목록이 낡으면 총무 없는 팀이 만들어질 수 있었다.

    ⚠ **맞바꿈을 적어 둔다.** 미리 막지 않으므로 총무는 확인까지 한 **뒤에**
      「마지막 총무는…」을 본다. 미리 막는 편이 친절하지만, **낡은 목록으로
      판단하는 위험**이 더 크다. 나가기에서 이미 같은 판단을 했다
      (`leaveteam.check`: 「규칙은 서버에 있고 클라이언트가 복제하지 않는다」).
  */
  const handleRemove = async (member: TeamMemberWithProfile) => {
    /*
      ⚠ **문구의 뜻이 2026-09-19에 정반대가 됐다.** 전에는 강퇴가 하드 삭제라
        그 사람의 정산 몫과 참석 기록이 **사라졌다**. 지금은 `left_at`만 찍혀
        **남는다.** 그래서 적을 말도 반대다.

      ⚠ 총무가 「내보내면 미납이 없어지나?」를 궁금해할 자리고, 지금까지는
        **실제로 없어졌다.** 반대가 됐으니 말해야 한다.
      ⚠ 팀 나가기 문구(「나가도 이 기록은 남아요」)와 **같은 말**을 쓴다 —
        같은 사실을 두 말로 적지 않는다(AGENTS.md 「같은 사실은 같은 말로」).
    */
    const ok = await confirmAction({
      title: '멤버 내보내기',
      message: `${member.displayName}님을 팀에서 내보낼까요?

지난 경기 참석 기록과 정산 몫은 그대로 남아요. 미납이 있으면 나가도 남습니다.`,
      confirmLabel: '내보내기',
      destructive: true,
    });
    if (ok) onRemove(member.id);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>멤버 ({members.length})</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {members.map((m) => {
            const isSelf = m.id === selfMemberId;
            return (
              <View key={m.id} style={styles.item}>
                <View style={styles.itemTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{m.displayName.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>
                      {m.displayName}
                      {isSelf && <Text style={styles.itemSelfTag}> (나)</Text>}
                    </Text>
                    {/* 반대말이 「총무」인 자리라 「팀원」이다 — 「멤버」는 명단의 한 칸을
                        가리키는 말이고 총무와 층위가 맞지 않는다. 약관도 역할(총무/팀원)로 적는다 */}
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{m.role === 'admin' ? '총무' : '팀원'}</Text>
                    </View>
                  </View>
                  {/* 선호 포지션 — 팀 분배에서 이 값대로 포메이션에 세운다.
                      본인 것은 총무가 아니어도 바꿀 수 있다. 어디 서고 싶은지는 본인이 정하는 것이고,
                      실력과 달리 남이 매기는 값이 아니다. */}
                  <Pressable
                    disabled={!isAdmin && !isSelf}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.displayName} 포지션 ${positionLabel(toPosition(m.position))}`}
                    style={({ pressed }) => [
                      styles.posChip,
                      !m.position && styles.posChipEmpty,
                      pressed && (isAdmin || isSelf) && styles.pressedOpacity,
                    ]}
                    onPress={() => onChangePosition(m.id, nextPosition(toPosition(m.position)))}
                  >
                    <Text style={[styles.posChipText, !m.position && styles.posChipTextEmpty]}>
                      {positionLabel(toPosition(m.position))}
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={!isAdmin}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.displayName} 실력 ${skillLabel(m.skillTag)}`}
                    style={({ pressed }) => [styles.skillChip, pressed && isAdmin && styles.pressedOpacity]}
                    onPress={() => onChangeSkillTag(m.id, nextSkillTag(m.skillTag))}
                  >
                    <Text style={styles.skillChipText}>{skillLabel(m.skillTag)}</Text>
                  </Pressable>
                </View>

                {isAdmin && !isSelf && (
                  <View style={styles.actionRow}>
                    {m.role !== 'admin' && (
                      <Pressable
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.actionButton, pressed && styles.pressedOpacity]}
                        onPress={() => onPromote(m.id)}
                      >
                        <Text style={styles.actionButtonText}>총무 임명</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.actionButton, pressed && styles.pressedOpacity]}
                      onPress={() => handleRemove(m)}
                    >
                      <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>내보내기</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  pressedOpacity: {
    opacity: 0.7,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  item: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.green,
    fontWeight: '700',
    fontSize: 15,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  itemSelfTag: {
    color: colors.placeholder,
    fontWeight: '400',
    fontSize: 12,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.cardRaised,
  },
  roleBadgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  skillChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillChipText: {
    color: colors.textStrong,
    fontSize: 12,
    fontWeight: '600',
  },
  /** 선호 포지션 칩 — 정해진 값은 초록, 미지정은 조용하게 */
  posChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  posChipEmpty: { backgroundColor: colors.cardRaised, borderColor: colors.border },
  posChipText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  posChipTextEmpty: { color: colors.placeholder, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
  },
  actionButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonTextDanger: {
    color: colors.danger,
  },
  });
