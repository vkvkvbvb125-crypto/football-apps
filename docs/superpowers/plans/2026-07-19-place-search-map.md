# 경기 장소 검색 + 지도 미리보기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기 등록/수정 화면의 장소 입력을 자유 텍스트에서 카카오 로컬 API 검색으로 바꾸고, 등록된 장소를 탭하면 카카오맵 지도 미리보기(탭하면 실제 카카오맵으로 이동)를 보여준다.

**Architecture:** 카카오 로컬 API 호출은 신규 Supabase Edge Function `search-places`가 대신 하고(REST 키는 서버 시크릿, `notify-team` 패턴 재사용), 선택한 장소의 좌표/주소/카테고리는 `matches` 테이블에 새 컬럼 4개로 저장한다. 지도 미리보기는 카카오맵 JavaScript SDK를 웹에서 동적 로드해 `kakao.maps.StaticMap`으로 렌더링하며, 이번 스펙은 **웹 타겟만** 다룬다(네이티브는 범위 밖 — `Platform.OS !== 'web'`이면 지도 없이 텍스트만 표시).

**Tech Stack:** React Native(Expo, web 타겟), Supabase(Postgres + Edge Functions/Deno), 카카오 로컬 API(REST), 카카오맵 JavaScript SDK.

## Global Constraints

- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit`(앱 루트: `c:\dev\football\app`) + 수동 확인(설명 제공)으로 대체한다.
- Supabase SQL 마이그레이션과 엣지함수 배포/시크릿 설정은 자동화 없음 — 사용자가 대시보드에서 직접 처리하며, 실행 확인 후 다음 태스크로 진행한다.
- 브랜치: `feature/nav-and-announcements` (이미 체크아웃됨). 커밋은 이 브랜치에 쌓는다.
- 이번 스펙은 웹 타겟만 다룬다. 네이티브(iOS/Android) 지도 표시는 범위 밖 — `Platform.OS === 'web'`일 때만 지도를 렌더링하고, 그 외엔 텍스트만 표시한다.
- 장소는 검색 결과에서만 선택 가능 — 직접입력(자유텍스트) 없음.
- 카카오맵 길찾기 URL(`https://map.kakao.com/link/to/{name},{lat},{lng}`)은 공식 문서에서 확정하지 못한 형식이므로, 해당 태스크의 수동 확인 단계에서 실제로 카카오맵이 열리는지 사용자가 테스트한다.

---

### Task 1: DB 스키마 변경 (Supabase SQL 실행)

**Files:**
- 참고: `app/supabase/schema.sql` (레퍼런스 문서 갱신)

**Interfaces:**
- Produces: `matches.address`(text, nullable), `matches.latitude`(double precision, nullable), `matches.longitude`(double precision, nullable), `matches.place_category`(text, nullable). Task 3 이후 모든 타입/쿼리가 이 컬럼을 전제로 한다.

- [ ] **Step 1: 사용자에게 아래 SQL을 Supabase 대시보드 → SQL Editor에서 실행해달라고 요청**

```sql
alter table matches
  add column address text,
  add column latitude double precision,
  add column longitude double precision,
  add column place_category text;
```

- [ ] **Step 2: 실행 완료 확인**

사용자가 "실행했어" 등으로 확인해줄 때까지 대기.

- [ ] **Step 3: `app/supabase/schema.sql` 문서에 반영**

`create table matches (...)` 블록의 `location text,` 줄 바로 아래에 다음 4줄을 추가:

```sql
  address text,
  latitude double precision,
  longitude double precision,
  place_category text,
```

- [ ] **Step 4: 커밋**

```bash
cd app
git add supabase/schema.sql
git commit -m "feat: 경기 장소 좌표/주소/카테고리 컬럼 추가"
```

---

### Task 2: 장소 검색 Edge Function + 클라이언트 서비스

**Files:**
- Create: `app/supabase/functions/search-places/index.ts`
- Create: `app/src/features/attendance/services/placeService.ts`
- Modify: `app/.env.example`

**Interfaces:**
- Produces: Edge Function `search-places` (POST body `{ query: string }` → `{ results: PlaceResult[] }`). `export interface PlaceResult { id: string; name: string; category: string; address: string; latitude: number; longitude: number }`와 `export async function searchPlaces(query: string): Promise<PlaceResult[]>` (`placeService.ts`) — Task 4(`PlaceSearchModal`)가 이 타입과 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: Edge Function 작성**

