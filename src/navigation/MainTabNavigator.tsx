// src/navigation/MainTabNavigator.tsx — 리디자인 적용판
// 떠 있는 알약 탭바. 가운데 경기운영 탭은 공을 원형 링에 담아 바 안에 앉힌다
// (윗변을 파는 노치 버전은 걷어냈다 — 노치가 없으면 배경은 View 하나면 충분하고
//  react-native-svg로 path를 그릴 이유가 없다).
// tabBarLabel은 문자열 대신 렌더 함수를 쓴다 — React Navigation 기본 라벨은 Text를
// 직접 그려서 nativeText 래퍼(Pretendard 폰트 주입)를 타지 않기 때문.
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePendingSettlementStore } from '../features/settlement/stores/pendingSettlementStore';
import { usePendingNotificationStore } from '../features/notifications/stores/pendingNotificationStore';
import { useSettlementStore } from '../features/settlement/stores/settlementStore';
import { useTeamStore } from '../features/team/stores/teamStore';
import { myUnpaidAmount } from '../features/settlement/utils/unpaid';
import { Text } from '../components/nativeText';
import { shadow, tabBar, zIndex, type Palette } from '../theme';
import { useThemeName, useThemed } from '../lib/useThemed';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';
import { useTourTarget } from '../features/tour/TourProvider';
import type { TourTarget } from '../features/tour/steps';

const Tab = createBottomTabNavigator();

/*
  활성 탭 — 아이콘·라벨·가운데 링이 모두 이 하나를 쓴다.
  ⚠ 테마마다 다르다. greenBright는 다크에서 「더 밝은 것」이지만 역할은
    「더 튀는 것」이라, 라이트에서는 green보다 어둡다(theme.ts 라이트 팔레트 주석).
*/
const activeOf = (colors: Palette) => colors.greenBright;
const idleOf = (colors: Palette) => colors.navIdle;
/** 탭바를 화면 하단에서 띄우는 간격 — 홈 인디케이터가 있으면 그만큼 더 올린다.
 *  높이/간격은 theme의 tabBar가 원본이다 (화면 스크롤 여백이 같은 값을 본다) */
const BAR_GAP = tabBar.gap;
/*
  바 좌우 여백. 8에서 12로 넓혔다.
  아래(insets 24 + gap 4 = 28dp)와의 비를 3.5배에서 2.3배로 좁힌 것이다 —
  8일 때는 아래만 넓어 「떠 있는 알약」이 아니라 「위로 밀린 바」로 읽혔다.
  세로만 줄이면 좌우와 안 맞는다. 화면으로 보고 함께 정했다.
*/
const BAR_SIDE = 12;
const BAR_H = tabBar.height;
const BAR_R = 22;
/*
 * 가운데 탭: 공을 담는 원형 링과 그 안의 공.
 *
 * 56/38에서 한 단 키웠다(+7%) — 경기운영이 앱의 핵심이라 존재감을 조금 더 준다.
 * glow는 안 늘린다. 검정 원 + 초록 공, 그 패턴만으로 이미 다른 탭과 구분된다.
 *
 * RING_LIFT는 안 건드려도 된다. 감싸는 칸이 justifyContent:'center'라
 * 링의 세로 중심이 (칸 중심 + RING_LIFT/2)로 정해진다 — RING 값과 무관하다.
 */
const RING = 60;
/**
 * 링을 바 세로 중앙에 맞추는 보정값. React Navigation이 아이콘을 감싸는 컨테이너에
 * 자체 여백을 넣어서 바 높이만으로는 계산이 안 맞는다 — 실제 렌더를 재서 맞춘 값이다.
 */
const RING_LIFT = 27;

/*
  ⚠ **훅을 부르지 않는다. 스타일을 인자로 받는다.**

  전에는 안에서 `useThemed(makeStyles)`를 불렀다. 이 함수는 컴포넌트가 아니라
  **JSX의 options 값으로 불리는 일반 함수**라, 호출 횟수가 곧 훅 수가 된다.
  지금은 라벨 있는 탭 넷이 무조건 그려져서 안 터지지만, **탭 하나라도 조건부가 되는
  순간** 렌더마다 훅 수가 달라져 「Rendered more hooks than during the previous render」다.
  2026-09-18에 MatchWeatherBlock의 weatherAccent가 같은 모양으로 실제로 죽었다 —
  거기는 조건부 호출이 이미 있었을 뿐이다.

  `MainTabNavigator`가 이미 styles를 들고 있으므로 그대로 넘긴다.
  ⚠ `colors`는 원래도 안 썼다.
*/
function tabLabel(title: string, styles: ReturnType<typeof makeStyles>) {
  return ({ color }: { color: string }) => <Text style={[styles.label, { color }]}>{title}</Text>;
}

