// scripts/invitecard.check.ts — 팀 홈의 초대 카드
//
// 이 카드는 두 번 뒤집혔다. 제목·설명은 「상시 권유는 소음」이라 뺐다가 되살렸고,
// QR은 「작게 그리면 스캔이 안 된다」고 22px 아이콘으로 뒀다가 실물로 바꿨다.
// 되살린 쪽이 다시 조용히 줄어드는 것을 막는다.
//
// 붙드는 것 넷:
//   1. QR이 실제로 스캔되는 크기인가 (이게 이 카드의 존재 이유다)
//   2. 카드 QR이 안 눌리는가 — 대면은 여기서 끝난다. 시트로 가는 문은 공유 버튼 하나다
//   3. 시트가 남아 있고, 시트에만 있는 것이 그대로인가
//   4. 제목·설명이 있는가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { onlyIndexOf } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const sheet = read('src/features/team/components/InviteSheet.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');

// ── 1. QR이 스캔되는 크기다 ─────────────────────────────────────────
//
// inviteUrl이 83바이트 → ECC M 기준 버전 5 → 37×37 모듈.
// 412pt 폭에서 124pt는 약 42mm이고 모듈 하나가 약 1.1mm다. 60pt면 0.55mm까지 내려간다.
// 「대충 이 정도」로 줄어드는 것을 막으려고 값을 못 박는다 — 줄이려면 그 계산부터 다시 한다.
{
  const size = tab.match(/const QR_SIZE = (\d+);/);
  assert.ok(size, 'QR_SIZE를 못 찾았다');
  assert.equal(size![1], '124', `QR 크기가 바뀌었다: ${size![1]} — 모듈 크기 계산을 다시 했는지 확인해라`);

  // 실물 QR이다. 아이콘으로 되돌아가면 여기서 걸린다
  assert.ok(/<QRCode value=\{inviteUrl\} size=\{QR_SIZE\}/.test(tab), '카드가 실물 QR을 안 그린다');
  assert.ok(!/name="qr-code-outline"/.test(tab), '카드 QR이 다시 아이콘이 됐다 — 스캔되지 않는다');

  // 흰 판 위에 그린다. 다크 표면 위의 QR은 카메라가 못 읽는다
  assert.ok(/inviteQrPlate/.test(tab), 'QR을 흰 판 없이 그린다');
  assert.ok(/backgroundColor: '#FFFFFF'/.test(tab.slice(onlyIndexOf(tab, '  inviteQrPlate: {', 'QR 판 스타일'))),
    'QR 판이 흰색이 아니다');

  /*
    부모가 URL을 넘긴다 — 코드(7248-6805)가 아니라 URL이어야 스캔이 참여로 이어진다.

    받는 곳이 둘이다(카드와 시트). 「있는가」로 보면 한쪽만 망가져도 다른 쪽이 통과시킨다 —
    실제로 카드 쪽을 코드로 바꾼 변이가 시트 줄 덕에 새어 나갔다. 개수로 못 박는다.
  */
  const passed = screen.split('inviteUrl={inviteUrl}').length - 1;
  assert.equal(passed, 2, `inviteUrl을 넘기는 곳이 ${passed}개다 — 카드와 시트 둘이어야 한다`);
}

// ── 2. 카드 QR은 누르는 것이 아니다 ────────────────────────────────
//
// 대면 초대는 카드에서 끝난다. QR을 눌러 시트를 또 열면 「보여주려던 사람」이
// 한 단계를 더 통과한다. 시트로 가는 문은 공유 버튼 하나다.
{
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, tab, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let qr: ts.Node | null = null;
  const find = (n: ts.Node) => {
    const open = ts.isJsxSelfClosingElement(n) ? n : ts.isJsxElement(n) ? n.openingElement : null;
    if (open && open.tagName.getText() === 'QRCode') qr = n;
    ts.forEachChild(n, find);
  };
  find(sf);
  assert.ok(qr, 'QR 노드를 못 찾았다');

  // QR을 감싸는 조상 중에 Pressable이 없어야 한다
  for (let p = (qr as ts.Node).parent; p; p = p.parent) {
    const tag = ts.isJsxElement(p) ? p.openingElement.tagName.getText() : null;
    assert.notEqual(tag, 'Pressable', '카드 QR이 눌린다 — 대면 초대가 시트를 한 번 더 거친다');
  }

  /*
    시트로 가는 문이 둘이다 — 레퍼런스가 그렇다.

    한때 하나였다. 초대 카드의 공유 버튼뿐이었고, 근거는 「같은 곳으로 가는 입구가
    둘이면 어느 쪽이 무엇인지 흐려진다」였다.

    레퍼런스는 멤버 줄 끝에 「+ 초대」 칸을 두고 초대 카드도 따로 둔다. 오는 맥락이
    다르다 — 멤버 줄의 칸은 명단을 보다가 「한 명 더」이고, 카드는 초대를 하려고
    찾아온 자리다. 도착지만 같다.
  */
  const opens = tab.split('onPress={onOpenInvite}').length - 1;
  assert.equal(opens, 2, `초대 시트를 여는 곳이 ${opens}개다 — 멤버 줄 끝 칸과 초대 카드 둘이다`);
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
  assert.ok(/<Text style=\{styles\.inviteTitle\}>팀에 친구를 초대해보세요!<\/Text>/.test(tab), '초대 카드 제목이 없다');
  assert.ok(/링크나 코드를 공유하면\\n친구가 바로 팀에 참여할 수 있어요\./.test(tab), '초대 카드 설명 두 줄이 없다');

  // 코드·공유는 그대로 있다
  assert.ok(/<Text style=\{styles\.inviteLabel\}>초대 코드<\/Text>/.test(tab), '초대 코드 라벨이 없다');
  assert.ok(/<Text style=\{styles\.inviteShareText\}>링크 공유하기<\/Text>/.test(tab), '공유 버튼이 없다');
}

console.log('invitecard ok');
