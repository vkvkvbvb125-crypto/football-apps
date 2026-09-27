// src/features/ads/adUnits.ts — 광고 단위 ID와 초기화. **가르는 자리가 여기 하나다.**
//
// ⚠ **실제 단위 ID 문자열은 이 파일에만 있다.** `ads.check.ts`가 붙든다 —
//   다른 파일에 그 문자열이 나오면 FAIL이다. 부르는 쪽은 아래 상수만 읽는다.
//
// ── 왜 `__DEV__`가 아닌가 ──────────────────────────────────────────
// `__DEV__`는 **릴리스 빌드에서 전부 false**다. 그런데 릴리스 빌드가 두 종류다:
//
//     · 내가 설치해서 판정하는 APK (preview · production-apk)
//     · **비공개 테스트 트랙에 올리는 AAB**
//
// 둘 다 `__DEV__ === false`라 실제 광고가 나간다. 비공개 테스트가 더 위험하다 —
// 테스터를 대행으로 모으면 관심 없는 클릭이 섞이고, 그건 **무효 트래픽**으로
// 게시자 책임이 된다. 수익 차감으로 끝나면 다행이고 계정 정지면 되돌리기 어렵다.
//
// ── 기준: 환경변수 하나. **없으면 테스트다** ──────────────────────
//     eas.json에서 `production` 프로필만 EXPO_PUBLIC_ADS=real을 준다.
//
// ⚠ **실패하는 방향을 고른 것이다.** 변수를 빠뜨리면 프로덕션에 테스트 광고가
//   나간다 = 수익 0, 정책 위반 0. 반대로 잡았다면 빠뜨릴 때 테스트 트랙에
//   실제 광고가 나간다 = 무효 트래픽. 되돌릴 수 있는 쪽으로 기운다.
import mobileAds, { MaxAdContentRating, TestIds } from 'react-native-google-mobile-ads';

/* ⚠ 이 문자열을 다른 파일로 옮기지 마라 — ads.check가 막는다 */
const HOME_NATIVE_REAL = 'ca-app-pub-8655981738970005/8011439612';

/** 실제 단위 ID를 쓰는가. `production` 프로필에서만 참이다 */
export const usingRealAds = process.env.EXPO_PUBLIC_ADS === 'real';

/** 홈 「최근 공지」 아래 네이티브 카드 하나 */
export const HOME_NATIVE_UNIT_ID = usingRealAds ? HOME_NATIVE_REAL : TestIds.NATIVE;

/*
  ⚠ **실기기 판정을 하는 날 여기에 기기 ID를 넣어라.**

  에뮬레이터는 AdMob이 **자동으로 테스트 기기로 본다** — 지금 판정은 에뮬레이터만
  쓰므로(실기기가 없다) 이 배열이 비어 있어도 안전하다.

  실기기에서 `production` 빌드를 판정하면 **실제 광고가 뜨고, 그걸 내가 누르면
  자기 클릭이다.** 그날 할 일은 하나뿐이다:

    1. 그 기기로 앱을 한 번 띄운다
    2. `adb logcat | grep "Use RequestConfiguration.Builder.setTestDeviceIds"`
       — 구글 SDK가 그 기기의 ID를 로그에 찍어 준다(비밀 아니다)
    3. 그 문자열을 아래 배열에 넣고 다시 빌드한다

  ⚠ 비워 두는 것과 「없어도 된다」는 다르다. 실기기가 생기면 **반드시** 채워라.
*/
const TEST_DEVICE_IDS: string[] = [];

/*
  초기화는 한 번만. 모듈 스코프 약속으로 묶어 두 번 부르지 않게 한다.

  ⚠ **순서가 있다 — setRequestConfiguration이 initialize보다 먼저다.**
    뒤집으면 첫 요청이 설정 없이 나간다(테스트 기기 지정이 그 요청에 안 먹는다).
*/
let ready: Promise<void> | null = null;

export function ensureAdsReady(): Promise<void> {
  ready ??= mobileAds()
    .setRequestConfiguration({
      /* 회비 앱이다. 성인 등급 소재가 붙을 자리가 아니다 */
      maxAdContentRating: MaxAdContentRating.G,
      testDeviceIdentifiers: TEST_DEVICE_IDS,
    })
    .then(() => mobileAds().initialize())
    .then(() => undefined);
  return ready;
}
