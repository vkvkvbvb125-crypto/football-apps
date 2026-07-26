import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { searchPlaces, type PlaceResult } from '../services/placeService';

const CATEGORIES = ['풋살장', '축구장', '운동장', '체육관'];

interface PlaceSearchModalProps {
  value: { name: string } | null;
  onSelect: (place: PlaceResult) => void;
}

export function PlaceSearchModal({ value, onSelect }: PlaceSearchModalProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 모달이 열릴 때 현재 위치를 가져와서 "내 주변" 검색에 쓴다. 권한 거부 시 위치 없이 전국 검색으로 대체.
  useEffect(() => {
    if (!modalVisible || coords) return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    })();
  }, [modalVisible, coords]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      searchPlaces(trimmed, coords ?? undefined)
        .then((places) => {
          setResults(places);
          setError(null);
        })
        .catch(() => {
          setError('검색에 실패했어요');
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, coords]);

  const close = () => {
    setQuery('');
    setResults([]);
    setError(null);
    setModalVisible(false);
  };

  const handleSelect = (place: PlaceResult) => {
    onSelect(place);
    close();
  };

  return (
    <>
      <Pressable style={styles.field} onPress={() => setModalVisible(true)}>
        <Ionicons name="location-outline" size={16} color={value ? '#4ADE80' : '#5A625E'} />
        <Text style={[styles.fieldText, !value && styles.fieldTextPlaceholder]}>{value?.name ?? '장소 검색'}</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>경기 장소 검색</Text>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={15} color="#5A625E" />
              <TextInput
                style={styles.searchInput}
                placeholder="장소명으로 검색"
                placeholderTextColor="#5A625E"
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            </View>

            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.chip, query === cat && styles.chipActive]}
                  onPress={() => setQuery(cat)}
                >
                  <Text style={[styles.chipText, query === cat && styles.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            {locationDenied && (
              <Text style={styles.hintText}>위치 권한이 없어서 내 주변이 아닌 전국 검색 결과가 나와요</Text>
            )}

            {loading && <ActivityIndicator style={styles.loading} color="#4ADE80" />}
            {!loading && error && <Text style={styles.emptyText}>{error}</Text>}
            {!loading && !error && query.trim() === '' && (
              <Text style={styles.emptyText}>카테고리를 선택하거나 검색해보세요</Text>
            )}
            {!loading && !error && query.trim() !== '' && results.length === 0 && (
              <Text style={styles.emptyText}>검색 결과가 없어요</Text>
            )}

            <FlatList
              data={results}
              keyExtractor={(p) => p.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.placeRow} onPress={() => handleSelect(item)}>
                  <View style={styles.placeRowTop}>
                    <Text style={styles.placeName}>{item.name}</Text>
                    {!!item.category && (
                      <View style={styles.categoryTag}>
                        <Text style={styles.categoryTagText}>{item.category}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.placeAddress}>{item.address}</Text>
                </Pressable>
              )}
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
    width: 320,
    maxHeight: '75%',
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
    backgroundColor: '#0F1512',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  chipActive: {
    backgroundColor: '#4ADE80',
    borderColor: '#4ADE80',
  },
  chipText: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#0F1512',
  },
  hintText: {
    marginTop: 10,
    color: '#8A9490',
    fontSize: 11,
    textAlign: 'center',
  },
  loading: {
    marginTop: 16,
  },
  list: {
    marginTop: 8,
  },
  placeRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1B231F',
  },
  placeRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#1B231F',
  },
  categoryTagText: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: '700',
  },
  placeAddress: {
    marginTop: 3,
    color: '#8A9490',
    fontSize: 12,
  },
  emptyText: {
    color: '#5A625E',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
