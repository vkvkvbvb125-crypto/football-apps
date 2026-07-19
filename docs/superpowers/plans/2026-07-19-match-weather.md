# 경기 날씨 예보 + 실내/실외 추천 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기 좌표가 있고 경기일이 3일 이내면, 일정 카드에 기상청 단기예보(기온/강수확률/하늘상태)를 보여주고 비/눈이 예보되면 실내 대체 장소를 고려하라는 안내를 함께 띄운다.

**Architecture:** 기상청 공공데이터포털 단기예보 API 호출은 신규 Supabase Edge Function `fetch-weather`가 대신 한다(서비스키는 서버 시크릿, `notify-team`/`search-places`와 동일한 프록시 패턴). 위경도는 엣지함수 안에서 기상청 격자좌표로 변환하고, 3일보다 먼 경기는 API를 아예 호출하지 않고 즉시 `available: false`를 반환한다.

**Tech Stack:** React Native(Expo), Supabase(Postgres + Edge Functions/Deno), 기상청 단기예보 API(`getVilageFcst`).

## Global Constraints

- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit`(앱 루트: `c:\dev\football\app`) + 수동 확인(설명 제공)으로 대체한다.
- 엣지함수 배포/시크릿 설정은 자동화 없음 — 사용자가 대시보드에서 직접 처리하며, 확인 후 다음 태스크로 진행한다.
- 브랜치: `feature/nav-and-announcements` (이미 체크아웃됨). 커밋은 이 브랜치에 쌓는다.
- 예보 범위는 기상청 단기예보(최대 3일 이내)만 다룬다. 그보다 먼 경기, 좌표 없는 경기, 조회 실패는 전부 "아무것도 표시 안 함"으로 동일하게 처리한다.
- 공공데이터포털 서비스키는 **디코딩(Decoding)** 버전을 써야 한다 — 인코딩 버전을 쓰면 `URLSearchParams`가 이미 인코딩된 `%` 문자를 다시 인코딩해서 요청이 깨진다.

---

### Task 1: 날씨 조회 Edge Function

**Files:**
- Create: `app/supabase/functions/fetch-weather/index.ts`

**Interfaces:**
- Produces: Edge Function `fetch-weather` (POST body `{ latitude: number; longitude: number; matchDateIso: string }` → `{ available: false }` 또는 `{ available: true; temperature: string; precipitationChance: string; precipitationType: string; sky: string }`). Task 2(`weatherService.ts`)가 이 함수를 그대로 호출한다.

- [ ] **Step 1: 사용자에게 기상청 API 키 발급 요청**

공공데이터포털(data.go.kr) 회원가입 → "기상청_단기예보 ((구)_동네예보) 조회서비스" 검색 → 활용신청 (보통 즉시 자동승인) → 마이페이지에서 서비스키 확인. **일반 인증키(Decoding)** 값을 복사(Encoding 버전 말고 Decoding 버전 — 아래 Global Constraints 참고).

완료 확인될 때까지 대기.

- [ ] **Step 2: Edge Function 작성**

`app/supabase/functions/fetch-weather/index.ts`:

```typescript
import { withSupabase } from 'npm:@supabase/server@^1';

const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;
const DEGRAD = Math.PI / 180.0;

function toGrid(lat: number, lon: number): { nx: number; ny: number } {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

const BASE_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// 기상청 단기예보는 하루 8회(02,05,08,11,14,17,20,23시) 발표되고, 발표 후 약 10분 뒤부터 API에 반영된다.
function getLatestBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kst.getUTCHours() * 100 + kst.getUTCMinutes();

  for (let i = BASE_TIMES.length - 1; i >= 0; i--) {
    const t = BASE_TIMES[i];
    if (hhmm >= Number(t) + 10) {
      const baseDate = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
      return { baseDate, baseTime: t };
    }
  }

  // 오늘 발표시각이 아직 하나도 안 지남 -> 전날 23시 발표 사용
  const prevDay = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const baseDate = `${prevDay.getUTCFullYear()}${pad(prevDay.getUTCMonth() + 1)}${pad(prevDay.getUTCDate())}`;
  return { baseDate, baseTime: '2300' };
}

// 경기 시각과 가장 가까운 3시간 예보 슬롯(0,3,6,...,21시)을 찾는다.
function nearestForecastSlot(matchDate: Date): { fcstDate: string; fcstTime: string } {
  const slots = [0, 3, 6, 9, 12, 15, 18, 21];
  const hour = matchDate.getHours();

  if (hour === 23) {
    // 23시는 같은 날 21시보다 다음날 0시 슬롯이 더 가까움
    const nextDay = new Date(matchDate.getTime() + 24 * 60 * 60 * 1000);
    return {
      fcstDate: `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`,
      fcstTime: '0000',
    };
  }

  let closest = slots[0];
  let minDiff = Math.abs(hour - slots[0]);
  for (const s of slots) {
    const diff = Math.abs(hour - s);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }

  return {
    fcstDate: `${matchDate.getFullYear()}${pad(matchDate.getMonth() + 1)}${pad(matchDate.getDate())}`,
    fcstTime: `${pad(closest)}00`,
  };
}

