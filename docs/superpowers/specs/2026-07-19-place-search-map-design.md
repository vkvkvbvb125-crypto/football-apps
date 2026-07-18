# 경기 장소 검색 + 지도 미리보기 설계

## 배경

경기 등록/수정 시 "장소"는 지금 자유 텍스트 입력이다. 실제 풋살장/축구장 이름과 주소를 검색해서 고르고, 등록된 장소를 탭하면 지도 미리보기(탭하면 실제 카카오맵으로 이동해 길찾기)를 보여주고 싶다.

이 프로젝트엔 카카오 로그인용 카카오 디벨로퍼스 앱이 이미 있고(`EXPO_PUBLIC_KAKAO_REST_API_KEY`), 같은 앱에 "카카오맵" 제품을 추가로 활성화해서 재사용한다.

**범위:** 이번 스펙은 웹 타겟만 다룬다. 카카오맵 정적 지도는 브라우저용 JavaScript SDK(`kakao.maps.StaticMap`)로만 문서화돼 있어 DOM이 없는 네이티브(iOS/Android)에서는 그대로 못 쓴다 — 네이티브 대응(WebView 등)은 별도 스펙으로 미룬다. 장소 검색 자체(엣지함수 호출)는 플랫폼 무관하게 동작하지만, 지도 미리보기 컴포넌트는 `Platform.OS === 'web'`일 때만 렌더링하고 네이티브에서는 주소 텍스트만 보여준다.

## 1. 장소 검색

### 1-1. Supabase Edge Function: `search-places`

카카오 로컬 API(키워드 장소 검색)를 서버에서 대신 호출한다. 브라우저에서 카카오 API를 직접 fetch하면 CORS로 막힐 가능성이 높아 `notify-team`과 같은 패턴(엣지함수 경유)을 그대로 쓴다.

```typescript
// supabase/functions/search-places/index.ts
import { withSupabase } from 'npm:@supabase/server@^1';

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // 경도
  y: string; // 위도
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

배포는 다른 엣지함수와 동일하게 사용자가 직접 처리(Supabase CLI 또는 대시보드). `KAKAO_REST_API_KEY`는 시크릿으로 등록해야 함 — SQL이 아니라 `supabase secrets set KAKAO_REST_API_KEY=...` 또는 대시보드 Edge Functions 설정 화면에서.

### 1-2. 클라이언트 서비스

`src/features/attendance/services/placeService.ts` (신규):

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

### 1-3. 검색 모달 UI

`src/features/attendance/components/PlaceSearchModal.tsx` (신규) — `BankPicker.tsx`와 같은 구조(Pressable 필드 + Modal). 차이점: 로컬 배열 필터링이 아니라 `searchPlaces`를 300ms 디바운스로 호출. 결과 행: 장소명(굵게) + 카테고리 태그(작은 배지) + 주소(회색 작은 글씨). 로딩 중엔 `ActivityIndicator`, 결과 없으면 "검색 결과가 없어요", 에러 시 "검색에 실패했어요" 표시. **자유입력(직접입력) 옵션 없음** — 검색 결과에서만 선택 가능(축구장/풋살장은 대부분 카카오맵에 등록돼 있어 커버리지 문제가 적음).

## 2. 데이터 모델

`matches.location`(기존 text 컬럼)은 계속 "장소명" 용도로 그대로 쓰고, 좌표/주소/카테고리 컬럼 4개를 추가한다.

```sql
alter table matches
  add column address text,
  add column latitude double precision,
  add column longitude double precision,
  add column place_category text;
