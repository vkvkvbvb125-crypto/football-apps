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
/*
  ⚠ **동기 `getLastNotificationResponse()`를 요구하면 안 된다. 그게 결함이었다.**
    콜드 스타트에서 **늘 null**이었다 — SDK 문서가 말하는 그대로다:
    훅은 `undefined`(아직 무엇을 돌려줄지 모른다) → 정해지면 값. 동기 버전은
    그 「아직 모르는」 구간에 불려 null을 받고 끝난다.
    2026-09-29에 기기에서 봤다(am kill 뒤 푸시로 깨워 탭 → 20초 기다려도 홈).
  ⚠ 그래서 **훅을 요구한다.** 동기 버전으로 되돌아가면 여기서 FAIL이다.
*/
ok(/useLastNotificationResponse\(\)/.test(app),
   'App.tsx가 useLastNotificationResponse를 안 쓴다 — 동기 getLastNotificationResponse는 ' +
   '콜드 스타트에서 늘 null이라 앱이 죽어 있을 때 누른 알림을 놓친다');
ok(!/getLastNotificationResponse\(\)/.test(app),
   'App.tsx가 동기 getLastNotificationResponse()로 되돌아갔다 — 콜드 스타트를 다시 놓친다');
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
  /* 앵커를 훅에서 리스너로 옮겼다 — 동기 호출이 사라졌으므로 */
  const at = app.indexOf('addNotificationResponseReceivedListener');
  if (at < 0) return '';
  const from = app.lastIndexOf('useEffect', at);
  return from < 0 ? '' : app.slice(from, at);
})();
ok(notifBlock !== '', '알림 useEffect를 못 찾았다');
ok(!/session/.test(notifBlock),
   'App.tsx의 알림 처리에 세션 조건이 붙었다 — cold start를 다시 놓치게 된다');

// ── ⑦ 탭 되돌리기가 **첫 마운트에 돌면 안 된다** ──
/*
  ⚠ **⑥을 고치자마자 그 아래에서 나온 두 번째 결함이다.** 탭 전환이 되기 시작하니
    비로소 보였다 — 알림으로 들어온 **첫 진입**이 늘 팀 홈에 떨어졌다.

    `TeamHomeScreen`에는 효과가 둘 있다:
        setTab(paramTab)   ← 알림이 지정한 탭
        setTab('home')     ← 팀을 **바꿨을 때** 되돌리기
    효과는 **선언 순서대로** 돌아서 마운트 때 뒤엣것이 이긴다.
    이미 마운트된 상태에서는 뒤엣것이 다시 안 돌아 **멀쩡했다** —
    그래서 「앱을 새로 열고 알림을 누르는」 가장 흔한 경로에서만 틀렸다.

  ⚠ **이것도 ⑥과 같은 종류다**(글자는 맞고 런타임 순서가 틀렸다).
    여기서 붙드는 것은 **「직전 팀 id와 견주는 가드가 있는가」** 하나뿐이다.
*/
const teamScreen = read('src/features/team/screens/TeamHomeScreen.tsx');
const resetAt = teamScreen.indexOf("setTab('home')");
ok(resetAt >= 0, 'TeamHomeScreen에 팀 전환 시 홈으로 되돌리는 자리가 없다');
{
  /* 그 호출이 들어 있는 효과 블록만 잘라 본다 — 파일 전체를 보면 위쪽 선언이 대신 통과시킨다 */
  const from = teamScreen.lastIndexOf('useEffect(', resetAt);
  const block = from >= 0 ? teamScreen.slice(from, resetAt) : '';
  ok(
    block.includes('lastTeamId.current') && block.includes('return'),
    "TeamHomeScreen의 setTab('home')이 첫 마운트에도 돈다 — 바로 위 효과가 세운 " +
      '탭(알림이 지정한 탭)을 덮는다. 직전 팀 id와 견줘서 **바뀐 경우에만** 되돌려라'
  );
}

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
/*
  ⚠ **목록을 다시 읽는가.** 이게 빠져 있었다 — 패널이 **이미 마운트돼 있으면**
    `load()`가 다시 안 돌아 **방금 올라온 글이 목록에 없다.** 필터를 풀어도 펼 카드가
    없다(2026-09-29 기기, B② 판정). 공지도 같은 병이라 아래에서 같이 본다.
    **알림은 늘 「방금 생긴 것」을 가리킨다.**
*/
const openPostBody = (() => {
  const at = panel.indexOf('if (!openPostId) return;');
  return at >= 0 ? panel.slice(at, at + 200) : '';
})();
{
  const body = openPostBody;
  ok(body.includes('load()'),
     'BoardPanel이 openPostId를 받고도 목록을 다시 안 읽는다 — 이미 마운트돼 있으면 ' +
     '방금 올라온 글이 목록에 없어 펼 카드가 없다');
}
{
  const at = teamHome.indexOf('setPendingAnnouncementId(openAnnouncementId)');
  const body = at >= 0 ? teamHome.slice(at, at + 400) : '';
  ok(body.includes('loadAnnouncements()'),
     'TeamHomeScreen이 openAnnouncementId를 받고도 공지 목록을 다시 안 읽는다 — ' +
     '공지 알림은 공지를 **만드는 순간** 나가므로 앱이 떠 있는 사용자의 목록엔 그 공지가 없다');
}
/*
  ⚠ **같은 효과 블록 안에서 본다.** 파일 전체에 `setFilter(null)`을 걸었더니
    다른 자리(분류 칩을 다시 누르면 전체로 돌아가는 곳)가 대신 통과시켰다 —
    되돌리기를 지우는 변이가 새어 나갔다(2026-09-30). 또 「위치로 잘랐다」다.
*/
ok(openPostBody.includes('setFilter(null)'),
   'BoardPanel이 openPostId를 받고도 분류 필터를 안 되돌린다 — 다른 분류가 걸려 있으면 ' +
   '목표 글이 목록에서 빠져 아무 카드도 안 펴진다');

