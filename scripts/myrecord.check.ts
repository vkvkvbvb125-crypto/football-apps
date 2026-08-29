// scripts/myrecord.check.ts — 미납 금액이 팀 화면에서 빠진 자리
//
// 이 카드는 세 번 바뀌었고 지금은 없다.
//
//   ① 「내 기록」 — 참석 + 내 미납 두 칸
//   ② 「팀 기록」 — 좌 성적(빈 칸) · 우 미납. 레퍼런스에 맞춰 이름과 칸을 갈았다
//   ③ 없음 — 레퍼런스가 카드를 통째로 뺐다
//
// 미납을 여기 되살렸던 근거는 「점은 알림(볼 것이 있다), 칸은 확인(얼마인지)」이었다.
// 그 둘 중 **알림 쪽만 남는다** — 하단 탭 정산 뱃지의 빨간 점은 그대로다.
// 액수를 확인하는 자리가 정산 화면 하나로 줄어든 것이 이 변경의 값이자 비용이다.
//
// 그래서 이 파일이 붙드는 것도 바뀐다. 「카드가 무엇을 그리는가」가 아니라
// **「빠진 것이 제대로 빠졌는가」**다:
//   1. 팀 화면에 미납 금액이 없다 (되살아나면 점과 칸이 다시 갈린다)
//   2. 탭 뱃지는 살아 있다 (둘 다 사라지면 미납을 알 방법이 없어진다)
//   3. 공용 정의는 그대로다 (탭 뱃지가 그것을 쓴다)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');
const nav = read('src/navigation/MainTabNavigator.tsx');

// ── 1. 팀 화면에 미납 금액이 없다 ───────────────────────────────────
//
// 「그리는 글자」로 본다 — 왜 뺐는지 적은 주석에 「미납」이 남아 있어야 하고,
// 그 낱말을 부정 단언으로 잡으면 근거를 지워야 통과한다(anchor.ts 세 번째 구분).
{
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, tab, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const shown: string[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) shown.push(n.text);
    else if (ts.isJsxText(n)) shown.push(n.text);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  assert.ok(shown.length > 0, '그리는 글자를 하나도 못 모았다 — 파싱이 안 됐다');
  assert.ok(!shown.some((t) => t.includes('미납')), '팀 화면에 미납이 돌아왔다 — 액수는 정산 화면이 맡는다');

  // 값을 넘기는 통로도 없어야 한다. 문구만 지우고 prop이 남으면 다음 사람이 되살린다
  assert.ok(!/myUnpaid/.test(tab), '미납 prop이 팀 홈에 남아 있다');
  assert.ok(!/myUnpaid=/.test(screen), '팀 화면이 미납을 넘긴다');
}

// ── 2. 탭 뱃지는 살아 있다 ──────────────────────────────────────────
//
// 여기까지 사라지면 미납을 알 방법이 아예 없어진다. 카드를 뺀 근거가
// 「알림은 점이 맡는다」였으므로, 그 점이 없으면 근거가 성립하지 않는다.
{
  assert.ok(/myUnpaidAmount\(settlementCurrent, settlementPast, myMembershipId\)/.test(nav),
    '탭 뱃지가 미납을 안 센다 — 카드를 뺀 근거가 사라진다');
}

// ── 3. 공용 정의는 그대로다 ─────────────────────────────────────────
//
// unpaid.ts가 「진행중 + 지난 정산, 면제·납부 제외」를 한 곳에 못 박고 있다.
// 소비처가 줄었다고 정의가 흔들리면, 남은 소비처(탭 뱃지·나가기 경고)가 같이 흔들린다.
{
  const util = read('src/features/settlement/utils/unpaid.ts');
  assert.ok(/export function myUnpaidAmount/.test(util), '공용 미납 정의가 사라졌다');
  assert.ok(/!sh\.paid && !sh\.exempt/.test(util), '면제·납부 제외 조건이 바뀌었다');
}

console.log('myrecord ok');
