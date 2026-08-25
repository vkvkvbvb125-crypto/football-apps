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
import { useSettlementStore } from '../features/settlement/stores/settlementStore';
import { useTeamStore } from '../features/team/stores/teamStore';
import { myUnpaidAmount } from '../features/settlement/utils/unpaid';
import { Text } from '../components/nativeText';
import { colors, shadow, tabBar, zIndex } from '../theme';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';

const Tab = createBottomTabNavigator();

/** 활성 탭 — 아이콘·라벨·가운데 링이 모두 이 하나를 쓴다 */
const ACTIVE = colors.greenBright;
const IDLE = colors.navIdle;
/** 탭바를 화면 하단에서 띄우는 간격 — 홈 인디케이터가 있으면 그만큼 더 올린다.
 *  높이/간격은 theme의 tabBar가 원본이다 (화면 스크롤 여백이 같은 값을 본다) */
const BAR_GAP = tabBar.gap;
const BAR_SIDE = 8;
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

function tabLabel(title: string) {
  return ({ color }: { color: string }) => <Text style={[styles.label, { color }]}>{title}</Text>;
}

/** 옆 탭 아이콘 — 현재 탭 표시는 색(ACTIVE/IDLE)만으로 한다 */
function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color }: { color: string }) => <Ionicons name={name} size={22} color={color} />;
}

/**
 * 가운데 경기운영 탭 — 공을 원형 링에 담아 바 한가운데에 앉힌다.
 * 공 이미지는 tintColor가 안 먹으니 밝기로 활성/비활성을 구분한다.
 */
function BallIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.ring, focused && styles.ringOn]}>
      <Image
        source={require('../../assets/nav-ball.png')}
        style={[styles.ball, !focused && styles.ballIdle]}
        resizeMode="contain"
      />
    </View>
  );
}

export function MainTabNavigator() {
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

  const pendingSettlementId = usePendingSettlementStore((s) => s.id);
  const clearPendingSettlement = usePendingSettlementStore((s) => s.clear);

  // 정산 링크로 들어왔다 — 여기까지 왔다는 건 로그인·팀 로드가 끝났다는 뜻이라
  // 이제 정산 탭으로 보내고 해당 정산을 연다. 소비했으면 바로 비운다(뒤로 갔다 오면 또 열린다).
  useEffect(() => {
    if (!pendingSettlementId) return;
    navigation.navigate('Settlement', { openSettlementId: pendingSettlementId });
    clearPendingSettlement();
  }, [pendingSettlementId]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: IDLE,
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
          tabBarLabel: tabLabel('홈'),
          tabBarIcon: tabIcon('home-outline'),
        }}
      />
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          tabBarLabel: tabLabel('일정'),
          tabBarIcon: tabIcon('calendar-outline'),
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
          tabBarIcon: ({ focused }) => <BallIcon focused={focused} />,
          // 옆 탭들의 세로 정렬(styles.item)을 여기엔 걸지 않는다 — 위 주석 참고
          tabBarItemStyle: styles.itemCenter,
        }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{
          tabBarLabel: tabLabel('정산'),
          tabBarIcon: tabIcon('card-outline'),
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
          tabBarLabel: tabLabel('팀'),
          tabBarIcon: tabIcon('people-outline'),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.bgRoot,
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
  ringOn: { borderColor: ACTIVE, boxShadow: `0 0 7px ${colors.greenGlow}` },
  ball: { width: 41, height: 41 },
  // 시안에서 공은 어느 탭에 있든 늘 선명하다 — 활성 표시는 두른 링이 맡는다
  ballIdle: { opacity: 0.9 },
});
