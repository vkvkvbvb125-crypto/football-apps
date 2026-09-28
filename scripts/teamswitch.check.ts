// scripts/teamswitch.check.ts — 활성 팀 전환의 불변식
//
// 여기서 잡는 건 「두 번째 팀에 못 들어가던」 버그가 되살아나는 경로들이다.
// 화면으로는 안 보인다 — 팀이 하나뿐인 계정에서는 무엇을 망가뜨려도 똑같이 돈다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bodyFrom, onlyMatch } from './lib/anchor.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const store = read('src/features/team/stores/teamStore.ts');
const root = read('src/navigation/RootNavigator.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');
const sheet = read('src/features/team/components/TeamSwitchSheet.tsx');
const start = read('src/features/team/screens/TeamStartScreen.tsx');

// ── 1. loadMemberships가 선택을 덮어쓰지 않는다 ─────────────────────
// 원래 버그가 이 한 줄이었다. 이 함수는 슬로건·프로필·지역을 고칠 때마다 다시 불려서,
// 무조건 memberships[0]으로 두면 두 번째 팀에서 뭘 하든 첫 팀으로 튕긴다.
{
  assert.ok(
    !/set\(\{\s*memberships,\s*activeTeam:\s*memberships\[0\]/.test(store),
    'loadMemberships가 activeTeam을 memberships[0]으로 덮어쓴다 — 선택이 유지되지 않는다',
  );
  assert.ok(/preferTeamId \?\? current \?\? \(await readStoredTeamId\(\)\)/.test(store),
    '활성 팀 선택 우선순위(방금 만든 팀 → 보던 팀 → 저장된 팀)가 없다');
  // 그 팀에서 나갔으면 첫 팀으로 떨어져야 한다
  assert.ok(/memberships\.find\(\(m\) => m\.team\.id === wanted\) \?\? memberships\[0\] \?\? null/.test(store),
    '탈퇴·삭제된 팀이 활성이었을 때의 폴백이 없다');
}

// ── 2. setActiveTeam이 소속 밖의 팀을 받지 않는다 ───────────────────
{
  assert.ok(store.includes('setActiveTeam:'), 'setActiveTeam이 없다');
  /*
    구현부만 잘라 본다. 끝을 이름으로 잡으면 안 된다 — 같은 이름이 위쪽 인터페이스
    선언에도 있어서 시작보다 앞의 위치가 잡히고, 슬라이스가 빈 문자열이 된다.

    ⚠ **전에는 `slice(from, from + 1200)`이었다. 그게 결함이었다.**
      구현부는 **734자**라 창이 466자 넘어가 이웃 `loadMembers`를 함께 봤다.
      그래서 `setActiveTeam`의 early `return;`을 지워도 — 아래 단언이 이름으로
      겨눈 바로 그 결함인데 — 이웃의 `if (!activeTeam) return;`이 게으른 span을
      만족시켜 **PASS했다.** 2026-09-29에 변이로 확인하고 고쳤다.
      **다음 액션 경계까지** 자른다(anchor.ts의 bodyFrom).
  */
  const body = bodyFrom(store, 'setActiveTeam: (teamId)', 'setActiveTeam 구현부', [
    /\n  [A-Za-z][A-Za-z0-9]*: (async )?\(/,
  ]);
  assert.ok(/memberships\.find\(\(m\) => m\.team\.id === teamId\)/.test(body), '소속 여부를 확인하지 않는다');
  assert.ok(/console\.warn/.test(body), '소속되지 않은 팀을 조용히 무시한다 — 경고가 없다');
  assert.ok(/if \(!next\) \{[\s\S]*?return;/.test(body), '소속되지 않은 팀인데 그대로 진행한다');
  // 이전 팀 멤버가 남으면 안 된다
  assert.ok(/set\(\{ activeTeam: next, members: \[\] \}\)/.test(body), '전환할 때 이전 팀 멤버를 비우지 않는다');
}

// ── 3. 선택이 기기에 남고, 켤 때 돌아온다 ──────────────────────────
{
  assert.ok(store.includes('AsyncStorage'), '선택한 팀을 저장하지 않는다 — 앱을 끄면 첫 팀으로 돌아간다');
  assert.ok(/storeTeamId\(teamId\)/.test(store), 'setActiveTeam이 선택을 저장하지 않는다');
  assert.ok(/if \(activeTeam\) storeTeamId\(activeTeam\.team\.id\)/.test(store),
    '폴백으로 팀이 바뀌었을 때 저장값을 갱신하지 않는다 — 다음에 켤 때 또 없는 팀을 찾는다');
}

// ── 4. 만든 팀 / 가입한 팀으로 들어간다 ─────────────────────────────
{
  assert.ok(/loadMemberships\(created\?\.id\)/.test(store), '팀을 만들고 그 팀으로 안 들어간다');
  // null(이미 멤버)은 위에서 걸러지므로 여기선 옵셔널 체이닝이 없다
  assert.ok(/loadMemberships\(joined\.team_id\)/.test(store), '초대로 가입하고 그 팀으로 안 들어간다');
}

// ── 5. 팀에 딸린 데이터가 전환 때 비워진다 ──────────────────────────
// teamStore가 직접 못 지운다(순환 import). RootNavigator 한자리에서 지운다 —
// 전환·생성·가입·폴백이 전부 activeTeam.team.id 변화로 나타난다.
{
  for (const [needle, what] of [
    ['useAttendanceStore.setState', '경기'],
    ['useSettlementStore.setState', '정산'],
    ['useAnnouncementsStore.setState', '공지'],
  ] as const) {
    assert.ok(root.includes(needle), `팀이 바뀔 때 ${what} 데이터를 안 비운다 — 이전 팀 값이 남는다`);
  }
  assert.ok(/prevTeamId\.current !== undefined/.test(root),
    '첫 진입에도 비운다 — 막 불러온 데이터를 지울 수 있다');
  /*
   * 이 목록은 손으로 관리한다. 스토어를 새로 만들고 여기 등록을 잊으면 이전 팀 데이터가
   * 조용히 남는다 — 소스에서 「팀 종속 스토어가 몇 개인지」를 알 방법이 없어서, 검사가
   * 할 수 있는 건 경고를 지우지 못하게 붙잡아 두는 것뿐이다.
   */
  assert.ok(/⚠ 팀 종속 스토어를 새로 만들면 여기에도 등록할 것/.test(root),
    '새 스토어를 등록하라는 경고가 사라졌다 — 다음 사람이 목록을 못 보고 지나간다');
  /*
    teamStore는 다른 스토어를 import하면 안 된다 (attendance·announcements가 teamStore를 본다).

    ⚠ **import 줄만 본다.** 전에는 파일 전체에서 이름을 찾았는데, 그러면 **주석에 그
      이름을 적기만 해도 실패한다.** 실제로 그랬다 — teamStore에 「announcementsStore·
      attendanceStore가 같은 모양이다」라고 전례를 적었더니 순환 import로 잡혔다.
      근거를 주석에 적는 저장소라 앵커가 코드와 주석 양쪽에 있는 일이 흔하다
      (checks.mjs 머리말의 그 함정이다).

    ⚠ authStore는 이 목록에 없다. 그건 team을 전혀 안 보므로 순환이 아니다 —
      teamStore가 세션을 얻으려고 import한다(2026-09-15).
  */
  const noComments = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));
  for (const bad of ['attendanceStore', 'settlementStore', 'announcementsStore']) {
    assert.ok(!noComments.includes(bad), `teamStore가 ${bad}를 import한다 — 순환 import가 된다`);
  }
}

// ── 6. 팀이 하나여도 시트를 열 수 있다 ──────────────────────────────
/*
  ⚠ **여기 전에는 정반대가 적혀 있었다** — 「팀이 하나면 아무것도 안 바뀐다」,
    근거는 「팀이 하나여도 제목이 눌린다 — 셰브론이 붙고 **빈 시트**가 열린다」였다.

  ⚠ **그 근거가 틀렸다. 시트는 비어 있지 않다** — 바로 아래 ⑧이 그 시트에
    「새 팀 만들기 / 초대 코드로 참여」가 있어야 한다고 **같은 파일에서** 못 박고 있다.
    한 검사 안에서 두 항목이 서로 어긋나 있었다.

  실제 결과는 출시 차단이었다(2026-09-19): 팀이 **정확히 하나**인 사용자는
  시트를 열 길이 없어 **두 번째 팀에 영영 못 갔다.** 야홍 6명 전원이 그 상태였다.

  ⓘ 전수 검사(제목 누름 · 초대 소비 · 확인 · 취소)는 `secondteam.check.ts`가 한다.
    여기서는 이 화면의 모양만 본다.
*/
{
  const tag = /<TabHeader[^>]*onPressTitle=\{([^}]*)\}/.exec(screen);
  assert.ok(tag, 'TeamHomeScreen이 TabHeader에 onPressTitle을 안 넘긴다');
  assert.ok(
    !/hasMultipleTeams|memberships\.length/.test(tag[1]),
    `제목 누름이 팀 개수로 막혀 있다: «${tag[1].trim()}» — ` +
      `시트 안에만 있는 「새 팀 만들기 / 초대 코드로 참여」에 못 닿는다`
  );
}

// ── 7. 전환하면 내부 탭이 홈으로 돌아온다 ───────────────────────────
// 멤버 탭에 선 채로 팀을 바꾸면 제목만 바뀐 「멤버 관리」에 남는다.
{
  assert.ok(/setTab\('home'\);\s*\n\s*\}, \[activeTeam\?\.team\.id\]\)/.test(screen),
    '팀이 바뀔 때 내부 탭을 홈으로 되돌리지 않는다');
}

