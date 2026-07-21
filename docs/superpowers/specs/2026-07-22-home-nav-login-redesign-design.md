# 홈 탭 + 하단 네비게이션 + 로그인 화면 개편 Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 하단 탭을 홈·일정·경기운영·정산·팀 5개로 재구성하고, 홈 탭에 요약 대시보드를 새로 만들고, 로그인 화면을 실제 로고 이미지와 파티클 스피어를 포함한 새 디자인으로 교체한다.

**Architecture:** 세 가지 독립적이지만 함께 배포되는 변경. (1) 네비게이션: `MainTabNavigator`에 홈 탭 추가, 예약 탭 제거, 경기운영 탭에 원형 강조 버튼 스타일 적용. (2) 홈 화면: 기존 스토어(attendance/announcements/polls/team)만 재사용하는 순수 클라이언트 집계 화면, 새 DB/엣지함수 불필요. (3) 로그인 화면: 기존 레이아웃 구조 유지하되 로고 이미지·문구·파티클 스피어·약관 문구 교체.

**Tech Stack:** React Native/Expo, Zustand, React Navigation bottom-tabs, 기존 `ParticleSphere`(RN Animated) 컴포넌트 재사용/확장.

## Global Constraints

- 새 화면/컴포넌트는 기존 다크 테마 토큰만 사용한다: 배경 `#0F1512`, 카드 `#141A17`, 테두리 `#22302A`, 텍스트 `#FFFFFF`/`#8A9490`, 브랜드 `#2D5F3E`, 포인트 `#4ADE80`, 경고 `#D2A34C`. 목업 이미지의 색상 값(`#0a0f0d` 등)은 참고만 하고 실제 값은 쓰지 않는다.
- 새 DB 스키마, RLS, 엣지함수 변경 없음 — 전부 기존 데이터로 클라이언트에서 조합한다.
- `npx tsc --noEmit`으로 검증(테스트 프레임워크 없음).

---

## 1. 네비게이션 재구성

**파일:** `src/navigation/MainTabNavigator.tsx`

- 탭 순서: 홈(`HomeScreen`) → 일정(`AttendanceScreen`) → 경기운영(`AssignmentScreen`, 원형 강조) → 정산(`SettlementScreen`) → 팀(`TeamHomeScreen`)
- `Reservation` 탭 제거, `src/features/reservation/` 폴더 삭제 (다른 곳에서 참조 없음, 스텁 상태였음 확인 완료)
- `Assignment` 탭 `title`을 `'분배'` → `'경기운영'`으로 변경 (그동안 사용자가 부르던 이름과 통일)
- 초기 목업(캡슐형 하단바, 아이콘만 표시)을 참고해 **탭 바 전체를 라벨 없는 아이콘 전용으로 변경**(`tabBarShowLabel: false`), 높이를 82→64로 슬림하게, 상단 모서리를 `borderTopLeftRadius/borderTopRightRadius: 24`로 둥글게. `tabBarActiveTintColor`/`tabBarInactiveTintColor`는 방금 적용한 테마 값(`#2D5F3E`/`#5A625E`) 그대로 유지 — 이 톤 자체를 바꾸는 요청은 아니었음.
- `Assignment` 탭만 `tabBarIcon`을 커스텀 렌더링해 지름 44 원형 배지 안에 아이콘을 넣고 `top: -14`로 살짝 띄운다. 배지 배경/테두리는 기존에 승인된 톤(`#173A26`/`#2D5F3E`)만 사용하고 새로 라임(`#4ADE80`)을 추가하지 않는다 — 지난 테마 작업에서 라임은 "알림배지·오늘날짜·FAB" 세 가지로만 좁게 쓰기로 확정했고, 탭 활성 표시는 그 범위 밖이라 이번엔 넣지 않음(원하면 나중에 이 배지도 포함하도록 조정 가능). 아이콘 색은 배지 배경 대비를 위해 포커스 여부와 무관하게 흰색(`#FFFFFF`) 고정, 대신 배지 배경을 포커스 시 살짝 밝은 딥그린(`#22543A`)으로 바꿔 선택 상태를 표현.

**파일:** `src/features/assignment/screens/AssignmentScreen.tsx`

- `TabHeader title="분배"` → `title="경기운영"`

**삭제:** `src/features/reservation/screens/ReservationScreen.tsx` (및 빈 폴더)

---

## 2. 홈 화면

**신규 파일:** `src/features/home/screens/HomeScreen.tsx`

구조: `ScreenGradient` > `TabHeader title="홈"` > `ScrollView` 안에 위젯 3개.

### 2-1. 공지 요약 카드
- `useAnnouncementsStore`에서 `announcements` 로드(`loadAnnouncements`, activeTeam 바뀔 때).
- `announcements[0]`(이미 `is_pinned desc, created_at desc` 정렬되어 내려옴 — 고정 공지가 있으면 그게 0번, 없으면 최신 글) 하나만 표시: 제목 1줄 + 본문 1줄(`numberOfLines={1}`).
- 공지가 하나도 없으면 카드 자체를 숨김(빈 카드 노출 안 함).
- 탭하면 `navigation.navigate('Team')`로 이동(팀 탭에서 상세 확인 — 홈 자체엔 상세 모달을 새로 안 만듦, 목업도 요약만 보여줌).

