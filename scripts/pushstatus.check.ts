/*
  푸시 등록이 앱을 방해하지 않으면서도, 실패했다는 사실이 어딘가에 남는가.

  이 검사가 생긴 이유. 안드로이드 에뮬레이터에서 앱을 열 때마다 빨간 화면이 떴다 —
  google-services.json이 없어 getExpoPushTokenAsync가 던지는데 RootNavigator가
  await도 catch도 없이 부르고 있었다. 릴리스에서는 그 거부가 아무 데도 안 남는다
  (RN의 거부 추적기가 __DEV__ 안에만 걸린다). 즉 고르는 게 둘이었다:
  개발자를 막거나, 아무도 모르게 하거나.

  둘 다 아니게 만든 것이 이 코드다. 삼키되 값으로 남긴다. 그래서 이 검사는
  「catch가 있는가」만 보지 않는다 — 삼킨 것이 어딘가에서 다시 보이는지까지 본다.
  화면이 그 값을 안 읽으면 catch는 그냥 은폐가 된다.
*/
import { readFileSync } from 'node:fs';

const SVC = 'src/features/notifications/services/pushService.ts';
const NAV = 'src/navigation/RootNavigator.tsx';
/*
  ⚠ 이 값이 MySettingsScreen이었다. 알림 토글을 별도 화면으로 빼면서 옮겼다.
    옮기면 새 실패 갈래가 생긴다 — 「화면은 있는데 거기로 갈 수 없다」.
    그래서 아래 ④에서 설정 화면이 이 화면으로 가는 줄을 갖고 있는지도 함께 센다.
*/
const SET = 'src/features/settings/screens/NotificationSettingsScreen.tsx';
const MYSET = 'src/features/settings/screens/MySettingsScreen.tsx';

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const svc = strip(readFileSync(SVC, 'utf8'));
const nav = strip(readFileSync(NAV, 'utf8'));
const set = strip(readFileSync(SET, 'utf8'));
const myset = strip(readFileSync(MYSET, 'utf8'));

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

// ── ① 삼킨다 ──
ok(/catch \(err\) \{/.test(svc), '토큰 발급에 catch가 없다 — 던지면 unhandled rejection이다');
/*
  catch가 「있는가」로는 부족하다. 다시 던지는 catch도 그 단언을 통과한다 —
  변이 시험에서 실제로 통과했다. 블록 안을 봐야 한다.
*/
const catchBody = (() => {
  const at = svc.indexOf('} catch (err) {');
  if (at < 0) return '';
  let depth = 0;
  for (let i = svc.indexOf('{', at); i < svc.length; i += 1) {
    if (svc[i] === '{') depth += 1;
    else if (svc[i] === '}') {
      depth -= 1;
      if (depth === 0) return svc.slice(at, i + 1);
    }
  }
  return '';
})();
ok(catchBody !== '', 'catch 블록을 못 찾았다');
ok(!/throw/.test(catchBody), 'catch가 다시 던진다 — 삼키는 것이 아니다');
ok(/return \(pushStatus = 'failed'\)/.test(catchBody), 'catch가 failed를 안 남긴다');

// ── ② 삼킨 것이 값으로 남는다 ──
ok(/export function getPushStatus\(\)/.test(svc), 'getPushStatus가 없다');
for (const st of ['unknown', 'ok', 'unsupported', 'denied', 'no-project-id', 'failed']) {
  ok(svc.includes("'" + st + "'"), 'PushStatus에 ' + st + ' 갈래가 없다');
}
// 사용자가 고칠 수 있는 갈래(denied)와 못 고치는 갈래(failed)가 갈려 있어야 한다.
ok(/finalStatus !== 'granted'\) return \(pushStatus = 'denied'\)/.test(svc),
   '권한 거부가 denied로 안 갈린다 — failed와 뭉개지면 사용자가 할 일을 못 찾는다');

// ── ③ 릴리스에서 원인을 알 방법이 있다 ──
/*
  표지는 「하나라도 있는가」가 아니라 「전부 붙어 있는가」다. 하나만 검사하면
  나머지가 표지를 잃어도 조용하다 — 변이 시험에서 실제로 통과했다.
*/
const warns = svc.match(/console\.warn\([^,)]*/g) ?? [];
ok(warns.length >= 3, 'console.warn이 세 자리보다 적다');
ok(warns.every((w) => w.includes('[push]')),
   'console.warn 중 [push] 표지가 없는 것이 있다 — 로그에서 못 고른다: ' + warns.filter((w) => !w.includes('[push]')).join(' | '));

// ── ④ 화면이 그 값을 실제로 읽는다 ──
//    이게 없으면 catch는 은폐다. 검사의 핵심이 여기다.
ok(/import \{ getPushStatus \}/.test(set), '알림 설정 화면이 getPushStatus를 안 가져온다');
//    그 화면에 갈 수 있어야 읽는 의미가 있다.
ok(/navigate\('NotificationSettings'\)/.test(myset),
   '설정 화면에 알림 설정으로 가는 줄이 없다 — 화면은 있는데 갈 수 없다');
ok(/useState\(getPushStatus\)/.test(set), '알림 설정 화면이 상태를 안 읽는다');
ok(/pushStatus !== 'ok' && pushStatus !== 'unknown'/.test(set),
   '푸시를 못 받는 상태일 때의 안내 조건이 없다');
ok(/pushStatus === 'denied'/.test(set), '권한 거부와 그 밖을 화면이 안 가른다');
ok(set.includes('기기 설정에서 알림이 꺼져 있어요'), '권한 거부 안내 문구가 없다');
ok(set.includes('지금 이 기기에서는 푸시를 받을 수 없어요'), '발급 실패 안내 문구가 없다');

// ── ⑤ 권한 요청이 토큰 발급보다 먼저다 ──
//    순서가 뒤집히면 「사용자가 껐다」와 「빌드 설정이 틀렸다」가 같은 실패로 뭉개진다.
const permAt = svc.indexOf('requestPermissionsAsync');
const tokenAt = svc.indexOf('getExpoPushTokenAsync');
ok(permAt > -1 && tokenAt > -1 && permAt < tokenAt,
   '권한 요청이 토큰 발급보다 뒤에 있다');

// ── ⑥ 호출부가 결과를 버린다는 것이 표시돼 있다 ──
ok(/void registerForPushNotifications\(/.test(nav),
   'RootNavigator가 void 없이 부른다 — 버리는 것인지 잊은 것인지 구별이 안 된다');

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
