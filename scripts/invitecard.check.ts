// scripts/invitecard.check.ts — 팀 홈의 초대 카드
//
// 이 카드는 세 번 뒤집혔다. 제목·설명은 「상시 권유는 소음」이라 뺐다가 되살렸고,
// QR은 「작게 그리면 스캔이 안 된다」고 22px 아이콘으로 뒀다가 실물로 바꿨다가,
// 레퍼런스에 맞춰 카드에서 아예 뺐다.
//
// ⚠ QR이 사라진 게 아니라 **시트 전담이 됐다.** 그때 물었던 「카드 QR이 스캔 가능하면
//   시트 QR은 무엇을 하는가」의 답이 뒤집힌 것이다: 이제 카드는 코드·링크(원격)를
//   맡고, 대면은 「QR 보기」 한 번을 거친다. 대면에 탭이 하나 느는 것이 이 구조의 값이고,
//   돌려받는 것은 카드 높이다.
//   그래서 이 검사의 1번은 「카드의 QR이 큰가」에서 **「시트의 QR이 큰가」**로 옮겼다.
//   스캔되는 크기여야 한다는 요구는 그대로고, 그 요구가 사는 자리만 바뀐다.
//
// 붙드는 것 넷:
//   1. 시트 QR이 실제로 스캔되는 크기인가 (이제 대면 초대가 거기서만 끝난다)
//   2. 카드에서 QR로 가는 길이 있는가 (없으면 대면 초대가 갈 데가 없다)
//   3. 시트가 남아 있고, 시트에만 있는 것이 그대로인가
//   4. 제목·설명이 있는가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlyIndexOf } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const sheet = read('src/features/team/components/InviteSheet.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');

// ── 1. 시트 QR이 스캔되는 크기다 ────────────────────────────────────
//
// inviteUrl이 83바이트 → ECC M 기준 버전 5 → 37×37 모듈.
// 412pt 폭에서 124pt는 약 42mm이고 모듈 하나가 약 1.1mm다. 60pt면 0.55mm까지 내려간다.
// 「대충 이 정도」로 줄어드는 것을 막으려고 값을 못 박는다 — 줄이려면 그 계산부터 다시 한다.
{
  /* size={…}는 이 파일에 여럿이다(닫기 아이콘·복사 아이콘·공유 아이콘).
     처음 것을 집으면 닫기 버튼의 22를 QR 크기로 읽는다 — 상수 정의를 집는다 */
  const size = sheet.match(/const QR_SIZE = (\d+);/);
  assert.ok(size, '시트 QR 크기 상수를 못 찾았다');
  assert.ok(/<QRCode value=\{inviteUrl\} size=\{QR_SIZE\}/.test(sheet), '시트 QR이 그 상수를 안 쓴다');
  assert.ok(Number(size![1]) >= 124,
    `시트 QR이 작다: ${size![1]} — 모듈 크기 계산을 다시 했는지 확인해라(124에서 모듈 1.1mm)`);
  assert.ok(/<QRCode/.test(sheet), '시트가 실물 QR을 안 그린다');

  // 카드에는 QR이 없다 — 있으면 같은 것이 두 자리에 있고, 작게 그려질 자리가 하나 는다
  assert.ok(!/<QRCode/.test(tab), '카드에 QR이 돌아왔다 — 시트가 QR 전담이다');

  /*
    부모가 URL을 넘긴다 — 코드(7248-6805)가 아니라 URL이어야 스캔이 참여로 이어진다.
    카드에서 QR이 빠지면서 받는 곳이 시트 하나가 됐다.
  */
  const passed = screen.split('inviteUrl={inviteUrl}').length - 1;
  assert.equal(passed, 1, `inviteUrl을 넘기는 곳이 ${passed}개다 — 시트 하나여야 한다`);
}

