// scripts/memberstrip.check.ts — 멤버 섹션의 내 행과 아바타 줄
//
// 두 갈래(soloList 2명 이하 / 가로 로스터 3명 이상)를 한 모양으로 합쳤다.
// 갈래가 있던 이유는 「62px 아바타 하나가 폭에 혼자 놓이면 오른쪽이 통째로 빈다」였고,
// 내 행이 항상 전체 폭을 쓰므로 그 원인이 사라졌다.
//
// 붙드는 것:
//   1. 갈래가 돌아오지 않는가 (인원수로 모양이 갈리면 그 함정이 다시 생긴다)
//   2. 아바타 줄에서 나를 빼는가 (한 카드에 같은 사람을 두 번 그리지 않는다)
//   3. 내 행 메타가 앱의 통일된 표기를 쓰는가
//   4. 겹침이 살아 있는가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { onlyMatch } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');

// ── 1. 인원수로 모양이 갈리지 않는다 ────────────────────────────────
//
// 임계값을 두면 「그 아래 인원은 어디로도 못 간다」가 다시 생긴다. 실제로 2명 이하 팀이
// 멤버 탭에 도달할 방법이 없던 적이 있다.
{
  /* 주석에는 「soloList가 있었다」가 남아 있어야 한다 — 근거를 지우지 않았다.
     그래서 이름이 아니라 **쓰이는 자리**를 본다: 스타일 정의와 styles.X 참조 */
  assert.ok(!/styles\.soloList|styles\.soloAvatar|styles\.soloName/.test(tab),
    'soloList 갈래가 돌아왔다 — 인원수로 모양이 갈린다');
  assert.ok(!/^  solo\w+: \{/m.test(tab), 'soloList 스타일이 남아 있다');
  // (부정 단언 — tab 안에 아래 문자열을 넣어 실패하는 것을 확인했다)
  assert.ok(
    !/visibleMembers\.length <= 2|members\.length <= 2/.test(tab),
    '인원수로 멤버 섹션의 모양을 가른다'
  );

  // 내 행은 me가 있으면 언제나 그린다 — 1명 팀도 이 행 하나로 폭이 찬다
  assert.ok(/\{!!me && \(\s*\n\s*<Pressable/.test(tab), '내 행이 조건부로 사라진다');
}

// ── 2. 아바타 줄은 나를 뺀다 ────────────────────────────────────────
//
// 내 행에 이미 큰 아바타로 나왔다. 줄에 또 넣으면 한 카드에 같은 사람이 두 번이다.
// 그 결과로 「+N」은 7명부터 뜬다(나 + 5명까지는 다 보인다) — 의도다.
{
  const others = onlyMatch(tab, /const others = [^;]+;/, 'others 계산');
  assert.ok(
    /visibleMembers\.filter\(\(m\) => m\.id !== selfMemberId\)/.test(others),
    `아바타 줄이 나를 빼지 않는다: ${others}`
  );

  // 다섯까지 보이고 그 뒤는 +N
  assert.ok(/others\.slice\(0, 5\)/.test(tab), '아바타 줄이 다섯에서 안 끊긴다');
  assert.ok(/others\.length > 5 &&/.test(tab), '+N 조건이 다섯 기준이 아니다');
  assert.ok(/\+\{others\.length - 5\}/.test(tab), '+N이 남은 수를 안 센다');

  // 0명이면 줄 자체를 안 그린다 — 빈 가로줄은 「아직 안 만든 화면」으로 읽힌다
  assert.ok(/\{others\.length > 0 && \(/.test(tab), '나머지가 없어도 빈 줄을 그린다');
}

// ── 3. 내 행 메타 ───────────────────────────────────────────────────
//
// 「최근 N경기 중 M회」는 앱 전체가 쓰는 표기다(memberrow.check가 멤버 행 ↔ 내 기록을
// 한 단언으로 묶어 붙들고 있다). 여기서 새 표현을 만들면 같은 값이 세 가지로 적힌다.
{
  const meta = onlyMatch(tab, /\{\[\s*\n\s*toPosition\(me\.position\)[\s\S]*?\.join\(' · '\)\}/, '내 행 메타');
  assert.ok(/formatRecentAttendance\(memberAttendanceRate\(memberRateMatches, me\)\)/.test(meta),
    `내 행이 공용 참석 표기를 안 쓴다: ${meta.slice(0, 120)}`);
  // 실력 등급은 안 넣는다 — 본인이 자기 등급을 보면 팀 분위기가 깨진다
  assert.ok(!/skillTag/.test(meta), '내 행 메타에 실력 등급이 붙었다');
  // 등번호·주발은 「내 정보」 카드가 맡는다
  assert.ok(!/jerseyNumber|dominantFoot/.test(meta), '내 행 메타에 「내 정보」의 값이 들어왔다');

  // 역할 뱃지는 히어로와 같은 문구를 쓴다 (rolelabel.check가 전수로 붙든다)
  assert.equal(tab.split("{isAdmin ? '총무' : '팀원'}").length - 1, 2, '역할 뱃지 문구가 히어로와 갈렸다');
}

// ── 4. 겹침 ─────────────────────────────────────────────────────────
//
// 앱의 첫 겹침 UI다. 음수 마진이 사라지면 아바타가 그냥 나란히 서고, 테두리가 사라지면
// 뒤 원이 앞 원에 얹혀 경계가 뭉갠다.
{
  const overlap = onlyMatch(tab, /avatarChipOverlap: \{ marginLeft: (-?\d+) \}/, '겹침 값');
  const px = Number(overlap.match(/(-?\d+)/)![1]);
  assert.ok(px < 0, `아바타가 겹치지 않는다(marginLeft ${px})`);

  const chip = tab.slice(tab.indexOf('  avatarChip: {'), tab.indexOf('  avatarChipOverlap'));
  const w = Number(chip.match(/width: (\d+)/)![1]);
  // 지름의 25% 안팎. 더 당기면 이니셜 두 글자가 가려진다
  assert.ok(Math.abs(px) / w >= 0.2 && Math.abs(px) / w <= 0.3,
    `겹침이 지름의 ${Math.round((Math.abs(px) / w) * 100)}%다 — 20~30% 밖이면 근거를 다시 대라`);

  // 각 칸에 배경색 테두리 — 없으면 겹침이 「뭉갰다」로 보인다
  assert.ok(/borderWidth: 2,\s*\n\s*borderColor: colors\.bgRoot,/.test(chip), '아바타에 경계 테두리가 없다');
}

console.log('memberstrip ok');
