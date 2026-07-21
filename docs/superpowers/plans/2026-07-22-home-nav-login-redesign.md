# 홈 탭 + 네비게이션 + 로그인 화면 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 탭을 홈·일정·경기운영·정산·팀 5개로 재구성하고, 홈 탭에 요약 대시보드를 새로 만들고, 로그인 화면을 실제 로고 이미지 + 파티클 스피어를 포함한 새 디자인으로 교체한다.

**Architecture:** 새 홈 화면은 기존 스토어(attendance/announcements/polls/team)만 읽는 순수 클라이언트 집계 화면이라 서버 변경이 없다. 네비게이션은 기존 `MainTabNavigator`를 교체하고 `ReservationScreen`을 제거한다. `ParticleSphere`는 선택적 `size` prop을 추가해 로그인 화면에서도 재사용한다.

**Tech Stack:** React Native(Expo SDK 57), TypeScript, Zustand, React Navigation bottom-tabs.

## Global Constraints

- 색상은 기존 테마 토큰만 사용: 배경 `#0F1512`, 카드 `#141A17`, 테두리 `#22302A`, 텍스트 `#FFFFFF`/`#8A9490`, 브랜드 `#2D5F3E`, 포인트(라임) `#4ADE80`, 경고 `#D2A34C`. 라임은 기존에 합의된 범위(알림배지/오늘날짜/FAB)를 벗어나 새로 추가하지 않는다.
- 새 DB 스키마/RLS/엣지함수 변경 없음.
- 테스트 프레임워크 없음 — 각 태스크는 `npx tsc --noEmit`(반드시 `app` 디렉토리에서 실행)과 브라우저 수동 확인으로 검증한다.
- Expo SDK 57 기준 문서(https://docs.expo.dev/versions/v57.0.0/)를 벗어나는 API를 새로 쓰지 않는다(이번 작업은 기존에 이미 쓰던 API만 사용해서 해당 없음).

---

### Task 1: 홈 화면 신규 작성

**Files:**
- Create: `src/features/home/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `useTeamStore().activeTeam`(`{team:{id}, membershipId}`), `useAttendanceStore().matches/loadMatches`(`MatchWithVotes[]` — `match_date: string`, `location: string|null`, `latitude/longitude: number|null`, `votes: {team_member_id, status}[]`, 오름차순 정렬됨), `useAnnouncementsStore().announcements/loadAnnouncements`(`is_pinned desc, created_at desc` 정렬됨), `usePollsStore().polls/loadPolls`(`{deadline: string|null, question: string, responses: {team_member_id}[]}[]`), `WeatherBadge`(`src/features/attendance/components/WeatherBadge.tsx`, props `latitude/longitude/matchDateIso`), `ScreenGradient`, `TabHeader`.
- Produces: `HomeScreen` 컴포넌트(`BottomTabScreenProps<any>` 받음) — Task 2에서 `MainTabNavigator`의 `Home` 탭으로 연결.

- [ ] **Step 1: `HomeScreen.tsx` 작성**

```tsx
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { TabHeader } from '../../../components/TabHeader';
import { WeatherBadge } from '../../attendance/components/WeatherBadge';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { usePollsStore } from '../../polls/stores/pollsStore';

const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  const dateLabel = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const timeLabel = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { dateLabel, timeLabel };
}

function formatDDay(iso: string) {
  const diffMs = new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const days = Math.round(diffMs / 86400000);
  if (days <= 0) return '오늘';
  return `D-${days}`;
}

