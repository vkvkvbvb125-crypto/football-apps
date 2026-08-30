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

/**
 * 푸시 등록의 마지막 결과.
 *
 * 왜 값으로 남기는가. 토큰 발급은 「실패해도 앱은 돌아야 하는」 부수 기능이라
 * 던지게 두면 안 되는데(개발 빌드는 빨간 화면, 릴리스는 침묵), 그냥 삼키면
 * 이번엔 아무도 실패를 모른다. 실제로 그랬다 — 안드로이드에서 google-services.json이
 * 없어 토큰이 한 번도 안 나왔는데, 총무 쪽에서도 팀원 쪽에서도 보이는 게 없었다.
 * 「알림이 안 갔다」와 「아무도 안 읽었다」의 출력이 같다.
 *
 * 그래서 실패를 삼키되 값으로 남긴다. 화면(내 설정 › 알림)이 이 값을 읽어
 * 「지금 이 기기에서는 푸시를 받을 수 없다」를 말한다.
 */
export type PushStatus =
  /** 아직 시도한 적 없음 (로그인 전) */
  | 'unknown'
  /** 토큰을 받아 profiles.push_token에 저장했다 */
  | 'ok'
  /** 웹 — 푸시 자체가 없다 */
  | 'unsupported'
  /** 사용자가 알림 권한을 껐다 — 유일하게 사용자가 고칠 수 있는 갈래다 */
  | 'denied'
  /** app.json의 extra.eas.projectId가 없다 — 빌드 설정 문제 */
  | 'no-project-id'
  /** 토큰 발급이나 저장이 실패했다 (안드로이드 FCM 미설정 등) */
  | 'failed';

let pushStatus: PushStatus = 'unknown';

/** 마지막 푸시 등록 결과. 화면이 「푸시를 받을 수 없다」를 말할 근거다. */
export function getPushStatus(): PushStatus {
  return pushStatus;
}

/**
 * 푸시 토큰을 받아 프로필에 저장한다.
 *
 * ⚠ 이 함수는 던지지 않는다. 부르는 쪽(RootNavigator)이 로그인 직후에
 * await 없이 부르므로, 던지면 그대로 unhandled rejection이 된다. 실패는
 * PushStatus로 돌려주고 console.warn으로 원인을 남긴다 — 릴리스에서 RN의
 * 거부 추적기는 __DEV__ 안에만 걸려서, 던지게 두면 아무 데도 안 남는다.
 *
 * 권한 요청이 토큰 발급보다 먼저다. 순서를 바꾸지 마라 — 권한 없이 부른
 * getExpoPushTokenAsync는 권한 오류를 내고, 그러면 「사용자가 껐다」와
 * 「빌드 설정이 틀렸다」가 같은 실패로 뭉개진다.
 */
export async function registerForPushNotifications(userId: string): Promise<PushStatus> {
  if (Platform.OS === 'web') return (pushStatus = 'unsupported'); // 웹은 푸시 알림 미지원

  try {
    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return (pushStatus = 'denied');

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[push] app.json에 extra.eas.projectId가 없다');
      return (pushStatus = 'no-project-id');
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase
      .from('profiles')
      .update({ push_token: tokenData.data })
      .eq('id', userId);
    if (error) {
      console.warn('[push] 토큰을 저장하지 못했다 —', error.message);
      return (pushStatus = 'failed');
    }

    return (pushStatus = 'ok');
  } catch (err) {
    // 안드로이드에서 google-services.json이 없으면 여기로 온다:
    //   "Unable to get Firebase Messaging instance. Did you configure
    //    googleServicesFile path in app config?"
    // Firebase 설정 자체는 서랍에 있다. 여기서는 앱을 방해하지 않는 것까지만 한다.
    console.warn('[push] 등록 실패 —', err instanceof Error ? err.message : String(err));
    return (pushStatus = 'failed');
  }
}

/**
 * 알림 종류 — 팀원이 설정에서 끌 수 있는 단위다.
 * 넘기지 않으면 아무도 거르지 않는다(끌 수 없는 알림).
 */
export type NotifyKind =
  /* 경기 토글(notify_match) */
  | 'new_match'
  | 'deadline'
  | 'weather'
  /* 공지 토글(notify_announcement) */
  | 'announcement'
  /* 게시판 토글(notify_board) */
  | 'mention'
  | 'comment'
  /* 정산 토글(notify_settlement) */
  | 'settlement';

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