// ── 8. 시트가 현재 팀을 표시하고, 만들기/참여로 나갈 수 있다 ────────
{
  assert.ok(/accessibilityState=\{\{ selected: active \}\}/.test(sheet), '현재 팀을 접근성에 알리지 않는다');
  assert.ok(/checkmark/.test(sheet), '현재 팀에 체크가 없다');
  // 뱃지 문구는 rolelabel.check가 전수로 붙든다 — 여기서는 있는지만 본다
  assert.ok(/role === 'admin' \? '총무' : '팀원'/.test(sheet), '역할 뱃지가 없다');
  assert.ok(/onCreateOrJoin/.test(sheet), '새 팀 만들기 / 참여 진입이 없다');
  /*
    팀이 있을 때도 그 화면이 등록돼 있어야 한다.

    ⚠ **이름이 "TeamAddAnother"다 — "TeamOnboarding"이 아니다.** 2026-09-16까지 둘 다
      같은 이름이었고, 그게 「팀을 만들어도 화면이 안 넘어간다」의 원인이었다
      (React Navigation은 바뀐 목록에 같은 이름이 있으면 그 라우트에 머문다).
    ⚠ 여기서 옛 이름을 다시 못 박으면 **고친 것을 되돌리라고 검사가 요구하게 된다.**
      이름이 겹치는 것 자체는 screenname.check가 따로 막는다.
  */
  assert.ok(/name="TeamAddAnother"[\s\S]{0,400}name="TeamSettings"/.test(root),
    '팀이 있는 상태에서 TeamAddAnother 라우트가 없다 — 시트의 「새 팀」이 죽는다');
  /*
    그리고 팀이 생기면 스스로 내려와야 한다.

    예전엔 /navigation.canGoBack()/ 하나로 봤는데 그 꼴이 파일에 둘이다 —
    이 이펙트와 헤더의 뒤로 버튼 렌더. 이펙트를 지워도 버튼 줄이 통과시켰다.
    「팀이 바뀌면 내려온다」는 한 자리를 말하는 단언이니 그 자리를 특정한다.
  */
  const backOut = onlyMatch(
    start,
    /if \(activeTeamId !== openedWith\.current && navigation\.canGoBack\(\)\)[\s\S]*?navigation\.goBack\(\);/,
    'TeamStartScreen의 자동 내려오기'
  );
  assert.ok(backOut, 'TeamStartScreen이 스택에 얹혔을 때 빠져나오지 못한다');
}

