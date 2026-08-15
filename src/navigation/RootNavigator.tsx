import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../features/auth/stores/authStore';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { SignUpScreen } from '../features/auth/screens/SignUpScreen';
import { ForgotPasswordScreen } from '../features/auth/screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../features/auth/screens/ResetPasswordScreen';
import { useTeamStore } from '../features/team/stores/teamStore';
import { TeamStartScreen } from '../features/team/screens/TeamStartScreen';
import { useOnboardingStore } from '../features/onboarding/stores/onboardingStore';
import { OnboardingScreen } from '../features/onboarding/screens/OnboardingScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { TeamSettingsScreen } from '../features/team/screens/TeamSettingsScreen';
import { MySettingsScreen } from '../features/settings/screens/MySettingsScreen';
import { registerForPushNotifications } from '../features/notifications/services/pushService';
import * as Notifications from 'expo-notifications';
import { useNotificationsStore } from '../features/notifications/stores/notificationsStore';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bgRoot, card: colors.bgRoot },
};

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgScreen }}>
      <ActivityIndicator size="large" color="#4ADE80" />
    </View>
  );
}

/**
 * 앱을 켰을 때 처음 뜨는 화면.
 *
 * 글자가 하나씩 튀어 올라오고, 마지막에 공이 굴러 들어와 점을 찍는다.
 * (로고 이미지 한 장을 페이드인하면 "이미지 띄웠구나"로만 보인다)
 */
/** 로그인 화면·홈 히어로와 같은 표기 — 여기만 대문자면 다른 로고처럼 보인다 */
const SPLASH_WORD = 'KickDay';

function SplashScreen() {
  // 글자마다 하나씩 — 0에서 1로 가면 아래에서 올라오며 나타난다
  const letters = useRef(SPLASH_WORD.split('').map(() => new Animated.Value(0))).current;
  const ball = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.stagger(
        70,
        letters.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }))
      ),
      Animated.spring(ball, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgRoot }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {SPLASH_WORD.split('').map((ch, i) => (
          <Animated.Text
            key={i}
            style={{
              fontFamily: 'Pretendard-ExtraBold',
              fontSize: 38,
              letterSpacing: -1,
              // 앞 낱말 Kick만 초록 — 로그인 화면·홈 히어로와 같은 규칙
              color: i < 4 ? colors.green : colors.text,
              opacity: letters[i],
              transform: [
                { translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
                { scale: letters[i].interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              ],
            }}
          >
            {ch}
          </Animated.Text>
        ))}

        {/* 마지막에 굴러 들어오는 공 — 한 바퀴 돌면서 글자 끝에 붙는다.
            사진 같은 3D 렌더(축구공.png)는 납작한 글자 옆에서 혼자 튀어서 아이콘으로 쓴다. */}
        <Animated.View
          style={{
            marginLeft: 7,
            marginBottom: 4,
            opacity: ball,
            transform: [
              { translateX: ball.interpolate({ inputRange: [0, 1], outputRange: [-34, 0] }) },
              { rotate: ball.interpolate({ inputRange: [0, 1], outputRange: ['-360deg', '0deg'] }) },
            ],
          }}
        >
          <Ionicons name="football" size={26} color={colors.green} />
        </Animated.View>
      </View>
    </View>
  );
}

/** 애니메이션을 다 볼 수 있게 최소한 이만큼은 스플래시를 띄운다 */
const SPLASH_MIN_MS = 1700;

export function RootNavigator() {
  const session = useAuthStore((s) => s.session);
  const authInitialized = useAuthStore((s) => s.initialized);
  const recoveryMode = useAuthStore((s) => s.recoveryMode);

  const teamLoaded = useTeamStore((s) => s.loaded);
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const resetTeam = useTeamStore((s) => s.reset);

  const onboardingLoaded = useOnboardingStore((s) => s.loaded);
  const onboardingSeen = useOnboardingStore((s) => s.seen);
  const checkOnboardingSeen = useOnboardingStore((s) => s.checkSeen);
  const markOnboardingSeen = useOnboardingStore((s) => s.markSeen);

  const loadNotifications = useNotificationsStore((s) => s.load);

  // 세션 복구는 보통 순식간이라 그대로 두면 로고가 한 프레임 번쩍이고 만다
  const [splashHeld, setSplashHeld] = useState(false);

  useEffect(() => {
    checkOnboardingSeen();
    const t = setTimeout(() => setSplashHeld(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

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
      registerForPushNotifications(session.user.id);
    } else {
      resetTeam();
    }
  }, [session?.user.id]);

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

  if (!authInitialized || !onboardingLoaded || !splashHeld) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* 재설정 링크로 들어오면 세션이 이미 서 있다 — 그대로 두면 홈으로 지나쳐서
            정작 비밀번호를 바꿀 기회가 없다. 아래 모든 분기보다 먼저 잡는다. */}
        {recoveryMode ? (
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        ) : !onboardingSeen ? (
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onDone={markOnboardingSeen} />}
          </Stack.Screen>
        ) : !session ? (
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
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen name="TeamSettings" component={TeamSettingsScreen} />
            <Stack.Screen name="MySettings" component={MySettingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
