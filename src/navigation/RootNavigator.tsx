import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../features/auth/stores/authStore';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { SignUpScreen } from '../features/auth/screens/SignUpScreen';
import { ForgotPasswordScreen } from '../features/auth/screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../features/auth/screens/ResetPasswordScreen';
import { useTeamStore } from '../features/team/stores/teamStore';
import { TeamStartScreen } from '../features/team/screens/TeamStartScreen';
import { usePendingInviteStore } from '../features/team/stores/pendingInviteStore';
import { alertMessage, confirmAction } from '../components/Dialog';
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
import { palettes, type Palette } from '../theme';
import { useColors, useThemeName } from '../lib/useThemed';
import { TourProvider } from '../features/tour/TourProvider';
import { EmptyState } from '../components/EmptyState';

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

/*
  팀을 못 불러왔을 때. **두 갈래가 한 화면을 쓰되 문구가 다르다.**

      failed    「불러오지 못했어요」  답이 **오류로** 왔다
      timeout   「응답이 없어요」      답이 **안 왔다** (12초를 넘겨 끊었다)

  ⚠ **「팀 시작」 화면으로 보내지 않는다.** 전에는 catch가 `loaded: true`만 세워서
    `!activeTeam` 갈래로 떨어졌고, 그 화면의 큰 버튼은 「팀 만들기 / 참가」다 —
    **팀이 있는 사람에게 팀을 만들라고 권하는 화면**이고 누르면 중복 팀이 생긴다.
    오류를 한 줄 그리긴 했지만 그 줄보다 버튼이 크다.

  ⚠ **「다시 시도」는 loadMemberships를 그대로 다시 부른다.** 상한이 그 함수 **안**에
    있어서 재시도에도 다시 걸린다 — 한 번 끊긴 뒤 두 번째가 무한정 기다리면
    같은 자리로 돌아온다.
*/
function TeamLoadErrorScreen() {
  const loadError = useTeamStore((s) => s.loadError);
  const loading = useTeamStore((s) => s.loading);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const timedOut = loadError === 'timeout';
  return (
    <EmptyState
      emoji={timedOut ? '⏳' : '⚠️'}
      title={timedOut ? '응답이 없어요' : '불러오지 못했어요'}
      subtitle={
        timedOut
          ? '서버가 제때 답하지 않았어요.\n연결을 확인하고 다시 시도해 주세요'
          : '팀 정보를 불러오는 중 문제가 생겼어요.\n잠시 뒤 다시 시도해 주세요'
      }
      actionLabel={loading ? '불러오는 중…' : '다시 시도'}
      onAction={loading ? undefined : () => void loadMemberships()}
    />
  );
}

function LoadingScreen() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgScreen }}>
      <ActivityIndicator size="large" color={colors.green} />
    </View>
  );
}