`app/supabase/functions/search-places/index.ts`:

```typescript
import { withSupabase } from 'npm:@supabase/server@^1';

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
    const { query } = await req.json();
    if (!query || !query.trim()) {
      return Response.json({ error: 'query가 필요합니다.' }, { status: 400 });
    }

    const restApiKey = Deno.env.get('KAKAO_REST_API_KEY');
    if (!restApiKey) {
      return Response.json({ error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
    const kakaoRes = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
    if (!kakaoRes.ok) {
      return Response.json({ error: '장소 검색에 실패했습니다.' }, { status: 502 });
    }
    const kakaoJson = await kakaoRes.json();
    const documents: KakaoDocument[] = kakaoJson.documents ?? [];

    const results = documents.map((d) => ({
      id: d.id,
      name: d.place_name,
      category: d.category_name.split('>').pop()?.trim() ?? '',
      address: d.road_address_name || d.address_name,
      latitude: Number(d.y),
      longitude: Number(d.x),
    }));

    return Response.json({ results });
  }),
};
```

- [ ] **Step 2: 사용자에게 배포 + 시크릿 설정 요청**

다음을 사용자에게 요청:
1. Supabase 대시보드 → Edge Functions → 새 함수 `search-places` 생성 → 위 코드 붙여넣고 배포 (Supabase CLI가 설정돼 있으면 `supabase functions deploy search-places`도 가능)
2. Edge Functions → Secrets(또는 `supabase secrets set KAKAO_REST_API_KEY=...`)에 카카오 디벨로퍼스 콘솔의 REST API 키를 `KAKAO_REST_API_KEY`로 등록
3. 카카오 디벨로퍼스 콘솔에서 해당 앱에 "카카오맵" 제품이 활성화돼 있는지 확인 (로컬 API 포함)

완료 확인될 때까지 대기.

- [ ] **Step 3: 클라이언트 서비스 작성**

`app/src/features/attendance/services/placeService.ts`:

```typescript
import { supabase } from '../../../lib/supabase';

export interface PlaceResult {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const { data, error } = await supabase.functions.invoke('search-places', { body: { query } });
  if (error) throw error;
  return data.results as PlaceResult[];
}
```

- [ ] **Step 4: `.env.example`에 카카오맵 JS 키 항목 추가**

`app/.env.example` 끝에 추가:

```
# Kakao Developers > 앱 설정 > 앱 키 > JavaScript 키 (카카오맵 지도 표시용)
EXPO_PUBLIC_KAKAO_MAPS_JS_KEY=your-kakao-maps-js-key
```

- [ ] **Step 5: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음 (`supabase/functions/`는 Deno 런타임 코드라 앱의 tsc 대상에서 제외돼 있어야 함 — 에러가 나면 `tsconfig.json`의 `exclude`에 `supabase/functions`가 포함돼 있는지 확인)

- [ ] **Step 6: 커밋**

```bash
cd app
git add supabase/functions/search-places/index.ts src/features/attendance/services/placeService.ts .env.example
git commit -m "feat: 카카오 로컬 API 장소검색 엣지함수 + 클라이언트 서비스 추가"
```

---

### Task 3: 타입 + attendanceService.ts 확장

**Files:**
- Modify: `app/src/types/database.ts` (matches 타입)
- Modify: `app/src/features/attendance/services/attendanceService.ts`

**Interfaces:**
- Consumes: Task 1에서 추가된 DB 컬럼.
- Produces: `CreateMatchInput`/`UpdateMatchInput`에 `address: string | null`, `latitude: number | null`, `longitude: number | null`, `placeCategory: string | null` 필드 추가. Task 6(`AttendanceScreen.tsx`)이 이 필드명 그대로 payload를 구성한다.

- [ ] **Step 1: `database.ts`의 matches 타입에 필드 추가**

`app/src/types/database.ts`에서 매치 관련 블록을 찾아:

```typescript
      matches: {
        Row: {
          id: string;
          team_id: string;
          match_date: string;
          location: string | null;
          vote_deadline: string | null;
          status: MatchStatus;
          quarter_minutes: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          match_date: string;
          location?: string | null;
          vote_deadline?: string | null;
          status?: MatchStatus;
          quarter_minutes?: number;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [];
      };
```

다음으로 교체:

