# 팀 대표 지역 + 캘린더 전체 날짜 날씨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀이 대표 지역을 하나 설정해두면, 경기가 없는 날짜도 그 지역 기준 날씨를 캘린더에 보여준다.

**Architecture:** `teams` 테이블에 대표 지역 컬럼을 추가하고, `TeamHomeScreen.tsx`에 기존 `PlaceSearchModal`을 재사용한 설정 카드를 붙인다. `AttendanceScreen.tsx`의 캘린더 날씨 계산을 "이 달 경기들" 기준에서 "오늘부터 10일" 기준으로 바꿔서, 경기 있는 날은 그 경기 좌표를, 없는 날은 팀 대표 지역 좌표를 쓴다.

**Tech Stack:** 기존과 동일(React Native/Expo, Supabase, zustand).

## Global Constraints

- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit`(앱 루트: `c:\dev\football\app`) + 수동 확인으로 대체한다.
- Supabase SQL은 자동화 없음 — 사용자가 대시보드에서 직접 실행하며, 확인 후 다음 태스크로 진행한다.
- 브랜치: `feature/nav-and-announcements` (이미 체크아웃됨). 커밋은 이 브랜치에 쌓는다.
- 날씨 조회 캐싱은 다루지 않는다(스펙의 범위 밖 — 화면당 최대 11건의 조회가 발생할 수 있음을 감수한다).

---

### Task 1: DB 스키마 변경 (Supabase SQL 실행)

**Files:**
- 참고: `app/supabase/schema.sql` (레퍼런스 문서 갱신)

**Interfaces:**
- Produces: `teams.home_place_name`(text, nullable), `teams.home_address`(text, nullable), `teams.home_latitude`(double precision, nullable), `teams.home_longitude`(double precision, nullable).

- [ ] **Step 1: 사용자에게 아래 SQL을 Supabase 대시보드 → SQL Editor에서 실행해달라고 요청**

```sql
alter table teams
  add column home_place_name text,
  add column home_address text,
  add column home_latitude double precision,
  add column home_longitude double precision;
```

- [ ] **Step 2: 실행 완료 확인**

사용자가 "실행했어" 등으로 확인해줄 때까지 대기.

- [ ] **Step 3: `app/supabase/schema.sql` 문서에 반영**

`create table teams (...)` 블록의 `invite_code ...,` 줄 바로 아래에 추가:

```sql
  home_place_name text,
  home_address text,
  home_latitude double precision,
  home_longitude double precision,
```

- [ ] **Step 4: 커밋**

```bash
cd app
git add supabase/schema.sql
git commit -m "feat: 팀 대표 지역 컬럼 추가"
```

---

### Task 2: 타입 + 서비스 + 스토어

**Files:**
- Modify: `app/src/types/database.ts`
- Modify: `app/src/features/team/services/teamService.ts`
- Modify: `app/src/features/team/stores/teamStore.ts`

**Interfaces:**
- Consumes: Task 1에서 추가된 DB 컬럼.
- Produces: `export async function updateTeamHomeLocation(teamId: string, location: { placeName: string; address: string; latitude: number; longitude: number }): Promise<void>` (`teamService.ts`). `useTeamStore`에 `updateHomeLocation: (location: { placeName: string; address: string; latitude: number; longitude: number }) => Promise<void>` 액션 추가. Task 3이 이 액션을 그대로 쓴다.

- [ ] **Step 1: `database.ts`의 teams 타입에 필드 추가**

`app/src/types/database.ts`에서:

```typescript
      teams: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          name: string;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
        Relationships: [];
      };
```

다음으로 교체:

```typescript
      teams: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          home_place_name: string | null;
          home_address: string | null;
          home_latitude: number | null;
          home_longitude: number | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          name: string;
          created_by: string;
          home_place_name?: string | null;
          home_address?: string | null;
          home_latitude?: number | null;
          home_longitude?: number | null;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 2: `teamService.ts`에 `updateTeamHomeLocation` 추가**

`app/src/features/team/services/teamService.ts` 끝에 추가:

