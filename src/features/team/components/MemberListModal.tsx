import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SkillTag } from '../../../types/database';
import type { TeamMemberWithProfile } from '../services/teamService';

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
  onPromote,
  onRemove,
}: MemberListModalProps) {
  const adminCount = members.filter((m) => m.role === 'admin').length;

  const handleRemove = (member: TeamMemberWithProfile) => {
    if (member.role === 'admin' && adminCount <= 1) {
      Alert.alert('내보낼 수 없어요', '마지막 총무는 내보낼 수 없어요. 먼저 다른 총무를 임명해주세요.');
      return;
    }
    const message = `${member.displayName}님을 팀에서 내보내시겠어요?`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) onRemove(member.id);
      return;
    }
    Alert.alert('멤버 내보내기', message, [
      { text: '아니오', style: 'cancel' },
      { text: '내보내기', style: 'destructive', onPress: () => onRemove(member.id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>멤버 ({members.length})</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
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
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{m.role === 'admin' ? '총무' : '멤버'}</Text>
                    </View>
                  </View>
                  <Pressable
                    disabled={!isAdmin}
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
                        style={({ pressed }) => [styles.actionButton, pressed && styles.pressedOpacity]}
                        onPress={() => onPromote(m.id)}
                      >
                        <Text style={styles.actionButtonText}>총무 임명</Text>
                      </Pressable>
                    )}
                    <Pressable
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F1512',
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
    color: '#FFFFFF',
    fontSize: 20,
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
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
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
    backgroundColor: '#1B231F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 15,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  itemSelfTag: {
    color: '#5A625E',
    fontWeight: '400',
    fontSize: 12,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#1B231F',
  },
  roleBadgeText: {
    color: '#8A9490',
    fontSize: 11,
    fontWeight: '600',
  },
  skillChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  skillChipText: {
    color: '#E7ECE9',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#22302A',
    paddingTop: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1B231F',
  },
  actionButtonText: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonTextDanger: {
    color: '#F87171',
  },
});
