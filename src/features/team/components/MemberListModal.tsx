import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '../../../components/nativeText';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { Ionicons } from '@expo/vector-icons';
import type { SkillTag } from '../../../types/database';
import {
  fetchRemovedMembers,
  restoreMember,
  type RemovedMember,
  type TeamMemberWithProfile,
} from '../services/teamService';
import { toUserMessage } from '../../../lib/dbError';
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
  /** 내보낸 멤버 목록을 불러오는 데 쓴다 */
  teamId: string;
  /** 되돌린 사람에게 알려줄 **현재** 초대 코드. 재발급했으면 옛 코드는 죽어 있다 */
  inviteCode: string;
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
  teamId,
  inviteCode,
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
  /*
    내보낸 멤버 — **총무일 때만 불러온다.**

    ⚠ **뷰가 막아주지 않는다.** `team_members_removed`는 security_invoker라
      `team_members_select`(= `is_team_member`)만 걸린다 — **팀원도 읽을 수 있다.**
      총무 전용은 여기, 화면이 가르는 것이다. 다음 사람이 「뷰가 막아준다」고
      오해하지 않게 적어 둔다(teamService의 REMOVED_MEMBERS 머리말과 같은 말).
  */
  const [removed, setRemoved] = useState<RemovedMember[]>([]);
  useEffect(() => {
    if (!visible || !isAdmin) return;
    let alive = true;
    fetchRemovedMembers(teamId)
      .then((rows) => alive && setRemoved(rows))
      /* 목록을 못 불러와도 멤버 목록은 남는다 — 아래 구역만 안 그려진다 */
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, isAdmin, teamId]);

  const codeDisplay = inviteCode.replace(/(.{4})(?=.)/g, '$1-');

  /*
    ⚠ **되돌려도 팀에 다시 들어가지는 않는다.** 표식만 지우고, 본인이 초대 코드로
      들어온다. 그래서 **되돌린 자리에서 코드를 같이 알려준다** — 총무가 코드를
      재발급했으면 그 사람이 들고 있는 옛 코드는 죽어 있어서, 안 알려주면
      되돌려 놓고도 「왜 못 들어오지」가 된다.
  */
  const handleRestore = async (member: RemovedMember) => {
    const ok = await confirmAction({
      title: '되돌리기',
      message: `${member.displayName}님이 다시 들어올 수 있게 할까요?

바로 팀에 들어오지는 않아요. 아래 초대 코드를 알려주세요.`,
      confirmLabel: '되돌리기',
      destructive: false,
    });
    if (!ok) return;
    try {
      await restoreMember(member.id);
      setRemoved((prev) => prev.filter((r) => r.id !== member.id));
      await Clipboard.setStringAsync(inviteCode);
      alertMessage(
        '되돌렸어요',
        `${member.displayName}님에게 초대 코드 ${codeDisplay}를 알려주세요. 코드를 복사해 뒀어요.`
      );
    } catch (e) {
      alertMessage('실패', toUserMessage(e));
    }
  };

  const handleRemove = async (member: TeamMemberWithProfile) => {
    /*
      ⚠ **문구의 뜻이 2026-09-19에 정반대가 됐다.** 전에는 강퇴가 하드 삭제라
        그 사람의 정산 몫과 참석 기록이 **사라졌다**. 지금은 `left_at`만 찍혀
        **남는다.** 그래서 적을 말도 반대다.

      ⚠ 총무가 「내보내면 미납이 없어지나?」를 궁금해할 자리고, 지금까지는
        **실제로 없어졌다.** 반대가 됐으니 말해야 한다.
      ⚠ 팀 나가기 문구(「나가도 이 기록은 남아요」)와 **같은 사실**을 말한다.
        다만 **「나가도」는 쓰지 않는다** — 여기서는 본인이 나가는 게 아니라
        **총무가 내보내는** 것이라, 「나가도」가 본인 의사로 나간 것처럼 읽힌다.
        2026-09-19에 개발 클라이언트에서 문구를 눈으로 보고 잡았다.
    */
    const ok = await confirmAction({
      title: '멤버 내보내기',
      message: `${member.displayName}님을 팀에서 내보낼까요?

지난 경기 참석 기록과 정산 몫은 그대로 남아요. 미납 회비도 사라지지 않습니다.

내보낸 뒤에는 초대 코드를 알아도 다시 들어올 수 없어요. 되돌리려면 멤버 목록 아래에서 하면 돼요.`,
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

          {/*
            내보낸 멤버 — **총무에게만** 그린다. 비어 있으면 구역 자체를 안 그린다:
            대부분의 팀에는 내보낸 사람이 없고, 빈 구역은 할 일이 있는 것처럼 보인다.
          */}
          {isAdmin && removed.length > 0 && (
            <View style={styles.removedSection}>
              <Text style={styles.removedTitle}>내보낸 멤버 ({removed.length})</Text>
              <Text style={styles.removedHint}>
                되돌려도 바로 들어오지는 않아요. 아래 초대 코드를 알려주세요.
              </Text>
              <Pressable
                onPress={() => void Clipboard.setStringAsync(inviteCode)}
                accessibilityRole="button"
                accessibilityLabel={`초대 코드 ${inviteCode} 복사`}
                style={({ pressed }) => [styles.removedCode, pressed && styles.pressedOpacity]}
              >
                <Text style={styles.removedCodeLabel}>초대 코드</Text>
                <Text style={styles.removedCodeText} selectable>
                  {codeDisplay}
                </Text>
                <Ionicons name="copy-outline" size={14} color={colors.textDim} />
              </Pressable>

              {removed.map((r) => (
                <View key={r.id} style={styles.removedRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{r.displayName.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.removedName} numberOfLines={1}>
                    {r.displayName}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.actionButton, pressed && styles.pressedOpacity]}
                    onPress={() => handleRestore(r)}
                  >
                    <Text style={styles.actionButtonText}>되돌리기</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  removedSection: { marginTop: 22, gap: 8 },
  removedTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  removedHint: { color: colors.textDim, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  removedCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  removedCodeLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  removedCodeText: {
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  removedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removedName: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, fontWeight: '600' },
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
