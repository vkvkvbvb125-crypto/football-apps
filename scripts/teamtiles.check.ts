// scripts/teamtiles.check.ts — 팀 화면 하단 진입 타일 넷
//
// 이 타일은 한 번 걷어냈다가 되살렸다. 걷어낸 근거(「넷 다 다른 화면으로 보내기라 팀
// 화면에서 끝나는 일이 없다」)가 반쯤 사실과 달랐고 — 공지사항은 나가지 않는다 —
// 나머지 반은 전제가 바뀌었다. 팀 화면이 팀에 관한 화면들의 허브다.
//
// 여기서 붙드는 것 셋:
//   1. 넷이 다 있고 각자 갈 곳이 있는가
//   2. 역할 조건이 붙지 않았는가  ← 「하지 않기로 한 판단」이다
//   3. 목적지 분기가 한 곳에 있는가
//
// 2번이 이 파일의 핵심이다. 타일에 isAdmin을 붙이면 팀원이 볼 수 있는 화면을 가리게 된다.
// 팀 설정 진입을 총무 전용으로 감쌌다가 팀원이 팀을 나갈 수 없게 됐던 것과 같은 실수라,
// 좋은 뜻으로 다시 붙는 것을 막는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const home = read('src/features/team/screens/TeamHomeScreen.tsx');
const nav = read('src/navigation/MainTabNavigator.tsx');

// ── 1. 넷이 다 있고, 라벨과 아이콘이 앱의 다른 자리와 어긋나지 않는다 ──
{
  const block = tab.slice(tab.indexOf('const TILES'), tab.indexOf('];', tab.indexOf('const TILES')));
  const tiles = [...block.matchAll(/key: '(\w+)', icon: '([\w-]+)', label: '([^']+)'/g)].map((m) => ({
    key: m[1],
    icon: m[2],
    label: m[3],
  }));

  assert.deepEqual(
    tiles.map((t) => t.key),
    ['schedule', 'assignment', 'settlement', 'notices'],
    `타일 넷이 아니다: ${tiles.map((t) => t.key).join(' / ')}`
  );
  assert.deepEqual(
    tiles.map((t) => t.label),
    ['일정', '경기운영', '정산', '공지사항'],
    `타일 라벨이 바뀌었다: ${tiles.map((t) => t.label).join(' / ')}`
  );

  // 「경기운영」은 그 화면이 스스로를 부르는 이름과 같아야 한다.
  // 하단 탭에는 라벨이 없어서 이 타일이 그 이름을 처음 보여주는 자리다.
  const screenTitle = read('src/features/attendance/../assignment/screens/AssignmentScreen.tsx').match(
    /<TabHeader title="([^"]+)" \/>/
  );
  assert.ok(screenTitle, '경기운영 화면의 제목을 못 찾았다');
  assert.equal(
    tiles.find((t) => t.key === 'assignment')!.label,
    screenTitle![1],
    `타일과 화면이 같은 곳을 두 이름으로 부른다: 타일 ${tiles.find((t) => t.key === 'assignment')!.label} / 화면 ${screenTitle![1]}`
  );

  // 하단 탭과 같은 곳으로 가는 셋은 아이콘도 같은 것을 쓴다 — 같은 곳인데 그림이 다르면
  // 「거기가 거기인가」를 매번 다시 판단하게 된다. (가운데 탭은 커스텀 BallIcon이라 뺀다)
  for (const [key, tabName] of [
    ['schedule', 'Attendance'],
    ['settlement', 'Settlement'],
  ] as const) {
    const at = nav.indexOf(`name="${tabName}"`);
    assert.ok(at > 0, `${tabName} 탭을 못 찾았다`);
    const icon = nav.slice(at, at + 400).match(/tabBarIcon: tabIcon\('([\w-]+)'\)/);
    assert.ok(icon, `${tabName} 탭의 아이콘을 못 찾았다`);
    assert.equal(
      tiles.find((t) => t.key === key)!.icon,
      icon![1],
      `${key} 타일이 하단 탭과 다른 아이콘을 쓴다`
    );
  }
}

// ── 2. 역할 조건이 붙지 않았다 ──────────────────────────────────────
//
// 넷 다 팀원이 들어갈 수 있는 화면이다. isAdmin은 그 안의 쓰기 동작에만 걸려 있다.
// 「총무 것 같으니 감싸자」가 실제로 팀원을 가둔 적이 있다(A: 팀 나가기).
{
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, tab, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const gates: ts.Node[] = [];
  const collect = (n: ts.Node) => {
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      /isAdmin/.test(n.expression.left.getText())
    ) {
      gates.push(n.expression.right);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  assert.ok(gates.length > 0, '이 파일에 총무 전용 구간이 하나도 없다 — 아래 판정이 헛돈다');

  const grid = tab.indexOf('{TILES.map((t) => (');
  assert.ok(grid > 0, '타일 격자를 못 찾았다');
  assert.ok(
    !gates.some((g) => grid >= g.getStart() && grid < g.getEnd()),
    '타일 격자가 총무 전용 구간 안에 있다 — 팀원이 볼 수 있는 화면을 가린다'
  );

  // 타일 하나씩 조건이 붙는 것도 막는다. 격자 안에 isAdmin이 없어야 한다
  const gridBlock = tab.slice(grid, tab.indexOf('</View>', grid));
  // (부정 단언 — gridBlock 안에 isAdmin을 넣어 실패하는 것을 확인했다)
  assert.ok(!/isAdmin/.test(gridBlock), '타일마다 역할 조건이 붙었다');
}

// ── 3. 목적지 분기가 한 곳에 있다 ───────────────────────────────────
//
// 공지사항만 setTab이고 셋은 navigate다. 타일 쪽에 그 분기를 두면 넷이 같은 모양인데
// 하나만 다르게 동작하는 것이 어디서 갈리는지 안 읽힌다.
{
  assert.ok(/onPress=\{\(\) => onGoTile\(t\.key\)\}/.test(tab), '타일이 공통 진입을 안 쓴다');
  // (부정 단언 — tab 안에 navigate/setTab을 넣어 실패하는 것을 확인했다)
  assert.ok(!/navigation\.navigate|setTab\(/.test(tab), '타일 쪽이 목적지를 직접 정한다');

  assert.ok(/onGoTile=\{\(key\) =>/.test(home), '부모가 타일 목적지를 안 정한다');
  const branch = home.slice(home.indexOf('onGoTile={(key) =>'), home.indexOf('}}', home.indexOf('onGoTile={(key) =>')));
  assert.ok(/key === 'notices'/.test(branch), '공지사항이 이 화면에 머무는 분기가 없다');
  assert.ok(/setTab\('notices'\)/.test(branch), '공지사항이 내부 탭으로 안 간다');
  for (const route of ['Attendance', 'Assignment', 'Settlement']) {
    assert.ok(branch.includes(route), `${route}로 가는 길이 없다`);
  }
}

console.log('teamtiles ok');
