// scripts/teamsettings.check.ts — 팀원이 팀 설정에 닿는가
//
// 팀 나가기는 팀 설정 화면 맨 아래에만 있다. 그 화면으로 가는 문은 팀 홈의 행 하나뿐이고,
// 그 행이 isAdmin으로 감싸져 있었다 — 팀원은 팀을 나갈 방법이 없었다.
//
// 화면으로는 안 걸린다. 총무 계정으로 보면 문이 멀쩡히 열려 있다. 팀원 계정으로 들어가
// 「없다」를 확인해야 보이는 종류라, 조건이 다시 좁아지는 것을 소스에서 붙든다.
//
// 반대 방향도 같이 본다: 문을 연 김에 총무용 폼까지 팀원에게 보이면, RLS가 거절할 값을
// 채우게 만드는 화면이 된다.
//
// ── 규칙: JSX 구조를 보는 단언은 파서로 간다 ────────────────────────
//
// 이 파일에서 나온 규칙이다. 4번 단락은 처음에 「</> + )}」로 총무 구간의 끝을 잡았는데,
// 그 화면에는 그 꼴이 둘이었다 — 저장 버튼을 감싼 조각과 총무 구간. indexOf가 앞의 것을
// 집었고, **검사는 통과하는데 재는 자리가 달랐다.** 총무 구간을 통째로 지운 변이가 그
// 틈으로 새어 나갔고, 그제야 드러났다.
//
// 같은 꼴이 파일에 둘 이상이면 문자열 위치는 조용히 다른 자리를 잰다. 「무엇이 무엇 안에
// 있는가」를 묻는 단언은 노드 포함 관계로 본다 — jsxcomment.check가 정규식 휴리스틱에서
// 오탐 9건을 내고 파서로 옮겼을 때와 같은 처방이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const screen = read('src/features/team/screens/TeamSettingsScreen.tsx');
const home = read('src/features/team/screens/TeamHomeScreen.tsx');

// ── 1. 문이 하나뿐이라는 전제 ───────────────────────────────────────
//
// 여기가 늘어나면 이 검사가 보는 자리가 달라진다. 늘리는 것 자체는 괜찮지만,
// 그때 이 검사도 같이 고쳐야 한다는 걸 알려주려고 개수를 못 박는다.
{
  const entries = home.match(/navigation\.navigate\('TeamSettings'\)/g) ?? [];
  assert.equal(entries.length, 1, `팀 설정 진입로 개수가 바뀌었다(${entries.length}) — 이 검사도 같이 고쳐라`);
}

