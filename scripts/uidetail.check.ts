// scripts/uidetail.check.ts — UI 디테일 개선 작업의 불변식 검사
//
// 값 하나하나가 맞는지 재확인하는 건 의미가 없다(소스에 쓴 걸 소스에서 읽는 동어반복).
// 여기서 잡는 건 "두 곳이 서로 맞아야 하는데 한쪽만 바뀌면 조용히 깨지는 것"들이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { onlyIndexOf, onlyMatch } from './lib/anchor.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const num = (src: string, re: RegExp, what: string) => {
  const m = src.match(re);
  assert.ok(m, `못 찾음: ${what}`);
  return Number(m![1]);
};

// ── 1. 명단 푸터가 카드 여백을 정확히 뚫는가 ──────────────────────────
// 푸터는 음수 마진으로 카드 padding을 상쇄해 구분선을 카드 폭 전체로 늘인다.
// 카드 padding만 바꾸면 선이 안쪽에서 끊기거나 카드 밖으로 삐져나간다 — 눈으로는
// 몇 px 어긋난 걸 못 잡으니 여기서 묶어 둔다.
{
  const s = read('src/features/attendance/components/MatchDetailCard.tsx');
  const cardPad = num(s, /card:\s*\{[^}]*?padding:\s*(\d+)/s, 'MatchDetailCard.card.padding');
  const mx = num(s, /rosterFoot:\s*\{[^}]*?marginHorizontal:\s*-(\d+)/s, 'rosterFoot.marginHorizontal');
  const mb = num(s, /rosterFoot:\s*\{[^}]*?marginBottom:\s*-(\d+)/s, 'rosterFoot.marginBottom');
  const px = num(s, /rosterFoot:\s*\{[^}]*?paddingHorizontal:\s*(\d+)/s, 'rosterFoot.paddingHorizontal');
  assert.equal(mx, cardPad, `푸터 좌우 음수마진(${mx})이 카드 padding(${cardPad})과 달라 구분선이 어긋난다`);
  // 실측 확인: 카드 372(테두리 포함) 안에서 푸터는 21..391 = 패딩 박스 370. 테두리를 덮지 않는다.
  assert.equal(mb, cardPad, `푸터 아래 음수마진(${mb})이 카드 padding(${cardPad})과 달라 카드 밑변에 안 붙는다`);
  assert.equal(px, cardPad, `푸터 안쪽 여백(${px})이 카드 padding(${cardPad})과 달라 글자가 다른 줄과 안 맞는다`);
  // 카드 밖에 떠 있던 옛 링크가 남아 있으면 같은 링크가 두 개가 된다
  const screen = read('src/features/attendance/screens/AttendanceScreen.tsx');
  assert.ok(!screen.includes('rosterLinkRow'), '카드 밖 「명단 보기」 잔재가 남아 있다');
  assert.ok(screen.includes('onOpenRoster'), '카드에 명단 열기가 연결되지 않았다');
}

// ── 2. 빈 팀 칸이 접힐 수 있는가 ────────────────────────────────────
// minHeight가 다시 붙으면 분배 전 화면이 또 빈 상자로 채워진다.
{
  const s = read('src/features/assignment/screens/AssignmentScreen.tsx');
  const body = s.match(/groupBody:\s*\{([^}]*)\}/)![1];
  assert.ok(!/minHeight/.test(body), 'groupBody에 minHeight가 다시 생겼다 — 빈 팀이 접히지 않는다');
  const emptyH = num(s, /groupEmptyBox:\s*\{[^}]*?minHeight:\s*(\d+)/s, 'groupEmptyBox.minHeight');
  const playerH = num(s, /playerRow:\s*\{[^}]*?minHeight:\s*(\d+)/s, 'playerRow.minHeight');
  // §15: 빈 상태가 실제 데이터가 있을 때보다 더 넓은 자리를 차지하면 안 된다
  assert.ok(emptyH <= playerH, `빈 칸(${emptyH})이 선수 한 줄(${playerH})보다 크다`);
}

