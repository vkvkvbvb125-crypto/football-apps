# 경기 날씨 중기예보(3~10일) 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기일이 단기예보 범위(3일)를 넘고 10일 이내면 중기예보(오전/오후 강수확률·날씨, 최저/최고기온)를 보여준다.

**Architecture:** `getFcstZoneCd`(예보구역정보 조회서비스)로 경기 좌표와 가장 가까운 예보구역을 찾고, 그 `regId`로 `getMidLandFcst`(육상예보)와 `getMidTa`(기온예보)를 호출해 합친다. 기존 `fetch-weather` 엣지함수를 확장하고, 응답에 `range: 'short' | 'mid'`를 추가해 클라이언트가 표시 형식을 구분한다.

**Tech Stack:** 기존과 동일(Supabase Edge Functions/Deno, React Native).

## Global Constraints

- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit`(앱 루트: `c:\dev\football\app`) + 수동 확인으로 대체한다.
- **이 계획은 Task 2에서 실제 기상청 API를 호출해 응답 구조를 확인하는 검증 단계를 거친다.** `getMidLandFcst`/`getMidTa`/`getFcstZoneCd`의 정확한 응답 필드명은 문서만으로 100% 확정되지 않으므로(공공데이터포털 문서가 불완전함), Task 3의 파싱 코드는 Task 2에서 실제로 확인한 필드명을 반영해서 작성한다 — 이 문서의 Task 3 코드는 공개적으로 잘 알려진 필드명 패턴(`wf3Am`/`rnSt3Am`/`taMin3` 형태)을 기준으로 작성했지만, Task 2 실행 후 실제와 다르면 그 자리에서 수정한다.
- 브랜치: `feature/nav-and-announcements` (이미 체크아웃됨). 커밋은 이 브랜치에 쌓는다.
- 엣지함수 재배포/시크릿/활용신청은 자동화 없음 — 사용자가 직접 처리하며, 확인 후 다음 태스크로 진행한다.

---

### Task 1: 추가 API 활용신청 + 서비스키 확인

**Files:** 없음(사용자 액션만)

- [ ] **Step 1: 사용자에게 활용신청 요청**

공공데이터포털(data.go.kr)에서 아래 두 개를 추가로 활용신청(같은 계정 — 보통 기존 서비스키를 그대로 재사용 가능, 안 되면 새 키가 발급됨):
1. "기상청_예보구역정보 조회서비스"
2. "기상청_중기예보 조회서비스"

완료되고 서비스키(기존 `KMA_SERVICE_KEY`와 같은 값인지, 다른 값인지) 확인될 때까지 대기.

- [ ] **Step 2: 커밋 없음 (사용자 액션만)**

---

### Task 2: 실제 API 응답 구조 검증

**Files:** 없음(조사만, 코드 없음)

**Interfaces:**
- Produces: 실제 API 응답 필드명 확인 결과 — Task 3에서 이 결과를 반영한다.

- [ ] **Step 1: `getFcstZoneCd` 실제 호출**

서비스키를 받으면(사용자가 공유하거나, 사용자가 직접 curl로 실행하고 결과를 공유), 서울 인근(위경도 37.5, 127.0 근처)에 대한 예보구역 목록을 확인한다:

```bash
curl -s "https://apis.data.go.kr/1360000/FcstZoneInfoService/getFcstZoneCd?serviceKey=<서비스키>&pageNo=1&numOfRows=300&dataType=JSON"
```

응답에서 각 항목의 `regId`, `regName`, `lat`, `lon` 필드가 실제로 존재하는지, 그리고 `regId`가 육상예보용(`11B00000` 형태)과 기온예보용(`11B10101` 형태)을 어떻게 구분해서 담고 있는지(별도 필드로 구분되는지, 아니면 이 API가 둘 중 하나만 주는지) 확인한다.

- [ ] **Step 2: `getMidLandFcst`, `getMidTa` 실제 호출**

Step 1에서 찾은 서울 근처 regId로 두 API를 호출해서 실제 응답 필드명을 확인한다:

```bash
curl -s "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=<서비스키>&pageNo=1&numOfRows=10&dataType=JSON&regId=11B00000&tmFc=<오늘날짜>0600"
curl -s "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=<서비스키>&pageNo=1&numOfRows=10&dataType=JSON&regId=11B10101&tmFc=<오늘날짜>0600"
```

`wf3Am`/`wf3Pm`/`rnSt3Am`/`rnSt3Pm`(3일 후 오전/오후 날씨·강수확률) 같은 필드명, 그리고 8~10일차는 오전/오후 구분 없이 `wf8`/`rnSt8` 형태로만 오는지(자정 기준 하루 통합값)를 확인한다. `getMidTa`에서는 `taMin3`/`taMax3` ~ `taMin10`/`taMax10` 필드명을 확인한다.

- [ ] **Step 3: 결과 반영**

Step 1, 2에서 확인한 실제 필드명이 Task 3의 코드와 다르면, Task 3 작성 시 그 실제 필드명으로 교체한다.

---

### Task 3: `fetch-weather` 엣지함수 확장 (중기예보)

**Files:**
- Modify: `app/supabase/functions/fetch-weather/index.ts`

**Interfaces:**
- Consumes: Task 2에서 확인한 실제 API 응답 구조.
- Produces: `fetch-weather` 응답에 `range: 'short' | 'mid'` 필드 추가. `range === 'mid'`일 때: `{ available: true, range: 'mid', amWeather: string, amPop: string, pmWeather: string, pmPop: string, minTemp: string, maxTemp: string }`. Task 4가 이 형태를 그대로 소비한다.

- [ ] **Step 1: 거리 계산 + 예보구역 검색 함수 추가**

기존 `toGrid` 함수 아래에 추가:

```typescript
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEGRAD;
  const dLon = (lon2 - lon1) * DEGRAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEGRAD) * Math.cos(lat2 * DEGRAD) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface FcstZone {
  regId: string;
  regName: string;
  lat: number;
  lon: number;
}