export function HomeScreen({ navigation }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);

  const polls = usePollsStore((s) => s.polls);
  const loadPolls = usePollsStore((s) => s.loadPolls);

  useEffect(() => {
    if (!activeTeam) return;
    loadMatches();
    loadAnnouncements();
    loadPolls();
  }, [activeTeam?.team.id]);

  if (!activeTeam) return null;

  const now = Date.now();
  const nextMatch = matches.find((m) => new Date(m.match_date).getTime() >= now - NEXT_MATCH_GRACE_MS);
  const latestAnnouncement = announcements[0] ?? null;

  const myVoteOnNextMatch = nextMatch?.votes.find((v) => v.team_member_id === activeTeam.membershipId);
  const openUnansweredPoll = polls.find(
    (p) =>
      (p.deadline == null || new Date(p.deadline).getTime() > now) &&
      !p.responses.some((r) => r.team_member_id === activeTeam.membershipId)
  );

  let nudge: { text: string; onPress: () => void } | null = null;
  if (nextMatch && !myVoteOnNextMatch) {
    nudge = { text: '다음 경기 투표에 참여해주세요', onPress: () => navigation.navigate('Attendance') };
  } else if (openUnansweredPoll) {
    nudge = {
      text: `새 투표에 참여해주세요: ${openUnansweredPoll.question}`,
      onPress: () => navigation.navigate('Team'),
    };
  }

  return (
    <ScreenGradient>
      <TabHeader title="홈" />
      <ScrollView contentContainerStyle={styles.content}>
        {latestAnnouncement && (
          <Pressable style={styles.card} onPress={() => navigation.navigate('Team')}>
            <Text style={styles.cardLabel}>공지</Text>
            <Text style={styles.announceTitle} numberOfLines={1}>
              {latestAnnouncement.title}
            </Text>
            <Text style={styles.announceBody} numberOfLines={1}>
              {latestAnnouncement.body}
            </Text>
          </Pressable>
        )}

        {nextMatch ? (
          <View style={styles.card}>
            <View style={styles.matchHeaderRow}>
              <Text style={styles.cardLabel}>다음 경기</Text>
              <Text style={styles.dDayBadge}>{formatDDay(nextMatch.match_date)}</Text>
            </View>
            <Text style={styles.matchLine}>
              {formatMatchDate(nextMatch.match_date).dateLabel} · {nextMatch.location ?? '장소 미정'} ·{' '}
              {formatMatchDate(nextMatch.match_date).timeLabel}
            </Text>
            <WeatherBadge
              latitude={nextMatch.latitude}
              longitude={nextMatch.longitude}
              matchDateIso={nextMatch.match_date}
            />
            <Text style={styles.attendeeCount}>
              참석 {nextMatch.votes.filter((v) => v.status === 'attend').length}명
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>등록된 경기가 없어요</Text>
            <Text style={styles.emptySubtitle}>새 경기가 등록되면 여기에 보여드릴게요</Text>
          </View>
        )}

        {nudge && (
          <Pressable style={styles.nudgeCard} onPress={nudge.onPress}>
            <Text style={styles.nudgeText} numberOfLines={1}>
              {nudge.text}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 6,
  },
  cardLabel: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  announceTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  announceBody: {
    color: '#8A9490',
    fontSize: 12,
  },
  matchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dDayBadge: {
    color: '#2D5F3E',
    fontSize: 13,
    fontWeight: '800',
  },
  matchLine: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  attendeeCount: {
    marginTop: 4,
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyEmoji: {
    fontSize: 28,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#8A9490',
    fontSize: 12,
  },
  nudgeCard: {
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#22302A',
  },
  nudgeText: {
    color: '#D2A34C',
    fontSize: 13,
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: 타입 검증**

Run (반드시 `app` 디렉토리에서): `npx tsc --noEmit`
Expected: 에러 없음(이 시점엔 아직 어떤 네비게이터에도 연결 안 됐지만 파일 자체 타입은 통과해야 함).

- [ ] **Step 3: 커밋**

```bash
git add src/features/home/screens/HomeScreen.tsx
git commit -m "feat: 홈 화면 신규 작성 (공지 요약/다음 경기/미답변 유도)"
```

---

### Task 2: 네비게이션 재구성 (홈 탭 추가, 예약 탭 제거, 경기운영 탭 강조)

**Files:**
- Modify: `src/navigation/MainTabNavigator.tsx` (전체 교체)
- Modify: `src/features/assignment/screens/AssignmentScreen.tsx` (`TabHeader title` 한 줄)
- Delete: `src/features/reservation/screens/ReservationScreen.tsx` 및 `src/features/reservation/` 폴더

**Interfaces:**
- Consumes: Task 1에서 만든 `HomeScreen`(`src/features/home/screens/HomeScreen.tsx`의 named export `HomeScreen`).
- Produces: 5탭 `MainTabNavigator` — 이후 태스크 없음(이 태스크가 네비게이션 최종 상태).

- [ ] **Step 1: 예약 기능 폴더 삭제**

```bash
rm -rf src/features/reservation
```

- [ ] **Step 2: `MainTabNavigator.tsx` 전체 교체**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';
import { HomeScreen } from '../features/home/screens/HomeScreen';

const Tab = createBottomTabNavigator();

function tabIcon(outlineName: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? filledName : outlineName} size={22} color={color} />
  );
}

function assignmentTabIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        top: -14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? '#22543A' : '#173A26',
        borderWidth: 1.5,
        borderColor: '#2D5F3E',
      }}
    >
      <Ionicons name={focused ? 'football' : 'football-outline'} size={22} color="#FFFFFF" />
    </View>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#2D5F3E',
        tabBarInactiveTintColor: '#5A625E',
        tabBarStyle: {
          backgroundColor: '#0F1512',
          borderTopColor: '#1E2924',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: 64,
          paddingTop: 10,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: '홈', tabBarIcon: tabIcon('home-outline', 'home') }}
      />
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: '일정', tabBarIcon: tabIcon('calendar-outline', 'calendar') }}
      />
      <Tab.Screen
        name="Assignment"
        component={AssignmentScreen}
        options={{ title: '경기운영', tabBarIcon: assignmentTabIcon }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{ title: '정산', tabBarIcon: tabIcon('cash-outline', 'cash') }}
      />
      <Tab.Screen
        name="Team"
        component={TeamHomeScreen}
        options={{ title: '팀', tabBarIcon: tabIcon('shield-outline', 'shield') }}
      />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 3: `AssignmentScreen.tsx`의 탭 헤더 타이틀 변경**

