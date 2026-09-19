/*
  팀이 하나인 사용자가 **두 번째 팀에 갈 수 있는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  출시 차단 ⑤였다. 둘이 **동시에** 막혀 있었다:

    ⑴ `TeamHomeScreen`이 `onPressTitle`을 `hasMultipleTeams`로 막았다.
       그런데 **「새 팀 만들기 / 초대 코드로 참여」가 그 시트 안에만 있다.**
       팀이 정확히 하나면 시트를 열 길이 없어 **영영 못 갔다.**
    ⑵ `pendingInvite`를 소비하는 곳이 **`TeamStartScreen` 하나뿐**이었다.
       그 화면은 팀이 **없는** 사람만 지난다 — 팀이 있는 사용자가 초대 링크를 열면
       `App.tsx`가 코드를 스토어에 넣고 **아무도 안 꺼냈다.** 조용히 버려졌다.

  ⚠ 야홍 6명 전원이 팀 하나짜리였다. **전원이 초대를 못 썼다.**

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ `TeamHomeScreen`의 `onPressTitle`이 조건 없이 넘어간다
  ⑵ `pendingInvite` 소비가 **`RootNavigator` 한 곳**이다 — 두 곳이면 경합한다
     (팀 없는 사용자는 TeamStart가 먼저 그려져 거기서 지워 버린다)
  ⑶ 소비가 **세션이 있을 때만** 일어난다 — 없으면 누구로 참여할지가 없다
  ⑷ **묻고 나서** 참여시킨다 — 되돌리려면 나가기를 해야 하고 마지막 총무면 막힌다
  ⑸ **취소해도 지운다** — 남기면 화면을 옮길 때마다 같은 물음이 다시 뜬다

  ⚠ 못 보는 것: 시트 안에 실제로 두 줄이 보이는지. 그건 기기에서 본다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (t: string) =>
  t
    .split('\r')
    .join('')
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

const read = (p: string) => strip(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

/* ── ⑴ 팀이 하나여도 제목이 눌린다 ──────────────────────────────── */
{
  const screen = read('src/features/team/screens/TeamHomeScreen.tsx');
  const tag = /<TabHeader[^>]*onPressTitle=\{([^}]*)\}/.exec(screen);
  assert.ok(tag, 'TeamHomeScreen이 TabHeader에 onPressTitle을 안 넘긴다 — 팀 전환 시트를 열 길이 없다');
  assert.ok(
    !/hasMultipleTeams|memberships\.length/.test(tag[1]),
    `제목 누름이 팀 개수로 막혀 있다: «${tag[1].trim()}» — ` +
      `「새 팀 만들기 / 초대 코드로 참여」가 그 시트 안에만 있어서 ` +
      `팀이 하나인 사용자는 두 번째 팀에 **영영 못 간다**`
  );
}

/* ── ⑵ 소비처가 RootNavigator 한 곳인가 ─────────────────────────── */
{
  const consumers: string[] = [];
  for (const rel of [
    'src/navigation/RootNavigator.tsx',
    'src/features/team/screens/TeamStartScreen.tsx',
    'src/features/team/screens/TeamHomeScreen.tsx',
    'src/features/home/screens/HomeScreen.tsx',
  ]) {
    /* `clear()`를 부르는 곳이 소비처다 — 읽기만 하는 것은 소비가 아니다 */
    if (/clearPendingInvite\(\)/.test(read(rel))) consumers.push(rel);
  }
  assert.deepEqual(
    consumers,
    ['src/navigation/RootNavigator.tsx'],
    `pendingInvite 소비처가 RootNavigator 하나가 아니다 — 두 곳이면 경합한다. ` +
      `팀 없는 사용자는 TeamStart가 먼저 그려져 거기서 지워 버리고 확인 시트가 안 뜬다:\n  ` +
      consumers.join('\n  ')
  );
}

/* ── ⑶⑷⑸ 세션 뒤에 · 묻고 · 취소해도 지운다 ────────────────────── */
{
  const nav = read('src/navigation/RootNavigator.tsx');
  const fx = /if \(!session \|\| !pendingInviteCode\) return;[\s\S]*?\n  \}, \[session\?\.user\.id, pendingInviteCode\]\);/.exec(nav);
  assert.ok(
    fx,
    'RootNavigator의 초대 소비 effect를 못 찾았다 — 세션·코드 둘 다 있을 때만 돌아야 한다'
  );
  const body = fx[0];

  assert.ok(
    /confirmAction\(/.test(body),
    `묻지 않고 참여시킨다 — 링크 한 번에 팀이 늘면 되돌리려면 나가기를 해야 하고, ` +
      `마지막 총무면 **막힌다**. 되돌리기 비용이 큰 동작은 묻는다`
  );

  const clearAt = body.indexOf('clearPendingInvite()');
  const joinAt = body.indexOf('joinTeam(');
  assert.ok(clearAt > 0 && joinAt > 0, '소비 effect에 clear 또는 join이 없다');
  assert.ok(
    clearAt < joinAt,
    `취소한 경우에 코드가 남는다 — clearPendingInvite()가 「ok」 분기 안에 있으면 ` +
      `거절해도 화면을 옮길 때마다 같은 물음이 다시 뜬다. **취소는 거절이다**`
  );
  /*
    ⚠ **⑹ 결과를 보여주는가.** `joinTeam`은 **던지지 않고** 스토어의 `error`에 적는데,
      그걸 그리는 곳이 **`TeamStartScreen` 하나뿐**이다. 이 경로는 그 화면을 안 지나므로
      **문구가 세워지고 아무도 안 보여줬다** — 사용자는 「참여하기」를 누르고
      **아무 일도 안 일어난 것**을 본다.

      2026-09-19에 vc 13 기기 판정에서 잡았다. 없는 코드도, 이미 멤버인 팀도
      **둘 다 무반응**이었다. 검사가 ⑴~⑸을 다 통과시키고도 못 본 자리다 —
      「상태를 세운다」와 「사용자가 본다」는 다르다.
  */
  assert.ok(
    /alertMessage\(/.test(body),
    `참여 결과를 화면에 안 보여준다 — joinTeam은 던지지 않고 스토어 error에 적고, ` +
      `그걸 그리는 곳은 TeamStartScreen뿐이라 이 경로에서는 **아무 일도 안 일어난 것처럼** 보인다`
  );
  assert.ok(
    /setState\(\{ error: null \}\)/.test(body),
    `보여준 뒤 스토어의 error를 안 비운다 — 나중에 TeamStart에 들어가면 지난 문구가 떠 있다`
  );
}

console.log('secondteam ✓ 팀이 하나여도 시트를 열 수 있고 · 초대는 한 곳에서 묻고 소비한다');
