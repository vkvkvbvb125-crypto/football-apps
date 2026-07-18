# 네비게이션 재구성 + 공지사항 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5탭 구조(일정/정산/예약/분배/팀)를 확정하고, 팀 탭에 총무가 작성하면 팀원에게 알림이 가는 공지사항 기능을 추가한다.

**Architecture:** 네비게이션은 기존 `MainTabNavigator`(bottom-tabs) 구조를 유지한 채 탭 구성만 바꾼다(타이머 탭 제거, 예약 탭 추가, 타이머 콘텐츠는 분배 탭 안 토글로 이동). 공지사항은 새 react-navigation 스택을 도입하지 않고, 이 앱 전체에 이미 확립된 "Modal 중심" 패턴(AttendanceScreen의 생성/수정/케밥 팝오버)을 그대로 재사용한다.

**Tech Stack:** React Native 0.86 / Expo 57, TypeScript(strict), zustand, Supabase(Postgres/RLS), `@expo/vector-icons`.

## Global Constraints

- 테스트 프레임워크 없음(Jest/RNTL 미설치). 각 태스크 검증은 `npx tsc --noEmit` + `npx expo start --web` 수동 확인으로 대체.
- Supabase SQL은 마이그레이션 자동화가 없어 사용자가 대시보드 SQL Editor에서 직접 실행해야 함. 태스크 안에 정확한 SQL을 포함시키고, 실행을 요청하는 안내를 남긴다.
- 색상/스타일은 기존 값 재사용: 배경 `#0B0F0D`/`#141A17`/`#0F1512`, 테두리 `#22302A`, 텍스트 `#FFFFFF`/`#E7ECE9`/`#8A9490`/`#5A625E`, 강조 `#39D98A`, 위험 `#F87171`.
- DB 쓰기 권한: 조회는 `is_team_member(team_id)`, 작성/수정/삭제는 `is_team_admin(team_id)` — 기존 `matches` 테이블과 동일한 RLS 패턴.

---

### Task 1: 예약 탭 자리 만들기

**Files:**
- Create: `src/features/reservation/screens/ReservationScreen.tsx`
- Modify: `src/navigation/MainTabNavigator.tsx`

**Interfaces:**
- Produces: `ReservationScreen` 컴포넌트 (props 없음, `BottomTabScreenProps<any>` 받음 — 다른 탭 스크린과 동일한 시그니처)

- [ ] **Step 1: `ReservationScreen.tsx` 작성**

```tsx
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';

export function ReservationScreen(_props: BottomTabScreenProps<any>) {
  return (
    <ScreenGradient>
      <TabHeader title="예약" />
      <EmptyState emoji="🏟️" title="구장 예약 기능은 준비 중이에요" subtitle={'조금만 기다려주세요!'} />
    </ScreenGradient>
  );
}
```

- [ ] **Step 2: `MainTabNavigator.tsx`에 탭 등록**

`import { TimerScreen } from '../features/timer/screens/TimerScreen';` 아래에 추가:

```tsx
import { ReservationScreen } from '../features/reservation/screens/ReservationScreen';
```

`Tab.Screen name="Settlement"` 블록 다음, `Tab.Screen name="Assignment"` 앞에 추가:

```tsx
      <Tab.Screen
        name="Reservation"
        component={ReservationScreen}
        options={{ title: '예약', tabBarIcon: tabIcon('calendar-clear-outline', 'calendar-clear') }}
      />
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인**

Run: `npx expo start --web`
확인: 하단 탭에 "예약"이 새로 보이고, 탭을 누르면 "구장 예약 기능은 준비 중이에요" 화면이 뜨는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/features/reservation/screens/ReservationScreen.tsx src/navigation/MainTabNavigator.tsx
git commit -m "feat: 예약 탭 자리 추가 (준비중 화면)"
```

---

### Task 2: 타이머를 분배 탭에 통합

**Files:**
- Create: `src/features/timer/components/TimerPanel.tsx`
- Delete: `src/features/timer/screens/TimerScreen.tsx`
- Modify: `src/features/assignment/screens/AssignmentScreen.tsx`
- Modify: `src/navigation/MainTabNavigator.tsx`

**Interfaces:**
- Produces: `TimerPanel` 컴포넌트 (props 없음, 내부에서 `useTeamStore` 직접 사용 — `TimerScreen`이 하던 것과 동일)

