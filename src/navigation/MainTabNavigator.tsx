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
        width: 40,
        height: 40,
        borderRadius: 20,
        top: -6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? '#22543A' : '#173A26',
        borderWidth: 1.5,
        borderColor: '#2D5F3E',
      }}
    >
      <Ionicons name={focused ? 'football' : 'football-outline'} size={20} color="#FFFFFF" />
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
          height: 82,
          paddingTop: 8,
          paddingBottom: 16,
        },
        tabBarItemStyle: { paddingTop: 2 },
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
