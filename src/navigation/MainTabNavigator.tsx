import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';
import { ReservationScreen } from '../features/reservation/screens/ReservationScreen';

const Tab = createBottomTabNavigator();

function tabIcon(outlineName: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? filledName : outlineName} size={22} color={color} />
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#39D98A',
        tabBarInactiveTintColor: '#5A625E',
        tabBarStyle: {
          backgroundColor: '#0B0F0D',
          borderTopColor: '#1E2924',
          height: 82,
          paddingTop: 8,
          paddingBottom: 16,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 22 },
      }}
    >
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: '일정', tabBarIcon: tabIcon('calendar-outline', 'calendar') }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{ title: '정산', tabBarIcon: tabIcon('cash-outline', 'cash') }}
      />
      <Tab.Screen
        name="Reservation"
        component={ReservationScreen}
        options={{ title: '예약', tabBarIcon: tabIcon('calendar-clear-outline', 'calendar-clear') }}
      />
      <Tab.Screen
        name="Assignment"
        component={AssignmentScreen}
        options={{ title: '분배', tabBarIcon: tabIcon('people-outline', 'people') }}
      />
      <Tab.Screen
        name="Team"
        component={TeamHomeScreen}
        options={{ title: '팀', tabBarIcon: tabIcon('shield-outline', 'shield') }}
      />
    </Tab.Navigator>
  );
}