/*
  ⚠ **JS 스플래시(KickDay 로고 + 초록 글로우)를 걷어냈다 — 2026-09-15.**

  브랜드가 두 번 떴다. 네이티브 스플래시(검정 + 축구공)가 뜨고, 그게 사라진 자리에
  이 컴포넌트가 또 떴다. 같은 브랜드를 두 번 보여주는 것은 한 번보다 **느리게** 느껴진다.

  ⚠ 결정적인 것은 **이 겹이 아무것도 안 기다렸다**는 사실이다.
    `ready = authInitialized && splashHeld`에서 splashHeld는 데이터가 아니라
    **고정 타이머**였다 — `setTimeout(…, SPLASH_MIN_MS)`, 1700ms. 걷히는 페이드가 420ms.
    합쳐서 **2,120ms를 순수하게 애니메이션을 보여주려고** 썼다.
    「로딩 중이라 필요하다」가 아니었다. 그걸 확인하기 전에는 지울 수 없는 자리였다.

  대신 네이티브 스플래시를 준비가 끝날 때까지 붙잡는다 —
  App.tsx의 `preventAutoHideAsync()` + 단 한 곳의 `hideAsync()`. 「준비」의 정의도 거기 있다.

  ⚠ **되살리고 싶어지면 먼저 읽어라:** docs/session-2026-08.md 「스플래시 두 겹」.
    로고를 크게 쓰고 싶다는 이유라면 이 컴포넌트를 되살릴 게 아니라
    **app.json의 네이티브 스플래시 이미지를 바꾸는 것**이 답이다. 겹은 다시 늘리지 마라.
*/
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
  const recoveryMode = useAuthStore((s) => s.recoveryMode);

  const teamLoaded = useTeamStore((s) => s.loaded);
  const loadError = useTeamStore((s) => s.loadError);
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const resetTeam = useTeamStore((s) => s.reset);

  const loadNotifications = useNotificationsStore((s) => s.load);

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
    초대 링크를 **여기 한 곳에서** 소비한다.

    ⚠ **왜 화면이 아니라 여기인가.** 전에는 `TeamStartScreen`이 유일한 소비처였다.
      그 화면은 **팀이 없는 사람만** 지나므로, 팀이 있는 사용자가 초대 링크를 열면
      `App.tsx`가 코드를 스토어에 넣고 **아무도 안 꺼냈다** — 조용히 버려졌다.
      야홍 6명 전원이 팀 하나짜리라 초대를 받아도 쓸 수 없었다(출시 차단 ⑤).

    ⚠ **세션이 생긴 뒤에만 소비한다.** 로그인 전에 링크를 열 수 있고, 그때 바로
      쓰면 누구로 참여할지가 없다. 세션이 설 때까지 스토어에 **남겨 둔다** —
      그래서 「로그인 전에 연 링크가 로그인 후에 소비된다」가 성립한다.

    ⚠ **말없이 가입시키지 않는다.** 링크 한 번에 팀이 늘면 되돌리려면 나가기를
      해야 하고, 나가기는 마지막 총무면 **막힌다**. 되돌리기 비용이 큰 동작은 묻는다.

    ⚠ **팀 이름을 먼저 못 보여준다.** `teams`의 SELECT 정책이 `is_team_member`라
      **멤버가 아니면 코드로도 못 읽는다.** 이름을 보여주려면 definer 함수가 필요한데,
      1.0에서 SQL을 더 늘리지 않기로 했다(설계 ㉮). 참여 직후 이름이 바로 보인다.
  */
  const pendingInviteCode = usePendingInviteStore((s) => s.code);
  const clearPendingInvite = usePendingInviteStore((s) => s.clear);
  const joinTeam = useTeamStore((s) => s.joinTeam);

  useEffect(() => {
    if (!session || !pendingInviteCode) return;
    let cancelled = false;
    void (async () => {
      const ok = await confirmAction({
        title: '초대를 받았어요',
        message: '초대 링크로 팀에 참여할까요?',
        confirmLabel: '참여하기',
        /* ⓘ 취소 문구는 기본값(「취소」)을 쓴다. 「나중에」로 바꾸려면 공용
             confirmAction에 프롭을 더해야 하는데, **취소는 거절**이라는 이 자리의
             판단과 기본 문구가 어긋나지 않는다 — 굳이 늘리지 않는다 */
      });
      if (cancelled) return;
      /*
        ⚠ **취소해도 지운다.** 남겨 두면 화면을 옮길 때마다 같은 물음이 다시 뜨고,
          그건 거절을 못 받아들이는 것이다. **취소는 거절이고, 링크는 메시지에
          그대로 남아 있다** — 마음이 바뀌면 다시 누르면 된다.
      */
      clearPendingInvite();
      if (!ok) return;
      await joinTeam(pendingInviteCode);
      /*
        ⚠ **결과를 여기서 보여줘야 한다.** `joinTeam`은 던지지 않고 스토어의
          `error`에 적는데, **그걸 그리는 곳이 `TeamStartScreen` 하나뿐**이다.
          이 경로는 그 화면을 안 지나므로 **문구가 세워지고 아무도 안 보여줬다** —
          사용자는 「참여하기」를 누르고 **아무 일도 안 일어난 것**을 본다.
          2026-09-19에 vc 13 기기 판정에서 잡았다(없는 코드·이미 멤버 둘 다 무반응).

        ⚠ 제목을 「참여하지 못했어요」로 쓰면 안 된다 — 「이미 참여 중인 팀이에요」는
          **실패가 아니라 이미 된 일**이다. 셋 다 맞는 중립 제목을 쓴다.
        ⚠ 보여준 뒤 스토어를 비운다. 안 비우면 나중에 TeamStart에 들어갔을 때
          지난 문구가 그 화면에 떠 있다.
      */
      const joinError = useTeamStore.getState().error;
      if (joinError) {
        alertMessage('초대 링크', joinError);
        useTeamStore.setState({ error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, pendingInviteCode]);

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
        준비되기 전에는 이 트리가 아예 안 그려진다 — 그 판단은 **App.tsx가 한다**
        (테마·폰트·세션 셋). 세션을 모르는 상태로 먼저 그리면 로그인 화면이
        한 번 스쳤다 홈으로 바뀌므로, 그때까지는 네이티브 스플래시가 덮고 있다.
      */}
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
        ) : /*
             ⚠ **activeTeam 판정보다 먼저다.** 못 불러온 것과 팀이 없는 것은 둘 다
               `memberships: []`라 여기서 안 가르면 같은 화면으로 떨어진다.
           */
        loadError ? (
          <Stack.Screen name="TeamLoadError" component={TeamLoadErrorScreen} />
        ) : !activeTeam ? (
          <Stack.Screen name="TeamOnboarding" component={TeamStartScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainWithTour} />
            {/*
              팀이 있어도 열 수 있어야 한다 — 팀 전환 시트의 「새 팀 만들기 / 참여」가 여기로 온다.
              같은 화면이지만 **이름이 달라야 한다.**

              ⚠ **전에는 둘 다 "TeamOnboarding"이었고, 그게 팀 생성이 먹통으로 보이는 원인이었다.**
                React Navigation은 조건부로 화면 목록이 바뀔 때, **지금 포커스된 라우트 이름이
                새 목록에도 있으면 그대로 머문다.** 그래서 팀이 없다가 생겨서 브랜치가 통째로
                바뀌어도, 같은 이름이 이쪽에 또 있으니 화면이 안 넘어갔다.

                사용자 눈에는 「만들기를 눌렀는데 아무 일도 안 난다」이고, 그래서 다시 누른다 —
                **누를 때마다 팀이 하나씩 실제로 만들어진다.** 2026-09-16에 10개를 만들고서야 봤다.
                앱을 재시작하면 그제서야 홈으로 들어갔다. 데이터는 처음부터 맞았고 화면만 안 따라왔다.

              ⚠ 이름을 다시 합치지 마라. 합치는 순간 같은 증상이 돌아온다.
            */}
            <Stack.Screen name="TeamAddAnother" component={TeamStartScreen} />
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
    </View>
  );
}
