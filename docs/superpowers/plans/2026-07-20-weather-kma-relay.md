# 기상청 API 한국 리전 중계(AWS Lambda) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase 엣지함수에서 기상청 API가 401(IP 차단으로 추정)로 막히는 문제를, 서울 리전 AWS Lambda를 통한 URL 릴레이로 우회한다.

**Architecture:** AWS Lambda(서울 리전)를 "URL을 받아 GET 요청하고 응답을 그대로 돌려주는" 범용 릴레이로 만든다. `fetch-weather`(Supabase)는 기존 격자변환/지역코드/시간계산 로직을 그대로 유지하되, 기상청으로 직접 하던 `fetch()` 3곳을 이 Lambda를 거치는 `fetchViaRelay()` 헬퍼로 교체한다.

**Tech Stack:** AWS Lambda(Node.js 18.x+, Function URL), Supabase Edge Functions(Deno).

## Global Constraints

- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit`(앱 루트: `c:\dev\football\app`) + 수동 확인으로 대체한다(단, Lambda 코드는 순수 Node.js라 tsc 검사 대상 아님).
- AWS 콘솔 조작과 Supabase 시크릿 등록은 자동화 없음 — 사용자가 직접 처리하며, 확인 후 다음 단계로 진행한다.
- 브랜치: `feature/nav-and-announcements` (이미 체크아웃됨). 커밋은 이 브랜치에 쌓는다.
- Lambda는 `apis.data.go.kr` 도메인으로만 릴레이하도록 제한한다(오픈 프록시 악용 방지). 공유 시크릿(`X-Relay-Secret` 헤더)으로 인증한다.
- 디버그용 `debugStatus`/`debugBody` 필드는 이번 작업에서도 유지한다(문제 재발 시 계속 진단 가능하도록).

---

### Task 1: AWS Lambda 릴레이 함수 생성

**Files:** 없음 (AWS 콘솔에서 직접 생성 — 이 저장소에는 별도 파일을 두지 않는다, 코드는 이 계획 문서에만 존재)

**Interfaces:**
- Produces: Lambda Function URL(HTTPS 엔드포인트) — POST body `{ url: string }`, 헤더 `X-Relay-Secret: <공유시크릿>` 필요. 응답: `{ status: number, body: string }`(200) 또는 에러 JSON(401/400/502). Task 2가 이 엔드포인트를 호출한다.

- [ ] **Step 1: 사용자에게 Lambda 함수 생성 요청**

AWS 콘솔 → Lambda → 함수 생성:
- 함수 이름: `weather-kma-relay` (자유롭게 정해도 무방)
- 런타임: Node.js 20.x (또는 18.x 이상 — 전역 `fetch` 필요)
- 리전: 화면 우측 상단에서 **아시아 태평양(서울) ap-northeast-2**로 전환 후 생성

- [ ] **Step 2: 코드 작성 요청**

콘솔의 코드 편집기(`index.mjs` — Node.js 20.x 이상 콘솔 템플릿은 ES 모듈로 생성되므로 `exports.handler`가 아니라 `export const handler`를 써야 한다)에 아래 코드를 그대로 붙여넣고 **Deploy** 버튼을 누르도록 안내:

```javascript
export const handler = async (event) => {
  const secret = process.env.RELAY_SECRET;
  const providedSecret = event.headers && event.headers['x-relay-secret'];
  if (!secret || providedSecret !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const url = payload.url;
  if (typeof url !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'url이 필요합니다.' }) };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: '유효하지 않은 URL입니다.' }) };
  }

  if (parsed.hostname !== 'apis.data.go.kr') {
    return { statusCode: 400, body: JSON.stringify({ error: '허용되지 않은 도메인입니다.' }) };
  }

  try {
    const kmaRes = await fetch(url);
    const bodyText = await kmaRes.text();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: kmaRes.status, body: bodyText }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: '릴레이 요청 실패', detail: String(err) }) };
  }
};
```

- [ ] **Step 3: 환경변수 + Function URL 설정 요청**

1. 임의의 긴 랜덤 문자열을 하나 정하기(공유 시크릿 — 예: 비밀번호 생성기로 32자 이상). 이 값을 잘 기록해둘 것(Task 2에서 Supabase 쪽에도 똑같이 등록해야 함).
2. 함수 화면 → 구성(Configuration) → 환경 변수 → 편집 → 추가: 키 `RELAY_SECRET`, 값은 방금 정한 시크릿
3. 구성(Configuration) → 함수 URL → 생성 → 인증 유형: **NONE** (대신 위 공유 시크릿으로 보호) → 저장
4. 생성된 함수 URL(`https://xxxxxxxx.lambda-url.ap-northeast-2.on.aws/` 형태)을 복사

완료되고 함수 URL + 시크릿 값 둘 다 확인될 때까지 대기.

- [ ] **Step 4: 동작 확인**

사용자에게 curl로 직접 테스트해보도록 요청(터미널에서, `<RELAY_URL>`과 `<SECRET>`을 실제 값으로 교체):

