import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { AnnouncementRow } from '../services/announcementsService';

interface AnnouncementFormModalProps {
  visible: boolean;
  editing: AnnouncementRow | null;
  onClose: () => void;
  onSubmit: (input: { title: string; body: string; isPinned: boolean }) => void;
}

export function AnnouncementFormModal({ visible, editing, onClose, onSubmit }: AnnouncementFormModalProps) {
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
            placeholderTextColor="#5A625E"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.bodyInput]}
            placeholder="내용"
            placeholderTextColor="#5A625E"
            value={body}
            onChangeText={setBody}
            multiline
          />

          <View style={styles.pinRow}>
            <Text style={styles.pinLabel}>상단에 고정</Text>
            <Switch
              value={isPinned}
              onValueChange={setIsPinned}
              trackColor={{ false: '#22302A', true: '#4ADE80' }}
              thumbColor="#FFFFFF"
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#141A17',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
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
    color: '#E7ECE9',
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
    backgroundColor: '#1B231F',
  },
  cancelText: {
    color: '#8A9490',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2D5F3E',
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
