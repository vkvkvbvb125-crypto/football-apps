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
    /*
      ⚠ 여기만 굳은 팔레트(다크)를 쓴다. 리액트 밖이라 훅을 부를 수 없다 —
        알림 채널은 앱 시작 때 한 번 만들어지고, 이 값은 화면 색이 아니라
        **기기 LED 색**이다. 테마를 따라 바뀔 이유가 없고, 바꿀 수도 없다
        (채널은 만든 뒤 색을 못 고친다 — 안드로이드가 사용자 설정으로 본다).
    */
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

/**
 * 알림을 보낸 결과. 화면이 총무에게 무엇을 말할지 여기서 갈린다.
 *
 *   sent          알림을 받은 사람 수 (푸시 건수가 아니라 사람 수다)
 *   skipped       독촉 쿨다운으로 건너뛴 사람 수
 *   retryAfterMin 건너뛴 사람 **전원**이 다시 받을 수 있게 되기까지 남은 분
 */
export interface NotifyResult {
  sent: number;
  skipped: number;
  retryAfterMin: number;
}

/** 보낼 사람이 없어 부르지도 않은 경우. 「0명에게 보냈다」가 아니라 「아무 일도 없었다」다 */
export const EMPTY_NOTIFY: NotifyResult = { sent: 0, skipped: 0, retryAfterMin: 0 };

export async function notifyTeam(
  teamId: string,
  title: string,
  body: string,
  excludeUserId?: string,
  /** 지정하면 팀 전체가 아니라 이 user_id들에게만 보낸다 (예: 미투표자 독촉) */
  userIds?: string[],
  kind?: NotifyKind,
  /*
    알림을 눌렀을 때 어디로 갈지 정하는 값. Edge Function이 그대로
    messages[].data에 실어 보내고, 앱은 notificationRoute.routeFor가 읽는다.

    ⚠ **id가 아니라 목적지가 요구하는 값을 담는다.** 일정 화면은 matchId가
      아니라 focusDate를 받으므로(AttendanceScreen:275) 경기 알림은 날짜를
      싣는다. 마침 경기를 만드는 자리 둘은 insert 결과를 버려서 matchId가 손에
      없는데, matchDate는 입력값이라 항상 있다.

    ⚠ 공지는 반대다 — 목적지(AnnouncementDetailModal)가 **행 자체**를 받으므로
      id로 목록에서 찾아야 한다. 그래서 createAnnouncement에 .select()를 붙여
      id를 받아 온다. 이 저장소에 insert().select() 전례가 없어서 기기에서 재봤다:
      전체 행이 그대로 돌아온다(announcements_select 정책이 팀원에게 열려 있다).

    ⚠ mention·comment는 **postId**를 싣는다(2026-09-29). 글 상세 화면은 여전히
      없지만, 목록에서 **그 카드를 펴는** 것으로 지목이 된다(BoardPanel의 openPostId).
      id 출처가 둘로 다르다: comment는 PostComments가 이미 postId를 들고 있고,
      mention은 createPost가 `.select('id')`로 돌려준 값이다.

    ⚠ **Edge Function은 안 고쳤다.** notify-team이 `{ kind, ...(target ?? {}) }`로
      target을 통째로 펴서 싣는다 — 키를 열거하지 않아 새 키가 그냥 실린다.

    ⚠ 위치로 붙였다. 여기까지 인자가 여섯이고 여덟 호출이 전부 여섯을 넘긴다 —
      세어서 확인했다. 개수가 자리마다 다르면 일곱째를 붙일 때 여섯째 자리에
      undefined를 채워야 하고, 그걸 놓치면 kind가 target 자리로 조용히 들어간다.
  */
  target?: { matchDate?: string; settlementId?: string; announcementId?: string; postId?: string }
): Promise<NotifyResult> {
  const { data, error } = await supabase.functions.invoke('notify-team', {
    body: { teamId, title, body, excludeUserId, userIds, kind, target },
  });
  if (error) throw error;
  /*
    ⚠ **data를 버리지 않는다.** 전에는 `const { error }`만 읽었다. 그 상태로 서버가
      쿨다운을 걸면 총무 화면에는 아무 변화가 없다 — 눌렀는데 아무 일도 안 나는
      것이고, 그건 이 저장소가 이미 한 번 겪은 「찌르기가 한 번도 안 감」과 같은 모양이다.
      막는 것보다 **막았다고 말하는 것**이 이 기능의 본체다.
    ⚠ 값이 없으면 0으로 채운다. 옛 함수가 배포돼 있으면 skipped가 안 오는데,
      그때 undefined가 화면까지 흘러가면 「NaN명 건너뜀」이 된다.
  */
  const r = (data ?? {}) as Partial<NotifyResult>;
  return {
    sent: r.sent ?? 0,
    skipped: r.skipped ?? 0,
    retryAfterMin: r.retryAfterMin ?? 0,
  };
}
