// src/navigation/MainTabNavigator.tsx — 리디자인 적용판
// 떠 있는 알약 탭바 + 가운데 공 버튼(경기운영).
// tabBarLabel은 문자열 대신 렌더 함수를 쓴다 — React Navigation 기본 라벨은 Text를
// 직접 그려서 nativeText 래퍼(Pretendard 폰트 주입)를 타지 않기 때문.
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Text } from '../components/nativeText';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';

const Tab = createBottomTabNavigator();

const ACTIVE = '#35F58A';
const IDLE = '#7C8A85';

function tabLabel(title: string) {
  return ({ color }: { color: string }) => <Text style={[styles.label, { color }]}>{title}</Text>;
}

function CenterTab({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.center, focused && styles.centerOn]}>
      <Image source={require('../../assets/nav-ball.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />
    </View>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: IDLE,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        // 화면이 탭바 뒤로 스크롤되도록 — 각 화면은 contentContainer에 paddingBottom 96
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
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <CenterTab focused={focused} />,
          tabBarItemStyle: [styles.item, { paddingTop: 0 }],
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
    left: 8,
    right: 8,
    bottom: 10,
    height: 60,
    borderRadius: 20,
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
    borderRadius: 20,
    backgroundColor: 'rgba(6,14,14,0.94)',
    overflow: 'hidden',
  },
  item: { paddingTop: 8, height: 60 },
  label: { fontSize: 10, fontWeight: '700', marginTop: 1, marginBottom: 8 },

  center: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071010',
    borderWidth: 1,
    borderColor: 'rgba(100,140,135,0.6)',
    ...Platform.select({ android: { elevation: 6 } }),
  },
  centerOn: {
    backgroundColor: '#0B1A12',
    borderWidth: 1.5,
    borderColor: ACTIVE,
    shadowColor: ACTIVE,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
