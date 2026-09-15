import { useEffect, useRef } from 'react';
import { applyScreenshotFixtures } from './src/dev/screenshotFixtures';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { RootNavigator } from './src/navigation/RootNavigator';
import { usePendingInviteStore } from './src/features/team/stores/pendingInviteStore';
import { usePendingSettlementStore } from './src/features/settlement/stores/pendingSettlementStore';
import { useAuthStore } from './src/features/auth/stores/authStore';
import { settlementIdFromParsed } from './src/features/settlement/links';
import { routeFor } from './src/features/notifications/notificationRoute';
import { usePendingNotificationStore } from './src/features/notifications/stores/pendingNotificationStore';
import { useAppFonts } from './src/lib/fonts';
import { useThemeStore } from './src/lib/themeStore';
import { useColors, useThemeName } from './src/lib/useThemed';
import { applyWebViewportFix } from './src/lib/webViewport';
import { colors } from './src/theme';
import { DialogHost } from './src/components/Dialog';

applyWebViewportFix();

/*
  ⚠ **네이티브 스플래시를 준비가 끝날 때까지 붙잡는다. 이 호출이 여기 있어야 한다.**

  모듈 스코프다 — 컴포넌트 안(useEffect 포함)에 두면 첫 렌더보다 늦게 돌고, 그 사이
  expo-splash-screen이 이미 자동으로 걷어 버린다. 붙잡는 일은 React가 그리기 전에
  일어나야 한다.

  실패해도 삼킨다. 붙잡기에 실패하면 스플래시가 일찍 걷히는 것뿐이고,
  그것 때문에 앱이 안 뜨는 쪽이 훨씬 나쁘다.
*/
SplashScreen.preventAutoHideAsync().catch(() => {});

