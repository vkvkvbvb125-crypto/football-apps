# 기상청 API 한국 리전 중계(릴레이) 설계

## 배경

`fetch-weather` 엣지함수(Supabase, 전 세계 분산 서버)가 기상청 API(단기예보/중기육상예보/중기기온예보)를 직접 호출하면 401 Unauthorized로 거부된다. 실제 검증 결과(같은 서비스키·파라미터로 로컬 환경에선 200 정상 응답, User-Agent 헤더 추가해도 동일하게 401) 기상청 API 앞단의 게이트웨이가 발신 IP 기준으로 차단하는 것으로 결론 내렸다. Supabase Edge Function은 고정 IP가 없어 화이트리스트 등록도 불가능하다.

해결책: AWS Lambda를 서울 리전(ap-northeast-2)에 만들어서, `fetch-weather`가 기상청에 보낼 완성된 URL을 이 Lambda에 넘기면 Lambda가 대신 호출해서 응답을 그대로 돌려준다.

## 1. 중계 함수(Lambda)의 역할

기상청/날씨에 대해 아무것도 모르는 **범용 URL 릴레이**로 만든다: `{ url: string }`을 받아 그 URL을 GET 요청하고, 상태 코드와 응답 본문을 그대로 반환한다. 격자변환/지역코드/발표시각 계산 등 기존 로직은 전부 `fetch-weather`(Supabase)에 그대로 남긴다 — Lambda는 순수하게 "한국 리전에서 나가는 HTTP 요청" 역할만 한다.

## 2. 보안

이 Lambda는 인터넷에 공개된 HTTPS 엔드포인트(Function URL)가 된다. 두 가지 방어를 둔다:

- **공유 시크릿**: 요청 헤더 `X-Relay-Secret`에 사전에 정한 값을 담아 보내고, Lambda는 환경변수 `RELAY_SECRET`과 비교해서 안 맞으면 401을 반환한다.
- **허용 도메인 제한**: 요청받은 `url`의 호스트가 `apis.data.go.kr`이 아니면 400을 반환한다(시크릿이 유출돼도 임의 사이트로의 프록시 악용을 막기 위함).

## 3. 배포

AWS Lambda 콘솔에서 Node.js 런타임으로 함수 생성, 리전 **아시아 태평양(서울) ap-northeast-2** 선택, **Function URL** 활성화(인증 유형: NONE — 대신 위 공유 시크릿으로 자체 보호). API Gateway는 쓰지 않는다.

## 4. `fetch-weather` 쪽 변경

기상청으로 직접 `fetch(kmaUrl)`하던 3곳(단기예보 `getVilageFcst`, 중기육상예보 `getMidLandFcst`, 중기기온예보 `getMidTa`)을 공통 헬퍼 `fetchViaRelay(url: string)`로 교체한다. 이 헬퍼는 Lambda Function URL로 `POST { url }` 요청을 보내고(헤더에 `X-Relay-Secret` 포함), 받은 상태코드/본문을 기존 코드가 기대하던 형태(`Response`-like: `.ok`, `.status`, `.json()`, `.text()`)로 감싸서 돌려준다 — 이러면 호출부(단기예보/중기예보 로직)의 나머지 코드는 거의 그대로 유지된다.

Lambda Function URL과 공유 시크릿은 Supabase 엣지함수 시크릿에 각각 `WEATHER_RELAY_URL`, `WEATHER_RELAY_SECRET`로 등록한다.

## 5. 사전 준비 (사용자가 직접)

- AWS 콘솔에서 Lambda 함수 생성(리전: 서울), Function URL 활성화 후 URL 확보
- 임의의 공유 시크릿 문자열 하나 정하기 (Lambda 환경변수 `RELAY_SECRET`, Supabase 시크릿 `WEATHER_RELAY_SECRET`에 동일한 값으로 등록)
- Supabase 엣지함수 시크릿에 `WEATHER_RELAY_URL`(Lambda Function URL), `WEATHER_RELAY_SECRET` 등록

## 범위 밖

- Lambda 콜드스타트 지연 최적화(Provisioned Concurrency 등) — 개인 프로젝트 규모에서 불필요.
- 릴레이를 통한 캐싱(같은 URL 반복 요청 시 캐시) — 이번엔 다루지 않는다.
- 기상청 외 다른 API까지 이 릴레이를 통하게 확장하는 것 — 지금은 날씨 조회만 대상으로 한다(허용 도메인이 `apis.data.go.kr` 하나뿐).
