// scripts/memberrow.check.ts — 멤버 목록 행의 불변식
//
// 화면으로는 잘 안 갈린다. 셰브론 조건이 틀려도 총무 계정에서는 똑같이 보이고,
// 포지션이 전원 비어 있는 팀에서는 「미지정」을 지웠는지 안 지웠는지가 안 드러난다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { formatRecentAttendance } from '../src/features/attendance/utils/attendanceRate';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tab = read('src/features/team/components/TeamMembersTab.tsx');
const modal = read('src/features/team/components/MemberListModal.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');
const homeTab = read('src/features/team/components/TeamHomeTab.tsx');

// ── 1. 셰브론 조건이 모달의 편집 권한과 같은가 ──────────────────────
//
// 셰브론은 「눌러서 바꿀 수 있다」는 신호다. 신호와 권한이 어긋나면 둘 중 하나가
// 거짓말이 된다 — 총무에게만 붙이면 일반 멤버는 정작 바꿀 수 있는 자기 행에서
// 신호를 못 받고, 전원에게 붙이면 못 바꾸는 행에도 붙는다.
{
  assert.ok(/\{\(isAdmin \|\| isMe\) && \(/.test(tab),
    '셰브론 조건이 isAdmin || isMe가 아니다 — 신호와 편집 권한이 어긋난다');

  // 모달 쪽 전제가 그대로인지 같이 본다. 저쪽이 바뀌면 이 조건도 틀린 것이 된다.
  assert.ok(/disabled=\{!isAdmin && !isSelf\}/.test(modal),
    '모달의 포지션 편집 권한이 바뀌었다 — 셰브론 조건도 다시 봐야 한다');

  // 탭 자체는 전원에게 열려 있다 — 남의 행도 조회는 된다
  assert.ok(/onPress=\{onOpenMemberList\}/.test(tab), '행 탭이 사라졌다');
  assert.ok(!/isAdmin && onPress|onPress=\{isAdmin/.test(tab), '탭 진입을 권한으로 막는다 — 조회까지 막힌다');
}

// ── 2. 포지션은 값이 있을 때만 ──────────────────────────────────────
// positionLabel(null)이 「미지정」을 돌려준다. 팀 대부분이 포지션을 안 정해서
// 그대로 두면 목록 전체가 「미지정 · 미지정」이 된다.
{
  assert.ok(/if \(!pos && !recent\) return null;/.test(tab),
    '포지션도 참석도 없을 때 메타 줄을 그대로 그린다');
  assert.ok(/\{!!pos && \(/.test(tab), '포지션을 값 없이도 그린다 — 「미지정」이 찍힌다');
  // 가운뎃점은 양쪽이 다 있을 때만
  assert.ok(/\{!!pos && !!recent && <Text style=\{styles\.memberMetaDot\}>/.test(tab),
    '한쪽만 있어도 가운뎃점을 그린다 — 「· 최근 3경기 중 2회」가 된다');
}

// ── 3. 최근 참석은 횟수로, 없으면 줄을 생략 ─────────────────────────
{
  assert.ok(tab.includes('formatRecentAttendance'), '최근 참석 보조 정보가 없다');
  assert.ok(!/formatMemberRate/.test(tab), '퍼센트 표기가 남아 있다 — 분모를 모르면 못 읽는다');

  // 순수 함수라 직접 부른다
  const r = (attended: number, slots: number) => ({ rate: null, attended, slots, matchCount: slots });
  assert.equal(formatRecentAttendance(r(2, 3)), '최근 3경기 중 2회');
  assert.equal(formatRecentAttendance(r(0, 5)), '최근 5경기 중 0회', '한 번도 안 나온 것도 사실이라 적는다');
  assert.equal(formatRecentAttendance(r(0, 0)), null, '셀 경기가 없는데 「0경기 중 0회」를 적는다');
  // 표본이 모자라 퍼센트를 못 내는 경우에도 횟수는 나와야 한다
  assert.equal(formatRecentAttendance(r(1, 2)), '최근 2경기 중 1회', '표본이 적다고 횟수까지 감춘다');
}

// ── 4. 참석 표기가 두 곳에서 같은가 ────────────────────────────────
//
// 멤버 행(TeamMembersTab)과 「내 기록」(TeamHomeScreen의 myRateLabel)은 같은 값을
// 적는다 — 둘 다 memberAttendanceRate(memberRateMatches, ...)라 창(최근 3개월 · 가입 후)이
// 같다. 그런데 표현이 갈리면 사용자는 두 숫자가 같은 것인지 알 수 없다.
//
// 실제로 두 번 갈렸다: 한 번 맞췄다가 STEP 2에서 멤버 행만 바꾸며 또 갈렸다.
// 따로 검사하면 한쪽만 바뀌었을 때 못 잡으므로, 둘을 한 단언으로 묶는다.
{
  assert.ok(/formatRecentAttendance/.test(tab), '멤버 행이 공용 표기 함수를 안 쓴다');
  assert.ok(/formatRecentAttendance\(myRate\)/.test(screen),
    '「내 기록」이 공용 표기 함수를 안 쓴다 — 멤버 행과 같은 값을 다르게 적게 된다');

  // 손으로 만든 문구가 남아 있으면 함수를 써도 갈린다
  assert.ok(!/\$\{myRate\.attended\}회/.test(screen),
    '「내 기록」이 문구를 직접 만든다 (「4회 (67%)」) — 멤버 행과 갈린다');
  assert.ok(!/formatMemberRate/.test(tab), '멤버 행에 퍼센트 표기가 남아 있다');

  /*
   * 창이 같아야 표기 통일이 뜻을 갖는다. 한쪽 창이 바뀌면 표현만 같고 값이 다른 상태가
   * 되는데, 그게 지금보다 나쁘다.
   *
   * 「파일에 그 호출이 있는가」로는 안 된다 — 다른 줄에 남아 있으면 통과한다.
   * 변이 시험에서 내 기록만 memberAttendanceRate([], me)로 바꿨는데 새어 나갔다.
   * 각 값을 만드는 그 줄을 본다.
   */
  const myRateLine = screen.match(/const myRate = [^;]+;/);
  assert.ok(myRateLine, '「내 기록」의 참석 계산을 못 찾음');
  assert.ok(/memberAttendanceRate\(memberRateMatches, me\)/.test(myRateLine![0]),
    `「내 기록」이 다른 창을 센다: ${myRateLine![0]} — 표기만 같고 값이 다른 상태가 된다`);

  const rowCall = tab.match(/formatRecentAttendance\([^)]*\)+/);
  assert.ok(rowCall, '멤버 행의 참석 계산을 못 찾음');
  assert.ok(/memberAttendanceRate\(memberRateMatches, m\)/.test(rowCall![0]),
    `멤버 행이 다른 창을 센다: ${rowCall![0]}`);

  /*
   * 창이 둘이라는 것 자체를 붙든다.
   *
   *   팀 지표 (스탯 바의 「참석」)   monthlyAttendanceRate  →  이번 달
   *   개인 지표 (멤버 행 · 내 기록)  memberAttendanceRate   →  최근 3개월
   *
   * 「창을 새로 만들지 마라」를 계속 지켜 왔는데, 창이 이미 둘이라는 걸 모르고 있었다.
   * 둘 다 근거가 있다 — 팀은 「이번 달 어땠나」이고 개인은 표본이 작아 한 번 빠지면
   * 75%까지 흔들린다(attendanceRate.ts 머리말). 그래서 합치지 않고 유지한다.
   *
   * 대신 뒤바뀌는 것을 막는다. 스탯 바가 3개월을 세거나 개인 지표가 이번 달을 세면
   * 옆에 적힌 기준 문구가 그 자리에서 거짓말이 된다.
   */
  const teamRateLine = screen.match(/const teamRate = [^;]+;/);
  assert.ok(teamRateLine, '팀 참석률 계산을 못 찾음');
  assert.ok(/monthlyAttendanceRate\(/.test(teamRateLine![0]),
    `팀 지표가 개인 창을 센다: ${teamRateLine![0]} — 스탯 바 옆의 「이번 달 …」이 거짓이 된다`);
  assert.ok(!/memberAttendanceRate\(/.test(teamRateLine![0]), `팀 지표가 개인 창을 센다: ${teamRateLine![0]}`);

  // 그 기준 문구가 실제로 화면에 있어야 붙들 것이 있다
  assert.ok(/이번 달 치른 경기 기준이에요/.test(homeTab),
    '스탯 바 옆 기준 안내가 없다 — 한 화면에 창이 둘인데 어느 쪽인지 말하지 않는다');
}

// ── 5. 스탯 바와 로스터 카드가 같은 말을 두 번 하지 않는가 ────────
//
// 둘 다 멤버 수를 말한다. 문구까지 같으면 화면에 같은 문장이 두 줄 뜨고, 진입까지
// 양쪽에 걸면 같은 곳으로 가는 입구가 셋(제목 셰브론 · 로스터 칩 · 스탯 바)이 된다.
// 지표는 스탯 바, 명단은 로스터 카드로 역할을 갈랐다.
{
  /*
    StatRow가 이 파일에 둘이다 — 히어로의 스탯 바와 「내 기록」. 예전엔 두 곳 다
    문자열로 재고 있었고, 둘 다 지금 맞는 것이 **우연**이었다.

      indexOf('<StatRow>')            앞의 것을 집는다. 스탯 바가 위에 있어서 맞았다.
                                      내 기록이 위로 가면 조용히 뒤집힌다.
      /<StatTile label="…"/ 전수      내 기록의 StatTile은 label이 다음 줄이라 정규식이
                                      못 봤다. 포맷이 한 줄로 바뀌면 라벨 넷이 잡힌다.

    둘 다 파서로 본다 — 어느 StatRow인지는 감싸는 View의 스타일 이름으로 가른다.
    (규칙: JSX 구조를 보는 단언은 파서로 — teamsettings.check 머리말)
  */
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, homeTab, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** 이 노드를 감싸는 가장 가까운 styles.X 이름 */
  const ownerStyle = (n: ts.Node): string | null => {
    for (let p = n.parent; p; p = p.parent) {
      const tag = ts.isJsxElement(p) ? p.openingElement.getText() : null;
      const m = tag?.match(/styles\.(\w+)/);
      if (m) return m[1];
    }
    return null;
  };

  const rows = new Map<string, ts.JsxElement>();
  const collectRows = (n: ts.Node) => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'StatRow') {
      const owner = ownerStyle(n);
      assert.ok(owner, 'StatRow를 감싸는 스타일을 못 찾았다');
      rows.set(owner as string, n);
    }
    ts.forEachChild(n, collectRows);
  };
  collectRows(sf);

  assert.deepEqual([...rows.keys()].sort(), ['myRecord', 'teamStats'], `StatRow의 자리가 바뀌었다: ${[...rows.keys()].join(' / ')}`);

  const bar = rows.get('teamStats')!;
  const labelsOf = (root: ts.Node) => {
    const out: string[] = [];
    const visit = (n: ts.Node) => {
      const open = ts.isJsxSelfClosingElement(n) ? n : ts.isJsxElement(n) ? n.openingElement : null;
      if (open && open.tagName.getText() === 'StatTile') {
        const a = open.attributes.properties.find(
          (x) => ts.isJsxAttribute(x) && x.name.getText() === 'label'
        ) as ts.JsxAttribute | undefined;
        const init = a?.initializer;
        if (init && ts.isStringLiteral(init)) out.push(init.text);
        else out.push(`(문자열이 아님: ${init?.getText() ?? '없음'})`);
      }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return out;
  };
  /*
    이 방식은 「내 기록의 StatTile을 한 줄로 정리」 같은 변이를 **일부러 안 잡는다.**
    무해한 포맷 변경이고, 옛 정규식은 그걸 라벨 넷으로 읽어 엉뚱하게 실패했다.
    포맷만 바꿔도 깨지는 검사는 다음 사람이 검사를 무르게 만든다 —
    「또 그 검사네」가 되는 순간 단언을 지우는 쪽이 쉬워진다.
  */
  const tiles = labelsOf(bar);
  /* 「총 경기」였다. 계산이 matches.length(팀 생성 이래 전부)라 「총」이 값과 맞았지만,
     기간이 없는 「경기」도 누적을 가리키는 데 거짓이 아니고 옆 두 칸과 길이가 맞는다.
     계산은 그대로다 — 라벨만 값에 맞춰 줄였다. */
  /*
    「참석」이었다. 레퍼런스에 맞춰 「참여율」로 바꿨다.

    기준 안내 줄(「이번 달 치른 경기 기준이에요」)이 상시 노출에서 ⓘ를 눌러 펴는
    것으로 바뀌면서, 라벨이 그 몫을 일부 져야 했다 — 「참석」은 횟수로도 읽히지만
    「참여율」은 이름에 비율이 들어 있어 안 눌러도 종류가 읽힌다.
  */
  assert.deepEqual(tiles, ['경기', '멤버', '참여율'], `스탯 바 라벨이 바뀌었다: ${tiles.join(' / ')}`);

  /*
    로스터 제목에는 숫자를 안 적는다.

    예전엔 「팀원 N명」이었고 이 단언도 그 문구를 붙들었다. 스탯 바와 문구가 겹치지
    않게 한 것인데, 겹치는 건 문구가 아니라 **값**이었다 — 「멤버 6」과 「팀원 6명」이
    한 화면에서 같은 수를 두 번 적었다. 이름을 갈라도 그건 안 풀린다.
    근거는 그대로다(지표는 스탯 바, 명단은 이 카드). 보는 대상만 바뀐다.

    제목 Text 노드를 파서로 집는다 — 파일 어딘가에 members.length가 있는지가 아니라
    그 줄이 무엇을 그리는지를 본다.
  */
  /*
    styles.sectionTitle을 쓰는 Text가 이 파일에 둘이다 — 로스터 제목과 「내 정보」.
    처음엔 마지막 것을 집어 「내 정보」를 로스터 제목으로 읽었다(순서를 바꾸자 드러났다).
    로스터 제목은 onGoMembers로 가는 sectionHead 안에 있다 — 그 컨테이너부터 찾는다.
  */
  let head: ts.JsxElement | null = null;
  const findHead = (n: ts.Node) => {
    if (
      ts.isJsxElement(n) &&
      // sectionHeadLink가 이 이름을 부분문자열로 품는다 — 닫는 중괄호까지 본다.
      // 안 그러면 컨테이너가 아니라 그 안의 Pressable을 집는다(실제로 그랬다)
      n.openingElement.getText().includes('style={styles.sectionHead}') &&
      n.getText().includes('onPress={onGoMembers}')
    ) {
      head = n;
    }
    ts.forEachChild(n, findHead);
  };
  findHead(sf);
  assert.ok(head, '로스터 제목이 든 sectionHead를 못 찾았다');

  let title: ts.JsxElement | null = null;
  const findTitle = (n: ts.Node) => {
    if (
      ts.isJsxElement(n) &&
      n.openingElement.tagName.getText() === 'Text' &&
      n.openingElement.getText().includes('styles.sectionTitle')
    ) {
      title = n;
    }
    ts.forEachChild(n, findTitle);
  };
  findTitle(head as ts.Node);
  assert.ok(title, '로스터 제목을 못 찾았다');
  const titleText = (title as ts.JsxElement).children.map((c) => c.getText()).join('').trim();
  /*
    제목에 숫자가 붙는다 — 레퍼런스에 맞춰 뒤집었다.

    옛 단언은 그 반대였다: 「로스터 제목에 숫자가 붙었다 — 스탯 바가 같은 수를 이미
    말한다」. 그 근거를 지우지 않는 이유는, 지우면 다음 사람이 겹침을 발견하고 또
    뺄 것이기 때문이다. 겹치는 것은 맞다. 알면서 둔다.

    두 수가 다른 것을 말한다 — 스탯 바의 「멤버 6」은 팀 지표고, 제목의 「6명」은 옆
    「전체보기 ›」가 여는 목록의 크기다. 아바타 줄이 다섯에서 끊기고 「+N」으로 접히는
    구조라 전체 수를 말하는 자리가 제목뿐이다.
  */
  assert.ok(/^멤버 \{members\.length\}명$/.test(titleText),
    `로스터 제목이 「멤버 N명」이 아니다: ${titleText}`);

  /*
    스탯 바에는 **화면을 옮기는** 진입이 없다.

    예전엔 `!/Pressable|onPress/`로 봤다. 값 옆 ⓘ가 눌리는 것이 되면서 그 단언이
    ⓘ까지 잡는다 — 막으려던 것과 다른 것을 막게 됐다. 막으려던 것은 「스탯 바를
    눌러 멤버 탭으로 간다」이고, 그건 제목·아바타 줄에 이미 둘 있어서 셋이 되면
    어느 것이 무엇인지 흐려진다. ⓘ는 아무 데도 안 간다.

    그래서 「누르는가」가 아니라 「어디로 보내는가」를 본다.
  */
  const barText = bar.getText();
  assert.ok(!/onGoMembers|onGoTile|navigation\./.test(barText), '스탯 바에 진입이 붙었다 — 멤버 탭 입구가 셋이 된다');
  // StatTile을 Pressable로 감싸는 것도 같은 일이다 — 칸 전체가 눌리면 그게 입구가 된다
  assert.ok(!/<Pressable[\s\S]*?<StatTile/.test(barText), '스탯 바의 칸이 통째로 눌린다 — 입구가 된다');

  /*
    제목의 진입은 남아 있어야 한다.

    예전엔 /onPress={onGoMembers}/ 하나로 봤는데 그 꼴이 이 파일에 셋이다 —
    제목의 「전체보기」, 아바타 줄의 각 칸, 「+N」. 제목 것을 지워도 나머지 둘이
    통과시켰다. 「이 자리인가」를 묻는 단언이라 자리를 특정한다.

    제목 진입은 sectionHeadLink를 쓰는 Pressable이다. 아바타 줄은 avatarChip이라
    스타일로 갈린다.
  */
  let titleEntry: ts.JsxOpeningElement | null = null;
  const findEntry = (n: ts.Node) => {
    if (
      ts.isJsxOpeningElement(n) &&
      n.tagName.getText() === 'Pressable' &&
      n.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && a.name.getText() === 'onPress' && a.initializer?.getText() === '{onGoMembers}'
      ) &&
      n.attributes.properties.some((a) => a.getText().includes('sectionHeadLink'))
    ) {
      titleEntry = n;
    }
    ts.forEachChild(n, findEntry);
  };
  findEntry(sf);
  assert.ok(titleEntry, '제목에서 멤버 탭으로 가는 길이 사라졌다');
}

console.log('memberrow ok');
