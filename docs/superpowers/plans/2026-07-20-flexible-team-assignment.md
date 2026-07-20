# 팀분배 - 팀 개수 자유화 + 실력태그 밸런싱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분배 화면에서 총무가 그룹 컬럼을 직접 추가/삭제해 팀 개수(2~5팀)를 조정하고, 랜덤 분배가 실력태그(상/중/하)를 고려해 균형있게 나누도록 한다.

**Architecture:** `matches` 테이블에 `team_count` 컬럼을 추가(기존 `quarter_minutes` 패턴과 동일)하고, `assignmentStore`의 `randomize`를 실력태그 버킷 기반 라운드로빈으로 교체, `moveMember`를 그룹 순환 방식으로 변경, `addGroup`/`removeLastGroup` 신규 액션을 추가한다. UI는 그룹 컬럼을 항상 렌더링하도록 바꾸고 추가/삭제 컨트롤을 붙인다.

**Tech Stack:** React Native + Expo (TypeScript), Zustand, Supabase (Postgres + RLS).

## Global Constraints

- 팀 개수는 2~5 사이 (DB CHECK 제약 + UI 버튼 조건부 렌더링으로 이중 방어).
- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit` + 수동 확인으로 대체.
- Supabase SQL은 사용자가 대시보드에서 직접 실행 후 확인받고 다음 태스크로 진행.
- 실력태그 밸런싱은 참석 확정(`status === 'attend'`) 인원만 대상으로 계산.

---

### Task 1: DB 스키마 변경 (`matches.team_count`)

**Files:**
- Modify: `app/supabase/schema.sql` (문서화 목적, 실제 실행은 사용자가 Supabase 대시보드에서)

**Interfaces:**
- Consumes: 없음
- Produces: `matches.team_count` 컬럼 (`int not null default 2 check (team_count between 2 and 5)`). Task 2 이후 모든 태스크가 이 컬럼을 사용.

- [ ] **Step 1: 사용자에게 실행할 SQL 안내**

다음 SQL을 Supabase 대시보드 SQL Editor에서 실행하도록 사용자에게 전달:

```sql
alter table matches add column team_count int not null default 2 check (team_count between 2 and 5);
```

- [ ] **Step 2: `schema.sql`에 반영**

`app/supabase/schema.sql`의 `matches` 테이블 정의에서:

```sql
create table matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_date timestamptz not null,
  location text,
  address text,
  latitude double precision,
  longitude double precision,
  place_category text,
  vote_deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'locked', 'completed')),
  quarter_minutes int not null default 10,
  created_by uuid not null references team_members(id),
  created_at timestamptz not null default now()
);
```

다음으로 교체 (`quarter_minutes` 다음 줄에 `team_count` 추가):

```sql
create table matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_date timestamptz not null,
  location text,
  address text,
  latitude double precision,
  longitude double precision,
  place_category text,
  vote_deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'locked', 'completed')),
  quarter_minutes int not null default 10,
  team_count int not null default 2 check (team_count between 2 and 5),
  created_by uuid not null references team_members(id),
  created_at timestamptz not null default now()
);
```

- [ ] **Step 3: 사용자 확인 대기**

사용자가 SQL을 실행했다고 확인하면 다음 태스크로 진행. 확인 전에는 코드 작업 시작하지 않는다.

---

### Task 2: 타입 + 서비스 헬퍼 추가

**Files:**
- Modify: `app/src/types/database.ts:69-100` (`matches` 테이블 타입)
- Modify: `app/src/features/attendance/services/attendanceService.ts` (끝에 함수 추가)
- Modify: `app/src/features/assignment/services/assignmentService.ts` (끝에 함수 추가)

**Interfaces:**
- Consumes: Task 1에서 만든 `matches.team_count` 컬럼
- Produces:
  - `Database['public']['Tables']['matches']['Row'].team_count: number` — Task 4, 5가 `match.team_count`로 참조
  - `export async function updateMatchTeamCount(matchId: string, teamCount: number): Promise<void>` (`attendanceService.ts`) — Task 4의 `addGroup`/`removeLastGroup`이 호출
  - `export function groupLabelsFor(teamCount: number): string[]` (`assignmentService.ts`) — Task 4, 5가 그룹 라벨 배열 생성에 사용

- [ ] **Step 1: `database.ts`의 `matches` 타입에 `team_count` 추가**

`app/src/types/database.ts`에서:

```typescript
      matches: {
        Row: {
          id: string;
          team_id: string;
          match_date: string;
          location: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_category: string | null;
          vote_deadline: string | null;
          status: MatchStatus;
          quarter_minutes: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          match_date: string;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_category?: string | null;
          vote_deadline?: string | null;
          status?: MatchStatus;
          quarter_minutes?: number;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [];
      };
```

다음으로 교체:

```typescript
      matches: {
        Row: {
          id: string;
          team_id: string;
          match_date: string;
          location: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_category: string | null;
          vote_deadline: string | null;
          status: MatchStatus;
          quarter_minutes: number;
          team_count: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          match_date: string;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_category?: string | null;
          vote_deadline?: string | null;
          status?: MatchStatus;
          quarter_minutes?: number;
          team_count?: number;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 2: `attendanceService.ts`에 `updateMatchTeamCount` 추가**

`app/src/features/attendance/services/attendanceService.ts` 끝에 추가:

```typescript
export async function updateMatchTeamCount(matchId: string, teamCount: number) {
  const { error } = await supabase.from('matches').update({ team_count: teamCount }).eq('id', matchId);
  if (error) throw error;
}
```

- [ ] **Step 3: `assignmentService.ts`에 `groupLabelsFor` 추가**

`app/src/features/assignment/services/assignmentService.ts` 끝에 추가:

```typescript
export function groupLabelsFor(teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, i) => String.fromCharCode(65 + i));
}
```

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd app
git add src/types/database.ts src/features/attendance/services/attendanceService.ts src/features/assignment/services/assignmentService.ts
git commit -m "feat: matches.team_count 타입 및 관련 서비스 헬퍼 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 팀 멤버 조회에 `skill_tag` 노출

**Files:**
- Modify: `app/src/features/team/services/teamService.ts:47-53` (`TeamMemberWithProfile` 인터페이스), `:85-95` (`fetchTeamMembers` 매핑)

**Interfaces:**
- Consumes: 없음 (기존 `team_members.skill_tag` 컬럼은 이미 존재하고 `select('*')`로 이미 조회되고 있음 — 반환 객체 매핑에서만 누락되어 있었음)
- Produces: `TeamMemberWithProfile.skillTag: SkillTag | null` — Task 4의 `randomize`가 `useTeamStore.getState().members`에서 이 필드로 실력태그 버킷을 나눔

- [ ] **Step 1: `TeamMemberWithProfile`에 `skillTag` 필드 추가**

`app/src/features/team/services/teamService.ts`에서:

```typescript
export interface TeamMemberWithProfile {
  id: string;
  userId: string;
  role: TeamMemberRow['role'];
  displayName: string;
  avatarUrl: string | null;
}
```

다음으로 교체:

```typescript
export interface TeamMemberWithProfile {
  id: string;
  userId: string;
  role: TeamMemberRow['role'];
  skillTag: TeamMemberRow['skill_tag'];
  displayName: string;
  avatarUrl: string | null;
}
```

- [ ] **Step 2: `fetchTeamMembers` 매핑에 `skillTag` 추가**

같은 파일에서:

```typescript
  return members.map((m) => {
    const profile = profilesById.get(m.user_id);
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role,
      displayName: profile?.display_name ?? '멤버',
      avatarUrl: profile?.avatar_url ?? null,
    };
  });
```

다음으로 교체:

```typescript
  return members.map((m) => {
    const profile = profilesById.get(m.user_id);
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role,
      skillTag: m.skill_tag,
      displayName: profile?.display_name ?? '멤버',
      avatarUrl: profile?.avatar_url ?? null,
    };
  });
```

- [ ] **Step 3: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
cd app
git add src/features/team/services/teamService.ts
git commit -m "feat: 팀 멤버 조회 결과에 실력태그(skillTag) 노출

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `assignmentStore.ts` 로직 교체

**Files:**
- Modify: `app/src/features/assignment/stores/assignmentStore.ts` (전체 재작성)

**Interfaces:**
- Consumes:
  - `groupLabelsFor(teamCount: number): string[]` (Task 2, `assignmentService.ts`)
  - `updateMatchTeamCount(matchId: string, teamCount: number): Promise<void>` (Task 2, `attendanceService.ts`)
  - `useTeamStore.getState().members: TeamMemberWithProfile[]`에서 `.skillTag` (Task 3)
  - `useAttendanceStore.getState().matches`의 각 항목에 `.team_count: number` (Task 2)
- Produces:
  - `moveMember(matchId: string, teamMemberId: string): Promise<void>` — 시그니처 변경(기존 3번째 인자 `groupLabel` 제거). Task 5가 이 새 시그니처로 호출.
  - `addGroup(matchId: string): Promise<void>` — 신규. Task 5가 호출.
  - `removeLastGroup(matchId: string): Promise<void>` — 신규. Task 5가 호출.

- [ ] **Step 1: 전체 파일 교체**

`app/src/features/assignment/stores/assignmentStore.ts` 전체를 다음으로 교체:

```typescript
import { create } from 'zustand';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { updateMatchTeamCount } from '../../attendance/services/attendanceService';
import { useTeamStore } from '../../team/stores/teamStore';
import { fetchAssignments, groupLabelsFor, saveAssignments, updateAssignment } from '../services/assignmentService';
import type { Database } from '../../../types/database';

type AssignmentRow = Database['public']['Tables']['team_assignments']['Row'];

interface AssignmentState {
  assignments: AssignmentRow[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadAssignments: () => Promise<void>;
  randomize: (matchId: string) => Promise<void>;
  moveMember: (matchId: string, teamMemberId: string) => Promise<void>;
  addGroup: (matchId: string) => Promise<void>;
  removeLastGroup: (matchId: string) => Promise<void>;
}

const SKILL_BUCKET_ORDER = ['상', '중', '하', '미지정'] as const;

export const useAssignmentStore = create<AssignmentState>((set, get) => ({
  assignments: [],
  loaded: false,
  loading: false,
  error: null,
  loadAssignments: async () => {
    const matchIds = useAttendanceStore.getState().matches.map((m) => m.id);
    set({ loading: true, error: null });
    try {
      const assignments = await fetchAssignments(matchIds);
      set({ assignments, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀분배를 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  randomize: async (matchId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    const attendeeIds = (match?.votes ?? [])
      .filter((v) => v.status === 'attend')
      .map((v) => v.team_member_id);

    const members = useTeamStore.getState().members;
    const buckets: Record<(typeof SKILL_BUCKET_ORDER)[number], string[]> = {
      상: [],
      중: [],
      하: [],
      미지정: [],
    };
    attendeeIds.forEach((teamMemberId) => {
      const skillTag = members.find((m) => m.id === teamMemberId)?.skillTag;
      buckets[skillTag ?? '미지정'].push(teamMemberId);
    });
    SKILL_BUCKET_ORDER.forEach((key) => {
      buckets[key] = [...buckets[key]].sort(() => Math.random() - 0.5);
    });

    const teamCount = match?.team_count ?? 2;
    const labels = groupLabelsFor(teamCount);
    const assignments: { teamMemberId: string; groupLabel: string }[] = [];
    SKILL_BUCKET_ORDER.forEach((key) => {
      buckets[key].forEach((teamMemberId, i) => {
        assignments.push({ teamMemberId, groupLabel: labels[i % teamCount] });
      });
    });

    set({ loading: true, error: null });
    try {
      await saveAssignments(matchId, assignments);
      await get().loadAssignments();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀분배에 실패했습니다.', loading: false });
    }
  },
  moveMember: async (matchId, teamMemberId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    const labels = groupLabelsFor(match?.team_count ?? 2);
    const current = get().assignments.find((a) => a.match_id === matchId && a.team_member_id === teamMemberId);
    const currentIndex = current ? labels.indexOf(current.group_label) : -1;
    const nextLabel = labels[(currentIndex + 1) % labels.length];
    try {
      await updateAssignment(matchId, teamMemberId, nextLabel);
      await get().loadAssignments();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '조정에 실패했습니다.' });
    }
  },
  addGroup: async (matchId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    if (!match || match.team_count >= 5) return;
    try {
      await updateMatchTeamCount(matchId, match.team_count + 1);
      await useAttendanceStore.getState().loadMatches();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀 추가에 실패했습니다.' });
    }
  },
  removeLastGroup: async (matchId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    if (!match || match.team_count <= 2) return;
    const labels = groupLabelsFor(match.team_count);
    const lastLabel = labels[labels.length - 1];
    const prevLabel = labels[labels.length - 2];
    const membersInLastGroup = get().assignments.filter(
      (a) => a.match_id === matchId && a.group_label === lastLabel
    );

    set({ loading: true, error: null });
    try {
      for (const a of membersInLastGroup) {
        await updateAssignment(matchId, a.team_member_id, prevLabel);
      }
      await updateMatchTeamCount(matchId, match.team_count - 1);
      await useAttendanceStore.getState().loadMatches();
      await get().loadAssignments();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀 삭제에 실패했습니다.', loading: false });
    }
  },
}));
```

- [ ] **Step 2: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음 (이 시점에는 `AssignmentScreen.tsx`가 아직 옛 `moveMember(matchId, teamMemberId, groupLabel)` 3-인자 시그니처로 호출 중이라 여기서 타입 에러가 날 수 있음 — Task 5에서 해결되므로 정상)

- [ ] **Step 3: 커밋**

```bash
cd app
git add src/features/assignment/stores/assignmentStore.ts
git commit -m "feat: 팀분배 랜덤 로직을 실력태그 밸런싱으로 교체, 그룹 추가/삭제 액션 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `AssignmentScreen.tsx` UI 변경

**Files:**
- Modify: `app/src/features/assignment/screens/AssignmentScreen.tsx` (전체)

**Interfaces:**
- Consumes: Task 2의 `groupLabelsFor`, Task 4의 `moveMember(matchId, teamMemberId)` / `addGroup(matchId)` / `removeLastGroup(matchId)`
- Produces: 없음 (최종 UI)

- [ ] **Step 1: import 추가**

`app/src/features/assignment/screens/AssignmentScreen.tsx` 상단:

```typescript
import { useEffect, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { TimerPanel } from '../../timer/components/TimerPanel';
```

다음으로 교체:

```typescript
import { useEffect, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { groupLabelsFor } from '../services/assignmentService';
import { TimerPanel } from '../../timer/components/TimerPanel';
```

- [ ] **Step 2: `GROUPS` 상수 제거**

`const GROUPS = ['A', 'B'];` 줄을 삭제.

- [ ] **Step 3: 스토어 훅에 `addGroup`/`removeLastGroup` 추가**

```typescript
  const randomize = useAssignmentStore((s) => s.randomize);
  const moveMember = useAssignmentStore((s) => s.moveMember);
```

다음으로 교체:

```typescript
  const randomize = useAssignmentStore((s) => s.randomize);
  const moveMember = useAssignmentStore((s) => s.moveMember);
  const addGroup = useAssignmentStore((s) => s.addGroup);
  const removeLastGroup = useAssignmentStore((s) => s.removeLastGroup);
```

- [ ] **Step 4: 그룹 렌더링 블록 교체**

기존:

```jsx
                {matchAssignments.length === 0 ? (
                  <Text style={styles.waitingText}>아직 분배되지 않았어요</Text>
                ) : (
                  <View style={styles.groupsRow}>
                    {GROUPS.map((group) => (
                      <View key={group} style={styles.groupColumn}>
                        <Text style={styles.groupTitle}>{group}팀</Text>
                        {matchAssignments
                          .filter((a) => a.group_label === group)
                          .map((a) => (
                            <Pressable
                              key={a.team_member_id}
                              disabled={!isAdmin}
                              style={({ pressed }) => [styles.memberChip, pressed && isAdmin && styles.pressedOpacity]}
                              hitSlop={6}
                              onPress={() => moveMember(match.id, a.team_member_id, group === 'A' ? 'B' : 'A')}
                            >
                              <Text style={styles.memberName}>{nameFor(a.team_member_id)}</Text>
                            </Pressable>
                          ))}
                      </View>
                    ))}
                  </View>
                )}
```

다음으로 교체:

```jsx
                {(() => {
                  const groupLabels = groupLabelsFor(match.team_count);
                  return (
                    <View style={styles.groupsRow}>
                      {groupLabels.map((group, groupIndex) => {
                        const isLastGroup = groupIndex === groupLabels.length - 1;
                        return (
                          <View key={group} style={styles.groupColumn}>
                            <View style={styles.groupHeader}>
                              <Text style={styles.groupTitle}>{group}팀</Text>
                              {isAdmin && isLastGroup && groupLabels.length > 2 && (
                                <Pressable onPress={() => removeLastGroup(match.id)} hitSlop={8}>
                                  <Ionicons name="trash-outline" size={14} color="#8A9490" />
                                </Pressable>
                              )}
                            </View>
                            {matchAssignments
                              .filter((a) => a.group_label === group)
                              .map((a) => (
                                <Pressable
                                  key={a.team_member_id}
                                  disabled={!isAdmin}
                                  style={({ pressed }) => [
                                    styles.memberChip,
                                    pressed && isAdmin && styles.pressedOpacity,
                                  ]}
                                  hitSlop={6}
                                  onPress={() => moveMember(match.id, a.team_member_id)}
                                >
                                  <Text style={styles.memberName}>{nameFor(a.team_member_id)}</Text>
                                </Pressable>
                              ))}
                          </View>
                        );
                      })}
                      {isAdmin && groupLabels.length < 5 && (
                        <Pressable
                          style={({ pressed }) => [styles.addGroupChip, pressed && styles.pressedOpacity]}
                          onPress={() => addGroup(match.id)}
                        >
                          <Ionicons name="add" size={16} color="#39D98A" />
                          <Text style={styles.addGroupText}>팀 추가</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })()}
```

- [ ] **Step 5: 스타일 수정**

기존:

```typescript
  waitingText: {
    marginTop: 12,
    color: '#5A625E',
    fontSize: 12,
  },
  groupsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  groupColumn: {
    flex: 1,
    gap: 6,
  },
  groupTitle: {
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
```

다음으로 교체:

```typescript
  groupsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  groupColumn: {
    flexBasis: '45%',
    flexGrow: 1,
    gap: 6,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  groupTitle: {
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 13,
  },
  addGroupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#39D98A',
    alignSelf: 'flex-start',
  },
  addGroupText: {
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 12,
  },
```

(`waitingText`는 더 이상 쓰이지 않으므로 삭제됨.)

- [ ] **Step 6: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 총무 계정으로 분배 화면 → 경기 카드에 분배 전에도 A/B 2개 빈 컬럼이 보이는지
2. "+ 팀 추가"를 3번 눌러 5팀(A~E)까지 늘어나는지, 5팀 상태에서 버튼이 사라지는지
3. "랜덤 분배" 실행 후 각 그룹에 상/중/하 태그가 고르게 섞였는지
4. 멤버 칩을 여러 번 탭해서 그룹을 순환하며(A→B→C→...) 마지막 그룹 다음에 다시 A로 돌아오는지
5. 마지막 그룹(E)에 멤버가 있는 상태에서 삭제 아이콘을 눌러 그 멤버들이 D팀으로 이동하고 컬럼이 사라지는지
6. 2팀(A/B) 상태에서 삭제 아이콘이 안 보이는지

- [ ] **Step 8: 커밋**

```bash
cd app
git add src/features/assignment/screens/AssignmentScreen.tsx
git commit -m "feat: 분배 화면에 팀 추가/삭제 UI 및 그룹 순환 이동 반영

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과

- **스펙 커버리지:** DB 스키마(Task 1) / 타입·서비스(Task 2) / 실력태그 노출(Task 3, 스펙에 명시되지 않았으나 `randomize`가 의존하는 실제 코드 갭이라 추가) / 스토어 로직(Task 4) / UI(Task 5) — 스펙의 모든 섹션이 태스크로 매핑됨.
- **플레이스홀더 스캔:** 없음 — 모든 스텝에 실제 코드 포함.
- **타입 일관성:** `groupLabelsFor(teamCount: number): string[]`이 Task 2에서 정의되고 Task 4(`randomize`/`moveMember`/`removeLastGroup`)와 Task 5(렌더링)에서 동일한 시그니처로 사용됨. `moveMember(matchId, teamMemberId)` 시그니처가 Task 4 정의와 Task 5 호출부에서 일치. `TeamMemberWithProfile.skillTag`가 Task 3 정의와 Task 4의 `randomize` 사용처에서 동일한 필드명으로 일치.
