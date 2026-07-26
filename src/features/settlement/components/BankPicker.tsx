import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';

interface Bank {
  name: string;
  color: string;
}

const BANKS: Bank[] = [
  { name: '카카오뱅크', color: '#F9E000' },
  { name: '국민은행', color: '#FFB300' },
  { name: '기업은행', color: '#0067AC' },
  { name: '농협은행', color: '#00A651' },
  { name: '신한은행', color: '#0046FF' },
  { name: 'iM뱅크(대구)', color: '#00A19C' },
  { name: '산업은행', color: '#00468B' },
  { name: '우리은행', color: '#0066B3' },
  { name: '한국씨티은행', color: '#003DA5' },
  { name: '하나은행', color: '#00857C' },
  { name: 'SC제일은행', color: '#0C7CBA' },
  { name: '경남은행', color: '#F58220' },
  { name: '광주은행', color: '#EC6C00' },
  { name: '토스뱅크', color: '#0064FF' },
  { name: '부산은행', color: '#0F4C9B' },
  { name: '전북은행', color: '#00A0DE' },
  { name: '제주은행', color: '#0093D0' },
  { name: '새마을금고', color: '#FF9C00' },
  { name: '수협은행', color: '#005BAC' },
  { name: '신협', color: '#0055A5' },
  { name: '우체국', color: '#E60012' },
];

interface BankPickerProps {
  value: string;
  onChange: (bankName: string) => void;
}

export function BankPicker({ value, onChange }: BankPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');

  const filtered = query.trim() ? BANKS.filter((b) => b.name.includes(query.trim())) : BANKS;

  const close = () => {
    setQuery('');
    setManualMode(false);
    setManualText('');
    setModalVisible(false);
  };

  const handleSelect = (bankName: string) => {
    onChange(bankName);
    close();
  };

  const handleManualConfirm = () => {
    if (!manualText.trim()) return;
    onChange(manualText.trim());
    close();
  };

  return (
    <>
      <Pressable style={styles.field} onPress={() => setModalVisible(true)}>
        <Ionicons name="business-outline" size={16} color={value ? '#4ADE80' : '#5A625E'} />
        <Text style={[styles.fieldText, !value && styles.fieldTextPlaceholder]}>{value || '은행 선택'}</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            {manualMode ? (
              <>
                <View style={styles.titleRow}>
                  <Pressable onPress={() => setManualMode(false)} hitSlop={8}>
                    <Ionicons name="chevron-back" size={18} color="#8A9490" />
                  </Pressable>
                  <Text style={styles.title}>은행명 직접 입력</Text>
                  <View style={{ width: 18 }} />
                </View>

                <TextInput
                  style={styles.manualInput}
                  placeholder="은행명을 입력하세요"
                  placeholderTextColor="#5A625E"
                  value={manualText}
                  onChangeText={setManualText}
                  autoFocus
                />

                <Pressable
                  style={[styles.confirmButton, !manualText.trim() && styles.confirmButtonDisabled]}
                  disabled={!manualText.trim()}
                  onPress={handleManualConfirm}
                >
                  <Text style={styles.confirmButtonText}>확인</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>은행 선택</Text>

                <View style={styles.searchRow}>
                  <Ionicons name="search" size={15} color="#5A625E" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="은행 검색"
                    placeholderTextColor="#5A625E"
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                  />
                </View>

                <FlatList
                  data={filtered}
                  keyExtractor={(b) => b.name}
                  style={styles.list}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable style={styles.bankRow} onPress={() => handleSelect(item.name)}>
                      <View style={[styles.badge, { backgroundColor: item.color }]}>
                        <Text style={styles.badgeText}>{item.name.slice(0, 1)}</Text>
                      </View>
                      <Text style={styles.bankName}>{item.name}</Text>
                    </Pressable>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyText}>검색 결과가 없어요</Text>}
                />

                <Pressable
                  style={styles.manualLink}
                  onPress={() => {
                    setManualText('');
                    setManualMode(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={15} color="#8A9490" />
                  <Text style={styles.manualLinkText}>목록에 없는 은행 (직접 입력)</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
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
    width: 300,
    maxHeight: '70%',
    backgroundColor: '#141A17',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  manualInput: {
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  confirmButton: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#4ADE80',
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: '#0F1512',
    fontWeight: '700',
  },
  manualLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#22302A',
  },
  manualLinkText: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0F1512',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  list: {
    marginTop: 12,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#0F1512',
    fontSize: 12,
    fontWeight: '800',
  },
  bankName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#5A625E',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
