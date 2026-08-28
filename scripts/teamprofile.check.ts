// scripts/teamprofile.check.ts — 팀 프로필 표시 줄
//
// 요일 인덱스가 두 체계다: team_settings.default_weekdays는 0=월, JS Date.getDay()는
// 0=일. 한 번 섞이면 표시가 하루씩 밀린 채로 조용히 굴러간다 — 화면에 "매주 화요일"이
// 뜨는데 실제 경기는 수요일이면 아무도 버그로 신고하지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { onlyMatch } from './lib/anchor.ts';
import { WEEKDAYS, regularLabel } from '../src/features/team/weekdays.ts';
import { recentAvgHeadcount } from '../src/features/attendance/utils/attendanceRate.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 0=월 ───────────────────────────────────────────────────────
// DB에서 수요일을 저장하면 [2]가 들어간다 (실측 2026-08-22)
assert.equal(WEEKDAYS[0], '월');
assert.equal(WEEKDAYS[2], '수');
assert.equal(WEEKDAYS[6], '일');
assert.equal(regularLabel([2], '20:00:00'), '매주 수요일 20:00');

// 복수 요일 — teams에 단일 int를 두지 않은 이유
assert.equal(regularLabel([1, 3], '20:00:00'), '매주 화·목요일 20:00');
// 순서가 뒤집혀 저장돼도 월→일 순으로 읽는다
assert.equal(regularLabel([3, 1], '20:00'), '매주 화·목요일 20:00');

// 요일이 없으면 시간만으로는 뜻이 없다
assert.equal(regularLabel([], '20:00:00'), null);
assert.equal(regularLabel(null, '20:00:00'), null);
// 시간만 없으면 요일까지는 말할 수 있다
assert.equal(regularLabel([2], null), '매주 수요일');
// 범위 밖 값이 섞여도 배열 밖을 읽지 않는다
assert.equal(regularLabel([2, 9], '20:00'), '매주 수요일 20:00');

// ── 평균 인원은 placeholder 전용 ────────────────────────────────
{
  const now = new Date('2026-08-23T12:00:00+09:00');
  const at = (iso: string, n: number) => ({ matchDate: iso, attendCount: n });
  // 이미 치른 경기만 — 앞으로 있을 경기는 아직 아무도 투표 안 했을 수 있다
  assert.equal(
    recentAvgHeadcount([at('2026-08-05T20:00:00+09:00', 10), at('2026-09-05T20:00:00+09:00', 0)], now),
    10
  );
  // 3개월 밖은 뺀다
  assert.equal(recentAvgHeadcount([at('2026-01-05T20:00:00+09:00', 30), at('2026-08-05T20:00:00+09:00', 10)], now), 10);
  // 표본이 없으면 null — 0명과 "아직 없음"은 다르다
  assert.equal(recentAvgHeadcount([], now), null);
  assert.equal(recentAvgHeadcount([at('2026-08-05T20:00:00+09:00', 11), at('2026-08-12T20:00:00+09:00', 12)], now), 12);

  // 자동값은 placeholder로만 — 저장 경로에 실리면 안 된다
  const screen = read('src/features/team/screens/TeamSettingsScreen.tsx');
  assert.ok(/placeholder={headcountHint}/.test(screen), '자동 계산값이 placeholder로 안 간다');
  assert.ok(/최근 경기 평균/.test(screen), '자동값이라는 표시가 없다 — 저장된 값처럼 보인다');
  assert.ok(!/avgHeadcount: autoHeadcount/.test(screen), '자동 계산값을 저장한다');
  // CHECK 제약(1..99) 밖은 보내기 전에 막는다
  assert.ok(/next < 1 \|\| next > 99/.test(screen), '범위 가드가 없다 — DB가 23514로 거절한다');
}

// ── 프로필 저장은 칸별로 나간다 ─────────────────────────────────
{
  const svc = read('src/features/team/services/teamService.ts');
  // 즉시 저장 3개가 매번 6칸을 보내면 남의 최신 값을 화면의 낡은 값으로 덮는다
  assert.ok(/PROFILE_COLUMN/.test(svc), '팀 프로필이 다시 전 칸 전송이다');
  assert.ok(/if \(Object\.keys\(patch\)\.length === 0\) return;/.test(svc), '빈 patch도 UPDATE를 날린다');
  // DB에 없는 컬럼 — 실리면 프로필 저장 전체가 실패한다
  for (const dead of ['regular_weekday', 'regular_time']) {
    assert.ok(!svc.includes(dead), `${dead}는 teams에 없다 (마이그레이션에서 뺐다)`);
    assert.ok(!read('src/types/database.ts').includes(dead), `${dead}가 타입에 남아 있다`);
  }
}

