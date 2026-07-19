# 경기 날씨 예보 + 실내/실외 추천 설계

## 배경

경기 등록 시 카카오 로컬 API로 장소를 검색하면 `matches` 테이블에 위경도(latitude/longitude)가 저장된다. 이 좌표를 이용해 경기 당일 날씨를 예보해서 일정 카드에 바로 보여주고, 비/눈이 예보되면 실내 대체 장소를 고려하라는 안내를 함께 띄운다.

## 1. 아키텍처

기상청 공공데이터포털의 단기예보 API를 Supabase Edge Function `fetch-weather`가 대신 호출한다(`notify-team`, `search-places`와 동일한 서버 프록시 패턴 — 서비스키를 클라이언트에 노출하지 않음).

## 2. 예보 범위

기상청 단기예보(`getVilageFcst`)는 **발표 시점 기준 약 3일 이내**만 3시간 단위로 상세하게 나온다. 경기 날짜가 오늘부터 3일(72시간) 이내면 단기예보를, 3~10일 사이면 중기예보(7번 섹션)를 조회한다. 10일보다 먼 경기는 엣지함수를 호출하지 않고 클라이언트에서 바로 "아직 예보가 안 나왔어요" 상태로 처리한다.

좌표가 없는 경기(자유텍스트 등록 또는 장소 미입력)는 날씨 조회 자체를 시도하지 않고 날씨 섹션을 표시하지 않는다.

## 3. 좌표 변환 (위경도 → 기상청 격자)

기상청 API는 격자좌표(nx, ny)를 쓴다. 아래는 공개적으로 널리 쓰이는 LCC(Lambert Conformal Conic) 변환 공식이다(엣지함수 안에 그대로 포함):

```typescript
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

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
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
```

구현 시점에 data.go.kr의 최신 API 문서에서 파라미터명/응답 필드명이 이 스펙과 다르지 않은지 다시 확인한다(공공 API는 가끔 필드명이 바뀐다).

## 4. Edge Function `fetch-weather`

입력: `{ latitude, longitude, matchDateIso }`. 처리:
1. `matchDateIso`가 현재로부터 3일(72시간)보다 미래면 `{ available: false }` 즉시 반환.
2. 위경도를 격자로 변환.
3. 가장 최근 발표시각(02/05/08/11/14/17/20/23시 중 이미 발표되고 API에 반영됐을 시각)을 계산해 `base_date`/`base_time`으로 사용.
4. 기상청 `getVilageFcst` 호출, 응답에서 `fcstDate`+`fcstTime`이 경기 시각과 가장 가까운 3시간 슬롯의 항목들을 추린다.
5. 그 슬롯의 `TMP`(기온), `POP`(강수확률), `PTY`(강수형태 코드), `SKY`(하늘상태 코드)를 뽑아 `{ available: true, temperature, precipitationChance, precipitationType, sky }` 형태로 반환.

## 5. 클라이언트

`src/features/attendance/services/weatherService.ts`: `fetchMatchWeather(latitude, longitude, matchDateIso)` — 엣지함수 호출 후 결과를 그대로 반환.

일정 카드(`AttendanceScreen.tsx`)에 `WeatherBadge` 컴포넌트를 추가해서, 좌표가 있고 경기일이 3일 이내인 매치에 한해 마운트 시 날씨를 조회한다. 로딩 중엔 아무것도 안 보여주고(깜빡임 방지), 결과가 있으면 날씨 아이콘(SKY/PTY 코드로 결정) + 기온 + 강수확률을 한 줄로, `PTY`가 0(없음)이 아니거나 `POP`이 60 이상이면 그 아래에 "☔ 비 예보 - 실내 대체 장소도 고려해보세요" 경고 문구를 추가로 보여준다. 예보 없음/좌표 없음/조회 실패 시 아무것도 렌더링하지 않는다(빈 공간도 차지하지 않음).

## 6. 사전 준비 (사용자가 직접)

- 공공데이터포털(data.go.kr) 회원가입 → "기상청_단기예보 ((구)_동네예보) 조회서비스" 활용신청 → 서비스키 발급 (보통 즉시 자동승인)
- "기상청_중기예보 조회서비스", "기상청_예보구역정보 조회서비스" 활용신청 추가 (7번 섹션에서 사용, 보통 즉시 자동승인 — 서비스키는 단기예보와 동일 계정의 키를 재사용)
- Supabase 엣지함수 시크릿에 `KMA_SERVICE_KEY`로 등록

## 7. 중기예보 확장 (3~10일)

경기일이 단기예보 범위(3일)를 넘고 10일 이내면 중기예보를 조회한다.

**지역코드 조회**: 중기예보는 격자좌표가 아니라 예보구역코드(`regId`)를 쓰고, 이 코드는 위경도로 직접 변환할 공식이 없다. 대신 기상청 `getFcstZoneCd`(예보구역정보 조회서비스) API를 호출하면 전국 예보구역 목록을 위경도와 함께 받을 수 있다 — 이 목록에서 경기 좌표와 가장 가까운(직선거리, haversine) 구역을 찾아 그 `regId`를 사용한다. `getMidLandFcst`(육상예보)와 `getMidTa`(기온예보)가 서로 다른 규칙의 `regId`를 쓰는 것으로 알려져 있어서, `getFcstZoneCd` 응답을 실제로 확인해 두 값을 각각 어떻게 뽑아낼지 구현 초반에 검증한다(문서만으로 확정하지 않고 실제 호출 결과를 보고 파싱 로직을 정한다).

**중기예보 호출**: 하루 2회(06:00, 18:00) 발표. `getMidLandFcst`에서 오전/오후 강수확률(`rnSt`류 필드)과 날씨 문자열(`wf`류 필드), `getMidTa`에서 최저/최고기온을 가져와 합친다. 정확한 응답 필드명은 구현 시점에 실제 호출 결과로 확정한다.

**응답 형식**: `fetch-weather`의 응답에 `range: 'short' | 'mid'` 필드를 추가한다. `range: 'mid'`일 때는 시간대 개념이 없으므로 오전/오후 각각의 날씨 문자열과 강수확률, 그리고 최저/최고기온을 반환한다.

**UI**: `WeatherBadge`와 달력 이모지 모두 `range`에 따라 다르게 표시한다. 단기예보는 기존처럼 "☀️ 22°C · 강수 10%", 중기예보는 "오전 흐림 · 오후 비(60%) · 15~24°" 형태로 표시한다. 실내 추천 문구 조건(비/눈 예보 또는 강수확률 60% 이상)은 오전/오후 중 하나라도 해당하면 띄운다.

## 범위 밖

- 실내 대체 장소를 실제로 추천/검색해주는 기능(예: 근처 실내 체육관 자동 검색) — 경고 문구만 띄우고 실제 대안 장소 검색은 하지 않는다.
- 팀 알림(예: "비 예보가 있어요" 푸시) — 카드 표시만, 별도 알림 발송은 하지 않는다.
- 예보구역 목록 캐싱(매 요청마다 `getFcstZoneCd` 재호출) — 호출 횟수가 늘지만 이번엔 정확성을 우선한다.
