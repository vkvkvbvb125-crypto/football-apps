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
import { onlyIndexOf, onlyMatch } from './lib/anchor.ts';

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

  /*
    진입이 여럿이다 — 히어로의 「팀 설정 ›」과 「팀 정보를 채워주세요」 행이 같은 곳으로 간다.
    indexOf로 첫 것을 집으면 순서가 바뀌는 날 판정이 뒤집힌다(뒤엣것은 총무 전용이다).
    필요한 것은 「어느 하나라도 총무 게이트 밖에 있는가」다 — 팀원에게 문이 하나라도 있으면 된다.
  */
  const entries: number[] = [];
  for (let i = src.indexOf('onPress={onOpenTeamSettings}'); i >= 0; i = src.indexOf('onPress={onOpenTeamSettings}', i + 1)) {
    entries.push(i);
  }
  assert.ok(entries.length > 0, '팀 홈에 팀 설정 진입이 없다');
  const open = entries.filter((at) => !gates.some((g) => at >= g.getStart() && at < g.getEnd()));
  assert.ok(
    open.length > 0,
    `팀 설정 진입 ${entries.length}개가 전부 총무 전용 구간 안에 있다 — 팀원은 팀을 나갈 방법이 없어진다`
  );

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
  // 링크에서 아웃라인 알약 버튼으로 바뀌었다(레퍼런스). 문구는 그대로 값으로 붙든다 —
  // 스타일 이름이 moreText → settingsPillText로 옮겨갔을 뿐 묻는 것은 같다
  assert.ok(/<Text style=\{styles\.settingsPillText\}>팀 설정 ›<\/Text>/.test(tab),
    '진입 버튼 문구가 「팀 설정 ›」이 아니다');
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
  const leave = onlyIndexOf(src, 'accessibilityLabel="팀 나가기"', '팀 나가기 버튼');
  const save = onlyIndexOf(src, 'onPress={handleSave}', '저장 버튼');

  assert.equal(inGate(leave), false, '팀 나가기가 총무 전용 구간 안에 있다 — 팀원이 다시 갇힌다');
  assert.equal(inGate(save), true, '저장 버튼이 총무 구간 밖에 있다 — 팀원이 RLS가 거절할 폼을 채우게 된다');

  /*
    카드 제목이 이제 둘씩 있다 — 총무의 편집 카드와 팀원의 읽기 카드.
    onlyIndexOf가 그걸 잡아서 여기까지 왔다. 「몇 개인가」가 아니라 「어느 쪽이 어디 있는가」를
    묻는 자리라 위치를 전부 모아 본다.

    편집 폼은 총무 구간 안에만 있어야 한다 — 팀원에게 보이면 RLS가 거절할 폼을 채우게 된다.
    읽기 카드는 밖에 있어야 팀원이 본다.
  */
  const titlesOf = (card: string) => {
    const needle = `<Text style={styles.cardTitle}>${card}</Text>`;
    const out: number[] = [];
    for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) out.push(i);
    return out;
  };

  for (const card of ['팀 대표 지역', '팀 프로필', '정기모임', '회비', '게스트']) {
    const at = titlesOf(card);
    assert.ok(at.some(inGate), `${card} 편집 카드가 총무 구간 밖에 있다 — 팀원이 저장할 수 없는 폼을 채우게 된다`);
    assert.ok(at.some((x) => !inGate(x)), `${card}가 팀원에게 안 보인다 — 알아야 하는 값이다`);
  }

  /*
    실력 레벨만 팀원에게 안 보인다.

    「하지 않기로 한 판단」이다. 다른 다섯을 다 보여주는 마당에 이것만 빠지면 다음 사람이
    「빠뜨렸네」 하고 채운다 — 그러면 상 3점 / 중 2점 / 하 1점 배점표에서 자기 등급을
    역산한다. 「본인이 자기 등급을 보면 팀 분위기가 깨진다」가 가로 로스터·멤버 행에 이어
    세 번째로 지켜지는 자리다.
  */
  const skill = titlesOf('실력 레벨');
  assert.ok(skill.length > 0, '실력 레벨 카드를 못 찾았다');
  assert.ok(
    skill.every(inGate),
    '실력 레벨이 팀원에게 보인다 — 배점표에서 자기 등급을 역산한다'
  );
  // 배점 안내도 같이 나가면 안 된다
  const hintAt = src.indexOf('상 3점 · 중 2점 · 하 1점');
  assert.ok(hintAt > 0 && inGate(hintAt), '실력 배점 안내가 총무 구간 밖에 있다');
}