```typescript
export interface TeamHomeLocation {
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
}

export async function updateTeamHomeLocation(teamId: string, location: TeamHomeLocation) {
  const { error } = await supabase
    .from('teams')
    .update({
      home_place_name: location.placeName,
      home_address: location.address,
      home_latitude: location.latitude,
      home_longitude: location.longitude,
    })
    .eq('id', teamId);
  if (error) throw error;
}
```

- [ ] **Step 3: `teamStore.ts`에 `updateHomeLocation` 액션 추가**

`app/src/features/team/stores/teamStore.ts`의 import에 추가:

```typescript
import {
  createTeam as createTeamRequest,
  fetchMyMemberships,
  fetchTeamMembers,
  joinTeamByInvite as joinTeamByInviteRequest,
  updateTeamHomeLocation as updateTeamHomeLocationRequest,
  type TeamHomeLocation,
  type TeamMembership,
  type TeamMemberWithProfile,
} from '../services/teamService';
```

`TeamState` 인터페이스에 추가:

```typescript
  updateHomeLocation: (location: TeamHomeLocation) => Promise<void>;
```

스토어 구현(`joinTeam` 다음)에 추가:

```typescript
  updateHomeLocation: async (location) => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      await updateTeamHomeLocationRequest(activeTeam.team.id, location);
      await get().loadMemberships();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '대표 지역 설정에 실패했습니다.', loading: false });
    }
  },
```

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd app
git add src/types/database.ts src/features/team/services/teamService.ts src/features/team/stores/teamStore.ts
git commit -m "feat: 팀 대표 지역 타입 + 서비스 + 스토어 액션 추가"
```

---

### Task 3: `TeamHomeScreen.tsx`에 설정 카드 추가

**Files:**
- Modify: `app/src/features/team/screens/TeamHomeScreen.tsx`

**Interfaces:**
- Consumes: `useTeamStore`의 `updateHomeLocation`(Task 2), `PlaceSearchModal`(`../../attendance/components/PlaceSearchModal`), `PlaceResult`(`../../attendance/services/placeService`) — 둘 다 기존에 구현된 컴포넌트/타입을 그대로 재사용.
- Produces: 없음 (UI 추가).

- [ ] **Step 1: import 추가**

```typescript
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';
```

- [ ] **Step 2: 스토어 훅 추가**

`const [copied, setCopied] = useState(false);` 다음 줄에 추가:

```typescript
  const updateHomeLocation = useTeamStore((s) => s.updateHomeLocation);
```

- [ ] **Step 3: 대표 지역 카드 JSX 추가**

기존:

```typescript
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
      </View>
