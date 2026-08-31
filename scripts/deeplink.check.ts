/*
  알림을 누르면 그 알림이 가리키는 곳으로 간다.

  이 검사가 생긴 이유. 리스너 둘이 **둘 다** loadNotifications()만 했다 —
  응답의 data를 읽는 코드가 0줄이었다. 「새 경기가 등록됐어요」를 눌렀는데
  팀 화면이 나오면, 그 알림은 데려다주지 못하고 「직접 찾아가라」고 하는 셈이다.

  이 사슬은 네 곳을 지난다. 한 곳만 끊겨도 **조용히** 실패한다 —
  화면은 뜨고 아무 일도 안 일어난다:

    ① Edge Function이 data를 싣는다        (안 실으면 앱이 읽을 게 없다)
    ② 호출부가 target을 넘긴다             (안 넘기면 탭까지만 간다)
    ③ routeFor가 목적지 파라미터로 바꾼다  (이름이 갈리면 무시된다)
    ④ 세션과 무관한 자리에서 응답을 읽는다 (세션 뒤면 cold start를 놓친다)

  ④가 제일 안 보인다. 앱이 켜져 있을 때는 잘 되고, 죽어 있을 때만 안 된다.
*/
import { readFileSync } from 'node:fs';

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const read = (p: string) => strip(readFileSync(p, 'utf8'));

// ── ① Edge Function이 data를 싣는다 ──
const fn = read('supabase/functions/notify-team/index.ts');
ok(/kind, target \} = await req\.json\(\)/.test(fn), 'notify-team이 target을 안 받는다');
ok(/const data = kind \?/.test(fn), 'notify-team이 data를 안 만든다');
ok(/\.\.\.\(data \? \{ data \} : \{\}\)/.test(fn),
   'messages에 data가 안 실린다 — 만들어만 놓고 안 쓰는 모양이다');
/*
  kind가 없으면 data를 안 싣는다. 빈 객체를 실으면 앱이 매번 「data는 있는데
  갈 곳이 없다」를 판정하게 된다.
  ⚠ 부정 단언이라 변이로 확인했다.
*/
ok(!/data: \{ kind, /.test(fn) || /const data = kind \?/.test(fn),
   'kind 없이도 data를 싣는다');

// ── ② 호출부가 target을 넘긴다 ──
/*
  값이 손에 있는 다섯 자리. 나머지 셋(공지·멘션·댓글)은 1단계에서 탭까지만 간다 —
  공지 상세와 글 상세가 화면 안의 지역 상태라 밖에서 지정할 파라미터가 없다.
*/
const TARGETS: [string, string][] = [
  ['src/features/attendance/stores/attendanceStore.ts', 'matchDate: input.matchDate'],
  ['src/features/attendance/stores/attendanceStore.ts', 'matchDate: first.matchDate'],
  ['src/features/attendance/screens/AttendanceScreen.tsx', 'matchDate: match.match_date'],
  ['src/features/home/screens/HomeScreen.tsx', 'matchDate: next.match_date'],
  ['src/features/settlement/screens/SettlementScreen.tsx', 'settlementId: s.id'],
];
for (const [file, needle] of TARGETS) {
  ok(read(file).includes(needle), `${file.split('/').pop()}가 ${needle}를 안 넘긴다`);
}

// ── ③ routeFor가 목적지가 읽는 이름으로 바꾼다 ──
/*
  여기가 제일 조용하게 깨진다. 이름이 갈리면 navigate는 되고 파라미터만 무시된다 —
  화면은 뜨는데 그 경기로 안 간다. 그래서 **양쪽을 다 읽어서 맞춘다.**
  한쪽만 단언하면 다른 쪽이 바뀔 때 못 잡는다.
*/
const route = read('src/features/notifications/notificationRoute.ts');
const attendance = read('src/features/attendance/screens/AttendanceScreen.tsx');
const settlement = read('src/features/settlement/screens/SettlementScreen.tsx');

for (const [name, dest, destFile] of [
  ['focusDate', attendance, 'AttendanceScreen'],
  ['openSettlementId', settlement, 'SettlementScreen'],
] as const) {
  ok(route.includes(name), `routeFor가 ${name}를 안 만든다`);
  /*
    정규식을 안 쓴다. 이 저장소에서 문자열이 셸을 두 번 지나가며 열 번 넘게 샜고,
    방금 이 줄에서도 샜다 — `\{`가 `\{`로 줄어 `\s`가 리터럴 s가 됐다.
    찾는 것이 「route.params as { name?: string }」 한 모양뿐이라 그대로 센다.
  */
  ok(dest.includes('{ ' + name + '?: string }'),
     `${destFile}이 ${name}를 route.params에서 안 읽는다 — 이름이 갈렸다`);
}

// ── ④ 응답을 세션과 무관한 자리에서 읽는다 ──
/*
  RootNavigator의 알림 리스너는 `if (!session) return`으로 막혀 있다. 앱 안의
  알림 목록을 갱신하는 일이라 맞는 조건이지만, **어디로 갈지 정하는 일에는
  세션이 필요 없다.** 거기 얹으면 앱이 죽어 있을 때 누른 알림은 응답이 세션
  복원보다 먼저 와서 리스너가 붙기도 전에 지나간다.
*/
const app = read('App.tsx');
ok(/getLastNotificationResponse\(\)/.test(app),
   'App.tsx가 cold start 응답을 안 읽는다 — 앱이 죽어 있을 때 누른 알림을 놓친다');
ok(/addNotificationResponseReceivedListener/.test(app),
   'App.tsx가 실행 중 응답을 안 읽는다');
ok(/clearLastNotificationResponse\(\)/.test(app),
   '소비한 응답을 안 지운다 — 런처로 앱을 열 때마다 같은 화면이 다시 열린다');
/*
  ⚠ App.tsx에 세션 조건이 붙으면 이 자리를 둔 이유가 사라진다.
    부정 단언이라 변이로 확인했다.
*/
const NL = String.fromCharCode(10);
const notifBlock = (() => {
  const at = app.indexOf('getLastNotificationResponse');
  if (at < 0) return '';
  const from = app.lastIndexOf('useEffect', at);
  return from < 0 ? '' : app.slice(from, at);
})();
ok(notifBlock !== '', '알림 useEffect를 못 찾았다');
ok(!/session/.test(notifBlock),
   'App.tsx의 알림 처리에 세션 조건이 붙었다 — cold start를 다시 놓치게 된다');

// 소비하는 쪽
const tabs = read('src/navigation/MainTabNavigator.tsx');
ok(/usePendingNotificationStore/.test(tabs), 'MainTabNavigator가 대기 중인 알림을 안 꺼낸다');
ok(/clearPendingNotification\(\)/.test(tabs),
   '소비 후 안 비운다 — 탭을 옮겼다 오면 같은 화면이 또 열린다');

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(NL));
  process.exit(1);
}
console.log('deeplink ok');