/** 쿼리든 프래그먼트든 상관없이 값을 꺼낸다 — Supabase는 둘 다 쓴다 */
function paramOf(url: string, key: string) {
  const m = url.match(new RegExp(`[#?&]${key}=([^&]*)`));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

function handleIncomingUrl(url: string | null) {
  if (!url) return;
  const parsed = Linking.parse(url);

  // 만료됐거나 이미 쓴 링크는 type=recovery 없이 오류만 달고 돌아온다.
  // 아래 recovery 검사보다 먼저 걸러야 한다 — 안 그러면 아무 설명 없는 로그인 화면만 남는다.
  if (paramOf(url, 'error') || paramOf(url, 'error_code')) {
    useAuthStore
      .getState()
      .reportLinkError(paramOf(url, 'error_code'), paramOf(url, 'error_description'));
    return;
  }

  const code = parsed.queryParams?.code;
  if (parsed.hostname === 'join' && typeof code === 'string') {
    usePendingInviteStore.getState().setCode(code);
    return;
  }

  // 비밀번호 재설정 메일의 링크 — 토큰으로 세션을 세우고 새 비밀번호 화면을 띄운다.
  // (type=recovery는 쿼리에도 프래그먼트에도 올 수 있어 원본 문자열로도 확인한다)
  const isRecovery = parsed.queryParams?.type === 'recovery' || /type=recovery/.test(url);
  if (isRecovery) {
    useAuthStore.getState().startRecovery(url);
    return;
  }

  // 정산 링크 — kickday://settlement/{id}
  const settlementId = settlementIdFromParsed(parsed.hostname ?? null, parsed.path ?? null);
  if (settlementId) {
    usePendingSettlementStore.getState().setId(settlementId);
  }
}

export default function App() {
  /*
    저장된 화면 모드를 읽는다.

    ⚠ 읽기 **전에** 그리면 잘못된 테마가 한 번 번쩍인다 — 기본값이 'system'이라
      기기가 라이트인데 사용자가 「어둡게」를 골라 뒀으면, 밝은 화면이 한 프레임
      떴다가 어두워진다. 스플래시가 그 순간을 덮어 주지만 스플래시 색 자체도
      테마를 타므로 안심할 수 없다.
      그래서 loaded가 false인 동안은 배경만 칠하고 아무것도 안 그린다.
      onboardingStore가 같은 이유로 같은 모양을 쓴다.
  */
  const themeLoaded = useThemeStore((s) => s.loaded);
  const loadTheme = useThemeStore((s) => s.load);
  useEffect(() => {
    loadTheme();
  }, []);

  /*
    스토어 스크린샷용 가짜 데이터.

    ⚠ **여기가 유일한 부르는 자리다.** 조건을 여기서 한 번, 함수 안에서 또 한 번 본다 —
      한 곳에만 두면 다른 데서 부르는 순간 새어 나간다.
      ⚠ 전에는 `__DEV__ &&`가 앞에 있었고 그래서 릴리스에서는 이 블록이 통째로 접혔다.
      스토어 스크린샷을 릴리스 빌드로 찍어야 해서 뺐다 — 근거와 대가는 픽스처 파일 머리에 있다.
      대신 그 변수를 주는 프로필이 APK만 뽑고, Play는 신규 앱에 AAB만 받는다.
      screenshot.check.ts가 이 모양을 붙든다.
  */
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_SCREENSHOT === '1') {
      applyScreenshotFixtures();
    }
  }, []);

  /*
    폰트. **반환값을 쓴다** — 전에는 버렸다.

    버리면 첫 화면이 시스템 폰트로 먼저 그려졌다가 Pretendard로 바뀐다. 글자 폭이 달라
    줄이 다시 흐르고, 그게 앱이 열리자마자 보인다.
    ⚠ 그렇다고 화면을 막지는 않는다 — useAppFonts는 **실패해도 true를 준다**
      (`loaded || !!error`). 폰트가 없으면 시스템 폰트로 뜨는 게 맞지, 안 뜨는 건 아니다.
  */
  const fontsReady = useAppFonts();

  useEffect(() => {
    Linking.getInitialURL().then(handleIncomingUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => subscription.remove();
  }, []);

  /*
    알림을 눌러서 들어온 경우. 바로 위 딥링크 처리와 **같은 자리에 둔 것이 요점**이다.

    ⚠ RootNavigator에도 알림 리스너가 있는데 그건 `if (!session) return`으로 막혀 있다.
      앱 안의 알림 목록을 갱신하는 일이라 세션이 필요해서 맞는 조건이다. 하지만
      **어디로 갈지를 정하는 일에는 세션이 필요 없다.** 거기에 얹었으면 앱이 죽어
      있을 때 누른 알림은 — 응답이 세션 복원보다 먼저 오므로 — 리스너가 붙기도
      전에 지나가서 놓친다. 그래서 여기다. Linking.getInitialURL()과 같은 이유다.

    getLastNotificationResponse()  앱이 죽어 있을 때 눌러서 열린 경우
    addNotificationResponseReceivedListener  앱이 살아 있을 때 누른 경우
    둘 다 갈 곳만 담아두고, 꺼내는 것은 준비가 끝난 MainTabNavigator다.
  */
  useEffect(() => {
    const take = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const intent = routeFor(response.notification.request.content.data);
      /*
        갈 곳이 없으면 아무것도 안 한다 — 홈으로 보내지 않는다. kind가 없는 옛
        알림이 여기로 들어온다. 자세한 근거는 notificationRoute.ts의 routeFor.
      */
      if (!intent) return;
      usePendingNotificationStore.getState().setIntent(intent);
      /*
        소비했으면 지운다. 안 지우면 다음에 런처로 앱을 열 때도 같은 응답이
        그대로 돌아와서, 누르지도 않은 알림의 화면이 다시 열린다.
        (docs: "May be used when an app selects a route based on the notification
         response, and it is undesirable to continue selecting the route after
         the response has already been handled.")
      */
      Notifications.clearLastNotificationResponse();
    };

    // 동기 버전을 쓴다 — …Async 쌍은 이 SDK에서 deprecated다
    take(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  /*
    ── 「준비」가 무엇인가 ─────────────────────────────────────────

    셋이다. 셋 다 **첫 프레임이 이미 맞으려면** 필요한 것이고, 그 밖의 것은 안 넣는다.

      themeLoaded      저장된 화면 모드. 안 읽고 그리면 반대 테마가 한 번 번쩍인다
      fontsReady       Pretendard. 안 기다리면 시스템 폰트로 그렸다가 줄이 다시 흐른다
      authInitialized  세션 복구. 안 기다리면 로그인 화면이 스쳤다 홈으로 바뀐다

    ⚠ **팀 로드(teamStore.loaded)는 안 넣는다.** 그건 네트워크라 얼마가 걸릴지 모르고,
      기다리면 스플래시가 그만큼 길어진다. 팀을 못 불러온 상태는 네비게이터 안의
      TeamLoading이 이미 맡는다 — 스플래시가 할 일이 아니다.

    ── 실패 경로 ─────────────────────────────────────────────────

    ⚠ 셋 다 **실패해도 true가 된다.** 따로 타임아웃을 안 건 근거다.
      themeLoaded      AsyncStorage 읽기가 throw해도 catch에서 true (themeStore.ts)
      fontsReady       `loaded || !!error` (fonts.ts)
      authInitialized  `getSession()`의 then·catch 양쪽에서 true (authStore.ts)

    ⚠ 남는 것은 「실패」가 아니라 「안 끝남」 하나다 — `getSession()`이 토큰 갱신으로
      네트워크를 타면 돌아올 때까지 스플래시가 서 있다. 무한은 아니다(소켓 타임아웃이
      결국 catch로 보낸다) 하지만 수십 초가 될 수 있다.
      **그래도 시간으로 끊지 않는다.** 끊고 걷으면 세션을 모르는 채 로그인 화면을 그리게
      되고, 이미 로그인한 사람에게 로그인 화면을 보여주는 것이 스플래시가 몇 초 더 서 있는
      것보다 나쁘다. 근본은 Supabase 호출에 시한이 없는 것이고 서랍 13번에 같은 뿌리로 있다.
  */
  const authInitialized = useAuthStore((s) => s.initialized);
  const ready = themeLoaded && fontsReady && authInitialized;

  /*
    ⚠ **네이티브 스플래시를 걷는 자리는 여기 하나다.**
      여러 곳에서 부르면 어느 것이 먼저 도느냐에 따라 깜빡인다.
      ref로 한 번만 돌게 막는다 — ready가 다시 true가 되어도 두 번 안 부른다.

    ⚠ 걷힌 직후 한 프레임이 비어도 흰 화면은 안 나온다 — AppFrame의 바깥 View가
      colors.bgRoot로 칠해져 있어 그 자리를 테마 색이 메운다.
  */
  const splashHidden = useRef(false);
  useEffect(() => {
    if (!ready || splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <SafeAreaProvider>
      <AppFrame ready={ready} />
    </SafeAreaProvider>
  );
}

/*
  배경색과 상태바가 테마를 타므로 훅을 부를 수 있는 컴포넌트가 하나 더 필요하다.
  App 자체에서 useColors()를 부르면 되지 않느냐 싶지만, 그러면 테마가 바뀔 때
  App이 통째로 다시 그려지면서 위 useEffect들(딥링크·알림 리스너)이 다시 돈다.
*/
function AppFrame({ ready }: { ready: boolean }) {
  const colors = useColors();
  const themeName = useThemeName();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgRoot }}>
      {ready && (
        <>
          <RootNavigator />
        {/* 확인·알림 대화상자가 그려지는 자리 (웹 전용, 네이티브에선 아무것도 안 그린다).
            네비게이터 위에 둬야 모달 위에서 물어도 가려지지 않는다 */}
          <DialogHost />
        </>
      )}
      {/*
        상태바 글자색 — 밝은 배경에 흰 글자면 시계가 안 보인다.
        ⚠ 색 값으로 비교하지 않는다(`colors.bgRoot === '#EDF1EF'`). 팔레트를
          한 칸 바꾸는 순간 조용히 반대가 되고, 그건 화면을 열어봐야만 보인다.
          테마 이름은 그 자체가 답이라 안 갈린다.
      */}
      <StatusBar style={themeName === 'light' ? 'dark' : 'light'} />
    </View>
  );
}
