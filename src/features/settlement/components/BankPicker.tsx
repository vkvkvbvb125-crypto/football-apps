import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const filtered = query.trim() ? BANKS.filter((b) => b.name.includes(query.trim())) : BANKS;

  const handleSelect = (bankName: string) => {
    onChange(bankName);
    setQuery('');
    setModalVisible(false);
  };

  return (
    <>
      <Pressable style={styles.field} onPress={() => setModalVisible(true)}>
        <Ionicons name="business-outline" size={16} color={value ? '#39D98A' : '#5A625E'} />
        <Text style={[styles.fieldText, !value && styles.fieldTextPlaceholder]}>{value || '은행 선택'}</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setQuery('');
          setModalVisible(false);
        }}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => {
            setQuery('');
            setModalVisible(false);
          }}
        >
          <Pressable style={styles.card} onPress={() => {}}>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0B0F0D',
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
    color: '#0B0F0D',
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