```

다음으로 교체:

```typescript
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

        {isAdmin && (
          <View style={styles.homeLocationCard}>
            <Text style={styles.homeLocationLabel}>팀 대표 지역</Text>
            <PlaceSearchModal
              value={activeTeam.team.home_place_name ? { name: activeTeam.team.home_place_name } : null}
              onSelect={(place: PlaceResult) =>
                updateHomeLocation({
                  placeName: place.name,
                  address: place.address,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
            />
            <Text style={styles.homeLocationHint}>경기 없는 날의 예상 날씨를 이 위치 기준으로 보여줘요</Text>
          </View>
        )}
      </View>
```

- [ ] **Step 4: 스타일 추가**

`inviteCard` 스타일 정의 다음에 추가:

```typescript
  homeLocationCard: {
    marginTop: 12,
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 10,
  },
  homeLocationLabel: {
    fontSize: 12,
    color: '#8A9490',
  },
  homeLocationHint: {
    fontSize: 11,
    color: '#5A625E',
  },
```

- [ ] **Step 5: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd app
git add src/features/team/screens/TeamHomeScreen.tsx
git commit -m "feat: 팀 홈 화면에 대표 지역 설정 카드 추가"
```

---

### Task 4: 캘린더 날씨를 오늘부터 10일 전체 날짜로 확장

**Files:**
- Modify: `app/src/features/attendance/screens/AttendanceScreen.tsx`

**Interfaces:**
- Consumes: `activeTeam.team.home_latitude`/`home_longitude`(Task 1~2로 확보됨).
- Produces: 없음 (최종 통합).

- [ ] **Step 1: `calendarWeather` 계산 useEffect 교체**

기존:

```typescript
  useEffect(() => {
    const eligible = matches.filter((m) => {
      if (m.latitude == null || m.longitude == null) return false;
      const hoursUntilMatch = (new Date(m.match_date).getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntilMatch <= 240 && hoursUntilMatch >= -3;
    });
    if (eligible.length === 0) {
      setCalendarWeather({});
      return;
    }

    let cancelled = false;
    Promise.all(
      eligible.map((m) =>
        fetchMatchWeather(m.latitude as number, m.longitude as number, m.match_date)
          .then((weather) => ({ match: m, weather }))
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
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
      setCalendarWeather(next);
    });
    return () => {
      cancelled = true;
    };
  }, [matches]);
```

다음으로 교체:

```typescript
  useEffect(() => {
    interface WeatherTarget {
      dateKey: string;
      latitude: number;
      longitude: number;
      matchDateIso: string;
    }

    const targets: WeatherTarget[] = [];
    const today = new Date();
    for (let i = 0; i <= 10; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() + i);
      const key = dateKey(day);

      const matchOnDay = matches.find((m) => {
        const d = new Date(m.match_date);
        return dateKey(d) === key && m.latitude != null && m.longitude != null;
      });

      if (matchOnDay) {
        targets.push({
          dateKey: key,
          latitude: matchOnDay.latitude as number,
          longitude: matchOnDay.longitude as number,
          matchDateIso: matchOnDay.match_date,
        });
      } else if (activeTeam?.team.home_latitude != null && activeTeam?.team.home_longitude != null) {
        const noon = new Date(day);
        noon.setHours(12, 0, 0, 0);
        targets.push({
          dateKey: key,
          latitude: activeTeam.team.home_latitude,
          longitude: activeTeam.team.home_longitude,
          matchDateIso: noon.toISOString(),
        });
      }
    }

    if (targets.length === 0) {
      setCalendarWeather({});
      return;
    }

    let cancelled = false;
    Promise.all(
      targets.map((t) =>
        fetchMatchWeather(t.latitude, t.longitude, t.matchDateIso)
          .then((weather) => ({ dateKey: t.dateKey, weather }))
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      results.forEach((r) => {
        if (r && r.weather.available) {
          const w = r.weather;
          const emoji =
            w.range === 'mid'
              ? w.amWeather?.includes('비') || w.pmWeather?.includes('비')
                ? '🌧️'
                : '⛅'
              : weatherEmoji(w.precipitationType ?? '0', w.sky ?? '1');
          next[r.dateKey] = emoji;
        }
      });
      setCalendarWeather(next);
    });
    return () => {
      cancelled = true;
    };
  }, [matches, activeTeam]);
```

- [ ] **Step 2: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 팀 탭 → 총무 계정으로 "팀 대표 지역" 카드에서 장소 검색으로 아무 곳이나 설정
2. 일정 탭으로 이동 → 경기가 없는 날짜들(오늘부터 10일 이내)에도 날짜 원 배경이 날씨 색조로 물드는지
3. 경기가 있는 날짜는 여전히 그 경기 좌표 기준 날씨가 우선하는지(대표 지역과 다른 색이어도 정상)
4. 대표 지역을 아직 설정 안 한 팀에서는 경기 없는 날에 아무 색도 안 뜨는지(기존과 동일)

- [ ] **Step 4: 커밋**

```bash
cd app
git add src/features/attendance/screens/AttendanceScreen.tsx
git commit -m "feat: 캘린더 날씨를 오늘부터 10일 전체 날짜로 확장(팀 대표 지역 활용)"
```

---

## Self-Review 결과

- **스펙 커버리지:** 데이터 모델(Task 1) / 서비스·스토어(Task 2) / 설정 UI(Task 3) / 캘린더 로직 확장(Task 4) — 스펙의 모든 섹션이 태스크로 매핑됨.
- **플레이스홀더 스캔:** 없음 — 모든 스텝에 실제 코드 포함.
- **타입 일관성:** `TeamHomeLocation`(Task 2, `placeName`/`address`/`latitude`/`longitude`)이 Task 3의 `updateHomeLocation` 호출 인자와 정확히 일치. `activeTeam.team.home_latitude`/`home_longitude`/`home_place_name` 필드명이 Task 2의 `Database['teams']['Row']` 타입과 Task 3·4의 실제 사용처에서 동일하게 쓰임.
