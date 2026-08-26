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
{
  const i = tab.indexOf('onPress={onOpenTeamSettings}');
  assert.ok(i > 0, '팀 홈에 팀 설정 진입이 없다');

  // 그 Pressable을 여는 자리부터 앞으로 훑어, 감싸는 조건이 붙었는지 본다.
  // 「파일에 isAdmin이 있는가」로는 못 잡는다 — 이 파일은 원래 isAdmin을 여러 번 쓴다.
  const open = tab.lastIndexOf('<Pressable', i);
  const before = tab.slice(tab.lastIndexOf('*/', open), open);
  // (부정 단언 — before 구간에 「{isAdmin && (」를 넣어 실패하는 것을 확인했다)
  assert.ok(
    !/\{\s*isAdmin\s*&&\s*\(/.test(before),
    '팀 설정 진입이 다시 총무 전용으로 좁아졌다 — 팀원은 팀을 나갈 방법이 없어진다'
  );
  assert.ok(
    !/\{\s*activeTeam\?\.role === 'admin'\s*&&/.test(before),
    '팀 설정 진입이 다시 총무 전용으로 좁아졌다'
  );

  // 팀원에게는 그 안에서 자기가 할 수 있는 일을 적는다
  assert.ok(
    /\{isAdmin \? '정기모임 · 회비 · 계좌 · 실력 레벨 · 게스트' : '팀 나가기'\}/.test(tab),
    '부제가 역할과 무관하다 — 팀원에게 총무용 항목만 나열하면 못 여는 문의 안내판이 된다'
  );
}

// ── 3. 가는 화면과 오는 문의 이름이 같다 ────────────────────────────
//
// 예전엔 문이 「운영 설정」, 화면 제목이 「설정」, 로딩 중 제목이 「팀 설정」이었다.
// 한 곳으로 가는 길에 이름이 셋이었다.
{
  assert.ok(/<Text style={styles\.rowTitle}>팀 설정<\/Text>/.test(tab), '진입 행 이름이 「팀 설정」이 아니다');
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