```typescript
      matches: {
        Row: {
          id: string;
          team_id: string;
          match_date: string;
          location: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_category: string | null;
          vote_deadline: string | null;
          status: MatchStatus;
          quarter_minutes: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          match_date: string;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_category?: string | null;
          vote_deadline?: string | null;
          status?: MatchStatus;
          quarter_minutes?: number;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 2: `attendanceService.ts`의 `CreateMatchInput`/`createMatch` 수정**

기존:

```typescript
export interface CreateMatchInput {
  teamId: string;
  matchDate: string;
  location: string;
  voteDeadline: string | null;
  quarterMinutes: number;
  createdBy: string;
}

export async function createMatch(input: CreateMatchInput) {
  const { error } = await supabase.from('matches').insert({
    team_id: input.teamId,
    match_date: input.matchDate,
    location: input.location || null,
    vote_deadline: input.voteDeadline,
    quarter_minutes: input.quarterMinutes,
    created_by: input.createdBy,
  });
  if (error) throw error;
}
```

다음으로 교체:

```typescript
export interface CreateMatchInput {
  teamId: string;
  matchDate: string;
  location: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeCategory: string | null;
  voteDeadline: string | null;
  quarterMinutes: number;
  createdBy: string;
}

export async function createMatch(input: CreateMatchInput) {
  const { error } = await supabase.from('matches').insert({
    team_id: input.teamId,
    match_date: input.matchDate,
    location: input.location || null,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    place_category: input.placeCategory,
    vote_deadline: input.voteDeadline,
    quarter_minutes: input.quarterMinutes,
    created_by: input.createdBy,
  });
  if (error) throw error;
}
```

- [ ] **Step 3: `UpdateMatchInput`/`updateMatch` 수정**

기존:

```typescript
export interface UpdateMatchInput {
  matchDate: string;
  location: string;
  voteDeadline: string | null;
  quarterMinutes: number;
}

export async function updateMatch(matchId: string, input: UpdateMatchInput) {
  const { error } = await supabase
    .from('matches')
    .update({
      match_date: input.matchDate,
      location: input.location || null,
      vote_deadline: input.voteDeadline,
      quarter_minutes: input.quarterMinutes,
    })
    .eq('id', matchId);
  if (error) throw error;
}
```

다음으로 교체:

```typescript
export interface UpdateMatchInput {
  matchDate: string;
  location: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeCategory: string | null;
  voteDeadline: string | null;
  quarterMinutes: number;
}

export async function updateMatch(matchId: string, input: UpdateMatchInput) {
  const { error } = await supabase
    .from('matches')
    .update({
      match_date: input.matchDate,
      location: input.location || null,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      place_category: input.placeCategory,
      vote_deadline: input.voteDeadline,
      quarter_minutes: input.quarterMinutes,
    })
    .eq('id', matchId);
  if (error) throw error;
}
```

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: `AttendanceScreen.tsx`의 `handleSubmit`에서 만드는 payload 객체에 새 필드가 없어서 타입 에러가 날 수 있음(아직 Task 6 전) — 에러가 `AttendanceScreen.tsx`만 가리키는지 확인하고 Task 4로 진행.

- [ ] **Step 5: 커밋**

```bash
cd app
git add src/types/database.ts src/features/attendance/services/attendanceService.ts
git commit -m "feat: 경기 장소 좌표/주소/카테고리 타입 + 서비스 반영"
```

---

### Task 4: 장소 검색 모달 (`PlaceSearchModal`)

**Files:**
- Create: `app/src/features/attendance/components/PlaceSearchModal.tsx`

**Interfaces:**
- Consumes: `searchPlaces(query): Promise<PlaceResult[]>` (Task 2, `../services/placeService`).
- Produces: `export function PlaceSearchModal({ value, onSelect }: { value: { name: string } | null; onSelect: (place: PlaceResult) => void })`. Task 6이 이 컴포넌트를 `AttendanceScreen.tsx`의 장소 입력 자리에 사용한다.

- [ ] **Step 1: 컴포넌트 작성**

`app/src/features/attendance/components/PlaceSearchModal.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchPlaces, type PlaceResult } from '../services/placeService';

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      searchPlaces(trimmed)
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
  }, [query]);

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
        <Ionicons name="location-outline" size={16} color={value ? '#39D98A' : '#5A625E'} />
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

            {loading && <ActivityIndicator style={styles.loading} color="#39D98A" />}
            {!loading && error && <Text style={styles.emptyText}>{error}</Text>}
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
    backgroundColor: '#0B0F0D',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
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
    color: '#39D98A',
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
```

- [ ] **Step 2: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음(이 파일 기준 — `AttendanceScreen.tsx` 관련 기존 에러는 Task 6 전까지 남아있음)

- [ ] **Step 3: 커밋**

```bash
cd app
git add src/features/attendance/components/PlaceSearchModal.tsx
git commit -m "feat: 카카오 장소검색 모달 컴포넌트 추가"
```

---

### Task 5: 장소 상세 + 지도 미리보기 (`PlaceDetailModal`)

**Files:**
- Create: `app/src/features/attendance/components/PlaceDetailModal.tsx`

**Interfaces:**
- Consumes: `process.env.EXPO_PUBLIC_KAKAO_MAPS_JS_KEY` (Task 2에서 `.env.example`에 추가한 항목 — 사용자가 자신의 `.env`에 실제 값을 넣어야 함, 이번 태스크에서 요청).
- Produces: `export function PlaceDetailModal({ visible, onClose, name, category, address, latitude, longitude }: PlaceDetailModalProps)`. Task 6이 일정 카드의 장소 탭 시 이 컴포넌트를 조건부로 마운트한다.

- [ ] **Step 1: 사용자에게 카카오맵 JS 키 발급 + `.env` 설정 요청**

카카오 디벨로퍼스 콘솔 → 해당 앱 → 제품 설정 → 카카오맵 활성화 → 앱 키에서 **JavaScript 키** 확인, 플랫폼 설정에 `http://localhost:8082`(로컬 개발용 포트) 등록. 그 다음 `app/.env` 파일에 아래 줄 추가:

