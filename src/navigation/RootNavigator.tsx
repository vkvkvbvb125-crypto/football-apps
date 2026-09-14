import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../features/auth/stores/authStore';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { SignUpScreen } from '../features/auth/screens/SignUpScreen';
import { ForgotPasswordScreen } from '../features/auth/screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../features/auth/screens/ResetPasswordScreen';
import { useTeamStore } from '../features/team/stores/teamStore';
import { TeamStartScreen } from '../features/team/screens/TeamStartScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { TeamSettingsScreen } from '../features/team/screens/TeamSettingsScreen';
import { MySettingsScreen } from '../features/settings/screens/MySettingsScreen';
import { ProfileDetailScreen } from '../features/settings/screens/ProfileDetailScreen';
import { NotificationSettingsScreen } from '../features/settings/screens/NotificationSettingsScreen';
import { TermsScreen } from '../features/settings/screens/TermsScreen';
import { ThemeSettingsScreen } from '../features/settings/screens/ThemeSettingsScreen';
import { registerForPushNotifications } from '../features/notifications/services/pushService';
import * as Notifications from 'expo-notifications';
import { useNotificationsStore } from '../features/notifications/stores/notificationsStore';
import { useAttendanceStore } from '../features/attendance/stores/attendanceStore';
import { useSettlementStore } from '../features/settlement/stores/settlementStore';
import { useAnnouncementsStore } from '../features/announcements/stores/announcementsStore';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Text } from '../components/nativeText';
import { palettes, type Palette } from '../theme';
import { useColors, useThemeName, useThemed } from '../lib/useThemed';
import { TourProvider } from '../features/tour/TourProvider';

const Stack = createNativeStackNavigator();

/*
  React Navigation의 테마. 화면 전환 중 잠깐 보이는 바탕색을 정한다 —
  이게 안 맞으면 화면을 밀 때 반대 테마의 색이 한 번 스친다.

  ⚠ DarkTheme/DefaultTheme을 갈아야 한다. colors만 덮으면 나머지 값(text·border)이
    반대 테마로 남는다.
*/
const navThemeOf = (name: 'dark' | 'light') => {
  const base = name === 'light' ? DefaultTheme : DarkTheme;
  const c: Palette = palettes[name];
  return { ...base, colors: { ...base.colors, background: c.bgRoot, card: c.bgRoot, text: c.text, border: c.border } };
};

function LoadingScreen() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgScreen }}>
      <ActivityIndicator size="large" color={colors.green} />
    </View>
  );
}

/**
 * 레퍼런스의 순서를 그대로 따른다 (스펙 3절):
 *   200ms   중앙에 아주 약한 초록 빛
 *   300~800 공 등장 (opacity 0→1, scale 0.92→1)
 *   600~1100 로고 등장 (opacity 0→1, translateY 8→0)
 *   900~1400 화면 하단에 얇은 가로 빛이 퍼졌다 사라진다
 *
 * bounce·회전·파티클은 쓰지 않는다. 예전 버전은 글자가 하나씩 튀어 오르고 공이 한 바퀴
 * 굴러 들어왔는데, 레퍼런스의 조용하고 무거운 인상과는 다른 종류의 움직임이었다.
 */
/** 로고 뒤에서 번지는 빛의 지름. 로고 너비의 두 배쯤이라야 뒤에서 비추는 것으로 읽힌다 */
const GLOW = 420;