interface KmaItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
    const { latitude, longitude, matchDateIso } = await req.json();
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !matchDateIso) {
      return Response.json({ error: 'latitude, longitude, matchDateIso가 필요합니다.' }, { status: 400 });
    }

    const matchDate = new Date(matchDateIso);
    const now = new Date();
    const hoursUntilMatch = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 72 || hoursUntilMatch < -3) {
      return Response.json({ available: false });
    }

    const serviceKey = Deno.env.get('KMA_SERVICE_KEY');
    if (!serviceKey) {
      return Response.json({ error: 'KMA_SERVICE_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const { nx, ny } = toGrid(latitude, longitude);
    const { baseDate, baseTime } = getLatestBaseDateTime(now);
    const { fcstDate, fcstTime } = nearestForecastSlot(matchDate);

    const params = new URLSearchParams({
      serviceKey,
      numOfRows: '1000',
      pageNo: '1',
      dataType: 'JSON',
      base_date: baseDate,
      base_time: baseTime,
      nx: String(nx),
      ny: String(ny),
    });

    const kmaRes = await fetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`
    );
    if (!kmaRes.ok) {
      return Response.json({ error: '날씨 조회에 실패했습니다.' }, { status: 502 });
    }
    const kmaJson = await kmaRes.json();
    const items: KmaItem[] = kmaJson.response?.body?.items?.item ?? [];

    const slotItems = items.filter((i) => i.fcstDate === fcstDate && i.fcstTime === fcstTime);
    if (slotItems.length === 0) {
      return Response.json({ available: false });
    }

    const valueOf = (category: string) => slotItems.find((i) => i.category === category)?.fcstValue ?? null;

    return Response.json({
      available: true,
      temperature: valueOf('TMP'),
      precipitationChance: valueOf('POP'),
      precipitationType: valueOf('PTY'),
      sky: valueOf('SKY'),
    });
  }),
};
```

- [ ] **Step 3: 배포 + 시크릿 설정 요청**

Supabase 대시보드 → Edge Functions → 새 함수 `fetch-weather` 생성 → 위 코드 붙여넣고 배포. Secrets에 `KMA_SERVICE_KEY`로 Step 1에서 발급받은 **디코딩** 서비스키 등록. 완료 확인될 때까지 대기.

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음(`supabase/functions`는 `tsconfig.json`의 `exclude`에 포함돼 있어 검사 대상 아님)

- [ ] **Step 5: 커밋**

```bash
cd app
git add supabase/functions/fetch-weather/index.ts
git commit -m "feat: 경기 날씨 조회 엣지함수 추가"
```

---

### Task 2: 클라이언트 서비스 + WeatherBadge 컴포넌트

**Files:**
- Create: `app/src/features/attendance/services/weatherService.ts`
- Create: `app/src/features/attendance/components/WeatherBadge.tsx`

**Interfaces:**
- Consumes: Edge Function `fetch-weather` (Task 1).
- Produces: `export interface MatchWeather { available: boolean; temperature?: string; precipitationChance?: string; precipitationType?: string; sky?: string }`, `export async function fetchMatchWeather(latitude: number, longitude: number, matchDateIso: string): Promise<MatchWeather>`, `export function WeatherBadge({ latitude, longitude, matchDateIso }: { latitude: number | null; longitude: number | null; matchDateIso: string })`. Task 3이 `WeatherBadge`를 일정 카드에 그대로 렌더링한다.

- [ ] **Step 1: `weatherService.ts` 작성**

`app/src/features/attendance/services/weatherService.ts`:

```typescript
import { supabase } from '../../../lib/supabase';

export interface MatchWeather {
  available: boolean;
  temperature?: string;
  precipitationChance?: string;
  precipitationType?: string;
  sky?: string;
}

export async function fetchMatchWeather(
  latitude: number,
  longitude: number,
  matchDateIso: string
): Promise<MatchWeather> {
  const { data, error } = await supabase.functions.invoke('fetch-weather', {
    body: { latitude, longitude, matchDateIso },
  });
  if (error) throw error;
  return data as MatchWeather;
}
```

- [ ] **Step 2: `WeatherBadge.tsx` 작성**

`app/src/features/attendance/components/WeatherBadge.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchMatchWeather, type MatchWeather } from '../services/weatherService';

interface WeatherBadgeProps {
  latitude: number | null;
  longitude: number | null;
  matchDateIso: string;
}

function weatherIconName(pty: string, sky: string): keyof typeof Ionicons.glyphMap {
  if (pty === '1' || pty === '4' || pty === '5') return 'rainy-outline';
  if (pty === '2' || pty === '6') return 'rainy-outline';
  if (pty === '3' || pty === '7') return 'snow-outline';
  if (sky === '1') return 'sunny-outline';
  if (sky === '3') return 'partly-sunny-outline';
  return 'cloudy-outline';
}

export function WeatherBadge({ latitude, longitude, matchDateIso }: WeatherBadgeProps) {
  const [weather, setWeather] = useState<MatchWeather | null>(null);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const hoursUntilMatch = (new Date(matchDateIso).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 72 || hoursUntilMatch < -3) return;

    let cancelled = false;
    fetchMatchWeather(latitude, longitude, matchDateIso)
      .then((result) => {
        if (!cancelled) setWeather(result);
      })
      .catch(() => {
        // 날씨 조회 실패는 조용히 무시 (카드에 그냥 안 보이면 됨)
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, matchDateIso]);

  if (!weather || !weather.available) return null;

  const pty = weather.precipitationType ?? '0';
  const pop = Number(weather.precipitationChance ?? '0');
  const showIndoorHint = pty !== '0' || pop >= 60;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Ionicons name={weatherIconName(pty, weather.sky ?? '1')} size={14} color="#8A9490" />
        <Text style={styles.text}>
          {weather.temperature}°C · 강수 {weather.precipitationChance}%
        </Text>
      </View>
      {showIndoorHint && <Text style={styles.hint}>☔ 비 예보 - 실내 대체 장소도 고려해보세요</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    color: '#8A9490',
    fontSize: 12,
  },
  hint: {
    marginTop: 2,
    color: '#F0B429',
    fontSize: 11,
    fontWeight: '600',
  },
});
```

- [ ] **Step 3: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
cd app
git add src/features/attendance/services/weatherService.ts src/features/attendance/components/WeatherBadge.tsx
git commit -m "feat: 경기 날씨 조회 서비스 + WeatherBadge 컴포넌트 추가"
```

---

### Task 3: `AttendanceScreen.tsx` 통합

**Files:**
- Modify: `app/src/features/attendance/screens/AttendanceScreen.tsx`

**Interfaces:**
- Consumes: `WeatherBadge` (Task 2, `../components/WeatherBadge`).
- Produces: 없음 (최종 통합 단계).

- [ ] **Step 1: import 추가**

```typescript
import { WeatherBadge } from '../components/WeatherBadge';
```

- [ ] **Step 2: 일정 카드에 `WeatherBadge` 삽입**

기존(장소 `Pressable`과 참석 카운트 `Text` 사이):

```typescript
                    {match.location && (
                      <Pressable onPress={() => setDetailMatch(match)}>
                        <Text style={styles.cardLocation}>{match.location}</Text>
                      </Pressable>
                    )}

                    <Text style={styles.countsText}>
                      참석 {counts.attend} · 불참 {counts.absent} · 미정 {counts.undecided}
                    </Text>
```

다음으로 교체:

```typescript
                    {match.location && (
                      <Pressable onPress={() => setDetailMatch(match)}>
                        <Text style={styles.cardLocation}>{match.location}</Text>
                      </Pressable>
                    )}

                    <WeatherBadge
                      latitude={match.latitude}
                      longitude={match.longitude}
                      matchDateIso={match.match_date}
                    />

                    <Text style={styles.countsText}>
                      참석 {counts.attend} · 불참 {counts.absent} · 미정 {counts.undecided}
                    </Text>
```

- [ ] **Step 3: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 좌표가 있고 경기일이 오늘부터 3일 이내인 경기 카드에 날씨(아이콘/기온/강수확률)가 뜨는지
2. 비/눈 예보거나 강수확률 60% 이상인 경기에 "☔ 비 예보 - 실내 대체 장소도 고려해보세요" 문구가 추가로 뜨는지
3. 경기일이 3일보다 먼 경기, 좌표 없는 경기는 그 자리에 아무것도 안 뜨는지(빈 공간 없이 자연스러운지)

- [ ] **Step 5: 커밋**

```bash
cd app
git add src/features/attendance/screens/AttendanceScreen.tsx
git commit -m "feat: 일정 카드에 경기 날씨 + 실내 추천 표시"
```

---

## Self-Review 결과

- **스펙 커버리지:** 아키텍처/좌표변환/예보범위(Task 1) / 클라이언트 서비스+뱃지 UI(Task 2) / 카드 통합(Task 3) / 사전 준비(Task 1 Step 1,3) — 스펙의 모든 섹션이 태스크로 매핑됨.
- **플레이스홀더 스캔:** 없음 — 발표시각 계산, 격자 변환, 슬롯 매칭 전부 실제 코드로 작성.
- **타입 일관성:** `MatchWeather`(Task 2)의 필드명(`temperature`/`precipitationChance`/`precipitationType`/`sky`)이 Task 1 엣지함수의 응답 필드명과 정확히 일치. `WeatherBadge` props(`latitude`/`longitude`/`matchDateIso`)가 Task 3에서 `match.latitude`/`match.longitude`/`match.match_date`로 전달하는 것과 타입이 맞음(`matches.latitude`/`longitude`는 `number | null` — `WeatherBadge`도 동일하게 nullable로 받음).
