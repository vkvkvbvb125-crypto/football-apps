# 네비게이션 재구성 + 공지사항 기능 설계

## 배경

5개 탭 구조를 확정하기로 함: 일정 / 정산 / 예약(추후 기능 구현, 지금은 자리만) / 분배(+타이머 통합) / 팀. 공지사항(총무가 글을 쓰면 팀원에게 알림이 가는 기능)은 새 탭이 아니라 팀 탭 안에 섹션으로 들어간다. 이번 스펙은 이 네비게이션 재구성과 공지사항 기능을 함께 다룬다.

## 1. 네비게이션 재구성

### 1-1. 예약 탭 (자리만 확보)

- 새 파일 `src/features/reservation/screens/ReservationScreen.tsx`: `ScreenGradient` + `TabHeader title="예약"` + 기존 `EmptyState` 컴포넌트로 "준비 중이에요" 메시지만 표시. 실제 예약 기능은 이번 스펙 범위 밖.
- `MainTabNavigator.tsx`에 `Tab.Screen name="Reservation" component={ReservationScreen}` 추가 (일정/정산 다음, 분배 이전 위치).

### 1-2. 분배+타이머 통합

- `TimerScreen.tsx`의 실제 내용(쿼터 타이머, 교체 대기열)을 `src/features/timer/components/TimerPanel.tsx`로 이동. `ScreenGradient`/`TabHeader`/`EmptyState`(팀 없음 케이스) 없이 순수 콘텐츠만 담은 컴포넌트로 만든다. Props 없음 — 기존 `TimerScreen`이 쓰던 `useTeamStore` 훅을 그대로 내부에서 사용.
- `TimerScreen.tsx` 파일은 삭제.
- `AssignmentScreen.tsx`에 로컬 state `const [view, setView] = useState<'assign' | 'timer'>('assign')` 추가. `TabHeader` 아래에 "분배" / "타이머" 두 개짜리 필 토글(기존 참석투표 칩과 동일한 스타일 재사용)을 넣고, `view === 'assign'`이면 기존 분배 목록을, `view === 'timer'`면 `<TimerPanel />`을 렌더링.
- `MainTabNavigator.tsx`에서 `Timer` 탭 제거.

## 2. 공지사항 기능

### 2-1. DB 스키마

```sql
create table announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  author_id uuid not null references team_members(id),
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table announcements enable row level security;

create policy "announcements_select" on announcements for select using (is_team_member(team_id));
create policy "announcements_write_admin" on announcements for all
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));
```

정렬: `is_pinned desc, created_at desc`.

### 2-2. 클라이언트 데이터 레이어

- `src/types/database.ts`에 `announcements` 테이블 타입 추가.
- `src/features/announcements/services/announcementsService.ts`: `fetchAnnouncements(teamId)`, `createAnnouncement(input)`, `updateAnnouncement(id, input)`, `deleteAnnouncement(id)`. (기존 `attendanceService.ts`와 동일한 형태 — supabase 클라이언트 직접 호출, 에러는 throw)
- `src/features/announcements/stores/announcementsStore.ts`: zustand 스토어. `announcements`, `loaded`, `loading`, `error`, `loadAnnouncements()`, `createAnnouncement(input)`, `updateAnnouncement(id, input)`, `deleteAnnouncement(id)`. `createAnnouncement` 성공 후 `notifyTeam(teamId, title, body 요약, excludeUserId)`를 호출 (기존 `pushService.ts`의 `notifyTeam` 그대로 재사용, 실패해도 조용히 무시 — `attendanceStore.ts`의 `createMatch`와 동일한 패턴).

### 2-3. UI

- `TeamHomeScreen.tsx`에 "공지사항" 섹션 추가: 최신 2~3개를 제목+본문 첫 줄만 미리보기로 보여주고, 총무 여부와 무관하게 "전체보기" 버튼 표시.
- `src/features/announcements/components/AnnouncementListModal.tsx`: 전체화면 슬라이드 Modal. 고정 공지 먼저, 그다음 최신순 전체 목록. 총무에게는 우측 하단 "+" FAB(기존 `AttendanceScreen`의 FAB 스타일 재사용)로 작성 모달 오픈. 각 항목 탭하면 상세 Modal 오픈.
- `src/features/announcements/components/AnnouncementDetailModal.tsx`: 제목/본문 전체, 작성일, 고정 여부 표시. 총무는 우측 상단에 케밥(⋮) 아이콘 → `AttendanceScreen`과 동일한 pageY 기반 앵커 팝오버로 "수정"/"삭제".
- `src/features/announcements/components/AnnouncementFormModal.tsx`: 작성/수정 공용 폼. 제목 `TextInput`, 내용 멀티라인 `TextInput`, "상단에 고정" 스위치(`Switch` 컴포넌트), "취소"/"저장" 버튼(기존 모달 버튼 스타일 재사용).
- 위 3개 컴포넌트는 `TeamHomeScreen.tsx`가 소유한 로컬 state로 열고 닫는다 (`listModalVisible`, `selectedAnnouncement`, `formModalVisible` 등) — react-navigation 스택 추가 없음, 기존 앱의 Modal 중심 패턴을 그대로 따른다.

## 범위 밖

- 예약 탭의 실제 기능(구장 검색/예약/결제)은 별도 스펙에서 다룬다.
- 공지사항 댓글, 읽음 확인(누가 읽었는지) 기능은 포함하지 않는다.
- 날씨 기반 실내/실외 추천 기능은 별도 스펙에서 다룬다.