async function findNearestZone(serviceKey: string, latitude: number, longitude: number): Promise<FcstZone | null> {
  const params = new URLSearchParams({
    serviceKey,
    pageNo: '1',
    numOfRows: '300',
    dataType: 'JSON',
  });
  const res = await fetch(`https://apis.data.go.kr/1360000/FcstZoneInfoService/getFcstZoneCd?${params.toString()}`);
  if (!res.ok) return null;
  const json = await res.json();
  const items: FcstZone[] = json.response?.body?.items?.item ?? [];
  if (items.length === 0) return null;

  let nearest = items[0];
  let minDist = haversineDistance(latitude, longitude, Number(nearest.lat), Number(nearest.lon));
  for (const item of items) {
    const dist = haversineDistance(latitude, longitude, Number(item.lat), Number(item.lon));
    if (dist < minDist) {
      minDist = dist;
      nearest = item;
    }
  }
  return nearest;
}
```

(Task 2 결과에 따라 `getFcstZoneCd`가 육상예보/기온예보용 `regId`를 어떻게 구분하는지 반영해서 `findNearestZone`이 필요하면 두 종류의 `regId`를 각각 반환하도록 조정한다.)

- [ ] **Step 2: 중기예보 조회 함수 추가**

```typescript
function getMidFcstBaseTime(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kst.getUTCHours() * 100 + kst.getUTCMinutes();
  const baseDate = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
  // 중기예보는 06:00, 18:00 하루 2회 발표 (발표 후 약 20~30분 뒤 반영)
  if (hhmm >= 1830) return `${baseDate}1800`;
  if (hhmm >= 630) return `${baseDate}0600`;
  const prevDay = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const prevBaseDate = `${prevDay.getUTCFullYear()}${pad(prevDay.getUTCMonth() + 1)}${pad(prevDay.getUTCDate())}`;
  return `${prevBaseDate}1800`;
}

interface MidForecast {
  amWeather: string;
  amPop: string;
  pmWeather: string;
  pmPop: string;
  minTemp: string;
  maxTemp: string;
}