// ── 2. 그 문이 역할로 좁혀져 있지 않다 ──────────────────────────────
//
// 진입이 히어로 카드 안으로 옮겨 가면서 앞뒤 글자가 다 바뀌었다. 문자열로 「앞을 훑어
// 조건이 붙었나」를 보면 옮길 때마다 깨지거나, 더 나쁘게는 엉뚱한 자리를 잰다.
// 아래 4번과 같은 방식으로 노드 포함 관계를 본다 — 어디로 옮겨도 판정이 같다.
{
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** isAdmin(또는 role === 'admin')으로 감싼 JSX 구간들 */
  const gates: ts.Node[] = [];
  const collect = (n: ts.Node) => {
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      /^(isAdmin|activeTeam\?\.role === 'admin')/.test(n.expression.left.getText())
    ) {
      gates.push(n.expression.right);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const entry = src.indexOf('onPress={onOpenTeamSettings}');
  assert.ok(entry > 0, '팀 홈에 팀 설정 진입이 없다');
  const gated = gates.some((g) => entry >= g.getStart() && entry < g.getEnd());
  assert.equal(gated, false, '팀 설정 진입이 총무 전용 구간 안에 있다 — 팀원은 팀을 나갈 방법이 없어진다');

  // 이 파일에 총무 전용 구간이 실제로 있어야 위 판정이 뜻을 갖는다.
  // 0개면 「감싸는 게 없으니 통과」가 되어 아무것도 안 보는 단언이 된다.
  assert.ok(gates.length > 0, '이 파일에 총무 전용 구간이 하나도 없다 — 위 판정이 헛돈다');
}

// ── 3. 가는 화면과 오는 문의 이름이 같다 ────────────────────────────
//
// 예전엔 문이 「운영 설정」, 화면 제목이 「설정」, 로딩 중 제목이 「팀 설정」이었다.
// 한 곳으로 가는 길에 이름이 셋이었다.
//
// 전체 폭 행이던 것을 링크로 줄이면서 역할별 부제(총무 「정기모임 · 회비 …」 /
// 팀원 「팀 나가기」)가 사라졌다. 그 자리를 비워 두지 않고 링크 문구를 값으로 붙든다 —
// 부제가 있던 단언을 지우기만 하면 이 지점의 검사가 통째로 없어진다.
{
  assert.ok(/<Text style=\{styles\.moreText\}>팀 설정 ›<\/Text>/.test(tab), '진입 링크 문구가 「팀 설정 ›」이 아니다');
  const titles = screen.match(/<Text style={styles\.headerTitle}>([^<]+)<\/Text>/g) ?? [];
  assert.ok(titles.length >= 2, '팀 설정 화면의 제목을 못 찾았다');
  const names = new Set(titles.map((t) => t.replace(/<[^>]+>/g, '')));
  assert.deepEqual([...names], ['팀 설정'], `같은 화면이 여러 이름으로 불린다: ${[...names].join(' / ')}`);
}

// ── 4. 화면 안에서는 총무 것과 내 것이 갈린다 ───────────────────────
//
// 문자열 위치로 「총무 구간의 끝」을 잡으려다 틀렸다. 그 파일에는 </> + )} 로 닫히는
// 조각이 둘이라(저장 버튼을 감싼 것과 총무 구간), indexOf가 앞의 것을 집었다. 지금
// 통과하고는 있었지만 재는 자리가 달랐고, 총무 구간을 통째로 지운 변이가 새어 나갔다.
//
// 그래서 파서에게 묻는다. 「isAdmin && …」인 JSX 표현식을 찾고, 팀 나가기 버튼이 그
// 하위에 있는지를 노드 관계로 본다 — 줄 모양이나 들여쓰기에 기대지 않는다.
{
  assert.ok(/const isAdmin = activeTeam\?\.role === 'admin';/.test(screen), '화면이 역할을 안 본다');

  const file = fileURLToPath(new URL('../src/features/team/screens/TeamSettingsScreen.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** isAdmin으로 감싼 JSX 구간들 */
  const gates: ts.Node[] = [];
  const collect = (n: ts.Node) => {
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      n.expression.left.getText() === 'isAdmin'
    ) {
      gates.push(n.expression.right);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  assert.ok(gates.length > 0, '총무용 구간이 역할로 감싸져 있지 않다 — 팀원이 못 쓰는 폼을 보게 된다');

  const inGate = (pos: number) => gates.some((g) => pos >= g.getStart() && pos < g.getEnd());

  const src = readFileSync(file, 'utf8');
  const leave = src.indexOf('accessibilityLabel="팀 나가기"');
  const save = src.indexOf('onPress={handleSave}');
  assert.ok(leave > 0 && save > 0, '팀 나가기 또는 저장 버튼을 못 찾았다');

  assert.equal(inGate(leave), false, '팀 나가기가 총무 전용 구간 안에 있다 — 팀원이 다시 갇힌다');
  assert.equal(inGate(save), true, '저장 버튼이 총무 구간 밖에 있다 — 팀원이 RLS가 거절할 폼을 채우게 된다');

  // 총무가 고치는 카드들도 그 안이다
  for (const card of ['팀 대표 지역', '정기모임', '회비', '실력 레벨']) {
    const at = src.indexOf(`<Text style={styles.cardTitle}>${card}</Text>`);
    assert.ok(at > 0, `${card} 카드를 못 찾았다`);
    assert.equal(inGate(at), true, `${card} 카드가 팀원에게도 보인다 — 저장할 수 없는 값이다`);
  }
}

console.log('teamsettings ok');
