# 날씨 조회 신뢰성 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 하나에서 날씨 조회 요청이 한꺼번에 몰려 기상청 API/릴레이가 실패할 확률을 줄이고(동시성 제한+재시도), 그래도 실패하면 500으로 죽지 않고 우아하게 처리한다.

**Architecture:** 클라이언트의 `fetchMatchWeather` 하나에 모듈 레벨 동시성 큐(최대 3개)와 재시도(최대 3회)를 넣어서, 이 함수를 호출하는 모든 곳(캘린더 계산, 경기 카드 `WeatherBadge`)이 코드 변경 없이 자동으로 혜택을 받는다. 엣지함수는 릴레이 호출 실패를 잡아서 다른 "조회 불가" 케이스들과 동일하게 `available: false`로 응답하도록 방어 코드를 추가한다.

**Tech Stack:** React Native + Expo (TypeScript, 클라이언트), Deno (Supabase Edge Function).

## Global Constraints

- 테스트 프레임워크 없음 — 검증은 `npx tsc --noEmit`(클라이언트) + 수동 확인으로 대체.
- 엣지함수는 사용자가 Supabase 대시보드에서 직접 재배포 — 코드 작성 후 재배포 요청하고 확인받은 뒤 다음으로 진행.
- 기존 `fetchMatchWeather(latitude, longitude, matchDateIso): Promise<MatchWeather>` 시그니처는 변경하지 않음 — 호출부(`AttendanceScreen.tsx`, `WeatherBadge.tsx`)는 이 계획에서 건드리지 않는다.

---

### Task 1: 클라이언트 - 동시성 제한 + 재시도 (`weatherService.ts`)

**Files:**
- Modify: `app/src/features/attendance/services/weatherService.ts` (전체 재작성)

**Interfaces:**
- Consumes: 없음
- Produces: `fetchMatchWeather(latitude: number, longitude: number, matchDateIso: string): Promise<MatchWeather>` — 시그니처 동일 유지, 내부적으로 동시 3개 제한 + 최대 3회 재시도. 이미 이 함수를 쓰고 있는 `AttendanceScreen.tsx`/`WeatherBadge.tsx`는 변경 불필요.

- [ ] **Step 1: 전체 파일 교체**

`app/src/features/attendance/services/weatherService.ts` 전체를 다음으로 교체:

```typescript
import { supabase } from '../../../lib/supabase';

export interface MatchWeather {
  available: boolean;
  range?: 'short' | 'mid';
  temperature?: string;
  precipitationChance?: string;
  precipitationType?: string;
  sky?: string;
  amWeather?: string;
  amPop?: string;
  pmWeather?: string;
  pmPop?: string;
  minTemp?: string;
  maxTemp?: string;
}

const MAX_CONCURRENT_REQUESTS = 3;
let activeRequestCount = 0;
const requestQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      activeRequestCount++;
      resolve();
    } else {
      requestQueue.push(() => {
        activeRequestCount++;
        resolve();
      });
    }
  });
}

function releaseSlot() {
  activeRequestCount--;
  const next = requestQueue.shift();
  if (next) next();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 한 화면에서 날씨 조회가 여러 개(캘린더 최대 10일치 + 경기 카드마다) 동시에 나가면
// 기상청 API가 순간적으로 몰린 요청을 거부하는 경우가 있어, 동시 3개로 제한하고
// 실패 시 짧게 대기 후 재시도한다.
export async function fetchMatchWeather(
  latitude: number,
  longitude: number,
  matchDateIso: string
): Promise<MatchWeather> {
  await acquireSlot();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await delay(attempt * 500);
      const { data, error } = await supabase.functions.invoke('fetch-weather', {
        body: { latitude, longitude, matchDateIso },
      });
      if (!error) return data as MatchWeather;
      lastError = error;
    }
    throw lastError;
  } finally {
    releaseSlot();
  }
}

export function weatherEmoji(pty: string, sky: string): string {
  if (pty === '1' || pty === '4' || pty === '5') return '🌧️';
  if (pty === '2' || pty === '6') return '🌨️';
  if (pty === '3' || pty === '7') return '❄️';
  if (sky === '1') return '☀️';
  if (sky === '3') return '⛅';
  return '☁️';
}

export function weatherLabel(pty: string, sky: string): string {
  if (pty === '1' || pty === '4' || pty === '5') return '비';
  if (pty === '2' || pty === '6') return '비/눈';
  if (pty === '3' || pty === '7') return '눈';
  if (sky === '1') return '맑음';
  if (sky === '3') return '구름많음';
  return '흐림';
}
```

