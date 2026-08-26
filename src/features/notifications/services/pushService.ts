import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme';

/**
 * 앱이 켜져 있는 동안 도착한 알림을 어떻게 할지.
 *
 * 이게 없으면 기본값이 "표시하지 않음"이라, 앱을 보고 있을 때 온 알림은 배너도 소리도 없이
 * 조용히 삼켜진다. 잠금화면·알림센터에 뜨는 건 앱이 꺼져 있을 때뿐이라, 정작 경기 중에
 * 온 정산 알림을 아무도 못 본다.
 *
 * 모듈을 불러오는 시점에 한 번만 건다 — 알림은 화면이 뜨기 전에도 도착할 수 있다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * 안드로이드는 채널이 없으면 알림이 소리 없이 뜬다(기본 중요도가 낮다).
 * iOS에는 채널 개념이 없어 호출해도 아무 일도 하지 않는다.
 */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: '킥데이 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.green,
  });
}

export async function registerForPushNotifications(userId: string) {
  if (Platform.OS === 'web') return; // 웹은 푸시 알림 미지원

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('profiles').update({ push_token: tokenData.data }).eq('id', userId);
}

/**
 * 알림 종류 — 팀원이 설정에서 끌 수 있는 단위다.
 * 넘기지 않으면 아무도 거르지 않는다(끌 수 없는 알림).
 */
export type NotifyKind = 'new_match' | 'announcement' | 'deadline';

export async function notifyTeam(
  teamId: string,
  title: string,
  body: string,
  excludeUserId?: string,
  /** 지정하면 팀 전체가 아니라 이 user_id들에게만 보낸다 (예: 미투표자 독촉) */
  userIds?: string[],
  kind?: NotifyKind
) {
  const { error } = await supabase.functions.invoke('notify-team', {
    body: { teamId, title, body, excludeUserId, userIds, kind },
  });
  if (error) throw error;
}
