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
import { Text } from '../components/nativeText';
import { colors, tabBar } from '../theme';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';

const Tab = createBottomTabNavigator();

const ACTIVE = colors.greenNav;
const IDLE = colors.navIdle;
/** 탭바를 화면 하단에서 띄우는 간격 — 홈 인디케이터가 있으면 그만큼 더 올린다.
 *  높이/간격은 theme의 tabBar가 원본이다 (화면 스크롤 여백이 같은 값을 본다) */
const BAR_GAP = tabBar.gap;
const BAR_SIDE = 8;
const BAR_H = tabBar.height;
const BAR_R = 22;
/** 가운데 탭: 공을 담는 원형 링과 그 안의 공 */
const RING = 56;
const BALL = 44;
/**
 * 링을 바 세로 중앙에 맞추는 보정값. React Navigation이 아이콘을 감싸는 컨테이너에
 * 자체 여백을 넣어서 바 높이만으로는 계산이 안 맞는다 — 실제 렌더를 재서 맞춘 값이다.
 */
const RING_LIFT = 27;

function tabLabel(title: string) {
  return ({ color }: { color: string }) => <Text style={[styles.label, { color }]}>{title}</Text>;
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
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          tabBarLabel: tabLabel('일정'),
          tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Assignment"
        component={AssignmentScreen}
        options={{
          // 시안대로 가운데는 라벨 없이 공만 — 대신 공이 다른 아이콘보다 크다
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <BallIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{
          tabBarLabel: tabLabel('정산'),
          tabBarIcon: ({ color }) => <Ionicons name="card-outline" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Team"
        component={TeamHomeScreen}
        options={{
          tabBarLabel: tabLabel('팀'),
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: BAR_SIDE,
    right: BAR_SIDE,
    height: BAR_H,
    borderRadius: BAR_R,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(85,110,108,0.35)',
    backgroundColor: 'transparent',
    elevation: 0,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    paddingBottom: 0,
    paddingTop: 0,
  },
  barBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: BAR_R,
    backgroundColor: 'rgba(6,14,14,0.94)',
  },
  // paddingTop으로 밀지 않고 가운데 정렬 — 아이콘+라벨 묶음이 바 높이 안에서 위로 쏠려 있었다.
  // 높이는 박지 않는다: 바의 borderWidth 1 때문에 안쪽이 바 height보다 2px 작아서,
  // 같은 값을 주면 항목이 바 밖으로 삐져나가 라벨 아랫단이 잘렸다.
  item: { justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '700', marginTop: 3 },

  // 공을 담는 원형 링 — 바 세로 한가운데
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(100,140,135,0.5)',
    backgroundColor: '#060D0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: RING_LIFT,
  },
  // 가운데 탭은 라벨이 없어서 색만으로는 현재 탭인지 알 수 없다 — 링으로 표시한다
  ringOn: {
    borderColor: ACTIVE,
    shadowColor: ACTIVE,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  ball: { width: 38, height: 38 },
  // 시안에서 공은 어느 탭에 있든 늘 선명하다 — 활성 표시는 두른 링이 맡는다
  ballIdle: { opacity: 0.9 },
});