```bash
curl -s -X POST "<RELAY_URL>" \
  -H "X-Relay-Secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=test&pageNo=1&numOfRows=1&dataType=JSON&base_date=20260101&base_time=0200&nx=60&ny=127"}'
```

Expected: `{"status":200,"body":"...(기상청 응답, 잘못된 serviceKey라 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 같은 내용이어도 status:200이면 정상 — 릴레이 자체는 성공한 것)"}` 형태의 JSON이 돌아오는지 확인. `401`이 오면 시크릿 헤더 오타, `400`이면 도메인/URL 형식 문제.

---

### Task 2: `fetch-weather`에 릴레이 연동

**Files:**
- Modify: `app/supabase/functions/fetch-weather/index.ts`

**Interfaces:**
- Consumes: Task 1의 Lambda Function URL + 공유 시크릿 (환경변수 `WEATHER_RELAY_URL`, `WEATHER_RELAY_SECRET`로 Supabase에 등록).
- Produces: 없음 (최종 통합).

- [ ] **Step 1: `fetchViaRelay` 헬퍼 추가**

`interface KmaItem { ... }` 블록 바로 아래에 추가:

```typescript
const RELAY_URL = Deno.env.get('WEATHER_RELAY_URL');
const RELAY_SECRET = Deno.env.get('WEATHER_RELAY_SECRET');

interface RelayResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

// 기상청 API가 Supabase 엣지함수의 발신 IP를 막아서(401), 서울 리전 AWS Lambda를 거쳐 대신 호출한다.
async function fetchViaRelay(url: string): Promise<RelayResponse> {
  if (!RELAY_URL || !RELAY_SECRET) {
    throw new Error('WEATHER_RELAY_URL/WEATHER_RELAY_SECRET가 설정되지 않았습니다.');
  }
  const relayRes = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': RELAY_SECRET },
    body: JSON.stringify({ url }),
  });
  if (!relayRes.ok) {
    const bodyText = await relayRes.text();
    throw new Error(`릴레이 호출 실패 (status ${relayRes.status}): ${bodyText.slice(0, 300)}`);
  }
  const { status, body } = await relayRes.json();
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}
```

- [ ] **Step 2: 중기예보 호출부(`fetchMidForecast`) 교체**

기존:

```typescript
  const [landRes, taRes] = await Promise.all([
    fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams.toString()}`),
    fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${taParams.toString()}`),
  ]);
  if (!landRes.ok || !taRes.ok) return null;
```

다음으로 교체:

```typescript
  const [landRes, taRes] = await Promise.all([
    fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams.toString()}`),
    fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${taParams.toString()}`),
  ]);
  if (!landRes.ok || !taRes.ok) return null;
```

- [ ] **Step 3: 단기예보 호출부 교체**

기존:

```typescript
    const kmaRes = await fetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; futsal-club-app)', Accept: 'application/json' } }
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

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 사용자에게 Supabase 시크릿 등록 + 재배포 요청**

Supabase 대시보드 → Edge Functions → Secrets에 추가:
- `WEATHER_RELAY_URL`: Task 1에서 확보한 Lambda Function URL
- `WEATHER_RELAY_SECRET`: Task 1에서 정한 공유 시크릿(Lambda의 `RELAY_SECRET`과 동일한 값)

그 다음 `fetch-weather` 함수를 이 파일의 최신 내용으로 다시 배포. 완료 확인될 때까지 대기.

- [ ] **Step 6: 커밋**

```bash
cd app
git add supabase/functions/fetch-weather/index.ts
git commit -m "fix: 기상청 API 호출을 서울 리전 AWS Lambda 릴레이로 우회"
```

- [ ] **Step 7: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

앱에서 3일 이내 경기 카드의 날씨가 정상적으로 뜨는지 확인. 여전히 502가 뜨면 `debugStatus`/`debugBody` 내용을 다시 확인 — 이번엔 릴레이(Lambda) 쪽 에러(401=시크릿 불일치, 400=URL/도메인 문제)이거나, 릴레이는 통과했지만 기상청이 진짜 다른 이유로 거부한 경우(그럴 경우 `debugBody`에 기상청의 실제 에러 메시지가 그대로 담김)일 것이다.

---

## Self-Review 결과

- **스펙 커버리지:** Lambda 릴레이 함수(Task 1) / 보안(공유 시크릿+도메인 제한, Task 1 코드 내) / `fetch-weather` 연동(Task 2) / 사전 준비(Task 1 Step 3, Task 2 Step 5) — 스펙의 모든 섹션이 태스크로 매핑됨.
- **플레이스홀더 스캔:** 없음 — Lambda 코드, `fetchViaRelay` 헬퍼, 3곳의 교체 코드 모두 실행 가능한 완전한 코드로 작성됨.
- **타입 일관성:** `RelayResponse`(`ok`/`status`/`json()`/`text()`)가 기존 `kmaRes`/`landRes`/`taRes`가 쓰이던 방식(`.ok`, `.text()`, `.json()`)과 정확히 같은 인터페이스라 호출부 나머지 코드(디버그 응답 조립, `landItem`/`taItem` 파싱)를 그대로 재사용 가능함을 확인.