// ── 빈 프로필 안내는 총무만 ────────────────────────────────────
{
  /*
   * 배너까지 팀 홈 탭으로 옮겨오면서 둘 다 한 파일에 있다.
   * (한때는 「채워주세요」만 탭이고 프로필 표시 줄은 부모에 있었다)
   */
  const homeTab = read('src/features/team/components/TeamHomeTab.tsx');
  const home = homeTab;
  assert.ok(
    /isAdmin && profileBits\.length === 0/.test(homeTab),
    '팀원에게도 "채워주세요"가 뜬다 — 채울 권한이 없는 사람에게 할 일을 만든다'
  );
  assert.ok(/profileBits\.length > 0 &&/.test(home), '빈 줄이 자리를 차지한다');

  /*
    빈 항목을 「미설정」으로 채우지 않는다 — 줄이 정보가 아니라 빈칸 목록이 된다.

    예전엔 home.slice(indexOf('profileBits'), +900)으로 그 자리를 봤다. profileBits가
    이 파일에 다섯 번 나오고 첫 것이 props 인터페이스라, 900자 창이 인터페이스와
    구조분해만 덮고 **렌더 자리에 닿지 않았다.** 무엇을 넣어도 통과하는 단언이었다.

    profileBits를 그리는 JSX 노드를 파서로 찾아 그 안만 본다.
    (규칙: JSX 구조를 보는 단언은 파서로 — teamsettings.check 머리말)
  */
  const file = fileURLToPath(new URL('../src/features/team/components/TeamHomeTab.tsx', import.meta.url));
  const sf = ts.createSourceFile(file, home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let line: ts.Node | null = null;
  const find = (n: ts.Node) => {
    // {profileBits.length > 0 && ( … )} 의 오른쪽 — 실제로 그리는 부분
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      n.expression.left.getText().replace(/\s/g, '') === 'profileBits.length>0'
    ) {
      line = n.expression.right;
    }
    ts.forEachChild(n, find);
  };
  find(sf);

  assert.ok(line, 'profileBits를 그리는 자리를 못 찾았다');
  const rendered = (line as ts.Node).getText();
  assert.ok(!/미설정/.test(rendered), `빈 항목을 "미설정"으로 채운다 — 줄이 정보가 아니라 빈칸 목록이 된다: ${rendered.slice(0, 80)}`);
  // 그 자리가 실제로 profileBits를 그리는지 — 못 찾은 것과 빈 것을 가른다
  assert.ok(/profileBits/.test(rendered), '그 자리가 profileBits를 안 그린다');
}

// ── 구장 · 종목 줄은 히어로에 있다 ─────────────────────────────────
//
// 「풋살」을 지웠던 적이 있다. 근거는 「상수라 정보가 0이다 — 이 앱에 풋살 아닌 팀은
// 없고 종목 컬럼도 고를 자리도 없다」였고, 그 사실은 지금도 맞다. 레퍼런스에 맞춰
// 되돌렸다: 정보량이 아니라 형태로 두는 줄이다(네 줄의 리듬이 서고, 구장명 혼자면
// 「· 풋살」이 없어 줄이 헐렁하다).
//
// 되돌리면서 붙드는 것이 바뀐다. 「없는가」가 아니라 **한 곳에만 있는가**다 —
// 구장명이 히어로와 소개 줄 양쪽에 있으면 고칠 때 한쪽만 고친다.
{
  const bits = onlyMatch(
    read('src/features/team/screens/TeamHomeScreen.tsx'),
    /const profileBits = \[[\s\S]*?\]\.filter\(Boolean\);/,
    'profileBits'
  );
  assert.ok(!/home_place_name/.test(bits), `구장명이 소개 줄에도 있다 — 히어로와 두 곳이다: ${bits}`);

  const homeTab2 = read('src/features/team/components/TeamHomeTab.tsx');
  assert.ok(/\[activeTeam\.team\.home_place_name, '풋살'\]/.test(homeTab2),
    '히어로에 구장 · 종목 줄이 없다');
}

console.log('teamprofile.check: ok');
