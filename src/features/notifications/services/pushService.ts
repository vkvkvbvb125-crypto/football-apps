import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../../../lib/supabase';

export async function registerForPushNotifications(userId: string) {
  if (Platform.OS === 'web') return; // 웹은 푸시 알림 미지원

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

export async function notifyTeam(teamId: string, title: string, body: string, excludeUserId?: string) {
  const { error } = await supabase.functions.invoke('notify-team', {
    body: { teamId, title, body, excludeUserId },
  });
  if (error) throw error;
}
