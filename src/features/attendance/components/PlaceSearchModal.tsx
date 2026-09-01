import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { searchPlaces, type PlaceResult } from '../services/placeService';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

const CATEGORIES = ['풋살장', '축구장', '운동장', '체육관'];

/**
 * 위치를 얻었는가 — 실패 둘이 다른 말을 해야 한다.
 *
 * 예전엔 boolean 하나(locationDenied)였다. 그래서 「권한은 있는데 측위가 실패」한
 * 경우에 coords도 안 세워지고 locationDenied도 안 세워져서, 화면이 아무 말 없이
 * 전국 결과를 보여줬다 — 「내 주변으로 찾았다」와 「위치를 못 얻어 전국으로 찾았다」의
 * 출력이 같았다. 에뮬레이터 첫 실행에서 이 갈래가 실제로 났다.
 */
type LocationState = 'pending' | 'ok' | 'denied' | 'unavailable';

/**
 * 측위를 기다리는 한도.
 *
 * getCurrentPositionAsync({})는 옵션이 비어 있으면 최고 정확도의 새 측위를 기다린다.
 * 실내에서 쓰는 앱인데 그 기본값은 맞지 않는다 — GPS가 안 잡히는 체육관에서 무한정
 * 멈춰 있게 된다. 마지막 위치를 먼저 보고, 없으면 Balanced로 이만큼만 기다린다.
 */
const LOCATION_TIMEOUT_MS = 5000;

/** 마지막 위치를 「내 주변」으로 인정해 줄 나이. 이보다 오래된 것은 쓰지 않는다. */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;