// ── 3. 점수가 화면에서 가장 큰 글자인가 ──────────────────────────────
// §7 "숫자가 Hero". 다른 곳 글씨를 키우다 이 관계가 뒤집히면 스코어보드의 주인공이 바뀐다.
{
  const score = num(read('src/features/timer/components/ScoreboardPanel.tsx'), /score:\s*\{[^}]*?fontSize:\s*(\d+)/s, 'score.fontSize');
  const timer = num(read('src/features/timer/components/TimerPanel.tsx'), /timeDisplay:\s*\{[^}]*?fontSize:\s*(\d+)/s, 'timeDisplay.fontSize');
  const amount = num(read('src/theme.ts'), /amount:\s*\{\s*fontSize:\s*(\d+)/, 'font.amount');
  assert.ok(score > timer, `점수(${score})가 타이머(${timer})보다 크지 않다`);
  assert.ok(score > amount, `점수(${score})가 정산 금액(${amount})보다 크지 않다`);
  // 팀 이름은 보조 — 점수와 세기를 다투면 안 된다
  const team = num(read('src/features/timer/components/ScoreboardPanel.tsx'), /team:\s*\{[^}]*?fontSize:\s*(\d+)/s, 'team.fontSize');
  assert.ok(team < score / 3, `팀 이름(${team})이 점수(${score})에 비해 크다`);
  // 팀 색을 쓰지 않는다 — 파랑이 브랜드 그린과 같은 위계로 들어오면 안 된다
  const sb = read('src/features/timer/components/ScoreboardPanel.tsx');
  assert.ok(!/colors\.blue/.test(sb), '스코어에 blue가 되살아났다');
  assert.ok(!/styles\.team, \{ color/.test(sb), '팀 이름에 색을 다시 넣었다');
  // 「경기 종료 → 정산으로」는 정상 흐름이라 primary — danger는 삭제·취소에만
  assert.ok(/finishText: \{ color: colors\.green/.test(sb), '종료 버튼이 primary가 아니다');
  assert.ok(/onFinish,\s+false/.test(sb), '확인 대화상자가 아직 destructive다');
}

// ── 4. 홈 공지가 티커 높이인가 ──────────────────────────────────────
// §3: 44~52px. 배너·경기 카드보다 낮아야 한다.
{
  const s = read('src/features/home/screens/HomeScreen.tsx');
  const h = num(s, /noticeBar:\s*\{[^}]*?minHeight:\s*(\d+)/s, 'noticeBar.minHeight');
  assert.ok(h >= 44 && h <= 52, `공지 높이 ${h}px — 44~52 밖이다`);
  assert.ok(h >= 44, '탭 표적이 44px 아래로 내려갔다');
  // 면이 card면 아래 경기 카드와 같은 층이 된다
  assert.ok(/noticeBar:\s*\{[^}]*?backgroundColor:\s*colors\.cardAlt/s.test(s), '공지 면이 cardAlt가 아니다');
}

// ── 5. 미등록 정산에 링을 그리지 않는가 ──────────────────────────────
// 상태는 배지가 말한다. 링이 돌아오면 한 카드에서 같은 말을 두 번 하게 된다.
{
  const s = read('src/features/settlement/components/SettlementCard.tsx');
  assert.ok(/\{!pending && <ProgressRing/.test(s), '미등록에도 링이 그려진다');
  assert.ok(!/label=\{pending/.test(s), '링 안에 상태 글자를 다시 넣었다');
  // 틴트만으로는 상세와 구분이 안 됐다 — 형태로 가른다: 채워진 버튼 + 텍스트 링크
  assert.ok(/styles\.sPendCta/.test(s), '「정산 만들기」가 채워진 버튼이 아니다');
  // 미등록은 앰버다 — 초록은 「진행중·완료·활성」이라 아직 시작 안 한 상태와 겹친다
  assert.ok(/sBadgeWarn/.test(s), '미등록 배지가 앰버가 아니다');
  assert.ok(!/sBadgeOutline/.test(s), '초록 아웃라인 배지가 남아 있다');
  // 목록에 넷씩 쌓이는 카드에 같은 설명 문장을 넣지 않는다 — 배지가 이미 말한다
  assert.ok(!/borderStyle: 'dashed'/.test(s), '반복되는 안내 스트립이 되살아났다');
  /*
    미등록 CTA는 앰버 아웃라인이다.
    「누를 것은 초록」이 카드 한 장 안의 규칙이라면, 여기서 이기는 건 카드 사이의 위계다 —
    미등록이 넷이면 채운 초록이 세로로 네 개 선다. 같은 강조가 목록에서 3개 이상
    반복되면 강조가 아니다. 진행중 하나가 떠오르려면 나머지가 물러나야 한다.
  */
  assert.ok(!/GreenFill/.test(s), '미등록 CTA에 초록 채움이 되살아났다');
  assert.ok(/sPendCtaText: \{ color: colors\.gold/.test(s), '미등록 CTA 라벨이 앰버가 아니다');
  assert.ok(/sCardGhost/.test(s), '미등록 카드가 ghost로 내려가지 않았다');
  // 같은 곳으로 가는 버튼이 둘이면 어느 쪽을 눌러야 하는지 되묻게 된다
  const ctas = (s.match(/onPrimaryAction \? stop\(onPrimaryAction\)/g) ?? []).length;
  assert.equal(ctas, 2, `주 액션 버튼이 ${ctas}개 — 미등록 1 + 진행중 1이어야 한다`);
  // 「경기 상세」는 정산 생성 시트가 아니라 다른 곳으로 가야 한다.
  // 예전엔 화면이 onPress와 onPrimaryAction에 같은 함수를 줘서 눌러도 같은 시트가 떴다.
  assert.ok(/onOpenTargets/.test(s), '「참석자 N명」 링크가 사라졌다');
  const screen = read('src/features/settlement/screens/SettlementScreen.tsx');
  const pend = screen.slice(screen.indexOf('variant="pending"'), screen.indexOf('variant="pending"') + 700);
  assert.ok(/onOpenTargets=\{\(\) => setTargetsMatchId/.test(pend), '「참석자」가 미리보기를 열지 않는다');
  assert.ok(!/onOpenTargets=\{[^}]*setCreateSheetMatchId/.test(pend),
    '「참석자」가 정산 생성 시트를 연다 — 정산 만들기와 같은 곳이다');
  // 미리보기와 생성 시트가 같은 목록을 봐야 한다 — 따로 계산하면 청구 대상이 갈린다
  assert.ok(/const candidatesFor = useCallback/.test(screen), '후보 계산이 공용 함수가 아니다');
  assert.ok(/candidatesFor\(createSheetMatch\)/.test(screen), '생성 시트가 공용 계산을 안 쓴다');
  assert.ok(/candidatesFor\(targetsMatch\)/.test(screen), '미리보기가 공용 계산을 안 쓴다');

  // 「변경 ›」은 계좌 관리로 가야 한다 — onClose면 시트만 닫히고 등록할 길이 없다
  const sheet2 = read('src/features/settlement/components/CreateSettlementSheet.tsx');
  assert.ok(/onEditAccount \?\? onClose/.test(sheet2), '「변경」이 계좌 관리로 가지 않는다');
  assert.ok(/setOuterTab\('account'\)/.test(screen), '화면이 계좌 관리 탭으로 전환하지 않는다');
  assert.ok(/alignSelf: 'flex-start'/.test(s), 'CTA가 다시 전체 폭으로 늘어났다');

  // 금액 단위가 숫자에 붙어 있는가 — 입력칸에 flex:1을 주면 「원」이 카드 끝으로 밀린다
  const sheet = read('src/features/settlement/components/CreateSettlementSheet.tsx');
  const ai = sheet.match(/amountInput: \{([^}]*)\}/)![1];
  assert.ok(!/flex: 1/.test(ai), 'amountInput이 다시 flex:1 — 「원」이 밖으로 밀린다');
  assert.ok(/amountGhost/.test(sheet), '폭을 정하는 유령 텍스트가 없다');
}

// ── 6. 탭바와 화면 하단 여백이 같은 값을 보는가 ──────────────────────
// 따로 두면 바 높이를 바꿀 때 마지막 줄이 바 뒤에 깔린다.
{
  const nav = read('src/navigation/MainTabNavigator.tsx');
  const grad = read('src/components/ScreenGradient.tsx');
  assert.ok(/BAR_H = tabBar\.height/.test(nav), '탭바 높이가 토큰을 안 본다');
  assert.ok(/tabBar\.gap \+ tabBar\.height/.test(grad), '하단 여백이 토큰을 안 본다');
}

// ── 7. 멤버 탭에 항상 들어갈 수 있는가 ──────────────────────────────
//
// 들어가는 길이 가로 로스터(3명 이상)와 +N 타일(6명 이상)뿐이었다. 2명 이하 팀은
// 도달 자체가 불가였고, 초대 진입로가 그 목록 끝에 있다 — 갓 만든 팀이 초대를
// 제일 급하게 찾는데 정확히 그 팀이 못 봤다. 임계값을 다시 넣으면 같은 함정이 난다.
{
  /*
   * 파일이 갈라졌다. 진입로는 팀 홈 탭(제목·로스터 아바타·+N 타일)에 있고, 목록 끝
   * 초대 행은 멤버 탭에 있다. 부모(TeamHomeScreen)는 이제 라우팅만 해서 여기 없다 —
   * 읽는 대상만 옮기고 보는 내용은 그대로다.
   */
  const home = read('src/features/team/components/TeamHomeTab.tsx');
  const membersTab = read('src/features/team/components/TeamMembersTab.tsx');
  // 부모가 setTab('members')를 넘겨주고 탭 안에서는 onGoMembers로 불린다
  const calls = [...home.matchAll(/onGoMembers/g)];
  assert.ok(calls.length >= 3, '멤버 탭 진입로가 줄었다');

  /*
    제목의 진입은 멤버 수를 안 본다.

    예전엔 indexOf('sectionHeadLink')로 그 자리를 잡았다. 히어로에 「팀 설정 ›」이 같은
    토큰으로 들어오면서 그 문자열이 파일에 둘이 됐고, indexOf가 앞의 것(히어로)을 집어
    검사가 통째로 엉뚱한 자리를 봤다 — 다행히 통과가 아니라 실패로 드러났다.
    onGoMembers를 부르는 Pressable 자체를 노드로 찾는다.
    (규칙: JSX 구조를 보는 단언은 파서로 — teamsettings.check 머리말)
  */
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let titleEntry: ts.Node | null = null;
  const gates: ts.Node[] = [];
  const collect = (n: ts.Node) => {
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
    // 「멤버가 N명 이상일 때만」으로 감싼 구간
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      /members\.length\s*[<>]/.test(n.expression.left.getText())
    ) {
      gates.push(n.expression.right);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  assert.ok(titleEntry, '제목이 멤버 탭으로 안 간다');
  const at = (titleEntry as ts.Node).getStart();
  assert.ok(
    !gates.some((g) => at >= g.getStart() && at < g.getEnd()),
    '제목 진입에 멤버 수 조건이 붙었다 — 2명 이하 팀이 멤버 탭에 못 간다'
  );

  // 초대는 그 목록 안에 있다
  assert.ok(/accessibilityLabel="멤버 초대하기"/.test(membersTab), '목록 끝 초대 행이 없다');
  assert.ok(!/inviteCtaText/.test(membersTab), '같은 일을 하는 초대 버튼이 둘이다');
}

// ── 히어로 — 두 곳이 맞아야 하는 것들 ──────────────────────────────
{
  const tab = read('src/features/team/components/TeamHomeTab.tsx').split('\r').join('');
  const blockOf = (name: string) => {
    const i = onlyIndexOf(tab, `  ${name}: {`, `${name} 스타일`);
    return tab.slice(i, tab.indexOf('\n  },', i));
  };

  /*
    엠블럼 링 ↔ 내 칸 링.

    「이 동그라미가 주인공이다」를 앱은 초록 링으로 말한다. 엠블럼이 그 어휘를 빌려
    쓰는 것이라 값이 같아야 한다 — 한쪽만 굵어지거나 색이 갈리면 같은 뜻을 다른
    모양으로 두 번 말하게 된다.

    ⚠ 비교 대상이 옮겨갔다. 예전에는 selfAvatar(전체 폭 「내 행」의 54px 아바타)와
      비교했는데, 멤버 줄이 칸 단위로 바뀌면서 그 행이 사라졌다. 스타일 정의는
      한동안 파일에 남아 있었고 **이 단언은 화면에 없는 것과 비교하고 있었다** —
      selfAvatar를 아무 값으로 바꿔도 화면은 안 변하고 검사만 통과/실패했다.
      「검사가 자기 사본을 시험한다」의 변종이다: 사본이 아니라 죽은 코드를 시험한다.

      지금 살아 있는 짝은 memberAvatarMe다(멤버 줄에서 내 칸의 링). 비교를 없애고
      값을 직접 보는 방법도 있었는데 안 골랐다 — 둘이 같아야 한다는 것이 이 단언의
      뜻이고, 값만 보면 한쪽이 바뀌어도 다른 쪽은 안 본다.
  */
  const ring = (name: string) => {
    const b = blockOf(name);
    return {
      width: onlyMatch(b, /borderWidth: [\d.]+/, `${name} borderWidth`).trim(),
      /* 한 줄짜리 스타일(memberAvatarMe)에서는 값 뒤에 닫는 중괄호가 붙는다 —
         구분자에 }를 넣어야 두 형태가 같은 문자열로 나온다 */
      color: onlyMatch(b, /borderColor: [^,}\n]+/, `${name} borderColor`).trim(),
    };
  };
  const emblem = ring('emblem');
  const selfCell = ring('memberAvatarMe');
  assert.deepEqual(
    emblem,
    selfCell,
    `엠블럼 링과 내 칸 링이 갈렸다: ${JSON.stringify(emblem)} vs ${JSON.stringify(selfCell)}`
  );
  assert.ok(/borderColor: colors\.green/.test(emblem.color), '엠블럼 링이 초록이 아니다');

  /* 비교 대상이 화면에 실제로 그려지는가 — 다시 죽은 코드와 비교하지 않도록 */
  assert.ok(/styles\.memberAvatarMe/.test(tab), '내 칸 링이 어디에도 안 쓰인다 — 죽은 것과 비교하고 있다');

  /*
    dashed가 안 돌아왔는가.

    이 앱에서 dashed는 「비었으니 채워라」다(myInfoChipEmpty의 「설정하기」). 엠블럼에
    dashed를 두면 로고를 **다 채운 뒤에도** 채우라는 표시가 남는다. 빈 상태의 안내는
    안에 있는 EMBLEM 글자가 한다.
    (부정 단언 — 위 긍정 단언이 emblem 블록을 이미 고정했다: anchor.ts 다섯 번째 구분)
  */
  assert.ok(
    !/borderStyle: 'dashed'/.test(blockOf('emblem')),
    '엠블럼에 dashed가 돌아왔다 — 다 채운 자리에도 채우라는 표시가 남는다'
  );

  /*
    밑색과 빛줄기가 같은 방향인가.

    빛줄기는 밑색의 밝은 쪽(우상단)에서 뻗어 나간다. 한쪽만 뒤집히면 어두운 구석에서
    빛이 시작해 카드가 두 방향으로 갈린다 — 눈으로는 「뭔가 탁하다」로만 보이고
    원인이 안 보인다. 두 겹 다 우상 → 좌하여야 한다.
  */
  /*
    히어로 여백 — 위아래가 같아야 한다.

    paddingTop만 20이고 아래가 없던 시절엔 엠블럼과 소개 줄이 카드 바닥에 그대로
    닿았다(재 봤다: 카드 y50~136, 엠블럼 바닥 136 — 아래 여백 0px). 카드가 낮아서
    빽빽했던 게 아니라 아래가 잘려 있었던 것이다. 위만 고치면 같은 증상이 돌아온다.
  */
  const row = blockOf('bannerRow');
  assert.ok(/paddingVertical: 20/.test(row), `히어로 상하 여백이 비대칭이다: ${row.replace(/\s+/g, ' ').slice(0, 90)}`);
  assert.ok(!/paddingTop:/.test(row), '히어로에 paddingTop이 따로 붙었다 — 아래가 다시 잘린다');

  /*
    엠블럼이 원이다 — 레퍼런스에 맞춰 뒤집었다.

    한때 rounded-square였고 근거가 있었다: 「엠블럼은 방패·사각이 원형보다 자연스럽고
    아래 Bento 격자의 사각 타일들과도 모양이 맞는다.」 그 근거는 코드 주석에 남겨 뒀다 —
    지우면 다음 사람이 「엠블럼인데 왜 원이지」로 되돌린다.

    radius를 pill로 붙든다. 76/2 같은 값을 쓰면 크기를 바꾸는 날 원이 아니게 되는데,
    화면에서는 「살짝 찌그러졌다」로만 보이고 왜인지는 안 보인다.
  */
  assert.ok(/borderRadius: radius\.pill,/.test(blockOf('emblem')), '엠블럼이 원이 아니다');

  /*
    본문이 네 줄이고 엠블럼이 카드 높이를 결정하지 않는다.

    한때 엠블럼 76 = 세 줄(25 + 12 + 13 + 12 + 14)로 높이를 맞췄는데, 레퍼런스가
    구장 · 종목 줄을 되살려 네 줄이 되면서 본문이 더 길어졌다. 이제 카드 높이는
    본문이 정하고 엠블럼은 그 안에 든다 — 엠블럼이 본문보다 커지면 카드가 엠블럼
    때문에 늘어나고, 그때 본문 위아래에 설명할 수 없는 여백이 생긴다.
  */
  const bodyGap = Number(onlyMatch(tab, /bannerBody: \{ flex: 1, gap: (\d+) \}/, '본문 gap').match(/gap: (\d+)/)![1]);
  const emblemSize = Number(onlyMatch(blockOf('emblem'), /width: (\d+)/, '엠블럼 폭').match(/(\d+)/)![1]);
  const bodyHeight = 25 + 13 + 13 + 14 + bodyGap * 3; // 팀명 · Since · 구장·종목 · 소개
  assert.ok(emblemSize <= bodyHeight,
    `엠블럼(${emblemSize})이 본문 네 줄(${bodyHeight})보다 커서 카드 높이를 정한다`);

  /*
    「팀 설정 ›」이 우상단에 없다.

    거기는 빛줄기가 가장 밝은 자리고 이 링크는 초록 글자다 — 팀명 줄에 있을 때
    대비가 3.34:1까지 떨어졌다(본문 기준 4.5:1). 소개 줄로 내려오면서 4.75:1이 됐고,
    그래서 빛줄기 알파를 0.22에서 0.40으로 올릴 수 있었다. 둘은 한 판단이라 같이 본다.
  */
  const body = tab.slice(
    onlyIndexOf(tab, '<View style={styles.teamNameRow}>', '팀명 줄'),
    onlyIndexOf(tab, '<View style={styles.settingsSlot}>', '팀 설정 칸')
  );
  assert.ok(!/onOpenTeamSettings/.test(body), '「팀 설정」이 본문 안으로 돌아갔다 — 우상단은 빛줄기가 가장 밝은 자리다');
  assert.ok(/settingsSlot: \{ alignSelf: 'center', marginTop: \d+ \}/.test(tab),
    '팀 설정 칸이 가운데보다 아래에 안 선다 — flex-end면 소개 줄과 한 줄로 읽힌다');

  // 빛줄기는 스톱이 셋이다. 둘이면 모서리에서 바로 꺼져 「띠」가 아니라 「밝은 모서리」가 된다
  const beam = onlyMatch(tab, /colors=\{\['rgba\(34,197,94,[\d.]+\)', 'rgba\(34,197,94,[\d.]+\)', 'transparent'\]\}/, '빛줄기 색');
  assert.ok(beam.length > 0);
  const stops = onlyMatch(tab, /locations=\{\[0, 0\.3, 0\.72\]\}/, '빛줄기 스톱');
  assert.ok(stops.length > 0, '빛줄기 스톱이 바뀌었다 — 코어(0~0.3)와 꼬리(~0.72)가 띠의 폭과 방향이다');

  /* 히어로 구간 안에서만 센다 — 같은 방향의 그라디언트가 카드 밖에도 생겼다
     (다음 경기 카드의 썸네일 플레이스홀더). 파일 전체를 세면 그것까지 잡힌다 */
  const heroBg = tab.slice(
    onlyIndexOf(tab, '<View style={styles.banner}>', '히어로 여는 태그'),
    onlyIndexOf(tab, '<View style={styles.bannerRow}>', '히어로 본문 행')
  );
  const dirs = heroBg.match(/start=\{\{ x: 1, y: 0 \}\}\s*\n\s*end=\{\{ x: 0, y: 1 \}\}/g) ?? [];
  assert.equal(dirs.length, 2, `히어로 배경 두 겹의 방향이 갈렸다 (우상→좌하가 ${dirs.length}겹)`);
}

// ── 4버튼은 한 줄이다 ───────────────────────────────────────────────
//
// 2×2였다. 근거가 「1×4는 412px에서 칸당 88px이라 「공지사항」 네 글자가 잘린다」였는데
// 재 보니 안 잘린다 — 88px은 맞고 글자 폭을 안 잰 값이었다. 렌더로 확인한 수:
//
//   420px 기기  칸 86  글자 45  여유 41
//   360px 기기  칸 71  글자 45  여유 26
//   320px 기기  칸 61  글자 45  여유 16   ← 가장 좁은 자리에서도 남는다
//
// 여기서 붙드는 것은 「한 줄인가」다. 폭은 화면마다 다르니 소스로 못 재고, 줄바꿈만
// 막으면 된다 — flexWrap이 돌아오면 좁은 기기에서 조용히 2×2가 된다.
{
  const tab = read('src/features/team/components/TeamHomeTab.tsx').split('\r').join('');
  const blockOf = (name: string) => {
    const i = onlyIndexOf(tab, `  ${name}: {`, `${name} 스타일`);
    return tab.slice(i, tab.indexOf('\n  },', i));
  };

  const grid = onlyMatch(tab, /tiles: \{[^}]+\}/, '타일 그리드');
  assert.ok(!/flexWrap/.test(grid), `타일 그리드에 flexWrap이 돌아왔다 — 좁은 기기에서 2×2가 된다: ${grid}`);
  assert.ok(/flexDirection: 'row'/.test(grid), '타일이 가로로 안 선다');

  const tile = blockOf('tile');
  // flexBasis '48%'면 둘씩 끊긴다. 0 + grow 1이라야 넷이 남는 폭을 똑같이 나눈다
  assert.ok(/flexBasis: 0,/.test(tile), `타일이 비율 기반 폭으로 돌아갔다 — 넷이 한 줄에 안 선다: ${tile.replace(/\s+/g, ' ').slice(0, 80)}`);
  assert.ok(/flexGrow: 1,/.test(tile), '타일이 남는 폭을 안 나눈다');

  // 글자가 자기 폭만 필요한 것은 세로 배치이기 때문이다. 가로로 눕히면
  // 아이콘 22 + gap + 글자 45가 한 줄에 들어가야 해서 위 여유가 사라진다
  assert.ok(!/flexDirection: 'row'/.test(tile), '타일 안이 가로 배치가 됐다 — 아이콘과 글자가 폭을 나눠 쓴다');

  // 넷을 같은 모양으로 그린다 — 하나만 달라지면 줄이 흔들린다
  const defs = onlyMatch(tab, /const TILES: [\s\S]*?\n\];/, 'TILES 정의');
  assert.equal((defs.match(/\{ key: '/g) ?? []).length, 4, '타일이 넷이 아니다');
}

console.log('uidetail.check: ok');