```

장소를 검색해서 고르면 5개 필드(location, address, latitude, longitude, place_category)가 한 번에 채워진다. 장소 선택은 계속 선택사항 — 안 고르면 전부 null. 기존에 자유 텍스트로 등록된 경기들은 이 4개 컬럼이 전부 null인 채로 그대로 남고, UI는 이를 "지도 없음, 장소명 텍스트만 표시"로 자연스럽게 처리한다(하위호환 자동 처리, 별도 마이그레이션 불필요).

## 3. 경기 등록/수정 폼

`AttendanceScreen.tsx`의 `<TextInput placeholder="장소" ... />`를 제거하고 `<PlaceSearchModal value={...} onSelect={...} />`로 교체한다. 선택된 장소는 로컬 state 하나(`PlaceResult | null`)로 관리하다가 제출 시 `location/address/latitude/longitude/placeCategory`로 풀어서 `createMatch`/`updateMatch` 호출에 담는다.

`attendanceService.ts`의 `CreateMatchInput`/`UpdateMatchInput`에 `address?: string | null`, `latitude?: number | null`, `longitude?: number | null`, `placeCategory?: string | null` 추가하고 insert/update 시 해당 컬럼에 반영. `src/types/database.ts`의 `matches` Row/Insert에도 4개 필드 추가.

수정 화면(`handleOpenEdit`)에서는 기존 `match`에 좌표가 있으면 그 값 그대로 `PlaceResult`를 복원해서 폼에 채워 넣는다(좌표 없는 옛날 경기는 장소명만 있는 상태로 복원 — 재검색해야 좌표가 채워짐).

## 4. 장소 상세 (지도 미리보기)

`AttendanceScreen.tsx`의 일정 카드에서 장소 텍스트(`{match.location && <Text>...}`)를 `Pressable`로 감싸서, 탭하면 `PlaceDetailModal`이 뜨도록 한다.

`src/features/attendance/components/PlaceDetailModal.tsx` (신규): 장소명 + 카테고리 태그 + 주소를 텍스트로 보여주고, `match.latitude`/`match.longitude`가 있으면(그리고 `Platform.OS === 'web'`이면) 그 아래에 지도 미리보기를 렌더링한다. 좌표가 없거나 네이티브 플랫폼이면 지도 영역 없이 텍스트만 표시.

지도 미리보기는 카카오맵 JavaScript SDK(`https://dapi.kakao.com/v2/maps/sdk.js?appkey={JS_KEY}&autoload=false`)를 웹에서 동적으로 로드한 뒤 `kakao.maps.StaticMap`을 DOM 컨테이너에 렌더링하는 방식이다(단순 `<img src=...>` 한 장이 아니라 SDK 스크립트 로드가 필요 — 최초 조사 때 예상과 다름, 공식 문서 확인 결과 반영). 지도를 탭하면 카카오맵 길찾기 링크(`https://map.kakao.com/link/to/{장소명},{lat},{lng}`)를 `Linking.openURL`로 연다 — **이 URL 스킴은 실제 정확한 최신 포맷을 구현 시점에 카카오 개발자 문서/커뮤니티에서 다시 확인해야 함** (이번 조사에서 공식 문서 페이지에 명시적으로 나오지 않아 확정 못함).

## 5. 사전 준비 (사용자가 직접 처리)

- 카카오 디벨로퍼스 콘솔 → 기존 앱 → "카카오맵" 제품 활성화 → JavaScript 키 발급
- 카카오맵 JavaScript 키의 "플랫폼" 설정에 로컬 개발 도메인(예: `localhost:8082`) 및 실제 배포 도메인 등록 (등록 안 하면 SDK가 401 등으로 로드 실패)
- Supabase 엣지함수 시크릿에 `KAKAO_REST_API_KEY` 등록
- `search-places` 엣지함수 배포 (다른 엣지함수와 동일한 방식)
- `.env`에 `EXPO_PUBLIC_KAKAO_MAPS_JS_KEY` 추가 (지도 SDK 로드용 — 로컬 API용 REST 키와는 다른 키)

## 범위 밖

- iOS/Android 네이티브 지도 표시 (WebView 등 별도 스펙에서 다룬다).
- 장소 직접입력/자유텍스트 폴백 (검색 결과에서만 선택).
- 경기 장소 반경 내 "주변 풋살장 추천" 등 부가 기능.
- 기존에 등록된 자유텍스트 장소의 좌표 역-보정(주소→좌표 변환) 일괄 마이그레이션.