/** expo-location에는 타임아웃 옵션이 없다. 넘기면 null로 끝낸다. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

interface PlaceSearchModalProps {
  value: { name: string } | null;
  onSelect: (place: PlaceResult) => void;
}

export function PlaceSearchModal({ value, onSelect }: PlaceSearchModalProps) {
  const { colors, styles } = useThemed(makeStyles);
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('pending');
  /**
   * 반경 안에 결과가 없어 위치 없이 다시 찾았는가.
   *
   * locationState와 축이 다르다 — 저건 「위치를 얻었는가」이고 이건 「그 위치로 찾은
   * 결과가 있었는가」다. 한 열거형에 섞으면 「위치는 얻었는데 0건이라 넓혔다」를
   * 표현할 수 없다.
   */
  const [widened, setWidened] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    모달이 열릴 때 현재 위치를 가져와 「내 주변」 검색에 쓴다.

    ⚠ try/catch를 걷어내지 마라. getCurrentPositionAsync는 던진다(측위 실패,
    위치 서비스 꺼짐). 예전엔 이 async IIFE에 catch가 없어서 거부가 그대로
    떠올랐다 — 개발 빌드는 빨간 화면, 릴리스는 침묵이다(RN의 거부 추적기가
    __DEV__ 안에만 걸린다). 그리고 던지고 나면 setCoords도 setLocationState도
    안 불려서 화면이 「찾는 중」인 채로 남는다.
  */
  useEffect(() => {
    if (!modalVisible || locationState !== 'pending') return;
    let cancelled = false;
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setLocationState('denied');
          return;
        }
        const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
        const position =
          last ??
          (await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            LOCATION_TIMEOUT_MS
          ));
        if (cancelled) return;
        if (!position) {
          setLocationState('unavailable');
          return;
        }
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationState('ok');
      } catch {
        if (!cancelled) setLocationState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalVisible, locationState]);

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
        .then(async (places) => {
          /*
            반경 밖 사용자를 빈손으로 돌려보내지 않는다.

            Edge Function은 좌표가 있으면 radius=20000·sort=distance로 찾는다.
            20000은 카카오 로컬 API의 상한이라 더 넓힐 수 없다. 그래서 근처에
            구장이 없는 사용자는 위치를 쓰기 시작하는 순간 0건을 받게 된다 —
            고치는 것이 손해가 되는 자리다. 0건이면 위치 없이 한 번 더 찾고,
            그 사실을 화면에 적는다.
          */
          if (places.length === 0 && coords) {
            const nationwide = await searchPlaces(trimmed);
            setResults(nationwide);
            setWidened(nationwide.length > 0);
          } else {
            setResults(places);
            setWidened(false);
          }
          setError(null);
        })
        .catch(() => {
          setError('검색에 실패했어요');
          setResults([]);
          setWidened(false);
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
    setWidened(false);
    // 위치를 못 얻은 채로 닫았으면 다음에 열 때 다시 시도한다 — 그 사이에 켰을 수 있다.
    setLocationState((s) => (s === 'ok' ? s : 'pending'));
    setModalVisible(false);
  };

  const handleSelect = (place: PlaceResult) => {
    onSelect(place);
    close();
  };

  return (
    <>
      <Pressable style={styles.field} onPress={() => setModalVisible(true)}>
        <Ionicons name="location-outline" size={16} color={value ? colors.green : colors.placeholder} />
        <Text style={[styles.fieldText, !value && styles.fieldTextPlaceholder]}>{value?.name ?? '장소 검색'}</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          style={styles.overlay}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          {/* 스크림의 탭이 카드 안까지 번지는 것만 막는다 — 누르는 것이 아니라 초점도 주지 않는다 */}
          <Pressable style={styles.card} onPress={() => {}} accessible={false}>
            {/*
              제목 줄에 닫기를 둔다.

              이 모달의 출구는 하드웨어 뒤로가기와 스크림(바깥 탭) 둘이었는데
              **둘 다 눈에 안 보인다.** 스크림이 출구인 줄 모르면 갇힌 것처럼
              보인다 — 실제로 이번 확인에서 갇혀 앱을 강제 종료했다.
              (그때는 뒤로가기가 개발 빌드의 LogBox에 먹히고 있었다. 뒤로가기
               자체는 정상이고, 중첩에서 안쪽만 닫히는 것도 확인했다.)
            */}
            <View style={styles.titleRow}>
              <Text style={styles.title}>경기 장소 검색</Text>
              <Pressable
                onPress={close}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="닫기"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={15} color={colors.placeholder} />
              <TextInput
                style={styles.searchInput}
                placeholder="장소명으로 검색"
                placeholderTextColor={colors.placeholder}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            </View>

            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: query === cat }}
                  style={[styles.chip, query === cat && styles.chipActive]}
                  onPress={() => setQuery(cat)}
                >
                  <Text style={[styles.chipText, query === cat && styles.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            {/* 실패 둘과 「넓혔다」가 각각 다른 말을 한다 — 셋을 한 문구로 합치지 마라 */}
            {locationState === 'denied' && (
              <Text style={styles.hintText}>위치 권한이 없어서 내 주변이 아닌 전국 검색 결과가 나와요</Text>
            )}
            {locationState === 'unavailable' && (
              <Text style={styles.hintText}>위치를 확인할 수 없어 전국 검색 결과가 나와요</Text>
            )}
            {widened && (
              <Text style={styles.hintText}>내 주변 20km 안에는 없어서 전국에서 찾았어요</Text>
            )}

            {loading && <ActivityIndicator style={styles.loading} color={colors.green} />}
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
                <Pressable
                  style={styles.placeRow}
                  accessibilityRole="button"
                  onPress={() => handleSelect(item)}
                >
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.card,
  },
  fieldText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldTextPlaceholder: {
    color: colors.placeholder,
    fontWeight: '400',
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 320,
    maxHeight: '75%',
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    /* 닫기가 오른쪽에 붙어도 제목은 카드 가운데에 남는다 — flex:1이 그 몫이다 */
    flex: 1,
    /* 닫기 버튼(20 아이콘 + 좌우 여백)만큼 왼쪽을 비워 좌우 균형을 맞춘다 */
    marginLeft: 28,
  },
  closeBtn: {
    width: 28,
    alignItems: 'flex-end',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
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
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.bgRoot,
  },
  hintText: {
    marginTop: 10,
    color: colors.textMuted,
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
    borderBottomColor: colors.cardRaised,
  },
  placeRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.cardRaised,
  },
  categoryTagText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '700',
  },
  placeAddress: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 12,
  },
  emptyText: {
    color: colors.placeholder,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  });
