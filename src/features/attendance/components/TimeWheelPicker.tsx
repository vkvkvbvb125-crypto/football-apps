import { useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 3;
export const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;
export const WHEEL_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2);

export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06~23
export const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 00~59

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatAmPm(hour: number, minute: number) {
  const period = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${h12}:${pad(minute)}`;
}

interface WheelProps {
  data: number[];
  selected: number;
  onSelect: (value: number) => void;
}

export function Wheel({ data, selected, onSelect }: WheelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const initialIndex = Math.max(0, data.indexOf(selected));

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(data.length - 1, Math.max(0, index));
    onSelect(data[clamped]);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={reelStyles.wheel}
      contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={handleMomentumEnd}
    >
      {data.map((v) => (
        <View key={v} style={reelStyles.item}>
          <View style={[reelStyles.pill, v === selected && reelStyles.pillActive]}>
            <Text style={[reelStyles.itemText, v === selected && reelStyles.itemTextActive]}>{pad(v)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

interface TimeReelProps {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}

export function TimeReel({ hour, minute, onHourChange, onMinuteChange }: TimeReelProps) {
  return (
    <View>
      <View style={reelStyles.labelRow}>
        <Text style={reelStyles.label}>시</Text>
        <Text style={reelStyles.label}>분</Text>
      </View>
      <View style={reelStyles.reel}>
        <Wheel data={HOURS} selected={hour} onSelect={onHourChange} />
        <Text style={reelStyles.colon}>:</Text>
        <Wheel data={MINUTES} selected={minute} onSelect={onMinuteChange} />
      </View>
      <Text style={reelStyles.caption}>선택된 시간: {formatAmPm(hour, minute)}</Text>
    </View>
  );
}

export const reelStyles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
    marginBottom: 8,
  },
  label: {
    color: '#8A9490',
    fontSize: 13,
    fontWeight: '600',
  },
  reel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheel: {
    height: WHEEL_HEIGHT,
    width: 76,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pillActive: {
    backgroundColor: '#39D98A',
  },
  itemText: {
    color: '#5A625E',
    fontSize: 18,
    fontWeight: '700',
  },
  itemTextActive: {
    color: '#0B0F0D',
  },
  colon: {
    color: '#8A9490',
    fontSize: 20,
    fontWeight: '800',
    marginHorizontal: 8,
  },
  caption: {
    marginTop: 12,
    color: '#39D98A',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

interface TimeWheelPickerProps {
  value: string;
  onChange: (time: string) => void;
}

export function TimeWheelPicker({ value, onChange }: TimeWheelPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [hour, minute] = value.split(':').map(Number);
  const [draftHour, setDraftHour] = useState(hour);
  const [draftMinute, setDraftMinute] = useState(minute);

  const handleOpen = () => {
    setDraftHour(hour);
    setDraftMinute(minute);
    setModalVisible(true);
  };

  const handleConfirm = () => {
    onChange(`${pad(draftHour)}:${pad(draftMinute)}`);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable style={styles.field} onPress={handleOpen}>
        <Ionicons name="time-outline" size={16} color="#39D98A" />
        <Text style={styles.fieldText}>{value}</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>시간 선택</Text>

            <TimeReel hour={draftHour} minute={draftMinute} onHourChange={setDraftHour} onMinuteChange={setDraftMinute} />

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
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
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
    backgroundColor: '#39D98A',
  },
  confirmText: {
    color: '#0B0F0D',
    fontWeight: '700',
  },
});