- [ ] **Step 2: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd app
git add src/features/attendance/services/weatherService.ts
git commit -m "fix: 날씨 조회에 동시성 제한(3개)과 재시도(3회) 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 엣지함수 - 릴레이 실패를 우아하게 처리 (`fetch-weather/index.ts`)

**Files:**
- Modify: `app/supabase/functions/fetch-weather/index.ts:239-314` (`fetchMidForecast`), `:375-384` (단기예보 분기)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (엣지함수 내부 방어 코드, 응답 형태는 기존 `available:false` 패턴과 동일)

- [ ] **Step 1: `fetchMidForecast`의 `Promise.all` 호출을 try/catch로 감싸기**

기존:

```typescript
  const [landRes, taRes] = await Promise.all([
    fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams.toString()}`),
    fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${taParams.toString()}`),
  ]);
  if (!landRes.ok || !taRes.ok) {
    return {
      data: null,
      debug: { step: 'relay_not_ok', landStatus: landRes.status, taStatus: taRes.status },
    };
  }
```

다음으로 교체:

```typescript
  let landRes: RelayResponse;
  let taRes: RelayResponse;
  try {
    [landRes, taRes] = await Promise.all([
      fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams.toString()}`),
      fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${taParams.toString()}`),
    ]);
  } catch (err) {
    return { data: null, debug: { step: 'relay_exception', message: String(err) } };
  }
  if (!landRes.ok || !taRes.ok) {
    return {
      data: null,
      debug: { step: 'relay_not_ok', landStatus: landRes.status, taStatus: taRes.status },
    };
  }
```

- [ ] **Step 2: 단기예보 분기의 `fetchViaRelay` 호출을 try/catch로 감싸기**

기존:

```typescript
    const kmaRes = await fetchViaRelay(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`
    );
    if (!kmaRes.ok) {
      const bodyText = await kmaRes.text();
      return Response.json(
        { error: '날씨 조회에 실패했습니다.', debugStatus: kmaRes.status, debugBody: bodyText.slice(0, 500) },
        { status: 502 }
      );
    }
```

다음으로 교체:

```typescript
    let kmaRes: RelayResponse;
    try {
      kmaRes = await fetchViaRelay(
        `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`
      );
    } catch (err) {
      return Response.json({ available: false, reason: 'relay_exception', message: String(err) });
    }
    if (!kmaRes.ok) {
      const bodyText = await kmaRes.text();
      return Response.json(
        { error: '날씨 조회에 실패했습니다.', debugStatus: kmaRes.status, debugBody: bodyText.slice(0, 500) },
        { status: 502 }
      );
    }
```

- [ ] **Step 3: 사용자에게 재배포 요청**

Supabase 대시보드 → Edge Functions → `fetch-weather` → 이 파일 전체를 복사해서 붙여넣고 재배포하도록 사용자에게 안내. 재배포 확인받을 때까지 대기.

- [ ] **Step 4: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 일정 탭을 새로고침하면서 브라우저 개발자도구 Network 탭에서 `fetch-weather` 요청이 한꺼번에 우르르 나가지 않고 몇 개씩 순차적으로 나가는지
2. 예전에 실패했던 경기들의 날씨가 이제 안정적으로 뜨는지 여러 번 새로고침해서 확인
3. 혹시 여전히 실패하는 경우가 있다면, 500이 아니라 "날씨 조회가 안 되는 날짜예요" 안내로 우아하게 처리되는지 (Network 탭에서 상태 코드가 200인지)

- [ ] **Step 5: 커밋**

```bash
cd app
git add supabase/functions/fetch-weather/index.ts
git commit -m "fix: 릴레이 호출 실패 시 500 대신 available:false로 우아하게 처리

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과

- **스펙 커버리지:** 동시성 제한+재시도(Task 1) / 릴레이 실패 우아한 처리(Task 2) — 스펙의 3가지 목표(동시성 제한, 재시도, 우아한 실패처리) 모두 커버됨. 디버그 필드 유지는 기존 코드를 그대로 두는 것이라 별도 태스크 불필요.
- **플레이스홀더 스캔:** 없음 — 모든 스텝에 실제 코드 포함.
- **타입 일관성:** `fetchMatchWeather`의 시그니처(`latitude, longitude, matchDateIso`)와 반환 타입(`Promise<MatchWeather>`)이 변경 전후 동일 — 호출부 영향 없음. `RelayResponse` 타입은 기존 파일에 이미 정의되어 있어(파일 상단) Task 2에서 재사용 가능.
