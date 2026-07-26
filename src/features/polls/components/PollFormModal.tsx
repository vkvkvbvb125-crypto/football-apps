import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';

interface PollFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { question: string; options: string[]; deadline: string | null }) => void;
}

export function PollFormModal({ visible, onClose, onSubmit }: PollFormModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [deadlineText, setDeadlineText] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuestion('');
    setOptions(['', '']);
    setDeadlineText('');
  }, [visible]);

  const handleAddOption = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const trimmedOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim() || trimmedOptions.length < 2) return;

    let deadline: string | null = null;
    if (deadlineText.trim()) {
      const d = new Date(deadlineText.trim().replace(' ', 'T') + ':00');
      if (!Number.isNaN(d.getTime())) deadline = d.toISOString();
    }

    onSubmit({ question: question.trim(), options: trimmedOptions, deadline });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>투표 만들기</Text>

          <TextInput
            style={styles.input}
            placeholder="질문"
            placeholderTextColor="#5A625E"
            value={question}
            onChangeText={setQuestion}
          />

          {options.map((option, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={[styles.input, styles.optionInput]}
                placeholder={`선택지 ${i + 1}`}
                placeholderTextColor="#5A625E"
                value={option}
                onChangeText={(text) =>
                  setOptions((prev) => prev.map((o, idx) => (idx === i ? text : o)))
                }
              />
              {options.length > 2 && (
                <Pressable onPress={() => handleRemoveOption(i)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color="#8A9490" />
                </Pressable>
              )}
            </View>
          ))}

          {options.length < 6 && (
            <Pressable style={styles.addOptionButton} onPress={handleAddOption}>
              <Ionicons name="add" size={16} color="#4ADE80" />
              <Text style={styles.addOptionText}>선택지 추가</Text>
            </Pressable>
          )}

          <TextInput
            style={styles.input}
            placeholder="마감시간 (선택, YYYY-MM-DD HH:mm)"
            placeholderTextColor="#5A625E"
            value={deadlineText}
            onChangeText={setDeadlineText}
          />

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={handleSubmit}>
              <Text style={styles.confirmText}>만들기</Text>
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
    maxHeight: '85%',
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
  },
  addOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  addOptionText: {
    color: '#4ADE80',
    fontWeight: '600',
    fontSize: 13,
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
    backgroundColor: '#4ADE80',
  },
  confirmText: {
    color: '#0F1512',
    fontWeight: '700',
  },
});