```
EXPO_PUBLIC_KAKAO_MAPS_JS_KEY=<발급받은 JavaScript 키>
```

완료 확인될 때까지 대기.

- [ ] **Step 2: 컴포넌트 작성**

`app/src/features/attendance/components/PlaceDetailModal.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

declare global {
  interface Window {
    kakao: any;
  }
}

const KAKAO_MAPS_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_MAPS_JS_KEY;

function loadKakaoMapsSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('웹에서만 지원해요.'));
  if (window.kakao?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('kakao-maps-sdk') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => window.kakao.maps.load(resolve));
      existing.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드에 실패했어요.')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'kakao-maps-sdk';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAPS_JS_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = () => reject(new Error('카카오맵 SDK 로드에 실패했어요.'));
    document.head.appendChild(script);
  });
}

interface KakaoMapPreviewProps {
  latitude: number;
  longitude: number;
  name: string;
}

function KakaoMapPreview({ latitude, longitude, name }: KakaoMapPreviewProps) {
  const containerRef = useRef<View>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMapsSdk()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current as unknown as HTMLElement | null;
        if (!container) return;
        const center = new window.kakao.maps.LatLng(latitude, longitude);
        // eslint-disable-next-line no-new
        new window.kakao.maps.StaticMap(container, { center, level: 3, marker: { position: center } });
      })
      .catch((err) => {
        if (!cancelled) setMapError(err instanceof Error ? err.message : '지도를 불러오지 못했어요.');
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  if (mapError) {
    return <Text style={styles.mapErrorText}>{mapError}</Text>;
  }

  return (
    <Pressable
      onPress={() => {
        const url = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${latitude},${longitude}`;
        Linking.openURL(url);
      }}
    >
      <View ref={containerRef} style={styles.mapPreview} />
    </Pressable>
  );
}

interface PlaceDetailModalProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function PlaceDetailModal({ visible, onClose, name, category, address, latitude, longitude }: PlaceDetailModalProps) {
  const showMap = Platform.OS === 'web' && latitude != null && longitude != null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>경기 장소</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color="#8A9490" />
            </Pressable>
          </View>

