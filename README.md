# 풋살모임 (Futsal Club App)

풋살 모임 운영 앱 MVP. React Native(Expo) + Supabase 기반, 멀티테넌시(팀별 데이터 완전 분리) 구조로 설계됨.

## 기술 스택

- Expo (React Native, TypeScript)
- Zustand (상태관리)
- React Navigation
- Supabase (Postgres, Auth, Realtime)
- 카카오 소셜 로그인 (Supabase Auth의 Kakao OAuth provider 사용)

## 개발 순서 (MVP)

1. **카카오 로그인 + 팀 생성/가입** ← 현재 단계
2. 참석투표
3. 회비 정산
4. 팀 분배
5. 경기 타이머 (오프라인 동작)

## 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

### 2. Supabase 프로젝트 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. 스키마 적용 — 아래 「스키마는 어디에 있나」 참고
3. **Authentication > Providers > Kakao** 활성화
   - [Kakao Developers](https://developers.kakao.com)에서 앱 생성 후 REST API 키, Client Secret 발급
   - Kakao 앱 설정에서 Redirect URI에 Supabase가 제공하는 콜백 URL(`https://<project-ref>.supabase.co/auth/v1/callback`) 등록
   - Kakao Login 동의항목에서 `profile_nickname`, `profile_image` 활성화 (이메일은 선택)
   - `account_email`을 요청하지 않는다면 Supabase 대시보드에서 "Allow users without an email" 옵션 켜기

### ⚠ 스키마는 어디에 있나 — 2026-09-14

**원본은 Supabase의 실제 DB다. 저장소에 사본을 두지 않는다.**

`supabase/schema.sql`이 있었고 위 2번이 그것을 실행하라고 했다. 지웠다.

이유는 「낡아서」가 아니다. **한 파일 안에 두 시절이 섞여 있어서, 파일만 봐서는
무엇이 참인지 못 갈랐다.** 2026-07-27 리디자인이 `settlements`·`payments`를
`drop table` 후 새로 만들었는데 그 파일은 안 따라갔다 — 그래서 같은 파일에
현재 정의 10개와 폐기된 정의 2개가 나란히 있었고, **둘 다 똑같이 그럴듯해 보였다.**
실제로 2026-09-14에 그 파일의 `settlements`를 근거로 판단하다 잡았다.

참고용 사본은 갈리기 마련이다. 이 저장소는 「사본을 시험하는 검사」를 이미 셋
걷어냈고(score·timerring·upcoming), `dupmatch.check`가 넷째였다 —
하필 **갈려 있던 그 파일**을 읽고 있었다. 같이 거뒀다.

#### 실제 스키마가 필요하면 그때 뽑는다

```bash
# 전체 (테이블·정책·트리거·함수)
npx supabase db dump --project-ref <ref> --schema public > /tmp/schema.sql

# 한 테이블만 보고 싶을 때는 대시보드 SQL Editor가 더 빠르다
#   select column_name, data_type, is_nullable
#   from information_schema.columns where table_name = 'matches';
```

⚠ 뽑은 파일을 **저장소에 커밋하지 마라.** 커밋하는 순간 다시 사본이 되고,
같은 일이 반복된다. 필요할 때 뽑아 쓰고 버린다.

#### ⚠ 그래서 빈 DB를 새로 세우려면

**마이그레이션만으로는 안 선다.** 테이블 12개 중 11개가 지운 파일에만 있었고
(`teams`·`team_members`·`matches`·`profiles`·`announcements`·`attendance_votes`·
`notifications`·`polls`·`poll_responses`·`team_assignments`·`payments`),
`20260727_kickday_redesign.sql`은 그것들이 **이미 있다고 전제하고** 시작한다.

지금 운영 중인 프로젝트가 하나뿐이라 새로 세울 일이 없어서 이 비용을 받아들였다.
새 환경이 필요해지면 순서는 이렇다:

1. 운영 DB에서 위 명령으로 뽑는다 → 그것이 원본이다
2. 운영 DB가 없는 상황이면 **git 이력에서 꺼낸다** —
   `git show 73a6026^:supabase/schema.sql`
   ⚠ 그건 **2026-07-27 이전 시절의 `settlements`·`payments`를 담고 있다.**
   그 두 절은 버리고 `20260727_kickday_redesign.sql`의 정의를 쓴다.

### 3. 환경변수 설정

`.env.example`을 복사해 `.env` 생성 후 Supabase 프로젝트 값 입력:

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

값은 Supabase 대시보드 **Project Settings > API**에서 확인. `.env`는 git에 커밋되지 않음.

### 4. 앱 실행 (Expo Go)

여기서 쓴 라이브러리(AsyncStorage, React Navigation, expo-web-browser, expo-linking 등)는 모두 Expo Go에 내장되어 있어 **커스텀 네이티브 빌드 없이 Expo Go 앱만으로 테스트 가능**합니다. 안드로이드/iOS 기기 아무거나, 심지어 서로 다른 OS라도 상관없습니다.

```bash
pnpm start
```

터미널에 뜨는 QR코드를 휴대폰의 Expo Go 앱(또는 카메라 앱)으로 스캔하면 실행됩니다. PC와 휴대폰이 같은 Wi-Fi가 아니면 `pnpm start --tunnel`을 사용하세요.

**카카오 로그인 테스트 시 주의**: Expo Go에서는 딥링크 주소가 `app.json`의 `scheme`이 아니라 `exp://192.168.x.x:8081/--/...` 같은 임시 주소로 대체됩니다. Supabase 대시보드 **Authentication > URL Configuration > Redirect URLs**에 이 주소(또는 `exp://*/**` 와일드카드)를 추가해야 카카오 로그인 리다이렉트가 정상 동작합니다.

`expo run:android` / `expo run:ios`는 네이티브 모듈을 추가하거나 EAS Build로 실제 배포를 준비할 때 필요한 것으로, 지금 단계에서는 필요하지 않습니다.

## 폴더 구조

```
src/
  features/
    auth/        # 로그인 (screens, services, stores)
    team/        # 팀 생성/가입/홈 (screens, services, stores)
  navigation/    # RootNavigator
  lib/           # Supabase 클라이언트
  types/         # DB 타입 (실제 DB와 대응 — 위 「스키마는 어디에 있나」)
supabase/
```

## 배포 (EAS Build)

`eas.json`은 이후 단계에서 추가 예정입니다. 안드로이드 배포부터 진행합니다.