// ── 9. 팀 전환 시트가 연 새 경로가 막다른 길이 아닌가 ──────────────
// 팀이 있는 상태에서 TeamStartScreen을 열 수 있게 되면서 두 경우가 실제로 닿는다.
{
  /*
    이미 속한 팀의 코드 — RPC가 on conflict의 where로 걸러 23505가 아니라 **null**이 온다.
    예전 매핑('23505': '이미 가입한 팀이에요')은 한 번도 안 걸렸고 화면은 무반응이었다.

    ⚠ **주석을 걷고 본다.** 2026-09-19에 문구를 「이미 참여 중인 팀이에요」로 바꾸면서
      teamStore에 **왜 바꿨는지를 옛 문구와 함께** 적었다. 그랬더니 이 단언이
      **그 주석에 걸려 통과했다** — 코드는 이미 바뀐 뒤였는데도.
      근거를 주석에 적는 저장소라 이 덫을 **다섯 번째** 밟았다.

    ⚠ 문구가 오류 어투이면 안 된다. 링크를 연 사람에게 이건 실패가 아니라 **이미 된 일**이다.
  */
  const storeCode = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));
  assert.ok(/if \(!joined\) \{[\s\S]{0,200}?이미 참여 중인 팀이에요/.test(storeCode),
    'RPC가 null을 줄 때(이미 멤버) 아무 말도 안 하거나, 문구가 「이미 참여 중인 팀이에요」가 아니다');
  assert.ok(!/이미 가입한 팀이에요/.test(storeCode),
    '옛 문구 「이미 가입한 팀이에요」가 코드에 남아 있다 — 오류처럼 읽힌다');
  assert.ok(!/'23505': '이미/.test(storeCode),
    "걸리지 않는 23505 매핑이 남아 있다 — 처리되는 것처럼 보인다");

  // 스택에 얹혔을 때 나갈 길
  assert.ok(/navigation\.canGoBack\(\) \? \(/.test(start),
    '팀이 있는 상태로 열렸을 때 닫기 버튼이 없다 — 로그아웃 말고 나갈 길이 없다');
}

console.log('teamswitch ok');
