// scripts/myrecord.check.ts — 팀 홈의 「내 기록」 카드
//
// 미납이 여기로 돌아왔다. 「돈 이야기는 정산 화면의 일이고 여기 두면 팀 홈이
// 독촉장이 된다」며 하단 탭의 빨간 점으로 옮겼던 값이다. 점은 그대로 두고 칸을 더한다 —
// 둘은 다른 일을 한다. 점은 알림(볼 것이 있다), 칸은 확인(얼마인지).
//
// 성적 칸은 한때 안 만들었다. 승패를 내려면 「내가 어느 조였나」(team_assignments)와
// 「그 조가 몇 점이었나」(match_scores)가 한 경기에서 만나야 하는데, 프로덕션에서
// 그 교집합이 0이다. 어떤 정의를 골라도 한 경기도 계산되지 않는다 —
// 그 사실은 지금도 그대로다.
//
// 그래도 칸은 만들었다. 레퍼런스에 그 칸이 있고 카드 모양이 레퍼런스와 같아야 한다.
// 「빈 칸을 만들지 않는다」는 여기서만 접었고, 대신 빈 칸이 「없음」이 아니라
// 「무엇을 하면 쌓이는지」를 말하게 했다.
//
// 카드 이름도 「내 기록」에서 「팀 기록」으로 바뀌었다. 참석 칸은 위 내 행 메타로 갔다
// (레퍼런스가 그렇게 나눈다) — 그쪽은 memberstrip.check가 본다.
//
// 붙드는 것:
//   1. 미납이 앱의 공용 정의를 쓰는가 (각자 계산하면 탭 점과 이 칸이 갈린다)
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
}

// ── 2. 미납에 기간을 안 적는다 ──────────────────────────────────────
//
// myUnpaidAmount는 날짜로 안 자른다 — 지난 정산에 남은 미납도 전부 센다.
// 「최근 30일 기준」을 붙이면 네 번째 창을 만드는 데다 31일 전 미납이 그 숫자에
// 들어 있으므로 거짓말이 된다.
//
// ⚠ 이 단언이 실제로 막을 일이 생겼다. 레퍼런스가 이 자리에 「최근 30일 기준」을
//   적는다. 자리는 레퍼런스대로 값 아래 한 줄로 뒀고 문장만 사실로 적었다
//   (「지난 정산까지 전부」). 창을 진짜로 30일로 자르는 쪽은 안 골랐다 —
//   같은 함수를 하단 탭 뱃지와 팀 나가기 경고가 함께 봐서 세 자리의 값이 갈린다.
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
  assert.ok(shown.includes('미납 금액'), '미납 칸의 라벨이 없다');

  // 성적 칸은 비어 있다 — 채울 데이터가 없다(점수↔배정 교집합 0, 완료 경기 0).
  // 「없음」이 아니라 「무엇을 하면 쌓이는지」를 적는다. 빈 칸이 할 수 있는 일은 그것뿐이다
  const 성적 = shown.some((t) => t.includes('성적이 쌓여요'));
  assert.ok(성적, '성적 빈 칸의 안내가 없다');
  assert.ok(!/승률|[0-9]+승|[0-9]+무|[0-9]+패/.test(text),
    `계산할 수 없는 성적을 적었다 — 점수↔배정 교집합이 0이다: ${text.slice(0, 80)}`);
}

// ── 3. 색이 뜻을 안 뒤집는다 ────────────────────────────────────────
//
// 크면 나쁜 숫자에 초록이 붙으면 좋아 보인다. 그리고 0원은 강조할 일이 아니다.
{
  const tile = onlyMatch(tab, /<StatTile\s*\n\s*label="미납 금액"[\s\S]*?\/>/, '미납 타일');
  assert.ok(/tone="danger"/.test(tile), `미납이 초록으로 강조된다: ${tile.slice(0, 90)}`);
  assert.ok(/accent=\{myUnpaid > 0\}/.test(tile), '미납 0원인데 강조한다');
}

console.log('myrecord ok');
