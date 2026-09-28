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
const teamHome = read('src/features/team/screens/TeamHomeScreen.tsx');

/*
  ⚠ **2026-09-29에 두 쌍이 늘었다.** 공지(`openAnnouncementId`)는 2단계에서
    이미 붙어 있었는데 **여기에 쌍이 안 들어와 있었다** — 검사가 둘만 지키는 동안
    셋째는 아무도 안 보고 있었다. 글(`openPostId`)을 붙이면서 같이 넣는다.
*/
for (const [name, dest, destFile] of [
  ['focusDate', attendance, 'AttendanceScreen'],
  ['openSettlementId', settlement, 'SettlementScreen'],
  ['openAnnouncementId', teamHome, 'TeamHomeScreen'],
  ['openPostId', teamHome, 'TeamHomeScreen'],
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

// ── ⑤ 글 지목이 끝까지 닿는가 ──
/*
  ⚠ **③만으로는 부족한 자리다.** 이름이 맞아도 id가 아예 없거나, 있어도 그 카드가
    안 그려지면 알림은 게시판 목록까지만 간다 — 화면에 오류가 안 보여서 조용하다.
    끝까지 닿으려면 조각 셋이 다 있어야 하고, 셋 다 다른 파일에 있다.
*/
const boardSvc = read('src/features/board/services/boardService.ts');
/*
  createPost가 id를 안 돌려주면 언급 알림에 실을 것이 없다.

  ⚠ **함수 안으로 좁혀서 본다.** 처음엔 파일 전체에 `insert(…)…select(`를 걸었는데
    `[\s\S]*?`가 함수 경계를 넘어 **다른 함수의 insert와 뒤쪽 select가 짝지어졌다** —
    .select()를 지우는 변이가 통과했다(2026-09-29). 이 저장소가 정규식으로 여러 번
    당한 자리다. 함수 하나를 잘라내서 그 안만 센다.
*/
const createPostBody = (() => {
  const at = boardSvc.indexOf('export async function createPost');
  if (at < 0) return '';
  const next = boardSvc.indexOf('export ', at + 10);
  return boardSvc.slice(at, next < 0 ? boardSvc.length : next);
})();
ok(createPostBody !== '', 'boardService에서 createPost를 못 찾았다');
ok(createPostBody.includes('.select('),
   "boardService.createPost에 .select()가 없다 — 새 글의 id가 안 돌아와 언급 알림이 " +
   '그 글을 못 지목한다');

const panel = read('src/features/board/components/BoardPanel.tsx');
ok(/openPostId/.test(panel), 'BoardPanel이 openPostId를 안 받는다');
ok(/autoOpen=/.test(panel), 'BoardPanel이 PostCard에 autoOpen을 안 내린다 — 카드가 안 펴진다');
/*
  ⚠ **분류 필터를 되돌리는가.** 필터가 걸린 채로 다른 분류의 글 알림을 누르면
    목표 글이 visible에서 빠져 **카드가 아예 안 그려진다.** 눌렀는데 아무 일도
    안 나는 모양이라 이 기능에서 제일 조용히 깨질 자리다.
  ⚠ 부정이 아니라 존재 단언이지만, 지우면 화면이 멀쩡해 보이므로 변이로 확인했다.
*/
ok(/if \(openPostId\) setFilter\(null\)/.test(panel),
   'BoardPanel이 openPostId를 받고도 분류 필터를 안 되돌린다 — 다른 분류가 걸려 있으면 ' +
   '목표 글이 목록에서 빠져 아무 카드도 안 펴진다');

const card = read('src/features/board/components/PostCard.tsx');
ok(/autoOpen/.test(card), 'PostCard가 autoOpen을 안 본다');
ok(/setShowComments\(true\)/.test(card), 'PostCard가 autoOpen에 댓글을 안 편다');

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