// ── 2. 카드에서 QR로 가는 길이 있다 ────────────────────────────────
//
// 대면 초대가 시트에서만 끝나므로, 카드에 그 문이 없으면 대면 초대가 갈 데가 없다.
// 「링크 공유」 하나만 두면 QR을 보여주려는 사람이 링크 버튼을 눌러야 한다.
{
  assert.ok(/accessibilityLabel="초대 QR 보기"/.test(tab), '카드에 QR로 가는 문이 없다');
  assert.ok(/name="qr-code-outline"/.test(tab), 'QR 버튼에 QR 그림이 없다');

  /*
    시트를 여는 곳이 셋이다 — 멤버 줄 끝 칸 · 링크 공유 · QR 보기.

    한때 하나였고 근거는 「같은 곳으로 가는 입구가 둘이면 어느 쪽이 무엇인지
    흐려진다」였다. 지금은 오는 맥락이 셋 다 다르다 — 명단을 보다가 「한 명 더」,
    원격으로 보내려고, 그 자리에서 보여주려고. 도착지만 같다.
  */
  const opens = tab.split('onPress={onOpenInvite}').length - 1;
  assert.equal(opens, 3, `초대 시트를 여는 곳이 ${opens}개다 — 멤버 줄 · 링크 · QR 셋이다`);
}

// ── 3. 시트는 남아 있고, 시트에만 있는 것도 남아 있다 ──────────────
//
// 카드에 QR이 생겼다고 시트를 지우면 두 가지를 잃는다.
{
  assert.ok(/<QRCode value=\{inviteUrl\}/.test(sheet), '시트의 QR이 사라졌다');

  // 링크 복사 — 카드의 복사는 초대 코드고 이건 URL이라 다른 값이다
  assert.ok(/Clipboard\.setStringAsync\(inviteUrl\)/.test(sheet), '시트의 「링크 복사」가 사라졌다 — 카드에 없는 값이다');
  assert.ok(!/Clipboard\.setStringAsync\(inviteUrl\)/.test(tab), '카드가 URL을 복사한다 — 코드 복사와 뜻이 겹친다');

  // 팀 홈 밖의 진입로 — 그쪽에서 온 사람은 카드 QR을 못 본다
  const members = read('src/features/team/components/TeamMembersTab.tsx');
  assert.ok(/onPress=\{onOpenInvite\}/.test(members),
    '멤버 목록의 초대 진입이 사라졌다 — 팀 홈 밖에서 시트를 여는 유일한 길이다');
}

// ── 4. 제목·설명이 있다 ────────────────────────────────────────────
//
// 「상시 권유는 소음」이라며 뺐던 것을 되살렸다. 조건 분기를 없애고 항상 카드로
// 노출하기로 정해졌으니 그 근거는 더 이상 이 자리의 것이 아니다.
{
  assert.ok(/<Text style=\{styles\.inviteTitle\}>친구를 초대해보세요!<\/Text>/.test(tab), '초대 카드 제목이 없다');
  assert.ok(/초대 코드나 링크를 공유하면 친구가 바로 팀에 참여할 수 있어요/.test(tab), '초대 카드 설명이 없다');

  /*
    코드 라벨(「초대 코드」)이 없어졌다. QR이 빠지면서 카드에 남은 큰 값이 코드 하나뿐이라,
    그 위에 이름을 또 적으면 같은 것을 두 번 말한다 — 설명 줄이 이미 「초대 코드나
    링크를 공유하면」으로 그게 무엇인지 말하고 있다.
    코드 자체는 남아 있어야 한다: 눌러서 복사하는 것이 이 카드의 주 동작이다.
  */
  assert.ok(/<Text style=\{styles\.inviteCode\} numberOfLines=\{1\}>/.test(tab), '초대 코드가 없다');
  assert.ok(/accessibilityLabel=\{`초대 코드 \$\{activeTeam\.team\.invite_code\} 복사`\}/.test(tab),
    '코드를 눌러 복사할 수 없다');
  assert.ok(/<Text style=\{styles\.inviteActionText\}>링크 공유 ›<\/Text>/.test(tab), '링크 공유 버튼이 없다');
  assert.ok(/<Text style=\{styles\.inviteActionText\}>QR 보기<\/Text>/.test(tab), 'QR 보기 버튼이 없다');
}

console.log('invitecard ok');