          <Text style={styles.placeName}>{name}</Text>
          {!!category && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{category}</Text>
            </View>
          )}
          {!!address && <Text style={styles.address}>{address}</Text>}

          {showMap && <KakaoMapPreview latitude={latitude as number} longitude={longitude as number} name={name} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 320,
    backgroundColor: '#141A17',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 20,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  placeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#1B231F',
  },
  categoryTagText: {
    color: '#39D98A',
    fontSize: 10,
    fontWeight: '700',
  },
  address: {
    color: '#8A9490',
    fontSize: 13,
  },
  mapPreview: {
    marginTop: 12,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0B0F0D',
  },
  mapErrorText: {
    marginTop: 12,
    color: '#5A625E',
    fontSize: 12,
    textAlign: 'center',
  },
});
```

- [ ] **Step 3: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음 (이 파일 기준)

- [ ] **Step 4: 커밋**

```bash
cd app
git add src/features/attendance/components/PlaceDetailModal.tsx
git commit -m "feat: 경기 장소 상세 + 카카오맵 지도 미리보기 컴포넌트 추가"
```

---

### Task 6: `AttendanceScreen.tsx` 통합

**Files:**
- Modify: `app/src/features/attendance/screens/AttendanceScreen.tsx`

**Interfaces:**
- Consumes: `PlaceSearchModal`(Task 4), `PlaceDetailModal`(Task 5), `PlaceResult`(Task 2, `../services/placeService`), 확장된 `CreateMatchInput`/`UpdateMatchInput`(Task 3, 스토어를 거쳐 그대로 전달됨 — `attendanceStore.ts`는 입력을 그대로 서비스에 전달하는 얇은 레이어라 수정 불필요).
- Produces: 없음 (최종 UI 통합 단계).

- [ ] **Step 1: import 추가**

```typescript
import { PlaceSearchModal } from '../components/PlaceSearchModal';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import type { PlaceResult } from '../services/placeService';
```

- [ ] **Step 2: `locationText` state를 `selectedPlace`로 교체 + 상세 모달 state 추가**

기존:

```typescript
  const [timeText, setTimeText] = useState('19:00');
  const [locationText, setLocationText] = useState('');
  const [quarterMinutesText, setQuarterMinutesText] = useState('10');
```

다음으로 교체:

```typescript
  const [timeText, setTimeText] = useState('19:00');
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [quarterMinutesText, setQuarterMinutesText] = useState('10');
  const [detailMatch, setDetailMatch] = useState<MatchWithVotes | null>(null);
```

파일 상단, `VOTE_OPTIONS` 선언 위에 로컬 타입 추가:

```typescript
interface SelectedPlace {
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}
```

- [ ] **Step 3: `handleOpenCreate`/`handleOpenEdit` 수정**

기존:

```typescript
  const handleOpenCreate = () => {
    setEditingMatchId(null);
    setTimeText('19:00');
    setLocationText('');
    setQuarterMinutesText('10');
    setDeadlineText('');
    setModalVisible(true);
  };

  const handleOpenEdit = (match: MatchWithVotes) => {
    const d = new Date(match.match_date);
    setSelectedDate(d);
    setEditingMatchId(match.id);
    setTimeText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setLocationText(match.location ?? '');
    setQuarterMinutesText(String(match.quarter_minutes));
    setDeadlineText(match.vote_deadline ? new Date(match.vote_deadline).toISOString().slice(0, 16).replace('T', ' ') : '');
    setModalVisible(true);
  };
```

다음으로 교체:

```typescript
  const handleOpenCreate = () => {
    setEditingMatchId(null);
    setTimeText('19:00');
    setSelectedPlace(null);
    setQuarterMinutesText('10');
    setDeadlineText('');
    setModalVisible(true);
  };

  const handleOpenEdit = (match: MatchWithVotes) => {
    const d = new Date(match.match_date);
    setSelectedDate(d);
    setEditingMatchId(match.id);
    setTimeText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setSelectedPlace(
      match.location
        ? {
            name: match.location,
            category: match.place_category,
            address: match.address,
            latitude: match.latitude,
            longitude: match.longitude,
          }
        : null
    );
    setQuarterMinutesText(String(match.quarter_minutes));
    setDeadlineText(match.vote_deadline ? new Date(match.vote_deadline).toISOString().slice(0, 16).replace('T', ' ') : '');
    setModalVisible(true);
  };
```

- [ ] **Step 4: `handleSubmit`의 payload에 장소 필드 추가**

기존:

```typescript
    const payload = {
      matchDate: matchDate.toISOString(),
      location: locationText.trim(),
      voteDeadline,
      quarterMinutes: Number(quarterMinutesText) || 10,
    };
```

다음으로 교체:

```typescript
    const payload = {
      matchDate: matchDate.toISOString(),
      location: selectedPlace?.name ?? '',
      address: selectedPlace?.address ?? null,
      latitude: selectedPlace?.latitude ?? null,
      longitude: selectedPlace?.longitude ?? null,
      placeCategory: selectedPlace?.category ?? null,
      voteDeadline,
      quarterMinutes: Number(quarterMinutesText) || 10,
    };