/** 옆 탭 아이콘 — 현재 탭 표시는 색(ACTIVE/IDLE)만으로 한다 */
function tabIcon(name: keyof typeof Ionicons.glyphMap, tour?: TourTarget) {
  return ({ color }: { color: string }) =>
    tour ? (
      /* 튜토리얼이 짚을 자리. ref 하나만 달고 나머지는 TourProvider가 한다 —
         화면에 분기를 심으면 튜토리얼이 끝나도 그 분기가 남는다 */
      <TourSpot name={tour}>
        <Ionicons name={name} size={22} color={color} />
      </TourSpot>
    ) : (
      <Ionicons name={name} size={22} color={color} />
    );
}

/** ref를 달기만 하는 껍데기 — Ionicons는 measureInWindow를 안 준다.
 *  ⚠ 여백이 있는 요소는 이걸로 감싸면 안 된다. 아래 BallIcon 주석 참고. */
function TourSpot({ name, children }: { name: TourTarget; children: React.ReactNode }) {
  const ref = useTourTarget(name);
  return <View ref={ref}>{children}</View>;
}

/**
 * 가운데 경기운영 탭 — 공을 원형 링에 담아 바 한가운데에 앉힌다.
 * 공 이미지는 tintColor가 안 먹으니 밝기로 활성/비활성을 구분한다.
 */