`src/features/assignment/screens/AssignmentScreen.tsx`에서:

```tsx
<TabHeader title="분배" />
```

를 다음으로 교체:

```tsx
<TabHeader title="경기운영" />
```

- [ ] **Step 4: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음(특히 `reservation` 삭제로 인한 미해결 import 없어야 함 — `MainTabNavigator.tsx`가 유일한 참조처였음을 이미 확인함).

- [ ] **Step 5: 브라우저 수동 확인**

앱을 열어 하단 탭이 홈·일정·경기운영·정산·팀 순서로 5개 나오는지, 라벨 없이 아이콘만 보이는지, 경기운영 아이콘만 원형 배지 안에서 살짝 떠 있는지, 각 탭을 눌렀을 때 정상 전환되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/navigation/MainTabNavigator.tsx src/features/assignment/screens/AssignmentScreen.tsx src/features/reservation
git commit -m "feat: 하단 탭 재구성 (예약 -> 홈 교체, 경기운영 탭 원형 강조)"
```

---

### Task 3: `ParticleSphere` 인라인 크기 지원

**Files:**
- Modify: `src/features/assignment/components/ParticleSphere.tsx` (전체 교체)

**Interfaces:**
- Consumes: 없음(독립 컴포넌트).
- Produces: `ParticleSphere({ size? }: { size?: number })` — `size` 생략 시 기존과 동일한 전체화면 절대위치 배경(변경 없음, `AssignmentScreen.tsx`의 기존 `<ParticleSphere />` 호출부는 수정 불필요). `size` 지정 시 `width:size, height:size`인 상대위치 박스로 렌더링. Task 4에서 `<ParticleSphere size={150} />`로 사용.

- [ ] **Step 1: `ParticleSphere.tsx` 전체 교체**

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const PARTICLE_COUNT = 150;
const DEFAULT_SPHERE_RADIUS = 130;
const ROTATION_STEPS = 36;
const ROTATION_DURATION_MS = 26000;
const DOT_BASE_SIZE = 4;

interface ParticleSphereProps {
  size?: number;
}

interface ParticleFrames {
  key: number;
  y: number;
  size: number;
  xSteps: number[];
  opacitySteps: number[];
  scaleSteps: number[];
}

function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

function buildParticles(radius: number, dotBaseSize: number): ParticleFrames[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const y0 = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const theta0 = goldenAngle * i;
    const x0 = Math.cos(theta0) * radiusAtY;
    const z0 = Math.sin(theta0) * radiusAtY;
    const size = dotBaseSize * lerp(radiusAtY, 0, 1, 0.7, 1);
    const xSteps: number[] = [];
    const opacitySteps: number[] = [];
    const scaleSteps: number[] = [];
    for (let step = 0; step <= ROTATION_STEPS; step++) {
      const angle = (step / ROTATION_STEPS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = x0 * cos + z0 * sin;
      const z = -x0 * sin + z0 * cos;
      xSteps.push(x * radius - size / 2);
      opacitySteps.push(lerp(z, -1, 1, 0.12, 0.85));
      scaleSteps.push(lerp(z, -1, 1, 0.5, 1.15));
    }
    return { key: i, y: y0 * radius - size / 2, size, xSteps, opacitySteps, scaleSteps };
  });
}

export function ParticleSphere({ size }: ParticleSphereProps) {
  const radius = size ? size * 0.42 : DEFAULT_SPHERE_RADIUS;
  const dotBaseSize = size ? (DOT_BASE_SIZE * size) / 300 : DOT_BASE_SIZE;
  const particles = useMemo(() => buildParticles(radius, dotBaseSize), [radius, dotBaseSize]);
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    function run() {
      if (cancelled) return;
      rotation.setValue(0);
      Animated.timing(rotation, {
        toValue: 1,
        duration: ROTATION_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) run();
      });
    }
    run();
    return () => {
      cancelled = true;
      rotation.stopAnimation();
    };
  }, [rotation]);

  const inputRange = useMemo(
    () => Array.from({ length: ROTATION_STEPS + 1 }, (_, i) => i / ROTATION_STEPS),
    []
  );

  return (
    <View style={size ? { width: size, height: size } : styles.container} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p) => (
          <Animated.View
            key={p.key}
            style={[
              styles.dot,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                top: p.y,
                opacity: rotation.interpolate({ inputRange, outputRange: p.opacitySteps }),
                transform: [
                  { translateX: rotation.interpolate({ inputRange, outputRange: p.xSteps }) },
                  { scale: rotation.interpolate({ inputRange, outputRange: p.scaleSteps }) },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0F1512', overflow: 'hidden' },
  center: { position: 'absolute', top: '50%', left: '50%' },
  dot: { position: 'absolute', backgroundColor: '#4ADE80' },
});
```

