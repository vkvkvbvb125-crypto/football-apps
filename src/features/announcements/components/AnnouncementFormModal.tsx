import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { MentionInput } from '../../../components/Mention';
import { useTeamStore } from '../../team/stores/teamStore';
import type { AnnouncementRow } from '../services/announcementsService';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

interface AnnouncementFormModalProps {
  visible: boolean;
  editing: AnnouncementRow | null;
  onClose: () => void;
  onSubmit: (input: { title: string; body: string; isPinned: boolean }) => void;
}

export function AnnouncementFormModal({ visible, editing, onClose, onSubmit }: AnnouncementFormModalProps) {
  const { colors, styles } = useThemed(makeStyles);
  // selector 안에서 map을 하면 매번 새 배열이 스냅샷으로 나와 무한 렌더가 된다.
  // 스토어에서는 그대로 꺼내고, 모양 바꾸기는 밖에서 한다.
  const members = useTeamStore((s) => s.members);
  const mentionTargets = members.map((m) => ({ id: m.userId, name: m.displayName }));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(editing?.title ?? '');
    setBody(editing?.body ?? '');
    setIsPinned(editing?.is_pinned ?? false);
  }, [visible, editing]);

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim(), isPinned });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{editing ? '공지 수정' : '공지 작성'}</Text>

          <TextInput
            style={styles.input}
            placeholder="제목"
            placeholderTextColor={colors.placeholder}
            value={title}
            onChangeText={setTitle}
          />
          <MentionInput
            style={[styles.input, styles.bodyInput]}
            placeholder="내용 (@로 팀원을 부를 수 있어요)"
            value={body}
            onChangeText={setBody}
            members={mentionTargets}
          />

          <View style={styles.pinRow}>
            <Text style={styles.pinLabel}>상단에 고정</Text>
            <Switch
              value={isPinned}
              onValueChange={setIsPinned}
              trackColor={{ false: colors.border, true: colors.green }}
              thumbColor={colors.text}
            />
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={handleSubmit}>
              <Text style={styles.confirmText}>저장</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.card,
  },
  bodyInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pinLabel: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
  },
  cancelText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.green,
  },
  confirmText: {
    color: colors.bgRoot,
    fontWeight: '700',
  },
  });