### 2-2. 다음 경기 카드
- `useAttendanceStore`에서 `matches` 로드. `matches`는 `match_date` 오름차순 정렬되어 내려오므로, `matches.find(m => new Date(m.match_date).getTime() >= Date.now() - 3 * 60 * 60 * 1000)`로 "다음 경기"를 찾는다(3시간 유예는 기존 `WeatherBadge`의 unavailable 판정 기준과 동일하게 맞춤 — 경기 시작 직후에도 잠깐은 "다음 경기"로 계속 보여주기 위함).
- 표시 내용:
  - D-day 배지: `Math.ceil((matchDate - now) / 86400000)`. 0 이하면 "오늘", 아니면 `D-{n}`.
  - 날짜/요일 · 장소 · 시간 (예: "7월 26일 (토) · 강남풋살장 · 19:00")
  - `WeatherBadge` 그대로 재사용 (`latitude`, `longitude`, `matchDateIso={match_date}`)
  - 참석 인원: `match.votes.filter(v => v.status === 'attend').length`명 참석
- 다음 경기가 없으면(`matches`가 비어있거나 전부 과거) 카드 대신 같은 위치에 작은 인라인 안내 블록을 넣는다(`EmptyState` 컴포넌트는 `flex:1` 전체화면 중앙정렬용이라 그대로 재사용하지 않고, 카드와 같은 padding/배경으로 emoji `📅` + "등록된 경기가 없어요" + "새 경기가 등록되면 여기에 보여드릴게요"만 텍스트로 표시).

### 2-3. 미답변 유도 카드 (앰버, `#D2A34C` 텍스트)
우선순위 순서로 하나만 표시, 조건에 안 맞으면 아예 숨김:
1. 다음 경기가 있고, 그 경기의 `votes`에 내 `membershipId`(activeTeam.membershipId)로 된 항목이 없으면 → "다음 경기 투표에 참여해주세요" 카드 표시. 탭하면 `navigation.navigate('Attendance')`.
2. (1)에 해당 안 하면, `usePollsStore`의 `polls` 중 마감 안 지났고(`deadline == null || new Date(deadline) > now`) `responses`에 내 `membershipId`가 없는 첫 번째 poll이 있으면 → "새 투표에 참여해주세요: {question}" 표시(질문은 1줄로 자름). 탭하면 `navigation.navigate('Team')`.
3. 둘 다 없으면 카드 숨김.

### 데이터 로딩
- `useEffect`에서 `activeTeam.team.id` 바뀔 때 `loadMatches`, `loadAnnouncements`, `loadPolls` 호출(다른 화면들과 동일 패턴, 각 스토어가 이미 캐시/로딩 상태 관리).
- `activeTeam`이 없으면 `null` 반환(다른 화면들과 동일 가드).

---

## 3. 로그인 화면 개편

**파일:** `src/features/auth/screens/LoginScreen.tsx`

- 로고: 기존 `Ionicons football-outline` + 원형 배경 뷰를 **`assets/logo.png` 이미지**로 교체. `Image` 컴포넌트, `require('../../../../assets/logo.png')`, `width: 96, height: 96, borderRadius: 22`, `resizeMode: 'contain'`. 로고 파일 자체에 짙은 배경이 이미 포함돼 있어 별도 배경 원(`logoCircle`) 뷰는 제거.
- 타이틀 "킥데이"는 유지.
- 태그라인: `"우리 팀 경기, 이제 더 쉽게"` → `"우리 팀의 매주 그 시간"`으로 교체.
- 태그라인과 버튼 사이에 `ParticleSphere`를 인라인 크기로 삽입(아래 3-1 참고), 높이 약 150 영역.
- 버튼 문구: `"카카오톡으로 간편가입"` → `"카카오로 시작하기"`, 아이콘을 커스텀 `kakaoBubble` 뷰 대신 `Ionicons name="chatbubble" size={18} color="#3C1E1E"`로 교체.
- 하단 문구: 기존 "가입한 적 없다면 자동으로 계정이 만들어져요"를 아래 약관 문구로 교체:
  `"로그인 시 이용약관 및 개인정보처리방침에 동의하게 됩니다"` — "이용약관", "개인정보처리방침" 두 단어만 `textDecorationLine: 'underline'` 스타일. 실제 약관/정책 문서 페이지는 없으므로 탭 동작 없이 텍스트만 표시(범위 밖).

### 3-1. `ParticleSphere` 인라인 크기 지원

**파일:** `src/features/assignment/components/ParticleSphere.tsx`

현재는 항상 부모를 꽉 채우는 절대위치 배경(`position:absolute, top/left/right/bottom:0`)으로만 동작해서 로그인 화면처럼 문서 흐름 안에 작게 넣을 수가 없다. 선택적 `size` prop을 추가:

- `size` 미지정 시: 기존과 동일하게 전체화면 절대위치 배경으로 렌더링(`AssignmentScreen`의 기존 사용법 그대로 유지, 동작 변화 없음).
- `size` 지정 시: `width: size, height: size`인 상대위치(`position: 'relative'`) 컨테이너로 렌더링하고, 구 반지름을 `size * 0.42`로, 점 기본 크기를 `size / 300 * DOT_BASE_SIZE`로 비례 축소.

`LoginScreen`에서 `<ParticleSphere size={150} />`로 사용.

---

## 검증
- `npx tsc --noEmit` 통과
- 브라우저에서 수동 확인: 하단 탭 5개 순서/아이콘/경기운영 원형 버튼, 홈 화면 3개 위젯(경기 있음/없음 케이스), 로그인 화면 로고/문구/스피어/버튼
