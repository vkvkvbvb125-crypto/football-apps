import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HOURS, MINUTES, Wheel, pad, reelStyles } from './TimeWheelPicker';

function parseTime(value: string, fallback: { hour: number; minute: number }) {
  const timePart = value.trim().split(' ')[1];
  if (!timePart) return fallback;
  const [h, mi] = timePart.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : fallback.hour, minute: Number.isFinite(mi) ? mi : fallback.minute };
}

function formatDisplay(value: string) {
  const timePart = value.trim().split(' ')[1];
  return timePart ? `${timePart}까지` : '설정 안 함';
}

interface DeadlinePickerProps {
  value: string;
  onChange: (value: string) => void;
  matchDate: Date;
  matchTime: string; // "HH:MM", 마감은 이 시각을 넘을 수 없음
}

export function DeadlinePicker({ value, onChange, matchDate, matchTime }: DeadlinePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [draftHour, setDraftHour] = useState(0);
  const [draftMinute, setDraftMinute] = useState(0);

  const [maxHour, maxMinute] = matchTime.split(':').map(Number);
  const hourChoices = HOURS.filter((h) => h <= maxHour);
  const minuteChoices = draftHour === maxHour ? MINUTES.filter((m) => m <= maxMinute) : MINUTES;

  const handleOpen = () => {
    const parsed = parseTime(value, { hour: maxHour, minute: maxMinute });
    const clampedHour = Math.min(parsed.hour, maxHour);
    const clampedMinute = clampedHour === maxHour ? Math.min(parsed.minute, maxMinute) : parsed.minute;
    setDraftHour(clampedHour);
    setDraftMinute(clampedMinute);
    setModalVisible(true);
  };

  const handleHourChange = (h: number) => {
    setDraftHour(h);
    if (h === maxHour && draftMinute > maxMinute) setDraftMinute(maxMinute);
  };

  const handleConfirm = () => {
    const y = matchDate.getFullYear();
    const m = String(matchDate.getMonth() + 1).padStart(2, '0');
    const d = String(matchDate.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d} ${pad(draftHour)}:${pad(draftMinute)}`);
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange('');
    setModalVisible(false);
  };

  const isSet = !!value.trim();

  return (
    <>
      <Pressable style={styles.field} onPress={handleOpen}>
        <Ionicons name="flag-outline" size={16} color={isSet ? '#2D5F3E' : '#5A625E'} />
        <Text style={[styles.fieldText, !isSet && styles.fieldTextPlaceholder]}>{formatDisplay(value)}</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Ionicons name="flag-outline" size={16} color="#2D5F3E" />
              <Text style={styles.title}>마감 설정</Text>
            </View>
            <Text style={styles.hint}>경기 시작({matchTime}) 전까지만 마감을 설정할 수 있어요</Text>

            <View style={reelStyles.labelRow}>
              <Text style={reelStyles.label}>시</Text>
              <Text style={reelStyles.label}>분</Text>
            </View>
            <View style={reelStyles.reel}>
              <Wheel data={hourChoices} selected={draftHour} onSelect={handleHourChange} resetKey={modalVisible} />
              <Text style={reelStyles.colon}>:</Text>
              <Wheel data={minuteChoices} selected={draftMinute} onSelect={setDraftMinute} resetKey={modalVisible} />
            </View>
            <Text style={reelStyles.caption}>
              경기 당일 {pad(draftHour)}:{pad(draftMinute)} 마감
            </Text>

            <Pressable style={styles.clearRow} onPress={handleClear}>
              <Ionicons name="close-circle-outline" size={14} color="#8A9490" />
              <Text style={styles.clearText}>마감 없음으로 설정</Text>
            </Pressable>

            <View style={styles.buttonRow}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmText}>확인</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0F1512',
  },
  fieldText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  fieldTextPlaceholder: {
    color: '#5A625E',
    fontWeight: '400',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 280,
    backgroundColor: '#141A17',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 20,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: '#8A9490',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -6,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  clearText: {
    color: '#8A9490',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
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
