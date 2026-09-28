/*
  강퇴 재참여 차단이 **끝까지 닿는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  이 기능은 조각 넷이 서로를 떠받친다. 하나만 빠져도 **화면은 멀쩡하고
  동작만 틀린다** — 이 저장소가 제일 여러 번 당한 모양이다.

      표식      remove_member가 removed_at을 찍는다        (서버)
      차단      join_team_by_invite가 그걸 보고 막는다     (서버)
      되돌리기  총무가 표식을 지운다                        (서버 + 화면)
      코드      되돌린 사람에게 현재 코드를 알려준다        (화면)

  ⚠ **서버 쪽은 여기서 못 본다.** 함수 본문이 저장소에 없다(콘솔에서 적용한다).
    그래서 붙드는 것은 **클라이언트가 그 넷을 전제하고 있는가**다 —
    전제가 사라지면(예: 되돌리기 UI가 없어지면) 차단만 남아 **오조작 한 번이
    복구 불가**가 된다. 그게 이 묶음을 넷으로 묶은 이유다.

  ⚠ **「뷰가 막아준다」는 오해를 특히 붙든다.** team_members_removed는
    security_invoker라 팀원도 읽는다. 총무 전용은 화면이 가른다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(p, 'utf8'));
const raw = (p: string) => readFileSync(p, 'utf8');

const service = read('src/features/team/services/teamService.ts');
const modal = read('src/features/team/components/MemberListModal.tsx');
const sheet = read('src/features/team/components/InviteSheet.tsx');
const store = read('src/features/team/stores/teamStore.ts');

/* ── ⑴ 서비스가 넷을 다 갖췄는가 ────────────────────────────────── */
assert.ok(
  /export const REMOVED_MEMBERS = 'team_members_removed';/.test(service),
  `teamService에 REMOVED_MEMBERS 상수가 없다 — 뷰 이름이 흩어지면 하나만 고쳐도 갈린다 ` +
    `(ACTIVE_MEMBERS와 같은 규칙)`
);
/*
  ⚠ **정규식을 안 쓴다.** 처음엔 RegExp에 단어 경계를 넣어 썼는데, 그 이스케이프가
    셸을 지나며 백슬래시 하나로 줄어 **백스페이스 문자**가 됐다 — 함수가 멀졕히
    있는데 FAIL이 났다. 이 저장소가 문서에 적어 둔 덤이고(deeplink.check ③ 머리말),
    이번에도 같은 자리에서 두 번 걸렸다. 그냥 센다.
*/
for (const fn of ['fetchRemovedMembers', 'restoreMember', 'rotateInviteCode']) {
  assert.ok(service.includes('export async function ' + fn + '('), `teamService에 ${fn}가 없다`);
}

/*
  ⚠ **P0001 변환이 붙어 있는가.** 서버가 한국어로 쓴 거절 문구가 여기서 안 열리면
    사용자는 「문제가 생겼어요. 잠시 후 다시 시도해주세요」를 본다 —
    영원히 안 되는 일을 다시 시도하라는 말이다. leaveTeam이 같은 자리에서 당했다.
*/
/*
  ⚠ **함수 경계로 자른다. 글자 수로 자르지 마라.** 처음엔 `slice(at, at + 600)`이었는데
    그 600자가 **다음 함수까지 넘어가** restoreMember에서 변환을 지워도
    rotateInviteCode의 변환이 대신 통과시켰다(2026-09-29).
    오늘만 세 번째로 같은 덫이다 — deeplink.check ⑤, 위 ⑵, 그리고 여기.
*/
const bodyOf = (fn: string) => {
  const at = service.indexOf('export async function ' + fn + '(');
  if (at < 0) return '';
  const next = service.indexOf('export ', at + 10);
  return service.slice(at, next < 0 ? service.length : next);
};
for (const fn of ['restoreMember', 'rotateInviteCode']) {
  const body = bodyOf(fn);
  assert.ok(body !== '', `teamService에서 ${fn} 본문을 못 찾았다`);
  assert.ok(
    body.includes("code === 'P0001'") && body.includes('UserFacingError'),
    `${fn}가 P0001을 UserFacingError로 안 바꾼다 — 서버가 쓴 한국어 거절 문구가 ` +
      `기본 문구에 덮여 사용자에게 안 보인다`
  );
}