function BallIcon({ focused }: { focused: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  const themeName = useThemeName();
  /*
    튜토리얼이 짚을 자리 — **TourSpot으로 감싸지 않고 링에 직접 단다.**

    ⚠ 이유: `styles.ring`에 `marginTop: RING_LIFT`(27)가 있다. 감싸는 View의 높이는
      **자식의 margin을 포함**하므로, 지름 60인 링을 감싸면 껍데기가 60×87로 잡힌다.
      measureInWindow는 ref가 달린 그 노드를 잴 뿐이라 구멍이 76×103으로 뚫렸고 —
      원 위에 세로로 긴 둥근 네모가 올라갔다(기기에서 재서 확인한 값이다).
      옆 탭들이 멀쩡했던 것은 그 아이콘에 margin이 없어서다.

    규칙: **여백이 붙은 요소는 감싸지 말고 그 요소에 직접 ref를 단다.**
  */
  const tourRef = useTourTarget('tab.assignment');
  /*
    라이트에서만 공의 색을 갈아끼운다.

    원본은 밝은 초록 점 패턴이라 흰 링 위에서 대비가 죽는다(합성해서 봤다 —
    거의 안 보인다). 자산이 단색이라(색조 130°가 97.5%) tintColor가 먹는다.

    ⚠ 다크에서는 쓰지 않는다. tintColor는 음영을 평평하게 만드는데, 다크에서는
      원본의 발광 음영이 그대로 살아 있고 그게 이 자산의 값어치다.
      「안 보인다」를 고치려고 「멀쩡한 쪽」까지 같이 바꾸지 않는다.
  */
  /* greenBright는 라이트에서 가장 진한 초록이다 — 옅은 초록 링 위에서 8.52:1
     (다크의 같은 자리가 11.35:1이니 결이 비슷하다) */
  const ballTint = themeName === 'light' ? colors.greenBright : undefined;
  return (
    <View ref={tourRef} style={[styles.ring, focused && styles.ringOn]}>
      <Image
        source={require('../../assets/nav-ball.png')}
        style={[styles.ball, !focused && styles.ballIdle, !!ballTint && { tintColor: ballTint }]}
        resizeMode="contain"
      />
    </View>
  );
}

export function MainTabNavigator() {
  const { colors, styles } = useThemed(makeStyles);
  // bottom을 10으로 못박아 두면 홈 인디케이터가 있는 기기에서 탭바가 그 위에 겹친다
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  /*
   * 정산 탭의 빨간 점 — 내가 안 낸 돈이 있으면 어느 화면에 있든 보인다.
   * 팀 홈의 「미납 금액」 타일을 여기로 옮긴 것이다. 돈 이야기는 정산 화면의 일이고,
   * 팀 홈에 상시로 두면 그 화면이 독촉장이 된다.
   *
   * ⚠ 전제: 이 값은 settlementStore가 채워져 있을 때만 정확하다. 채우는 건
   *   loadSettlements이고, 지금은 홈·팀 화면이 마운트될 때 부른다. 앱을 켜면 홈이
   *   첫 화면이라 실질적으로 늘 채워지지만, **첫 화면이 홈이 아니게 되면 조용히 깨진다** —
   *   점이 안 뜰 뿐 에러가 없어서 눈치채기 어렵다.
   *   그때는 여기서 부르지 말고(탭 네비게이터가 데이터를 불러오는 책임을 갖게 된다)
   *   RootNavigator의 팀 전환 정리와 같은 자리에서 미리 채우는 쪽이 맞다.
   */
  const settlementCurrent = useSettlementStore((s) => s.current);
  const settlementPast = useSettlementStore((s) => s.past);
  const myMembershipId = useTeamStore((s) => s.activeTeam?.membershipId);
  const hasUnpaid = myUnpaidAmount(settlementCurrent, settlementPast, myMembershipId) > 0;

  /*
    ── ⚠ 이 파일에서는 **탭 이름을 바로 부르면 안 된다** ─────────────

    이 컴포넌트는 `Stack.Screen name="Main"` **안**에 있다. 그래서 `useNavigation()`이
    돌려주는 것은 **스택의** navigation이고, Attendance·Settlement·Team은
    이 컴포넌트가 **렌더하는** Tab.Navigator의 이름 — 즉 **아래쪽**이다.
    React Navigation은 **위로만** 거슬러 찾으므로 그 이름은 아무 데도 안 닿는다.
    **예외도 안 난다 — 조용히 끝난다.**

    ⚠ **2026-09-29에 기기에서 처음 밟고 알았다.** 그 전까지 알림 딥링크도
      정산 딥링크도 **한 번도 동작한 적이 없다.** 진단 빌드가 이렇게 찍었다:

        4b navigate 인자    ["Attendance", undefined]
        4c navigate 호출됨   throw 없음
        5  실제 화면         홈 그대로

    ⚠ **다른 화면들은 멀쩡하다.** HomeScreen·AttendanceScreen 같은 곳은
      Tab.Navigator **안**이라 거기서 얻는 navigation이 탭의 것이다.
      틀린 것은 **탭을 렌더하는 이 파일**뿐이었다(2026-09-29에 17곳을 훑어 확인).

    그래서 **중첩 형태**로 부른다. 그런데 `navigate('Main', …)`는 안 된다 —
    `tour.check`가 막는다: 그 호출은 **Main을 하나 더 밀어** 마운트 상태를 잃는다
    (`MySettingsScreen`이 실제로 그 사고를 냈다). 저장소의 관용구는 **`popTo`**다:

        navigation.popTo('Main', { screen, params })

    이미 있는 Main으로 되돌아가면서 파라미터만 넘긴다. 스택이 안 늘어난다.
    `deeplink.check` ⑥이 이 파일의 navigate가 'Main'을 거치는지 본다.
  */
  const pendingSettlementId = usePendingSettlementStore((s) => s.id);
  const clearPendingSettlement = usePendingSettlementStore((s) => s.clear);

  // 정산 링크로 들어왔다 — 여기까지 왔다는 건 로그인·팀 로드가 끝났다는 뜻이라
  // 이제 정산 탭으로 보내고 해당 정산을 연다. 소비했으면 바로 비운다(뒤로 갔다 오면 또 열린다).
  useEffect(() => {
    if (!pendingSettlementId) return;
    navigation.popTo('Main', {
      screen: 'Settlement',
      params: { openSettlementId: pendingSettlementId },
    });
    clearPendingSettlement();
  }, [pendingSettlementId]);

  const pendingNotification = usePendingNotificationStore((s) => s.intent);
  const clearPendingNotification = usePendingNotificationStore((s) => s.clear);

  /*
    알림을 눌러서 들어왔다 — 위 정산 링크와 **같은 이유로 같은 자리**다.
    여기까지 왔다는 건 로그인·팀 로드가 끝났다는 뜻이다.

    ⚠ 로그아웃 상태에서 알림을 눌렀어도 버리지 않는다. App.tsx가 담아두고
      이 컴포넌트는 로그인이 끝나야 마운트되므로, 사용자가 로그인하는 순간
      원래 가려던 화면이 열린다. 알림을 놓치는 것보다 낫고, 홈으로 보내는 것보다도 낫다.
  */
  useEffect(() => {
    if (!pendingNotification) return;
    navigation.popTo('Main', {
      screen: pendingNotification.screen,
      params: pendingNotification.params,
    });
    clearPendingNotification();
  }, [pendingNotification]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: activeOf(colors),
        tabBarInactiveTintColor: idleOf(colors),
        tabBarStyle: [styles.bar, { bottom: insets.bottom + BAR_GAP }],
        tabBarItemStyle: styles.item,
        // 화면이 탭바 뒤로 스크롤되도록 — 각 화면은 contentContainer에 useTabBarPadding()을 준다
        tabBarBackground: () => <View style={styles.barBg} />,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: tabLabel('홈', styles),
          tabBarIcon: tabIcon('home-outline'),
        }}
      />
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          tabBarLabel: tabLabel('일정', styles),
          tabBarIcon: tabIcon('calendar-outline', 'tab.attendance'),
        }}
      />
      <Tab.Screen
        name="Assignment"
        component={AssignmentScreen}
        options={{
          /*
            가운데만 라벨이 없다.
            일관성으로는 붙이는 게 맞지만 공간이 안 나온다 — 링 60 + 라벨 15 = 75px인데
            바는 66px이다. 넣으려면 공을 44px로 줄이거나(지난 라운드에 키운 걸 되돌린다)
            바 위로 18px 삐져나오게 해야 한다(뒤 콘텐츠와 겹친다).
            공 크기와 바 안에 머무는 쪽을 택했다. 맥락은 공 그림이 맡는다.
          */
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <BallIcon focused={focused} />
          ),
          // 옆 탭들의 세로 정렬(styles.item)을 여기엔 걸지 않는다 — 위 주석 참고
          tabBarItemStyle: styles.itemCenter,
        }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{
          tabBarLabel: tabLabel('정산', styles),
          tabBarIcon: tabIcon('card-outline', 'tab.settlement'),
          /* 금액이 아니라 점이다 — 탭 라벨 옆에 숫자를 적으면 「무슨 숫자지」가 되고,
             자릿수에 따라 탭 폭이 흔들린다. 「볼 것이 있다」만 알리고 액수는 화면이 말한다 */
          tabBarBadge: hasUnpaid ? '' : undefined,
          tabBarBadgeStyle: styles.unpaidDot,
        }}
      />
      <Tab.Screen
        name="Team"
        component={TeamHomeScreen}
        options={{
          tabBarLabel: tabLabel('팀', styles),
          tabBarIcon: tabIcon('people-outline'),
        }}
      />
    </Tab.Navigator>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  /*
   * 떠 있는 탭바 — 카드 시스템의 값을 그대로 쓴다.
   *
   * 여기만 자기 값을 갖고 있었다: 테두리 rgba(85,110,108,0.35), 면 rgba(24,32,27,0.94),
   * 레거시 shadow prop, borderCurve 없음. 그중 면은 예전 card(#18201B) 기준이라
   * 팔레트를 Deep Black으로 내린 뒤에도 혼자 밝은 채로 남아 있었다.
   * 카드 28곳을 통일하면서 탭바만 빠져 있었던 셈이다.
   *
   * 테두리는 greenLine — 밝은 초록의 25% 알파다. solid 초록으로 두르니 바 전체가
   * 강조 버튼처럼 읽혀서, 선은 잡히되 면적을 주장하지 않는 세기로 내렸다.
   * 초록의 몫은 가운데 공(브랜드)과 활성 탭(상태) 둘이고, 테두리는 그 둘을
   * 담는 틀이라 물러나 있어야 한다.
   *
   * borderTopWidth: 0 도 지웠다. RN에서 방향별 값이 borderWidth를 이기니까
   * borderWidth: 1을 줘도 윗변만 0으로 남는데, 콘텐츠와 맞닿아 실제로 눈에 걸리는
   * 변이 바로 그 윗변이다. (React Navigation 기본 hairline을 없애려던 값인데,
   * 지금은 바가 떠 있는 알약이라 기본 hairline 자체가 없다.)
   */
  bar: {
    ...shadow.overlay,
    position: 'absolute',
    left: BAR_SIDE,
    right: BAR_SIDE,
    height: BAR_H,
    borderRadius: BAR_R,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.greenLine,
    // 콘텐츠가 바 뒤로 스크롤되므로 쌓임 순서를 값으로 못 박는다 (DOM 순서에 기대지 않는다)
    zIndex: zIndex.tabBar,
    backgroundColor: 'transparent',
    paddingBottom: 0,
    paddingTop: 0,
  },
  /*
   * 면은 불투명하다.
   *
   * rgba(20,26,23,0.94)였다 — "내용이 바 뒤로 지나가는 게 보여야 떠 있는 것처럼 읽힌다"는
   * 이유였는데, 6%는 생각보다 많이 샜다. 바 영역 픽셀을 1,425점 떠 보니 250점 넘게
   * 기준색에서 벗어나 있었고 가장 밝은 점이 #4ADE80 그대로였다 —
   * 흰 글자는 0.94×20 + 0.06×255 = 34로, 검정(19) 위에서 확실히 보인다.
   * 홈의 「계좌 송금」과 팀의 「최근 공지」가 탭 아이콘 사이에 끼어 보이던 게 이것이다.
   *
   * 떠 있는 느낌은 투명도가 아니라 테두리·그림자·좌우 8px 여백이 만든다. 그건 그대로다.
   */
  barBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: BAR_R,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  /*
   * 아이콘+라벨 묶음을 바 세로 한가운데로.
   *
   * justifyContent만으로는 안 됐다 — 항목에 높이가 없으면 가운데를 잴 상자가 없고,
   * React Navigation이 얹는 자체 세로 패딩이 묶음을 위로 밀어 올린다.
   *
   * 높이를 박되 BAR_H가 아니라 BAR_H - 2다. 바의 borderWidth 1이 위아래로 2px을
   * 먹어서 안쪽이 그만큼 좁다 — 예전에 BAR_H를 그대로 줬다가 항목이 바 밖으로
   * 삐져나가 라벨 아랫단이 잘렸다. paddingVertical: 0으로 기본 패딩도 지운다.
   *
   * 가운데 공 탭에는 걸지 않는다(itemCenter로 따로 준다). RING_LIFT는 예전 레이아웃을
   * 실제로 재서 맞춘 값이라, 여기에 높이를 박으면 기준이 달라져 공이 아래로 밀린다.
   */
  item: { height: BAR_H - 2, paddingVertical: 0, justifyContent: 'center' },
  /** 가운데 탭 — 라벨이 없고 ring이 marginTop으로 자리를 잡는다. 손대지 않는다 */
  /* 숫자 없는 점 — 기본 뱃지는 최소 폭이 있어서 빈 문자열이면 타원이 된다 */
  unpaidDot: {
    minWidth: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    marginTop: 4,
  },
  itemCenter: { justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '700', marginTop: 3 },

  /*
   * 공을 담는 원형 링 — 앱 아이콘과 같은 문법이다.
   * 면은 거의 검정(bgRoot)이고 빛나는 건 두른 선 하나뿐이다.
   * 예전엔 면이 card(#141A17)라 바 배경에서 뜬 회색 원처럼 보였다.
   */
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.22)',
    /*
     * ⚠ 라이트에서도 어둡다. nav-ball.png가 투명 86% 위의 초록 점 패턴이라
     *   밝은 면에 얹으면 대비가 죽는다(합성해서 봤다 — 흰 바탕에서 거의 안 보인다).
     *   가운데 탭이 화면의 주 동작이라 가장 튀는 게 오히려 맞다.
     *   자세한 근거는 theme.ts의 navBallBg 주석.
     */
    backgroundColor: colors.navBallBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: RING_LIFT,
  },
  /*
   * 가운데 탭은 라벨이 없어서 색만으로는 현재 탭인지 알 수 없다 — 링이 그 표시다.
   *
   * glow를 절제한다(스펙 08절). 예전 0.45/12px는 탭바 위에 초록 안개가 끼어
   * 옆 탭 라벨까지 물들였다. 아이콘의 halo도 심 바로 옆에서만 밝고 금방 사라진다.
   */
  ringOn: { borderColor: colors.greenBright, boxShadow: `0 0 7px ${colors.greenGlow}` },
  ball: { width: 41, height: 41 },
  // 시안에서 공은 어느 탭에 있든 늘 선명하다 — 활성 표시는 두른 링이 맡는다
  ballIdle: { opacity: 0.9 },
  });
