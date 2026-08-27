// scripts/myrecord.check.ts — 팀 홈의 「내 기록」 카드
//
// 미납이 여기로 돌아왔다. 「돈 이야기는 정산 화면의 일이고 여기 두면 팀 홈이
// 독촉장이 된다」며 하단 탭의 빨간 점으로 옮겼던 값이다. 점은 그대로 두고 칸을 더한다 —
// 둘은 다른 일을 한다. 점은 알림(볼 것이 있다), 칸은 확인(얼마인지).
//
// 성적 칸은 이번에 안 만들었다. 승패를 내려면 「내가 어느 조였나」(team_assignments)와
// 「그 조가 몇 점이었나」(match_scores)가 한 경기에서 만나야 하는데, 프로덕션에서
// 그 교집합이 0이었다. 어떤 정의를 골라도 한 경기도 계산되지 않는다.
// 그래서 빈 칸을 만들지 않는다 — 채울 때까지 미완성으로 보이고, 게다가 채울 경로가
// 지금은 막혀 있다.
//
// 붙드는 것:
//   1. 두 값이 앱의 공용 정의를 쓰는가 (각자 계산하면 탭 점과 이 칸이 갈린다)
//   2. 미납에 기간을 안 적는가 (잔액이라 창이 없다)
//   3. 색이 숫자의 뜻을 안 뒤집는가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { onlyMatch } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');
const nav = read('src/navigation/MainTabNavigator.tsx');

// ── 1. 공용 정의를 쓴다 ─────────────────────────────────────────────
//
// 「홈에서는 0원인데 탭에는 빨간 점」이 나오면 어느 쪽이 맞는지 알 방법이 없다.
// unpaid.ts가 정의를 한 곳에 못 박고 있고, 이 카드가 네 번째 소비처다.
{
  const passed = onlyMatch(screen, /myUnpaid=\{[^}]+\}/, '미납 prop');
  assert.ok(
    /myUnpaidAmount\(settlementCurrent, settlementPast, activeTeam\.membershipId\)/.test(passed),
    `미납을 공용 함수로 안 낸다: ${passed}`
  );

  // 하단 탭 점도 같은 함수를 본다. 한쪽만 바뀌면 화면과 뱃지가 갈린다
  assert.ok(/myUnpaidAmount\(settlementCurrent, settlementPast, myMembershipId\)/.test(nav),
    '탭 뱃지가 다른 방식으로 미납을 센다');

  // 참석은 「최근 N경기 중 M회」 — 멤버 행·내 행과 같은 표기다(memberrow.check가 묶어 본다)
  assert.ok(/value=\{myRateLabel\}/.test(tab), '「내 기록」이 공용 참석 표기를 안 쓴다');
}

// ── 2. 미납에 기간을 안 적는다 ──────────────────────────────────────
//
// myUnpaidAmount는 날짜로 안 자른다 — 지난 정산에 남은 미납도 전부 센다.
// 「최근 30일 기준」을 붙이면 네 번째 창을 만드는 데다 31일 전 미납이 그 숫자에
// 들어 있으므로 거짓말이 된다.
{
  /*
    주석이 아니라 **그려지는 글자**를 본다.

    처음엔 카드 구간을 문자열로 잘라 「30일」이 있는지 봤는데, 왜 그 기간을 안 적는지
    설명하는 주석에 그 말이 들어 있어서 늘 실패했다. 「이름이 없는가」와 「쓰이지
    않는가」는 다르다(anchor.ts 머리말의 세 번째 구분).
    파서로 그 카드가 화면에 내놓는 문자열만 모은다.
  */
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, tab, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let card: ts.Node | null = null;
  const findCard = (n: ts.Node) => {
    // styles.myRecordTitle도 걸리므로 닫는 중괄호까지 본다 — 카드는 View 하나다
    if (ts.isJsxElement(n) && n.openingElement.getText().includes('style={styles.myRecord}')) card = n;
    ts.forEachChild(n, findCard);
  };
  findCard(sf);
  assert.ok(card, '「내 기록」 카드를 못 찾았다');

  const shown: string[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) shown.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) shown.push(n.text);
    else if (ts.isJsxText(n)) shown.push(n.text);
    ts.forEachChild(n, collect);
  };
  collect(card as ts.Node);
  const text = shown.join(' ');

  assert.ok(!/\d+일/.test(text), `미납에 기간을 적었다 — 잔액이라 창이 없다: ${text.slice(0, 80)}`);
  assert.ok(shown.includes('내 미납'), '미납 칸의 주어가 없다 — 팀 전체 미납은 계산되지 않는다');
}

// ── 3. 색이 뜻을 안 뒤집는다 ────────────────────────────────────────
//
// 크면 나쁜 숫자에 초록이 붙으면 좋아 보인다. 그리고 0원은 강조할 일이 아니다.
{
  const tile = onlyMatch(tab, /<StatTile\s*\n\s*label="내 미납"[\s\S]*?\/>/, '미납 타일');
  assert.ok(/tone="danger"/.test(tile), `미납이 초록으로 강조된다: ${tile.slice(0, 90)}`);
  assert.ok(/accent=\{myUnpaid > 0\}/.test(tile), '미납 0원인데 강조한다');
}

console.log('myrecord ok');
