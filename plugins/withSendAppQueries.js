// plugins/withSendAppQueries.js
// Android 11(API 30)부터는 <queries>에 선언하지 않은 앱은 Linking.canOpenURL이 무조건
// false를 돌려준다. 선언이 없으면 송금 시트의 토스·카카오뱅크·KB·신한이 전부 "미설치"로
// 보이고 계좌 복사 폴백만 돌아간다 — 딥링크 송금이 Android에서 통째로 죽는다.
// iOS 쪽 대응은 app.json의 ios.infoPlist.LSApplicationQueriesSchemes에 있다.
//
// ⚠ 스킴 목록은 src/features/settlement/components/SendMoneySheet.tsx의 SEND_APPS와
//    같이 유지해야 한다. 런타임(앱 번들)과 빌드타임(prebuild)이라 import로 묶을 수 없다.
const { withAndroidManifest } = require('expo/config-plugins');

const SEND_APP_SCHEMES = ['supertoss', 'kakaobank', 'kbbank', 'shinhan-sr-ansimclick'];

const withSendAppQueries = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const queries = manifest.queries ?? [];

    queries.push({
      intent: SEND_APP_SCHEMES.map((scheme) => ({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      })),
    });

    manifest.queries = queries;
    return config;
  });

module.exports = withSendAppQueries;