function SplashScreen() {
  const splashStyles = useThemed(makeSplash).styles;
  const colors = useColors();
  const glow = useRef(new Animated.Value(0)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fade = (v: Animated.Value, delay: number, duration: number) =>
      Animated.timing(v, { toValue: 1, delay, duration, useNativeDriver: true });

    Animated.parallel([
      fade(glow, 200, 500),
      // 공을 걷어내면서 로고가 주인공이 됐다 — 빛이 번진 직후 바로 이어 붙는다
      fade(logo, 380, 560),
      // 퍼졌다 사라진다 — 0에서 1로 갔다가 다시 0으로
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(sweep, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={splashStyles.root}>
      {/*
        공 뒤에서 번지는 빛.

        처음엔 borderRadius를 준 초록 View 한 장으로 때웠는데, 그건 글로우가 아니라
        가장자리가 딱 끊긴 초록 원판이었다 — 공 뒤에 접시를 받쳐 둔 것처럼 보였다.
        빛은 중심에서 바깥으로 서서히 사라져야 하므로 방사형 그라디언트가 필요하다.
        react-native-svg의 RadialGradient를 쓴다(이미 설치돼 있다).
      */}
      <Animated.View style={[splashStyles.glow, { opacity: glow }]} pointerEvents="none">
        <Svg width={GLOW} height={GLOW}>
          <Defs>
            <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.green} stopOpacity={0.34} />
              <Stop offset="0.45" stopColor={colors.green} stopOpacity={0.12} />
              <Stop offset="1" stopColor={colors.green} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#splashGlow)" />
        </Svg>
      </Animated.View>

      {/*
        축구공 렌더(축구공.png)를 걷어냈다.

        사진풍 3D 렌더라 흰 스페큘러와 바닥 그림자가 이미 구워져 있어서, 평평한 다크 UI 위에
        놓으면 혼자 다른 재질로 떠 있었다. 빛 위에 로고만 두면 남는 건 브랜드와 빛뿐이라
        훨씬 조용하다 — 스플래시가 보여줘야 하는 것도 그 둘이다.
      */}
      <Animated.View
        style={{
          opacity: logo,
          transform: [
            { translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        }}
      >
        <View style={splashStyles.logoRow}>
          <Text style={splashStyles.logo}>
            <Text style={{ color: colors.green }}>Kick</Text>
            <Text style={{ color: colors.text }}>Day</Text>
          </Text>
          <Ionicons name="football" size={28} color={colors.green} style={{ marginLeft: 10, marginBottom: 5 }} />
        </View>
      </Animated.View>

      {/* 하단 가로 빛 — 가운데가 밝고 양끝으로 사라진다.
          단색 막대로 두면 양끝이 칼로 자른 것처럼 끊긴다. 가로 그라디언트로 흘려보낸다. */}
      <Animated.View style={[splashStyles.sweep, { opacity: sweep }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(34,197,94,0)', colors.green, 'rgba(34,197,94,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const makeSplash = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgRoot },
  // 이제 화면 한가운데에 로고 하나뿐이라 빛도 그냥 가운데다 — 보정할 게 없다
  glow: { position: 'absolute', width: GLOW, height: GLOW },
  logoRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // 화면의 유일한 요소가 됐으니 그만큼 키운다 (34 → 42)
  logo: { fontFamily: 'Pretendard-ExtraBold', fontSize: 42, letterSpacing: -1.4 },
  sweep: { position: 'absolute', bottom: 96, width: 240, height: 2, overflow: 'hidden' },
  });

/** 애니메이션을 다 볼 수 있게 최소한 이만큼은 스플래시를 띄운다 */
const SPLASH_MIN_MS = 1700;
/** 걷히는 시간. 더 짧으면 툭 꺼지고, 더 길면 앱이 늦게 열리는 것처럼 느껴진다 */
const SPLASH_EXIT_MS = 420;

/**
 * Main 화면 — 탭 네비게이터에 튜토리얼 오버레이를 두른 것.
 *
 * ⚠ **이 컴포넌트를 인라인 화살표 함수로 되돌리지 마라.** 전에 이랬다:
 *
 *     <Stack.Screen name="Main">{(props) => <TourProvider …>…</TourProvider>}</Stack.Screen>
 *
 *   화살표 함수가 RootNavigator를 그릴 때마다 새로 만들어져서 React에게는 매번 다른
 *   컴포넌트다 — 이 화면 전체가 쓸데없이 다시 마운트될 수 있는 모양이다.
 *
 * ⚠ **다만 「코치마크 두 장」의 원인은 이게 아니었다.** 이렇게 올린 뒤에도 그대로 났고,
 *   원인은 `MySettingsScreen`이 `navigate('Main')`으로 돌아가면서 Main을 하나 더
 *   얹은 것이었다(기기에서 인스턴스에 id를 붙여 확인 — MAIN MOUNT 둘, UNMOUNT 없음).
 *   그건 그쪽에서 `goBack()`으로 고쳤다. 여기 것은 **다른 위험을 하나 덜어낸 것**이지
 *   그 버그의 처방이 아니다. 둘을 섞어 기억하지 마라.
 *
 * ⚠ 역할은 여기서 직접 읽는다. 바깥에서 프롭으로 받으면 다시 클로저가 생긴다.
 *   판정 근거는 DB의 가입 함수다 — create_team → role 'admin', join_team → 'member'라
 *   TeamStartScreen에서 무엇을 눌렀는지 따로 기억할 필요가 없다.
 */
function MainWithTour({ navigation }: any) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  return (
    <TourProvider
      role={activeTeam?.role === 'admin' ? 'admin' : activeTeam ? 'member' : null}
      onNavigate={(screen) => navigation.navigate('Main', { screen })}
    >
      <MainTabNavigator />
    </TourProvider>
  );
}

export function RootNavigator() {
  const themeName = useThemeName();
  const colors = useColors();
  const session = useAuthStore((s) => s.session);
  const authInitialized = useAuthStore((s) => s.initialized);
  const recoveryMode = useAuthStore((s) => s.recoveryMode);

  const teamLoaded = useTeamStore((s) => s.loaded);
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const resetTeam = useTeamStore((s) => s.reset);

  const loadNotifications = useNotificationsStore((s) => s.load);

  // 세션 복구는 보통 순식간이라 그대로 두면 로고가 한 프레임 번쩍이고 만다
  const [splashHeld, setSplashHeld] = useState(false);
  /** 겹이 완전히 사라지기 전까지는 트리에 남겨 둔다 — 먼저 지우면 페이드가 끊긴다 */
  const [splashMounted, setSplashMounted] = useState(true);
  const exit = useRef(new Animated.Value(1)).current;

  const ready = authInitialized && splashHeld;

  useEffect(() => {
    const t = setTimeout(() => setSplashHeld(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    Animated.timing(exit, {
      toValue: 0,
      duration: SPLASH_EXIT_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSplashMounted(false);
    });
  }, [ready]);

  /**
   * 누가 로그인했는지가 바뀔 때만 다시 한다.
   *
   * session 객체를 그대로 의존성에 두면 토큰이 갱신될 때마다(약 1시간, 앱 복귀 시에도)
   * 새 객체가 흘러와서 멤버십 재조회와 푸시 재등록이 공짜로 한 번씩 더 돈다.
   * 정작 바뀐 건 토큰 문자열뿐이고, 사용자는 그대로다.
   */
  useEffect(() => {
    if (session) {
      loadMemberships();
      // 결과를 안 쓴다 — 실패는 PushStatus로 남고 내 설정 › 알림이 그걸 읽는다.
      void registerForPushNotifications(session.user.id);
    } else {
      resetTeam();
    }
  }, [session?.user.id]);

  /*
   * 팀이 바뀌면 팀에 딸린 데이터를 즉시 비운다.
   *
   * 각 화면이 activeTeam.team.id를 보고 다시 불러오긴 하는데, 그 사이 몇백 ms 동안
   * 새 팀 이름 아래 이전 팀의 경기·정산·공지가 그대로 떠 있다. 팀을 바꾼 직후가
   * 「이게 어느 팀 숫자지」가 제일 헷갈리는 순간이라 잠깐 비어 있는 편이 낫다.
   *
   * teamStore가 직접 못 지운다 — attendance·announcements 스토어가 teamStore를
   * import하고 있어서 반대로 import하면 순환이 된다. 여기는 그 위라 아무것도 안 꼬이고,
   * 전환·생성·가입·폴백이 전부 activeTeam.team.id 변화로 나타나 한자리에서 잡힌다.
   *
   * ⚠ 팀 종속 스토어를 새로 만들면 여기에도 등록할 것. 빠뜨리면 전환 후에도 이전 팀
   *   데이터가 남는데, 증상이 「가끔 이상한 값이 보인다」로만 나타나 추적이 어렵다.
   *
   * ponytail: 손으로 관리하는 목록이라 등록을 잊으면 조용히 샌다. 갚는 방향은 의존을
   *   뒤집는 것 — teamStore가 활성 팀 변경 구독만 노출하고 각 스토어가 자기 모듈에서
   *   리셋 콜백을 등록하면, 순환 없이 책임이 스토어 쪽에 남는다. 스토어가 하나 더
   *   늘어날 때 그때 하면 된다.
   */
  const activeTeamId = activeTeam?.team.id;
  const prevTeamId = useRef<string | undefined>(undefined);
  useEffect(() => {
    // 첫 진입(undefined → id)은 비울 것이 없다. 실제로 팀이 바뀐 경우만 처리한다
    if (prevTeamId.current !== undefined && prevTeamId.current !== activeTeamId) {
      useAttendanceStore.setState({ matches: [], loaded: false });
      useSettlementStore.setState({ current: null, past: [], pendingMatches: [], loaded: false });
      useAnnouncementsStore.setState({ announcements: [], readCounts: {}, loaded: false });
    }
    prevTeamId.current = activeTeamId;
  }, [activeTeamId]);

  // 푸시가 도착하거나 눌렸을 때 앱 안의 알림 목록도 따라 갱신한다.
  // 안 그러면 벨을 눌렀을 때 방금 받은 알림이 없어서 "왔는데 왜 없지"가 된다.
  useEffect(() => {
    if (!session) return;
    const reload = () => loadNotifications();
    const received = Notifications.addNotificationReceivedListener(reload);
    const responded = Notifications.addNotificationResponseReceivedListener(reload);
    return () => {
      received.remove();
      responded.remove();
    };
    // 위와 같은 이유 — 토큰만 바뀐 것으로 리스너를 떼었다 붙일 이유가 없다
  }, [session?.user.id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgRoot }}>
      {/*
        준비되기 전에는 네비게이터를 아예 마운트하지 않는다 — 세션·팀을 모르는 상태로
        먼저 그리면 로그인 화면이 한 번 스쳤다가 홈으로 바뀐다.
      */}
      {ready && (
        <NavigationContainer theme={navThemeOf(themeName)}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* 재설정 링크로 들어오면 세션이 이미 서 있다 — 그대로 두면 홈으로 지나쳐서
            정작 비밀번호를 바꿀 기회가 없다. 아래 모든 분기보다 먼저 잡는다. */}
        {recoveryMode ? (
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        ) : /*
             ⚠ **로그인 전 소개 3장(OnboardingScreen)을 걷어냈다 — 2026-09-10.**
               셋 다 그림이 `visual: null`이라 240px 빈 사각형이 떠 있었고, 실기기에서
               보니 첫 화면의 절반이 빈 채로 첫인상을 만들고 있었다.

               대신 **팀이 생긴 뒤** 화면 위에서 버튼을 하나씩 짚는다(features/tour).
               그때가 되어야 짚을 대상이 있고, 무엇보다 **역할이 정해진다** —
               팀을 만든 사람과 참가한 사람이 배워야 하는 것이 완전히 다르다.

               로그인 전에 「이 앱이 뭐냐」를 말하던 자리는 스토어 설명이 맡는다.
           */
        !session ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : !teamLoaded ? (
          /**
           * 전체 화면 스피너는 "아직 한 번도 못 불러왔다"일 때만이다.
           *
           * teamLoading까지 보면, 이미 들어와 있는 상태에서 멤버십을 다시 읽을 때마다
           * (토큰 갱신·앱 복귀로 세션이 다시 흐를 때, 팀 로고/슬로건/대표 지역 변경, 팀 나가기)
           * Main 탭 네비게이터가 통째로 언마운트된다 — 탭바가 사라졌다가, 돌아올 땐
           * 보고 있던 탭도 스크롤도 잃는다. 다시 읽는 건 뒤에서 조용히 하면 된다.
           */
          <Stack.Screen name="TeamLoading" component={LoadingScreen} />
        ) : !activeTeam ? (
          <Stack.Screen name="TeamOnboarding" component={TeamStartScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainWithTour} />
            {/* 팀이 있어도 열 수 있어야 한다 — 팀 전환 시트의 「새 팀 만들기 / 참여」가 여기로 온다.
                팀이 없을 때의 등록(위 브랜치)과 같은 화면이고, 그쪽은 브랜치 교체로 닫힌다 */}
            <Stack.Screen name="TeamOnboarding" component={TeamStartScreen} />
            <Stack.Screen name="TeamSettings" component={TeamSettingsScreen} />
            <Stack.Screen name="MySettings" component={MySettingsScreen} />
            <Stack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} />
            <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen} />
          </>
        )}
          </Stack.Navigator>
        </NavigationContainer>
      )}

      {/*
        스플래시는 조건부 return이 아니라 위에 얹힌 한 겹이다.
        전에는 준비되는 순간 통째로 갈아치워서 로고에서 앱으로 한 프레임에 툭 잘렸다.
        앱을 밑에서 먼저 그려 두고 이 겹을 걷어내면, 걷히는 동안 이미 완성된 화면이 비친다.

        걷힐 때 아주 살짝 확대한다(1 → 1.04). 불투명도만 줄이면 그냥 꺼지는 느낌인데,
        조금 다가오면서 사라지면 화면 뒤로 물러나는 것처럼 읽힌다.
        pointerEvents를 꺼서 걷히는 동안의 탭이 스플래시에 먹히지 않게 한다.
      */}
      {splashMounted && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { opacity: exit, transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] },
          ]}
        >
          <SplashScreen />
        </Animated.View>
      )}
    </View>
  );
}
