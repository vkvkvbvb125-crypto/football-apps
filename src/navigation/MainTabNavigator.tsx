import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, Text, View } from 'react-native';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { SettlementScreen } from '../features/settlement/screens/SettlementScreen';
import { AssignmentScreen } from '../features/assignment/screens/AssignmentScreen';
import { TeamHomeScreen } from '../features/team/screens/TeamHomeScreen';
import { HomeScreen } from '../features/home/screens/HomeScreen';

const Tab = createBottomTabNavigator();

const NAV_BG = 'rgba(6, 14, 14, 0.96)';
const NAV_BORDER = 'rgba(85, 110, 108, 0.35)';
const ACTIVE_COLOR = '#35F58A';
const INACTIVE_ICON = '#9AA6A2';
const INACTIVE_LABEL = '#6F7977';

function tabIcon(outlineName: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ focused }: { focused: boolean }) => (
    <Ionicons
      name={focused ? filledName : outlineName}
      size={19}
      color={focused ? ACTIVE_COLOR : INACTIVE_ICON}
    />
  );
}

function tabLabel(title: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text
      style={{
        marginTop: 3,
        fontSize: 10,
        fontWeight: '600',
        color: focused ? ACTIVE_COLOR : INACTIVE_LABEL,
      }}
    >
      {title}
    </Text>
  );
}

function assignmentTabIcon() {
  return (
    <View
      style={{
        width: 59,
        height: 59,
        borderRadius: 29.5,
        top: 4,
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#071010',
        borderWidth: 1,
        borderColor: 'rgba(100, 140, 135, 0.7)',
      }}
    >
      <View
        style={{
          width: 51,
          height: 51,
          borderRadius: 25.5,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(120, 160, 150, 0.45)',
        }}
      >
        <Image
          source={require('../../assets/네비게이션.png')}
          style={{ width: 40, height: 40 }}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 10,
          height: 59,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: NAV_BG,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: NAV_BORDER,
          boxShadow: '0px 4px 12px rgba(0,0,0,0.35)',
        },
        tabBarItemStyle: { minHeight: 44, justifyContent: 'center' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: '홈', tabBarIcon: tabIcon('home-outline', 'home'), tabBarLabel: tabLabel('홈') }}
      />
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          title: '일정',
          tabBarIcon: tabIcon('calendar-outline', 'calendar'),
          tabBarLabel: tabLabel('일정'),
        }}
      />
      <Tab.Screen
        name="Assignment"
        component={AssignmentScreen}
        options={{ title: '경기운영', tabBarIcon: assignmentTabIcon, tabBarLabel: () => null }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{ title: '정산', tabBarIcon: tabIcon('cash-outline', 'cash'), tabBarLabel: tabLabel('정산') }}
      />
      <Tab.Screen
        name="Team"
        component={TeamHomeScreen}
        options={{ title: '팀', tabBarIcon: tabIcon('people-outline', 'people'), tabBarLabel: tabLabel('팀') }}
      />
    </Tab.Navigator>
  );
}