```

- [ ] **Step 5: 장소 입력 `TextInput`을 `PlaceSearchModal`로 교체**

기존:

```typescript
            <TextInput
              style={styles.input}
              placeholder="장소"
              placeholderTextColor="#5A625E"
              value={locationText}
              onChangeText={setLocationText}
            />
```

다음으로 교체:

```typescript
            <PlaceSearchModal
              value={selectedPlace}
              onSelect={(place: PlaceResult) =>
                setSelectedPlace({
                  name: place.name,
                  category: place.category,
                  address: place.address,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
            />
```

- [ ] **Step 6: 일정 카드의 장소 텍스트를 탭 가능하게 변경**

기존:

```typescript
                    {match.location && <Text style={styles.cardLocation}>{match.location}</Text>}
```

다음으로 교체:

```typescript
                    {match.location && (
                      <Pressable onPress={() => setDetailMatch(match)}>
                        <Text style={styles.cardLocation}>{match.location}</Text>
                      </Pressable>
                    )}
```

- [ ] **Step 7: `PlaceDetailModal` 렌더링 추가**

파일 마지막 `</Modal>` (케밥 팝오버 모달) 바로 다음, `</ScreenGradient>` 앞에 추가:

```typescript
      {detailMatch && (
        <PlaceDetailModal
          visible
          onClose={() => setDetailMatch(null)}
          name={detailMatch.location ?? ''}
          category={detailMatch.place_category}
          address={detailMatch.address}
          latitude={detailMatch.latitude}
          longitude={detailMatch.longitude}
        />
      )}
```

조건부로 마운트/언마운트해야 매번 열 때마다 지도가 그 경기의 좌표로 새로 로드된다(항상 마운트된 채 `visible`만 토글하면 이전 세션에서 겪었던 "휠 피커가 재오픈 시 갱신 안 되던" 것과 같은 종류의 버그가 생김).

- [ ] **Step 8: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 총무 계정으로 "경기 만들기" → 장소 필드 탭 → "완주군 풋살장" 등으로 검색 → 결과 목록에 장소명/카테고리 태그/주소가 뜨는지 → 하나 선택 → 만들기
2. 만들어진 경기 카드의 장소 텍스트를 탭 → 상세 모달에 장소명/카테고리/주소 + 지도가 뜨는지
3. 지도를 탭했을 때 새 탭/창으로 카카오맵이 열리고 해당 위치로 길찾기가 되는지 (안 되면 URL 스킴을 다시 확인해야 함 — Global Constraints 참고)
4. 기존에 자유 텍스트로 등록했던 경기(좌표 없음)를 열어보면 지도 없이 장소명만 나오는지, 그 경기를 수정 화면에서 열었을 때 장소 필드에 기존 이름이 표시되는지

- [ ] **Step 10: 커밋**

```bash
cd app
git add src/features/attendance/screens/AttendanceScreen.tsx
git commit -m "feat: 경기 등록 화면에 장소 검색 + 지도 미리보기 통합"
```

---

## Self-Review 결과

- **스펙 커버리지:** 장소 검색(Task 2, 4) / 데이터 모델(Task 1, 3) / 장소 상세+지도(Task 5) / 폼·카드 통합(Task 6) / 사전 준비(Task 1 Step 1-2, Task 2 Step 2, Task 5 Step 1) — 스펙의 모든 섹션이 태스크로 매핑됨.
- **플레이스홀더 스캔:** 없음 — 카카오맵 길찾기 URL 스킴의 불확실성은 Global Constraints와 Task 6 Step 9에 명시적으로 검증 단계로 남겨둠(추측이 아니라 확인 대상으로 표기).
- **타입 일관성:** `PlaceResult`(Task 2)는 검색 결과 전용(좌표 항상 존재), `SelectedPlace`(Task 6, 화면 로컬 타입)는 폼 상태 전용(좌표 nullable) — 둘을 구분해서 기존 자유텍스트 경기 복원 시에도 타입 충돌 없이 동작. `CreateMatchInput`/`UpdateMatchInput`(Task 3)의 `address`/`latitude`/`longitude`/`placeCategory` 필드명이 Task 6의 payload 구성과 정확히 일치.