const card = read('src/features/board/components/PostCard.tsx');
ok(/autoOpen/.test(card), 'PostCard가 autoOpen을 안 본다');
ok(/setShowComments\(true\)/.test(card), 'PostCard가 autoOpen에 댓글을 안 편다');

// ── ⑥ 탭을 열 때 **탭 이름을 바로 부르지 않는가** ──
/*
  ⚠ **이 결함은 검사가 볼 수 없는 종류였다.** 글자는 전부 맞았다 —
    `routeFor`가 `{screen:'Attendance'}`를 만들고, 목적지가 그 이름을 갖고 있고,
    ③의 짝 맞추기도 통과했다. 그런데 **런타임에 안 닿았다.**

    `MainTabNavigator`는 `Stack.Screen name="Main"` 안에 있다. 그래서
    `useNavigation()`이 주는 것은 **스택의** navigation이고, 탭 이름은 그보다
    **아래쪽**이다. React Navigation은 위로만 찾으므로 아무 데도 안 닿고,
    **예외도 안 난다.** 2026-09-29에 기기에서 처음 밟고서야 알았다 —
    그때까지 알림·정산 딥링크가 **한 번도 동작한 적이 없다.**

  ⚠ **이 단언이 막는 것은 「이 모양」 하나뿐이다.** 같은 종류
    (「글자는 맞는데 런타임에 안 닿는다」)의 다음 결함은 또 못 잡는다.
    검사는 화면을 못 본다 — 그 경계를 서랍에 적어 뒀다.

  ⚠ **다른 파일은 안 본다.** HomeScreen 같은 탭 **안**의 화면은 탭 navigation을
    얻으므로 `navigate('Attendance')`가 맞는 코드다. 틀린 자리는 **탭을 렌더하는
    그 파일**뿐이다.
*/
const tabs = read('src/navigation/MainTabNavigator.tsx');
/*
  ⚠ **탭 이름 목록으로 세지 마라.** 처음엔 ['Home','Attendance',…]를 리터럴로 찾았는데,
    알림 쪽은 `navigate(pendingNotification.screen, …)`처럼 **변수**라 안 걸렸다 —
    옛 모양으로 되돌리는 변이가 그대로 통과했다(2026-09-29).
    규칙을 뒤집어서 센다: **이 파일의 모든 navigate는 'Main'이어야 한다.**
    그러면 리터럴이든 변수든 전부 걸린다.
*/
/*
  ⚠ **`navigate`와 `popTo` 둘 다 본다.** 실제로 쓰는 것은 `popTo`다 —
    `navigate('Main', …)`는 `tour.check`가 막는다(Main을 하나 더 밀어 마운트 상태를
    잃는다; `MySettingsScreen`이 그 사고를 냈다). 검사가 한쪽만 보면 다른 쪽으로
    옛 모양이 되살아난다.
*/
const badNav: string[] = [];
for (const fn of ['navigation.navigate(', 'navigation.popTo(']) {
  for (let i = tabs.indexOf(fn); i >= 0; i = tabs.indexOf(fn, i + 1)) {
    const after = tabs.slice(i + fn.length, i + fn.length + 8);
    if (!after.startsWith("'Main'")) {
      badNav.push(tabs.slice(i, i + 60).split(String.fromCharCode(10))[0]);
    }
  }
}
ok(badNav.length === 0,
   'MainTabNavigator의 화면 이동이 ' + "'Main'" + '을 안 거친다:' + NL + '  ' + badNav.join(NL + '  ') + NL +
   "  여기서 얻는 navigation은 **스택의 것**이라 탭 이름에 안 닿는다(예외도 안 난다). " +
   "popTo('Main', { screen, params }) 형태로 불러라");
/* 반대쪽도 본다 — 중첩 형태가 실제로 있는가. 없으면 딥링크가 통째로 사라진 것이다 */
ok(tabs.includes("popTo('Main', {"),
   "MainTabNavigator에 popTo('Main', { screen … })가 없다 — 알림·정산 딥링크가 탭을 못 연다");

// 소비하는 쪽
ok(/usePendingNotificationStore/.test(tabs), 'MainTabNavigator가 대기 중인 알림을 안 꺼낸다');
ok(/clearPendingNotification\(\)/.test(tabs),
   '소비 후 안 비운다 — 탭을 옮겼다 오면 같은 화면이 또 열린다');

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(NL));
  process.exit(1);
}
console.log('deeplink ok');