// ── 5. 팀원 화면이 편집 폼도, 저장 문구도 안 보여준다 ──────────────
{
  const file = fileURLToPath(new URL('../src/features/team/screens/TeamSettingsScreen.tsx', import.meta.url));
  const src = readFileSync(file, 'utf8').split('\r').join('');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // 읽기 구간을 먼저 고정한다. 부정 단언은 대상이 틀리면 늘 통과한다(anchor.ts 다섯 번째 구분)
  let readOnly: ts.Node | null = null;
  const find = (n: ts.Node) => {
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      n.expression.left.getText() === '!isAdmin'
    ) {
      readOnly = n.expression.right;
    }
    ts.forEachChild(n, find);
  };
  find(sf);
  assert.ok(readOnly, '팀원 읽기 구간을 못 찾았다 — 문을 열어놓고 안이 비어 있다');
  const view = (readOnly as ts.Node).getText();

  // 편집 위젯이 없다. 팀원이 채워도 RLS가 거절한다
  for (const w of ['TextInput', 'onChangeText', 'RegionPickerModal', 'PlaceSearchModal', 'styles.switch']) {
    assert.ok(!view.includes(w), `팀원 화면에 편집 위젯이 있다: ${w}`);
  }
  /*
    저장 관련 문구도 없다 — 팀원은 저장할 게 없다.

    view(소스 텍스트)로 보면 「저장을 잠갔어요를 안 띄운다」고 설명하는 주석에 걸린다.
    「이름이 없는가」와 「쓰이지 않는가」는 다르다(anchor.ts 세 번째 구분).
    그려지는 글자만 모아서 본다.
  */
  const shown: string[] = [];
  const collectText = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) shown.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) shown.push(n.text);
    else if (ts.isJsxText(n)) shown.push(n.text);
    ts.forEachChild(n, collectText);
  };
  collectText(readOnly as ts.Node);
  const text = shown.join(' ');
  for (const w of ['저장', '잠갔']) {
    assert.ok(!text.includes(w), `팀원 화면에 저장 관련 표현이 그려진다: ${w}`);
  }
  assert.ok(!view.includes('handleSave'), '팀원 화면이 저장을 부른다');

  // 빈 값은 「0원」이 아니다
  assert.ok(/const NOT_SET = '아직 정하지 않았어요';/.test(src), '빈 값 문구가 없다');
  assert.ok(
    /const won = \(v: string\) => \(v === '' \? NOT_SET : `\$\{Number\(v\)\.toLocaleString\(\)\}원`\);/.test(src),
    '빈 회비가 「0원」으로 그려진다 — 안 정한 것과 0원은 다르다'
  );
  assert.ok(view.includes('{won(fee)}') && view.includes('{won(guestFee)}'), '금액이 공용 표기를 안 쓴다');

  // 값이 편집 폼과 같은 상태에서 나온다. baseRef(서버 원본)를 따로 읽으면 두 화면이 갈린다
  assert.ok(!view.includes('baseRef'), '읽기 값이 편집 폼과 다른 식에서 나온다');
  for (const v of ['{capacity}', 'won(fee)', '{bank}', '{accountNo}', 'guestAllowed']) {
    assert.ok(view.includes(v), `읽기 카드가 폼 상태를 안 쓴다: ${v}`);
  }

  // 계좌 복사는 은행명을 같이 넣는다 — SendMoneySheet와 같은 방식
  const copy = onlyMatch(src, /Clipboard\.setStringAsync\(`[^`]+`[^)]*\)/, '계좌 복사');
  assert.ok(/\$\{bank\}/.test(copy), `계좌 복사가 은행명을 뺀다: ${copy}`);
  const send = read('src/features/settlement/components/SendMoneySheet.tsx');
  assert.ok(/Clipboard\.setStringAsync\(`\$\{bankName\} \$\{accountNo\}`\)/.test(send),
    'SendMoneySheet의 복사 방식이 바뀌었다 — 두 화면이 갈린다');
}

console.log('teamsettings ok');
