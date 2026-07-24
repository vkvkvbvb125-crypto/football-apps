import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, View } from 'react-native';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';
import { HomeScreen } from '../features/home/screens/HomeScreen';

const Tab = createBottomTabNavigator();

const TEAL_BORDER = '#2DD4BF';

function tabIcon(outlineName: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? filledName : outlineName} size={20} color={color} />
  );
}

function assignmentTabIcon() {
  return (
    <View
      style={{
        width: 72,
        height: 72,
        borderRadius: 36,
        top: -12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0F1512',
        borderWidth: 1.5,
        borderColor: TEAL_BORDER,
        overflow: 'hidden',
        boxShadow: '0px 4px 10px rgba(0,0,0,0.4)',
      }}
    >
      <Image
        source={require('../../assets/네비게이션.png')}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    </View>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4ADE80',
        tabBarInactiveTintColor: '#5A625E',
        tabBarStyle: {
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 14,
          height: 64,
          backgroundColor: '#0F1512',
          borderRadius: 32,
          borderWidth: 1,
          borderColor: TEAL_BORDER,
          boxShadow: '0px 8px 20px rgba(0,0,0,0.4)',
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', lineHeight: 13 },
        tabBarItemStyle: { paddingTop: 6 },
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
        options={{ title: '경기운영', tabBarIcon: assignmentTabIcon, tabBarLabel: () => null }}
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
