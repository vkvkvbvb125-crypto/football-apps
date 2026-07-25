import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

const NAV_BG = 'rgba(6, 14, 14, 0.96)';
const NAV_BORDER = 'rgba(85, 110, 108, 0.35)';
const ACTIVE_COLOR = '#35F58A';
const INACTIVE_ICON = '#9AA6A2';
const INACTIVE_LABEL = '#6F7977';

const SIDE_TABS = [
  { route: 'Home', label: '홈', icon: 'home-outline' as const },
  { route: 'Attendance', label: '일정', icon: 'calendar-outline' as const },
] as const;

const RIGHT_TABS = [
  { route: 'Settlement', label: '정산', icon: 'cash-outline' as const },
  { route: 'Team', label: '팀', icon: 'people-outline' as const },
] as const;

// 경기운영 화면 전용: 전역 플로팅 탭바 대신 콘텐츠 흐름 안에 놓이는 정적 네비게이션.
// 같은 5개 탭으로 실제 이동은 하되, 이 화면에서는 항상 "경기운영"이 활성 상태다.
export function EmbeddedNavBar() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.bar}>
      {SIDE_TABS.map((tab) => (
        <Pressable key={tab.route} style={styles.item} onPress={() => navigation.navigate(tab.route)}>
          <Ionicons name={tab.icon} size={19} color={INACTIVE_ICON} />
          <Text style={styles.label}>{tab.label}</Text>
        </Pressable>
      ))}

      <View style={styles.centerItem}>
        <View style={styles.centerCircle}>
          <Image
            source={require('../../assets/네비게이션.png')}
            style={styles.centerImage}
            resizeMode="contain"
          />
          <View style={styles.centerDot} />
        </View>
      </View>

      {RIGHT_TABS.map((tab) => (
        <Pressable key={tab.route} style={styles.item} onPress={() => navigation.navigate(tab.route)}>
          <Ionicons name={tab.icon} size={19} color={INACTIVE_ICON} />
          <Text style={styles.label}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 8,
    backgroundColor: NAV_BG,
    borderWidth: 1,
    borderColor: NAV_BORDER,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: INACTIVE_LABEL,
  },
  centerItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    top: -3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1A12',
    borderWidth: 1.5,
    borderColor: ACTIVE_COLOR,
  },
  centerImage: {
    width: 32,
    height: 32,
  },
  centerDot: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACTIVE_COLOR,
  },
});