- [ ] **Step 1: `TimerPanel.tsx` 작성 (TimerScreen의 콘텐츠를 그대로 옮기되 ScreenGradient/TabHeader/EmptyState 제거)**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { useTeamStore } from '../../team/stores/teamStore';

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function TimerPanel() {
  const members = useTeamStore((s) => s.members);

  const [quarterMinutes, setQuarterMinutes] = useState(10);
  const [quarterNumber, setQuarterNumber] = useState(1);
  const [remainingSeconds, setRemainingSeconds] = useState(quarterMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    setQueue(members.map((m) => m.id));
  }, [members]);

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          Vibration.vibrate(500);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const nameFor = (teamMemberId: string) => members.find((m) => m.id === teamMemberId)?.displayName ?? '멤버';

  const handleStartPause = () => setIsRunning((r) => !r);

  const handleReset = () => {
    setIsRunning(false);
    setRemainingSeconds(quarterMinutes * 60);
  };

  const handleNextQuarter = () => {
    setIsRunning(false);
    setQuarterNumber((q) => q + 1);
    setRemainingSeconds(quarterMinutes * 60);
  };

  const handleMinutesChange = (text: string) => {
    const value = Number(text) || 0;
    setQuarterMinutes(value);
    if (!isRunning) setRemainingSeconds(value * 60);
  };

  const rotateQueue = (memberId: string) => {
    setQueue((prev) => [...prev.filter((id) => id !== memberId), memberId]);
  };

  return (
    <View style={styles.content}>
      <Text style={styles.quarterLabel}>{quarterNumber}쿼터</Text>
      <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>

      <View style={styles.minutesRow}>
        <Text style={styles.minutesLabel}>쿼터 시간(분)</Text>
        <TextInput
          style={styles.minutesInput}
          value={String(quarterMinutes)}
          onChangeText={handleMinutesChange}
          keyboardType="number-pad"
          editable={!isRunning}
        />
      </View>

      <View style={styles.controlRow}>
        <Pressable style={styles.controlButton} onPress={handleReset}>
          <Text style={styles.controlButtonText}>초기화</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleStartPause}>
          <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={handleNextQuarter}>
          <Text style={styles.controlButtonText}>다음 쿼터</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>교체 대기 순서</Text>
      <Text style={styles.sectionHint}>이름을 누르면 맨 뒤로 이동해요 (방금 교체 들어간 사람)</Text>
      <View style={styles.queueList}>
        {queue.map((memberId, i) => (
          <Pressable key={memberId} style={styles.queueRow} onPress={() => rotateQueue(memberId)}>
            <Text style={styles.queueOrder}>{i + 1}</Text>
            <Text style={styles.queueName}>{nameFor(memberId)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },
  quarterLabel: {
    marginTop: 12,
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 14,
  },
  timeDisplay: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  minutesLabel: {
    color: '#8A9490',
    fontSize: 13,
  },
  minutesInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    width: '100%',
  },
  controlButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  controlButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#39D98A',
  },
  primaryButtonText: {
    color: '#0B0F0D',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    marginTop: 36,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHint: {
    alignSelf: 'flex-start',
    marginTop: 4,
    color: '#5A625E',
    fontSize: 11,
  },
  queueList: {
    width: '100%',
    marginTop: 12,
    gap: 6,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  queueOrder: {
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 12,
    width: 18,
  },
  queueName: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});
```

- [ ] **Step 2: 옛 `TimerScreen.tsx` 삭제**

```bash
rm src/features/timer/screens/TimerScreen.tsx
```

- [ ] **Step 3: `AssignmentScreen.tsx`에 분배/타이머 토글 추가**

import 블록 맨 위, `import { useEffect } from 'react';`를:

```tsx
import { useEffect, useState } from 'react';
```

로 교체. 그다음 `import { useAssignmentStore } from '../stores/assignmentStore';` 아래에 추가:

```tsx
import { TimerPanel } from '../../timer/components/TimerPanel';
```

`export function AssignmentScreen({ navigation }: BottomTabScreenProps<any>) {` 바로 다음 줄(첫 hook 선언부 앞)에 추가:

```tsx
  const [view, setView] = useState<'assign' | 'timer'>('assign');
```

`<TabHeader title="분배" />` 바로 다음에 토글 UI 추가:

```tsx
      <TabHeader title="분배" />
      <View style={styles.viewToggleRow}>
        <Pressable
          style={[styles.viewToggle, view === 'assign' && styles.viewToggleActive]}
          onPress={() => setView('assign')}
        >
          <Text style={[styles.viewToggleText, view === 'assign' && styles.viewToggleTextActive]}>분배</Text>
        </Pressable>
        <Pressable
          style={[styles.viewToggle, view === 'timer' && styles.viewToggleActive]}
          onPress={() => setView('timer')}
        >
          <Text style={[styles.viewToggleText, view === 'timer' && styles.viewToggleTextActive]}>타이머</Text>
        </Pressable>
      </View>
```

기존 `{!activeTeam ? (` 로 시작하는 조건부 렌더링 블록 전체를 `view === 'timer'`일 때 `<TimerPanel />`을 보여주도록 감싼다. 정확히는, 현재:

```tsx
      {!activeTeam ? (
        <EmptyState
          emoji="👥"
          title="팀에 가입하면 팀분배가 표시돼요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : loading && !loaded ? (
```

을 아래로 교체 (첫 줄만 변경):

```tsx
      {!activeTeam ? (
        <EmptyState
          emoji="👥"
          title="팀에 가입하면 팀분배가 표시돼요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : view === 'timer' ? (
        <ScrollView>
          <TimerPanel />
        </ScrollView>
      ) : loading && !loaded ? (
```

`ScrollView`는 이미 `react-native`에서 import되어 있으므로(파일 상단 확인) 추가 import 불필요.

`styles` 객체에 아래 스타일 추가 (`list: {...}` 위에):

```tsx
  viewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  viewToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  viewToggleActive: {
    backgroundColor: '#39D98A',
    borderColor: '#39D98A',
  },
  viewToggleText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  viewToggleTextActive: {
    color: '#0B0F0D',
  },
```

- [ ] **Step 4: `MainTabNavigator.tsx`에서 Timer 탭 제거**

```tsx
import { TimerScreen } from '../features/timer/screens/TimerScreen';
```

줄 삭제. 그리고:

```tsx
      <Tab.Screen
        name="Timer"
        component={TimerScreen}
        options={{ title: '타이머', tabBarIcon: tabIcon('stopwatch-outline', 'stopwatch') }}
      />
```

블록 삭제.

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (특히 `TimerScreen` 참조가 다른 곳에 안 남아있는지 확인)

- [ ] **Step 6: 수동 확인**

Run: `npx expo start --web`
확인:
1. 하단 탭에서 "타이머"가 사라졌는지
2. "분배" 탭 상단에 "분배 / 타이머" 토글이 보이는지
3. "타이머" 토글 누르면 기존 타이머 화면(쿼터 표시, 시작/일시정지, 교체 대기열)이 그대로 동작하는지
4. "분배" 토글로 돌아가면 기존 분배 목록이 그대로 보이는지

- [ ] **Step 7: 커밋**

```bash
git add src/features/timer/components/TimerPanel.tsx src/features/assignment/screens/AssignmentScreen.tsx src/navigation/MainTabNavigator.tsx
git rm src/features/timer/screens/TimerScreen.tsx
git commit -m "refactor: 타이머를 분배 탭 안 토글로 통합"
```

---

### Task 3: 공지사항 DB 스키마 + 타입

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `Database['public']['Tables']['announcements']['Row' | 'Insert' | 'Update']` 타입 — Task 4에서 사용

- [ ] **Step 1: `schema.sql`에 테이블 추가**

`-- =========================================================` 로 시작하는 "헬퍼 함수" 섹션 주석 바로 위(즉 `notifications` 테이블 정의 다음)에 추가:

```sql
-- ---------------------------------------------------------
-- 10. announcements: 총무가 작성하는 공지사항 (작성 시 알림 발송)
-- ---------------------------------------------------------
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
```

- [ ] **Step 2: RLS 활성화 + 정책 추가**

`alter table notifications enable row level security;` 다음 줄에 추가:

```sql
alter table announcements enable row level security;
```

파일 맨 끝(`notifications_update_own` 정책 다음)에 추가:

```sql

-- announcements: 팀원 조회 가능, 작성/수정/삭제는 총무만
create policy "announcements_select" on announcements for select using (is_team_member(team_id));
create policy "announcements_write_admin" on announcements for all
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));
```

- [ ] **Step 3: `database.ts`에 타입 추가**

`notifications: { ... };` 테이블 정의 다음, `Views: Record<string, never>;` 앞에 추가:

```tsx
      announcements: {
        Row: {
          id: string;
          team_id: string;
          author_id: string;
          title: string;
          body: string;
          is_pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          team_id: string;
          author_id: string;
          title: string;
          body: string;
          is_pinned?: boolean;
        };
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋 + 사용자에게 SQL 실행 요청**

```bash
git add supabase/schema.sql src/types/database.ts
git commit -m "feat: announcements 테이블 스키마 + 타입 추가"
```

커밋 후 사용자에게 Step 1~2의 SQL을 Supabase 대시보드 SQL Editor에서 실행해달라고 안내한다 (새 테이블 생성 + RLS 정책 적용).

---

### Task 4: 공지사항 데이터 레이어 (service + store)

**Files:**
- Create: `src/features/announcements/services/announcementsService.ts`
- Create: `src/features/announcements/stores/announcementsStore.ts`

**Interfaces:**
- Consumes: `Database['public']['Tables']['announcements']['Row']` (Task 3), `notifyTeam` from `src/features/notifications/services/pushService.ts` (기존)
- Produces:
  - `AnnouncementRow` 타입, `fetchAnnouncements(teamId): Promise<AnnouncementRow[]>`, `createAnnouncement(input: CreateAnnouncementInput)`, `updateAnnouncement(id, input: UpdateAnnouncementInput)`, `deleteAnnouncement(id)` — Task 5/6의 UI가 `useAnnouncementsStore`를 통해서만 사용
  - `useAnnouncementsStore`: `{ announcements: AnnouncementRow[], loaded, loading, error, loadAnnouncements(), createAnnouncement(input: { title, body, isPinned }), updateAnnouncement(id, input: { title, body, isPinned }), deleteAnnouncement(id) }`

- [ ] **Step 1: `announcementsService.ts` 작성**

```ts
import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

export type AnnouncementRow = Database['public']['Tables']['announcements']['Row'];

export async function fetchAnnouncements(teamId: string): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('team_id', teamId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CreateAnnouncementInput {
  teamId: string;
  authorId: string;
  title: string;
  body: string;
  isPinned: boolean;
}

export async function createAnnouncement(input: CreateAnnouncementInput) {
  const { error } = await supabase.from('announcements').insert({
    team_id: input.teamId,
    author_id: input.authorId,
    title: input.title,
    body: input.body,
    is_pinned: input.isPinned,
  });
  if (error) throw error;
}

export interface UpdateAnnouncementInput {
  title: string;
  body: string;
  isPinned: boolean;
}

export async function updateAnnouncement(id: string, input: UpdateAnnouncementInput) {
  const { error } = await supabase
    .from('announcements')
    .update({
      title: input.title,
      body: input.body,
      is_pinned: input.isPinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: `announcementsStore.ts` 작성**

```ts
import { create } from 'zustand';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { notifyTeam } from '../../notifications/services/pushService';
import {
  createAnnouncement as createAnnouncementRequest,
  deleteAnnouncement as deleteAnnouncementRequest,
  fetchAnnouncements,
  updateAnnouncement as updateAnnouncementRequest,
  type AnnouncementRow,
  type UpdateAnnouncementInput,
} from '../services/announcementsService';

interface AnnouncementsState {
  announcements: AnnouncementRow[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadAnnouncements: () => Promise<void>;
  createAnnouncement: (input: { title: string; body: string; isPinned: boolean }) => Promise<void>;
  updateAnnouncement: (id: string, input: UpdateAnnouncementInput) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
}

export const useAnnouncementsStore = create<AnnouncementsState>((set, get) => ({
  announcements: [],
  loaded: false,
  loading: false,
  error: null,
  loadAnnouncements: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      const announcements = await fetchAnnouncements(activeTeam.team.id);
      set({ announcements, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항을 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  createAnnouncement: async (input) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      await createAnnouncementRequest({ ...input, teamId: activeTeam.team.id, authorId: activeTeam.membershipId });
      await get().loadAnnouncements();

      const myUserId = useAuthStore.getState().session?.user.id;
      notifyTeam(activeTeam.team.id, `${activeTeam.team.name} 공지사항`, input.title, myUserId).catch(() => {
        // 알림 전송 실패는 조용히 무시 (공지 작성 자체는 이미 성공)
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항 작성에 실패했습니다.', loading: false });
    }
  },
  updateAnnouncement: async (id, input) => {
    set({ loading: true, error: null });
    try {
      await updateAnnouncementRequest(id, input);
      await get().loadAnnouncements();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항 수정에 실패했습니다.', loading: false });
    }
  },
  deleteAnnouncement: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteAnnouncementRequest(id);
      await get().loadAnnouncements();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항 삭제에 실패했습니다.', loading: false });
    }
  },
}));
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/features/announcements/services/announcementsService.ts src/features/announcements/stores/announcementsStore.ts
git commit -m "feat: 공지사항 데이터 레이어(service, store) 추가"
```

(이 태스크는 아직 UI가 없어 화면으로 확인 불가 — 타입체크로만 검증하고 다음 태스크에서 실제로 써본다.)

---

### Task 5: 공지 작성 흐름 (Form 모달 + 팀 탭 섹션)

**Files:**
- Create: `src/features/announcements/components/AnnouncementFormModal.tsx`
- Modify: `src/features/team/screens/TeamHomeScreen.tsx`

**Interfaces:**
- Consumes: `useAnnouncementsStore` (Task 4), `AnnouncementRow` (Task 4)
- Produces: `AnnouncementFormModal({ visible, editing: AnnouncementRow | null, onClose, onSubmit(input: {title,body,isPinned}) })` — Task 6에서도 그대로 재사용(수정 흐름)

- [ ] **Step 1: `AnnouncementFormModal.tsx` 작성**

```tsx
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { AnnouncementRow } from '../services/announcementsService';

interface AnnouncementFormModalProps {
  visible: boolean;
  editing: AnnouncementRow | null;
  onClose: () => void;
  onSubmit: (input: { title: string; body: string; isPinned: boolean }) => void;
}

export function AnnouncementFormModal({ visible, editing, onClose, onSubmit }: AnnouncementFormModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(editing?.title ?? '');
    setBody(editing?.body ?? '');
    setIsPinned(editing?.is_pinned ?? false);
  }, [visible, editing]);

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim(), isPinned });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{editing ? '공지 수정' : '공지 작성'}</Text>

          <TextInput
            style={styles.input}
            placeholder="제목"
            placeholderTextColor="#5A625E"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.bodyInput]}
            placeholder="내용"
            placeholderTextColor="#5A625E"
            value={body}
            onChangeText={setBody}
            multiline
          />

          <View style={styles.pinRow}>
            <Text style={styles.pinLabel}>상단에 고정</Text>
            <Switch
              value={isPinned}
              onValueChange={setIsPinned}
              trackColor={{ false: '#22302A', true: '#39D98A' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={handleSubmit}>
              <Text style={styles.confirmText}>저장</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#141A17',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  bodyInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pinLabel: {
    color: '#E7ECE9',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1B231F',
  },
  cancelText: {
    color: '#8A9490',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#39D98A',
  },
  confirmText: {
    color: '#0B0F0D',
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: `TeamHomeScreen.tsx`에 공지사항 섹션 + 작성 흐름 연결**

import 블록 맨 위를:

```tsx
import { useState } from 'react';
import { Pressable, Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { FieldBackground } from '../../../components/FieldBackground';
import { ScreenGradient } from '../../../components/ScreenGradient';
```

아래로 교체:

```tsx
import { useEffect, useState } from 'react';
import { Pressable, Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { AnnouncementFormModal } from '../../announcements/components/AnnouncementFormModal';
import { FieldBackground } from '../../../components/FieldBackground';
import { ScreenGradient } from '../../../components/ScreenGradient';
```

`export function TeamHomeScreen() {` 함수 본문을:

```tsx
export function TeamHomeScreen() {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const signOut = useAuthStore((s) => s.signOut);
  const [copied, setCopied] = useState(false);

  if (!activeTeam) return null;
```

아래로 교체:

```tsx
export function TeamHomeScreen() {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const signOut = useAuthStore((s) => s.signOut);
  const [copied, setCopied] = useState(false);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const createAnnouncement = useAnnouncementsStore((s) => s.createAnnouncement);
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    if (activeTeam) loadAnnouncements();
  }, [activeTeam?.team.id]);

  if (!activeTeam) return null;
```

`</View>` (invite card를 감싸는 `{isAdmin && (...)}` 블록이 끝나는 지점, 즉 `styles.content` `<View>`가 닫히기 직전) 바로 앞에 공지사항 섹션 추가. 현재:

```tsx
      <View style={styles.content}>
        {isAdmin && (
          <View style={styles.inviteCard}>
            ...
          </View>
        )}
      </View>
    </ScrollView>
    </ScreenGradient>
  );
}
```

을 아래로 교체:

```tsx
      <View style={styles.content}>
        {isAdmin && (
          <View style={styles.inviteCard}>
            <View>
              <Text style={styles.inviteLabel}>초대 코드</Text>
              <Text style={styles.inviteCode}>{activeTeam.team.invite_code}</Text>
            </View>
            <View style={styles.inviteButtons}>
              <Pressable style={styles.copyButton} onPress={handleCopyInviteCode}>
                <Text style={styles.copyButtonText}>{copied ? '복사됨' : '복사'}</Text>
              </Pressable>
              <Pressable style={styles.shareButton} onPress={handleShareInvite}>
                <Text style={styles.shareButtonText}>공유</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.announceSection}>
          <View style={styles.announceHeader}>
            <Text style={styles.announceTitle}>공지사항</Text>
            {isAdmin && (
              <Pressable onPress={() => setFormVisible(true)} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={20} color="#39D98A" />
              </Pressable>
            )}
          </View>
          {announcements.length === 0 ? (
            <Text style={styles.announceEmpty}>등록된 공지가 없어요</Text>
          ) : (
            announcements.slice(0, 3).map((a) => (
              <View key={a.id} style={styles.announceItem}>
                {a.is_pinned && <Ionicons name="pin" size={12} color="#39D98A" style={styles.announcePinIcon} />}
                <View style={styles.announceItemText}>
                  <Text style={styles.announceItemTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={styles.announceItemBody} numberOfLines={1}>
                    {a.body}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>

    <AnnouncementFormModal
      visible={formVisible}
      editing={null}
      onClose={() => setFormVisible(false)}
      onSubmit={(input) => {
        createAnnouncement(input);
        setFormVisible(false);
      }}
    />
    </ScreenGradient>
  );
}
```

(주의: 이 단계에서는 `<ScreenGradient>`가 `<ScrollView>`와 `<AnnouncementFormModal />`을 모두 감싸도록 최상위 반환문 구조가 바뀐다 — 기존 코드의 `<ScreenGradient><ScrollView>...</ScrollView></ScreenGradient>` 두 줄짜리 닫는 태그 위치가 바뀌는 것에 주의.)

`styles` 객체 맨 끝(`shareButtonText: {...},` 다음)에 추가:

```tsx
  announceSection: {
    marginTop: 20,
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 10,
  },
  announceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announceTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  announceEmpty: {
    color: '#5A625E',
    fontSize: 12,
  },
  announceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  announcePinIcon: {
    marginTop: 2,
  },
  announceItemText: {
    flex: 1,
  },
  announceItemTitle: {
    color: '#E7ECE9',
    fontSize: 13,
    fontWeight: '700',
  },
  announceItemBody: {
    marginTop: 2,
    color: '#8A9490',
    fontSize: 12,
  },
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인**

Run: `npx expo start --web`
확인:
1. 총무 계정으로 "팀" 탭 열기 → "공지사항" 섹션이 보이고 "+" 아이콘이 보이는지
2. "+" 눌러서 제목/내용 입력, "고정" 스위치 켜보고 "저장" → 섹션에 방금 쓴 공지가 핀 아이콘과 함께 보이는지
3. 다른(비총무) 계정으로 같은 팀 접속 시 "+" 아이콘 없이 공지 목록만 보이는지, 알림벨에 배지가 뜨는지

- [ ] **Step 5: 커밋**

```bash
git add src/features/announcements/components/AnnouncementFormModal.tsx src/features/team/screens/TeamHomeScreen.tsx
git commit -m "feat: 공지사항 작성 흐름 (팀 탭 섹션 + 작성 모달)"
```

---

### Task 6: 공지사항 전체보기 + 상세/수정/삭제

**Files:**
- Create: `src/features/announcements/components/AnnouncementListModal.tsx`
- Create: `src/features/announcements/components/AnnouncementDetailModal.tsx`
- Modify: `src/features/team/screens/TeamHomeScreen.tsx`

**Interfaces:**
- Consumes: `AnnouncementFormModal`(Task 5), `useAnnouncementsStore`(Task 4)
- Produces: 없음 (이 태스크가 마지막 소비자)

- [ ] **Step 1: `AnnouncementListModal.tsx` 작성**

```tsx
import { Pressable, ScrollView, StyleSheet, Text, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AnnouncementRow } from '../services/announcementsService';

interface AnnouncementListModalProps {
  visible: boolean;
  announcements: AnnouncementRow[];
  isAdmin: boolean;
  onClose: () => void;
  onSelect: (announcement: AnnouncementRow) => void;
  onCreate: () => void;
}

export function AnnouncementListModal({
  visible,
  announcements,
  isAdmin,
  onClose,
  onSelect,
  onCreate,
}: AnnouncementListModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>공지사항</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        {announcements.length === 0 ? (
          <Text style={styles.emptyText}>등록된 공지가 없어요</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {announcements.map((a) => (
              <Pressable key={a.id} style={styles.item} onPress={() => onSelect(a)}>
                <View style={styles.itemHeader}>
                  {a.is_pinned && <Ionicons name="pin" size={12} color="#39D98A" />}
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                </View>
                <Text style={styles.itemBody} numberOfLines={2}>
                  {a.body}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {isAdmin && (
          <Pressable style={styles.fab} onPress={onCreate}>
            <Ionicons name="add" size={28} color="#0B0F0D" />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B0F0D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 40,
    textAlign: 'center',
    color: '#5A625E',
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 12,
  },
  item: {
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  itemBody: {
    marginTop: 6,
    color: '#8A9490',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#39D98A',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 16px rgba(57,217,138,0.4)',
  },
});
```

- [ ] **Step 2: `AnnouncementDetailModal.tsx` 작성 (케밥 팝오버는 AttendanceScreen과 동일한 pageY 앵커 패턴)**

```tsx
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AnnouncementRow } from '../services/announcementsService';

interface AnnouncementDetailModalProps {
  announcement: AnnouncementRow | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (announcement: AnnouncementRow) => void;
  onDelete: (announcement: AnnouncementRow) => void;
}

export function AnnouncementDetailModal({
  announcement,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
}: AnnouncementDetailModalProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchorY, setMenuAnchorY] = useState(0);

  if (!announcement) return null;

  const dateLabel = new Date(announcement.created_at).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <Modal visible={!!announcement} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {announcement.is_pinned && <Ionicons name="pin" size={13} color="#39D98A" />}
                <Text style={styles.dateText}>{dateLabel}</Text>
              </View>
              {isAdmin && (
                <Pressable
                  onPress={(e) => {
                    setMenuAnchorY(e.nativeEvent.pageY);
                    setMenuVisible(true);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#8A9490" />
                </Pressable>
              )}
            </View>
            <ScrollView style={styles.bodyScroll}>
              <Text style={styles.title}>{announcement.title}</Text>
              <Text style={styles.body}>{announcement.body}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuPopover, { top: menuAnchorY + 12 }]}>
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                onEdit(announcement);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color="#E7ECE9" />
              <Text style={styles.menuOptionText}>수정</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                onDelete(announcement);
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#F87171" />
              <Text style={[styles.menuOptionText, styles.menuOptionTextDanger]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '80%',
    backgroundColor: '#141A17',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: '#5A625E',
    fontSize: 12,
  },
  bodyScroll: {
    marginTop: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    marginTop: 12,
    color: '#E7ECE9',
    fontSize: 14,
    lineHeight: 21,
  },
  menuOverlay: {
    flex: 1,
  },
  menuPopover: {
    position: 'absolute',
    right: 20,
    width: 160,
    backgroundColor: '#141A17',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22302A',
    overflow: 'hidden',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.4)',
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuOptionText: {
    color: '#E7ECE9',
    fontSize: 14,
    fontWeight: '600',
  },
  menuOptionTextDanger: {
    color: '#F87171',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#22302A',
  },
});
```

- [ ] **Step 3: `TeamHomeScreen.tsx`에 "전체보기" + 상세/수정/삭제 연결**

import 블록에 추가 (`AnnouncementFormModal` import 다음):

```tsx
import { AnnouncementListModal } from '../../announcements/components/AnnouncementListModal';
import { AnnouncementDetailModal } from '../../announcements/components/AnnouncementDetailModal';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import { Alert, Platform } from 'react-native';
```

(`Alert`, `Platform`은 이미 `react-native`에서 다른 항목과 함께 import되고 있을 수 있으니, 기존 `import { Pressable, Share, ScrollView, StyleSheet, Text, View } from 'react-native';` 줄에 `Alert, Platform`을 합쳐서 한 줄로 만든다 — 별도 import 줄을 두 개 만들지 않는다):

```tsx
import { Alert, Platform, Pressable, Share, ScrollView, StyleSheet, Text, View } from 'react-native';
```

store에서 `updateAnnouncement`, `deleteAnnouncement` 추가로 꺼내 쓰도록, Task 5에서 추가한 부분을:

```tsx
  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const createAnnouncement = useAnnouncementsStore((s) => s.createAnnouncement);
  const [formVisible, setFormVisible] = useState(false);
```

아래로 교체:

```tsx
  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const createAnnouncement = useAnnouncementsStore((s) => s.createAnnouncement);
  const updateAnnouncement = useAnnouncementsStore((s) => s.updateAnnouncement);
  const deleteAnnouncement = useAnnouncementsStore((s) => s.deleteAnnouncement);
  const [formVisible, setFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementRow | null>(null);
  const [listVisible, setListVisible] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementRow | null>(null);

  const handleOpenEdit = (a: AnnouncementRow) => {
    setSelectedAnnouncement(null);
    setEditingAnnouncement(a);
    setFormVisible(true);
  };

  const handleDeleteAnnouncement = (a: AnnouncementRow) => {
    const message = '이 공지를 삭제하시겠어요?';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        deleteAnnouncement(a.id);
        setSelectedAnnouncement(null);
      }
      return;
    }
    Alert.alert('공지 삭제', message, [
      { text: '아니오', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteAnnouncement(a.id);
          setSelectedAnnouncement(null);
        },
      },
    ]);
  };
```

Task 5에서 만든 "공지사항" 섹션 헤더(`announceHeader` View)를, "전체보기" 버튼을 포함하도록 교체. 현재:

```tsx
          <View style={styles.announceHeader}>
            <Text style={styles.announceTitle}>공지사항</Text>
            {isAdmin && (
              <Pressable onPress={() => setFormVisible(true)} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={20} color="#39D98A" />
              </Pressable>
            )}
          </View>
```

를 아래로 교체:

```tsx
          <View style={styles.announceHeader}>
            <Text style={styles.announceTitle}>공지사항</Text>
            <View style={styles.announceHeaderRight}>
              {isAdmin && (
                <Pressable
                  onPress={() => {
                    setEditingAnnouncement(null);
                    setFormVisible(true);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#39D98A" />
                </Pressable>
              )}
              <Pressable onPress={() => setListVisible(true)}>
                <Text style={styles.announceSeeAll}>전체보기</Text>
              </Pressable>
            </View>
          </View>
```

같은 섹션 안 미리보기 목록의 각 항목을 탭 가능하도록, 현재:

```tsx
            announcements.slice(0, 3).map((a) => (
              <View key={a.id} style={styles.announceItem}>
```

를 아래로 교체:

```tsx
            announcements.slice(0, 3).map((a) => (
              <Pressable key={a.id} style={styles.announceItem} onPress={() => setSelectedAnnouncement(a)}>
```

그리고 바로 아래 짝이 맞는 닫는 태그:

```tsx
                </View>
              </View>
            ))
```

를:

```tsx
                </View>
              </Pressable>
            ))
```

로 교체 (바깥쪽 `<View style={styles.announceItem}>`을 `<Pressable>`로 바꿨으니 닫는 태그도 맞춰야 함).

기존 `<AnnouncementFormModal ... onSubmit={(input) => { createAnnouncement(input); setFormVisible(false); }} />` 블록을 수정 지원하도록 교체. 현재:

```tsx
    <AnnouncementFormModal
      visible={formVisible}
      editing={null}
      onClose={() => setFormVisible(false)}
      onSubmit={(input) => {
        createAnnouncement(input);
        setFormVisible(false);
      }}
    />
    </ScreenGradient>
  );
}
```

를 아래로 교체:

```tsx
    <AnnouncementFormModal
      visible={formVisible}
      editing={editingAnnouncement}
      onClose={() => setFormVisible(false)}
      onSubmit={(input) => {
        if (editingAnnouncement) {
          updateAnnouncement(editingAnnouncement.id, input);
        } else {
          createAnnouncement(input);
        }
        setFormVisible(false);
      }}
    />
    <AnnouncementListModal
      visible={listVisible}
      announcements={announcements}
      isAdmin={isAdmin}
      onClose={() => setListVisible(false)}
      onSelect={(a) => {
        setListVisible(false);
        setSelectedAnnouncement(a);
      }}
      onCreate={() => {
        setListVisible(false);
        setEditingAnnouncement(null);
        setFormVisible(true);
      }}
    />
    <AnnouncementDetailModal
      announcement={selectedAnnouncement}
      isAdmin={isAdmin}
      onClose={() => setSelectedAnnouncement(null)}
      onEdit={handleOpenEdit}
      onDelete={handleDeleteAnnouncement}
    />
    </ScreenGradient>
  );
}
```

`styles` 객체에 추가 (`announceHeader: {...},` 다음):

```tsx
  announceHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  announceSeeAll: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 확인**

Run: `npx expo start --web`
확인:
1. "전체보기" 눌러서 전체 목록 모달이 뜨는지, 고정된 공지가 맨 위에 오는지
2. 항목 탭 → 상세 모달에서 제목/본문 전체가 보이는지
3. 총무 계정으로 상세 모달의 케밥(⋮) 눌러서 "수정"/"삭제" 팝오버가 눌린 위치 근처에 뜨는지
4. "수정" → 폼에 기존 값이 채워져 있고, 저장하면 반영되는지
5. "삭제" → 확인창 뜨고, 확인하면 목록/미리보기에서 사라지는지
6. 목록 모달에서 총무는 "+" FAB로 새 공지 작성 가능한지

- [ ] **Step 6: 커밋**

```bash
git add src/features/announcements/components/AnnouncementListModal.tsx src/features/announcements/components/AnnouncementDetailModal.tsx src/features/team/screens/TeamHomeScreen.tsx
git commit -m "feat: 공지사항 전체보기 + 상세/수정/삭제"
```