/* ── ⑵ 되돌리기 UI가 있는가 ─────────────────────────────────────── */
/*
  ⚠ **차단만 만들고 되돌리기를 안 만들면 오조작 한 번이 복구 불가**가 된다.
    설계에서 넷을 한 묶음으로 묶은 이유가 이것이라, 검사도 같이 붙든다.
*/
assert.ok(/fetchRemovedMembers\(/.test(modal), 'MemberListModal이 내보낸 멤버를 안 불러온다');
assert.ok(/restoreMember\(/.test(modal), 'MemberListModal에 되돌리기가 없다 — 차단만 남으면 복구 불가다');
assert.ok(
  /isAdmin && removed\.length > 0/.test(modal),
  `내보낸 멤버 구역이 총무 조건 없이 그려진다 — **뷰는 팀원도 읽을 수 있다.** ` +
    `막는 것은 화면뿐이다`
);

/*
  ⚠ **되돌린 뒤 현재 초대 코드를 알려주는가.** 되돌려도 팀에 바로 들어가지 않는다 —
    본인이 코드로 들어온다. 총무가 코드를 재발급했으면 그 사람이 든 옛 코드는
    죽어 있어서, 안 알려주면 되돌려 놓고 「왜 못 들어오지」가 된다.
  ⚠ 부정이 아니라 존재 단언이지만, 지우면 화면이 멀쩡해 보이므로 변이로 확인했다.
*/
assert.ok(/inviteCode/.test(modal), 'MemberListModal이 초대 코드를 안 받는다');
/*
  ⚠ **handleRestore 안만 본다.** 처음엔 파일 전체에서 찾았는데,
    `Clipboard.setStringAsync(inviteCode)`가 **두 곳**이다(되돌리기 경로 + 코드 칩).
    되돌리기 쪽을 지우는 변이가 칩 덕분에 통과했다(2026-09-29).
    deeplink.check ⑤에서 방금 같은 덫에 걸렸다 — 함수를 잘라내서 그 안만 센다.
*/
const restoreBody = (() => {
  const at = modal.indexOf('const handleRestore');
  if (at < 0) return '';
  const next = modal.indexOf('const handleRemove', at);
  return modal.slice(at, next < 0 ? modal.length : next);
})();
assert.ok(restoreBody !== '', 'MemberListModal에서 handleRestore를 못 찾았다');
assert.ok(
  restoreBody.includes('Clipboard.setStringAsync(inviteCode)'),
  `되돌린 자리에서 현재 초대 코드를 못 준다 — 되돌려도 본인이 코드로 들어와야 하고, ` +
    `재발급했으면 그 사람의 옛 코드는 죽어 있다`
);

/* ── ⑶ 강퇴 문구가 차단을 말하는가 ─────────────────────────────── */
/*
  뜻이 또 바뀌었다. 2026-09-19에 「기록이 남는다」로 뒤집혔고, 이번엔
  「다시 못 들어온다」가 더해졌다. 총무가 확인 화면에서 알아야 할 사실이다.
*/
assert.ok(
  /다시 들어올 수 없어요/.test(raw('src/features/team/components/MemberListModal.tsx')),
  `강퇴 확인 문구가 재참여 차단을 안 알린다 — 총무는 되돌릴 수 있다는 것도 모른다`
);

/* ── ⑷ 코드 재발급이 총무 전용이고 파괴적으로 묻는가 ───────────── */
assert.ok(/onRotate\(\)/.test(sheet), 'InviteSheet에 코드 재발급이 없다');
assert.ok(/isAdmin &&/.test(sheet), '코드 재발급이 총무 조건 없이 그려진다');
assert.ok(
  /destructive: true/.test(sheet),
  `코드 재발급을 파괴적으로 안 묻는다 — 누르면 **지금까지 뿌린 링크가 전부 죽는다.** ` +
    `아직 안 들어온 정상 초대자까지 포함이다`
);
/*
  ⚠ 재발급 뒤 멤버십을 다시 안 읽으면 화면이 **옛 코드를 계속 보여준다** —
    총무가 그 코드를 공유하고, 받은 사람은 못 들어온다.
*/
assert.ok(
  /rotateInviteCodeRequest\([\s\S]{0,200}?loadMemberships\(/.test(store),
  `재발급 뒤 loadMemberships를 안 부른다 — 화면이 옛 코드를 계속 보여준다`
);

console.log('kickblock ok — 표식·차단·되돌리기·코드 넷이 다 걸려 있다');
