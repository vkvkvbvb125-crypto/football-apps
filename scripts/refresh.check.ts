/*
  당겨서 새로고침이 **화면에 있는 것을 전부** 다시 불러오는가.

  홈은 네 곳에서 온 값을 한 화면에 모은다 — 경기·멤버·공지·정산.
  하나라도 빠지면 「당겼는데 저건 안 바뀌네」가 되고, 그때 사용자는 무엇이
  갱신되고 무엇이 아닌지를 추측하게 된다. 새로고침이 있는데 못 믿는 상태가
  아예 없는 것보다 나쁘다.

  ⚠ 마운트 때 부르는 것과 **같은 넷**이어야 한다. 화면에 카드를 하나 더 붙이면서
    마운트 쪽에만 로더를 추가하면 둘이 갈리는데, 그건 화면을 열어봐도 안 보인다 —
    처음 열 때는 맞게 뜨고 당겼을 때만 그 카드가 안 바뀐다.
    그래서 **두 자리를 비교**한다. 한쪽만 세면 갈린 것을 못 잡는다.
*/
import { readFileSync } from 'node:fs';

const NL = String.fromCharCode(10);
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const src = strip(readFileSync('src/features/home/screens/HomeScreen.tsx', 'utf8'));

/** 함수 본문을 괄호 균형으로 떼어낸다 */
function bodyAfter(marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) return '';
  let d = 0;
  for (let i = src.indexOf('{', at); i < src.length; i += 1) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') { d -= 1; if (d === 0) return src.slice(at, i + 1); }
  }
  return '';
}

const LOADERS = ['loadMatches', 'loadMembers', 'loadAnnouncements', 'loadSettlements'];

// ── ① RefreshControl이 붙어 있다 ──
ok(/<RefreshControl/.test(src), '홈에 RefreshControl이 없다 — 당겨서 새로고침이 안 된다');
ok(/refreshing=\{refreshing\}/.test(src), 'RefreshControl이 상태를 안 읽는다 — 스피너가 안 돈다');
ok(/onRefresh=\{refresh\}/.test(src), 'RefreshControl에 onRefresh가 없다');

// ── ② 넷을 다 부른다 ──
const refreshBody = bodyAfter('const refresh = useCallback(async () => {');
ok(refreshBody !== '', 'refresh 함수를 못 찾았다');
for (const fn of LOADERS) {
  ok(refreshBody.includes(fn + '('), `새로고침이 ${fn}을 안 부른다 — 그 값만 안 바뀐다`);
}

// ── ③ 마운트 때와 같은 넷이다 ──
/*
  두 자리를 비교한다. 마운트 쪽에 로더가 하나 늘었는데 새로고침 쪽에 안 늘면
  여기서 걸린다 — 그게 이 검사의 핵심이다.
*/
const mountBody = bodyAfter('useEffect(() => {' + NL + '    if (!activeTeam) return;');
ok(mountBody !== '', '마운트 로딩 이펙트를 못 찾았다');
const called = (body: string) => LOADERS.filter((f) => body.includes(f + '(')).sort().join(',');
ok(called(mountBody) === called(refreshBody),
   '마운트와 새로고침이 부르는 로더가 다르다. ' +
   `마운트: ${called(mountBody) || '(없음)'} / 새로고침: ${called(refreshBody) || '(없음)'}`);

// ── ④ 실패해도 스피너가 멈춘다 ──
/*
  finally가 없으면 로더 하나가 던지는 순간 스피너가 영원히 돈다. 화면은 멀쩡해
  보이는데 위쪽에서 계속 도는 상태라, 사용자는 앱이 멈췄다고 읽는다.
*/
/*
  ⚠ 창(N자)으로 보면 안 된다. `finally {}` 뒤에 setRefreshing(false)를 두면
    빈 finally인데도 통과한다 — 변이 시험에서 실제로 통과했다.
    (anchor.ts 「창으로 훑으면 놓친다」의 이 파일 판이다.)
    finally 블록을 **떼어내서** 그 안을 본다.
*/
const finallyBody = (() => {
  const at = refreshBody.indexOf('finally');
  if (at < 0) return '';
  let d = 0;
  for (let i = refreshBody.indexOf('{', at); i < refreshBody.length; i += 1) {
    if (refreshBody[i] === '{') d += 1;
    else if (refreshBody[i] === '}') { d -= 1; if (d === 0) return refreshBody.slice(at, i + 1); }
  }
  return '';
})();
ok(finallyBody !== '', '실패 시 스피너를 멈추는 finally가 없다 — 로더가 던지면 영원히 돈다');
ok(/setRefreshing\(false\)/.test(finallyBody),
   'finally 안에서 스피너를 안 멈춘다 — 블록은 있는데 비어 있다');

// ── ⑤ 스피너가 배경에 묻히지 않는다 ──
ok(/tintColor=\{colors\./.test(src) && /colors=\{\[colors\./.test(src),
   '스피너 색을 테마에서 안 가져온다 — 기본 회색이라 배경에 묻힌다');

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(NL));
  process.exit(1);
}
console.log('refresh ok');
