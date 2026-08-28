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
import { onlyMatch } from './lib/anchor.ts';

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

  /*
    넷이 갈렸다 — 레퍼런스에 맞춰 항목을 갈았다.

      전: 일정 · 경기운영 · 정산 · 공지사항
      후: 게시판 · 공지사항 · 멤버 관리 · 팀 설정

    앞의 셋이 빠진 근거는 **하단 탭에 이미 그 셋이 있다**는 것이다. 그래서 예전 검사가
    「하단 탭과 같은 아이콘을 쓰는가」를 봤다 — 같은 곳인데 그림이 다르면 「거기가
    거기인가」를 매번 다시 판단하게 되니까. 이제 넷 다 하단 탭에 없는 화면이라
    그 단언이 볼 대상 자체가 없어졌다. 중복을 없애면서 그 검사도 같이 사라진다.

    대신 **하단 탭과 겹치지 않는가**를 본다. 겹침이 돌아오면 그때 다시 「어느 쪽이
    무엇인가」가 흐려진다.
  */
  assert.deepEqual(
    tiles.map((t) => t.key),
    ['board', 'notices', 'members', 'settings'],
    `타일 넷이 아니다: ${tiles.map((t) => t.key).join(' / ')}`
  );
  assert.deepEqual(
    tiles.map((t) => t.label),
    ['게시판', '공지사항', '멤버 관리', '팀 설정'],
    `타일 라벨이 바뀌었다: ${tiles.map((t) => t.label).join(' / ')}`
  );

  // 하단 탭이 맡은 화면은 여기 없다 — 팀 화면 안에 같은 문을 또 두지 않는다
  for (const gone of ['schedule', 'assignment', 'settlement']) {
    assert.ok(!tiles.some((t) => t.key === gone), `${gone}이 타일로 돌아왔다 — 하단 탭에 이미 있다`);
  }

  // 「공지사항」에 안 읽은 표시가 붙는다. 점만 있고 읽음을 남기는 곳이 없으면
  // 영원히 켜져 있으므로, 그 짝을 한 자리에서 같이 본다
  assert.ok(/t\.key === 'notices' && hasUnreadNotice/.test(tab), '공지 타일에 안 읽은 점이 없다');
  assert.ok(/markAnnouncementsRead\(announcements\)/.test(home), '공지 목록을 열어도 읽음을 안 남긴다 — 점이 안 꺼진다');
  /* 이름이 아니라 **부르는 자리**를 본다 — 스토어 구독 줄에도 같은 이름이 있어서
     호출을 지워도 이름은 남는다(anchor.ts 세 번째 구분) */
  assert.ok(/void loadMyReads\(\)/.test(home), '내가 읽은 공지를 안 읽어온다 — 점을 켤지 말지 모른다');
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
// 셋은 이 화면 안의 탭으로 가고 「팀 설정」만 스택을 얹는다. 타일 쪽에 그 분기를 두면
// 넷이 같은 모양인데 하나만 다르게 동작하는 것이 어디서 갈리는지 안 읽힌다.
//
// 예전엔 반대였다 — 셋이 navigate고 공지사항만 setTab이었다. 항목이 갈리면서 비율이
// 뒤집혔고, 분기가 부모에 있으니 타일 쪽은 한 글자도 안 바뀌었다. 그게 이 구조의 값이다.
{
  assert.ok(/onPress=\{\(\) => onGoTile\(t\.key\)\}/.test(tab), '타일이 공통 진입을 안 쓴다');
  // (부정 단언 — tab 안에 navigate/setTab을 넣어 실패하는 것을 확인했다)
  assert.ok(!/navigation\.navigate|setTab\(/.test(tab), '타일 쪽이 목적지를 직접 정한다');

  assert.ok(/onGoTile=\{\(key\) =>/.test(home), '부모가 타일 목적지를 안 정한다');
  const branch = home.slice(home.indexOf('onGoTile={(key) =>'), home.indexOf('}}', home.indexOf('onGoTile={(key) =>')));
  assert.ok(/key === 'settings'/.test(branch), '팀 설정만 화면을 옮기는 분기가 없다');
  assert.ok(/navigation\.navigate\('TeamSettings'\)/.test(branch), '팀 설정으로 가는 길이 없다');
  // 나머지 셋은 이 화면 안의 탭이다 — setTab(key)로 키가 그대로 탭 이름이 된다
  assert.ok(/setTab\(key\)/.test(branch), '나머지 셋이 내부 탭으로 안 간다');

  /*
    타일 키가 탭 이름과 같아야 setTab(key)가 성립한다. 이름이 갈리면 눌러도 아무 일이
    없는데(존재하지 않는 탭으로 가서 아무 갈래에도 안 걸린다) 화면에서는 「눌리지 않는
    버튼」으로만 보인다.
  */
  const tabType = onlyMatch(home, /useState<'home' \| [^>]+>/, '탭 상태 타입');
  for (const key of ['board', 'notices', 'members']) {
    assert.ok(tabType.includes(`'${key}'`), `타일 키 ${key}에 해당하는 탭이 없다 — 눌러도 아무 일이 없다`);
  }
}

console.log('teamtiles ok');