- [ ] **Step 2: 타입 검증 + 경기운영 탭 회귀 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

브라우저에서 경기운영 탭을 열어 기존과 동일하게 전체화면 파티클 스피어가 회전하는지 확인(회귀 없어야 함 — `size` 생략 시 이전과 동일 동작).

- [ ] **Step 3: 커밋**

```bash
git add src/features/assignment/components/ParticleSphere.tsx
git commit -m "feat: ParticleSphere에 인라인 크기 옵션 추가"
```

---

### Task 4: 로그인 화면 개편

**Files:**
- Modify: `src/features/auth/screens/LoginScreen.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 3의 `ParticleSphere({ size })`, `assets/logo.png`(이미 존재 확인함, 177KB).
- Produces: 없음(최종 화면).

- [ ] **Step 1: `LoginScreen.tsx` 전체 교체**

```tsx
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { ParticleSphere } from '../../assignment/components/ParticleSphere';

export function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);

  return (
    <ScreenGradient>
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image source={require('../../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brandName}>
          킥<Text style={styles.brandNameAccent}>데이</Text>
        </Text>
        <Text style={styles.tagline}>우리 팀의 매주 그 시간</Text>
        <View style={styles.sphereWrap}>
          <ParticleSphere size={150} />
        </View>
      </View>

      <View style={styles.bottom}>
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.loginButton, pressed && styles.loginButtonPressed]}
          onPress={signIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator color="#3C1E1E" />
          ) : (
            <View style={styles.loginButtonContent}>
              <Ionicons name="chatbubble" size={18} color="#3C1E1E" />
              <Text style={styles.loginButtonText}>카카오로 시작하기</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          로그인 시 <Text style={styles.footnoteLink}>이용약관</Text> 및{' '}
          <Text style={styles.footnoteLink}>개인정보처리방침</Text>에 동의하게 됩니다
        </Text>
      </View>
    </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 140,
    paddingBottom: 56,
  },
  brand: {
    alignItems: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 22,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  brandNameAccent: {
    color: '#2D5F3E',
  },
  tagline: {
    marginTop: 10,
    fontSize: 14,
    color: '#8A9490',
  },
  sphereWrap: {
    marginTop: 12,
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    width: '100%',
    alignItems: 'center',
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#FEE500',
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    boxShadow: '0px 6px 12px rgba(254,229,0,0.35)',
  },
  loginButtonPressed: {
    opacity: 0.88,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginButtonText: {
    color: '#3C1E1E',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    marginTop: 16,
    color: '#8A9490',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  footnoteLink: {
    textDecorationLine: 'underline',
  },
  error: {
    marginBottom: 12,
    color: '#F87171',
    textAlign: 'center',
    fontSize: 13,
  },
});
```

- [ ] **Step 2: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 브라우저 수동 확인**

로그아웃 상태로 로그인 화면을 열어 로고 이미지(실제 킥데이 로고), 태그라인, 파티클 스피어, "카카오로 시작하기" 버튼, 하단 약관 문구(밑줄 두 단어)가 모두 보이는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/features/auth/screens/LoginScreen.tsx
git commit -m "feat: 로그인 화면 개편 (실제 로고 이미지, 파티클 스피어, 문구 변경)"
```
