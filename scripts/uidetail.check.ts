// scripts/uidetail.check.ts — UI 디테일 개선 작업의 불변식 검사
//
// 값 하나하나가 맞는지 재확인하는 건 의미가 없다(소스에 쓴 걸 소스에서 읽는 동어반복).
// 여기서 잡는 건 "두 곳이 서로 맞아야 하는데 한쪽만 바뀌면 조용히 깨지는 것"들이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

  // 제목의 진입은 멤버 수를 안 본다
  const anchor = home.indexOf('sectionHeadLink');
  const head = home.slice(anchor - 600, anchor + 200);
  assert.ok(/onGoMembers/.test(head), '제목이 멤버 탭으로 안 간다');
  assert.ok(!/members\.length [<>]/.test(head), '제목 진입에 멤버 수 조건이 붙었다');

  // 초대는 그 목록 안에 있다
  assert.ok(/accessibilityLabel="멤버 초대하기"/.test(membersTab), '목록 끝 초대 행이 없다');
  assert.ok(!/inviteCtaText/.test(membersTab), '같은 일을 하는 초대 버튼이 둘이다');
}

console.log('uidetail.check: ok');