async function fetchMidForecast(
  serviceKey: string,
  landRegId: string,
  taRegId: string,
  daysAhead: number
): Promise<MidForecast | null> {
  const tmFc = getMidFcstBaseTime(new Date());
  const dayN = Math.min(10, Math.max(3, daysAhead));

  const landParams = new URLSearchParams({
    serviceKey,
    pageNo: '1',
    numOfRows: '1',
    dataType: 'JSON',
    regId: landRegId,
    tmFc,
  });
  const taParams = new URLSearchParams({
    serviceKey,
    pageNo: '1',
    numOfRows: '1',
    dataType: 'JSON',
    regId: taRegId,
    tmFc,
  });

  const [landRes, taRes] = await Promise.all([
    fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams.toString()}`),
    fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${taParams.toString()}`),
  ]);
  if (!landRes.ok || !taRes.ok) return null;

  const landItem = (await landRes.json()).response?.body?.items?.item?.[0];
  const taItem = (await taRes.json()).response?.body?.items?.item?.[0];
  if (!landItem || !taItem) return null;

  // 8~10일차는 오전/오후 구분 없이 통합값만 제공됨
  const hasAmPm = dayN <= 7;
  const amWeather = hasAmPm ? landItem[`wf${dayN}Am`] : landItem[`wf${dayN}`];
  const pmWeather = hasAmPm ? landItem[`wf${dayN}Pm`] : landItem[`wf${dayN}`];
  const amPop = hasAmPm ? landItem[`rnSt${dayN}Am`] : landItem[`rnSt${dayN}`];
  const pmPop = hasAmPm ? landItem[`rnSt${dayN}Pm`] : landItem[`rnSt${dayN}`];

  return {
    amWeather,
    pmWeather,
    amPop: String(amPop),
    pmPop: String(pmPop),
    minTemp: String(taItem[`taMin${dayN}`]),
    maxTemp: String(taItem[`taMax${dayN}`]),
  };
}
```

- [ ] **Step 3: 메인 핸들러에서 3일~10일 분기 추가**

기존:

```typescript
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
```

다음으로 교체:

```typescript
    const matchDate = new Date(matchDateIso);
    const now = new Date();
    const hoursUntilMatch = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 240 || hoursUntilMatch < -3) {
      return Response.json({ available: false });
    }

    const serviceKey = Deno.env.get('KMA_SERVICE_KEY');
    if (!serviceKey) {
      return Response.json({ error: 'KMA_SERVICE_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    if (hoursUntilMatch > 72) {
      const daysAhead = Math.ceil(hoursUntilMatch / 24);
      const zone = await findNearestZone(serviceKey, latitude, longitude);
      if (!zone) return Response.json({ available: false });

      const mid = await fetchMidForecast(serviceKey, zone.regId, zone.regId, daysAhead);
      if (!mid) return Response.json({ available: false });

      return Response.json({ available: true, range: 'mid', ...mid });
    }

    const { nx, ny } = toGrid(latitude, longitude);
```

(Task 2 결과, 육상예보와 기온예보의 `regId`가 서로 다른 값이어야 한다면 `findNearestZone`을 두 번 호출하거나 `zone.regId`를 각 용도에 맞게 변환하는 로직으로 이 Step을 수정한다.)

- [ ] **Step 4: 단기예보 응답에도 `range: 'short'` 추가**

기존 반환문:

```typescript
    return Response.json({
      available: true,
      temperature: valueOf('TMP'),
      precipitationChance: valueOf('POP'),
      precipitationType: valueOf('PTY'),
      sky: valueOf('SKY'),
    });
```

다음으로 교체:

```typescript
    return Response.json({
      available: true,
      range: 'short',
      temperature: valueOf('TMP'),
      precipitationChance: valueOf('POP'),
      precipitationType: valueOf('PTY'),
      sky: valueOf('SKY'),
    });
```

- [ ] **Step 5: 사용자에게 재배포 요청**

Supabase 대시보드에서 `fetch-weather` 함수 내용을 갱신된 코드로 다시 배포해달라고 요청. 완료 확인될 때까지 대기.

- [ ] **Step 6: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
cd app
git add supabase/functions/fetch-weather/index.ts
git commit -m "feat: 날씨 조회 엣지함수에 중기예보(3~10일) 지원 추가"
```

---

### Task 4: 클라이언트 타입 + UI 확장

**Files:**
- Modify: `app/src/features/attendance/services/weatherService.ts`
- Modify: `app/src/features/attendance/components/WeatherBadge.tsx`
- Modify: `app/src/features/attendance/screens/AttendanceScreen.tsx`

**Interfaces:**
- Consumes: `fetch-weather`의 확장된 응답(Task 3).
- Produces: `MatchWeather` 타입에 중기예보 필드 추가. `WeatherBadge`가 `range`에 따라 다르게 렌더링.

- [ ] **Step 1: `MatchWeather` 타입 확장**

`app/src/features/attendance/services/weatherService.ts`에서:

```typescript
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
```

- [ ] **Step 2: `WeatherBadge`에 중기예보 표시 추가**

기존 `if (!weather || !weather.available) return null;` 다음, 렌더링 부분을 교체:

```typescript
  if (!weather || !weather.available) return null;

  if (weather.range === 'mid') {
    const amRain = weather.amWeather?.includes('비') || weather.amWeather?.includes('눈');
    const pmRain = weather.pmWeather?.includes('비') || weather.pmWeather?.includes('눈');
    const showIndoorHint =
      amRain || pmRain || Number(weather.amPop ?? '0') >= 60 || Number(weather.pmPop ?? '0') >= 60;

    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Text style={styles.emoji}>{amRain || pmRain ? '🌧️' : '⛅'}</Text>
          <Text style={styles.text}>
            오전 {weather.amWeather}({weather.amPop}%) · 오후 {weather.pmWeather}({weather.pmPop}%) ·{' '}
            {weather.minTemp}~{weather.maxTemp}°C
          </Text>
        </View>
        {showIndoorHint && <Text style={styles.hint}>☔ 비 예보 - 실내 대체 장소도 고려해보세요</Text>}
      </View>
    );
  }

  const pty = weather.precipitationType ?? '0';
  const pop = Number(weather.precipitationChance ?? '0');
  const showIndoorHint = pty !== '0' || pop >= 60;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{weatherEmoji(pty, weather.sky ?? '1')}</Text>
        <Text style={styles.text}>
          {weather.temperature}°C · 강수 {weather.precipitationChance}%
        </Text>
      </View>
      {showIndoorHint && <Text style={styles.hint}>☔ 비 예보 - 실내 대체 장소도 고려해보세요</Text>}
    </View>
  );
```

- [ ] **Step 3: `AttendanceScreen.tsx`의 예보 범위 조건 확장**

기존(`hoursUntilMatch > 72 || hoursUntilMatch < -3`로 필터링하는 두 곳 — `calendarWeather` 계산용 `eligible` 필터와 무관하게, `WeatherBadge` 자체 조건도 확인):

`WeatherBadge.tsx`의 `useEffect` 안:

```typescript
    if (hoursUntilMatch > 72 || hoursUntilMatch < -3) return;
```

다음으로 교체:

```typescript
    if (hoursUntilMatch > 240 || hoursUntilMatch < -3) return;
```

`AttendanceScreen.tsx`의 `calendarWeather` 계산 useEffect 안 동일한 조건도 교체:

```typescript
      return hoursUntilMatch <= 72 && hoursUntilMatch >= -3;
```

다음으로 교체:

```typescript
      return hoursUntilMatch <= 240 && hoursUntilMatch >= -3;
```

달력 이모지 계산 부분(`weatherEmoji(r.weather.precipitationType ?? '0', r.weather.sky ?? '1')`)도 `range==='mid'`일 때는 강수 문자열 기준으로 이모지를 고르도록 교체:

```typescript
      results.forEach((r) => {
        if (r && r.weather.available) {
          const w = r.weather;
          const emoji =
            w.range === 'mid'
              ? w.amWeather?.includes('비') || w.pmWeather?.includes('비')
                ? '🌧️'
                : '⛅'
              : weatherEmoji(w.precipitationType ?? '0', w.sky ?? '1');
          next[dateKey(new Date(r.match.match_date))] = emoji;
        }
      });
```

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

3~10일 뒤로 잡힌 경기(좌표 있는)를 만들어서 카드/달력에 "오전 OO · 오후 OO · 최저~최고" 형태로 뜨는지 확인.

- [ ] **Step 6: 커밋**

```bash
cd app
git add src/features/attendance/services/weatherService.ts src/features/attendance/components/WeatherBadge.tsx src/features/attendance/screens/AttendanceScreen.tsx
git commit -m "feat: 중기예보 표시(오전/오후 날씨, 최저/최고기온) UI 추가"
```

---

## Self-Review 결과

- **스펙 커버리지:** 지역코드 조회(Task 3 Step 1)/중기예보 호출(Task 3 Step 2-3)/응답 형식 확장(Task 3 Step 4)/UI(Task 4) — 스펙 7번 섹션의 모든 항목이 태스크로 매핑됨.
- **플레이스홀더 스캔:** Task 2는 의도적으로 "실제 API 호출해서 확인" 자체가 목적인 조사 태스크라 코드가 없음 — 이는 외부 API의 실제 동작을 확인해야만 다음 태스크 코드를 정확히 쓸 수 있는 정당한 사유이며, Global Constraints에 이 예외를 명시함. Task 3, 4는 모두 실행 가능한 완전한 코드로 작성됨.
- **타입 일관성:** `MatchWeather.range`(Task 4)가 엣지함수 응답의 `range`(Task 3)와 일치. `WeatherBadge`의 `amWeather`/`pmWeather`/`amPop`/`pmPop`/`minTemp`/`maxTemp` 필드명이 엣지함수 `MidForecast` 인터페이스와 정확히 일치.
