// scripts/memberstrip.check.ts — 팀 홈의 멤버 줄
//
// 세 번 모양이 바뀐 자리다. 이력을 남기는 이유는 매번 「이게 더 낫지 않나」로 되돌려지기
// 때문이다.
//
//   ① soloList(2명 이하) / 가로 로스터(3명 이상) 두 갈래
//      → 인원수로 모양이 갈리면 「그 아래 인원은 어디로도 못 간다」가 생긴다. 실제로
//        2명 이하 팀이 멤버 탭에 도달할 방법이 없던 적이 있다.
//   ② 내 행(전체 폭) + 겹치는 아바타 줄
//      → 갈래를 없앤 모양. 겹침 천장을 세 번 다시 계산했다(두 글자 6.9 / 한 글자 12.45 /
//        아이콘 9) — 칸 안의 내용이 바뀔 때마다 다시 재야 하는 값이었다.
//   ③ 지금: 가로 스크롤, 칸마다 아바타 · 이름 · 포지션. 전원이 같은 크기.
//      → 레퍼런스 구성. 겹치면 이름과 포지션이 갈 데가 없어서 겹침이 사라졌다.
//
// ── 2026-09-09에 여기서 멈춘 것 ────────────────────────────────────
//
// 빈 상태를 채우면서 「멤버가 둘 이하면 명단 바로 아래에서 초대를 권하자」를 넣었다가
// 1번 단언(`members.length <= 2`)에 걸렸다. 되돌렸다.
//
// ⚠ **단언이 의도보다 넓은 것은 맞다.** 막으려던 것은 「명단 **레이아웃**이 인원수로
//   갈린다」인데 패턴은 「인원수를 본다」를 막는다. 그리고 그 변경은 ①의 사고와
//   반대 방향이었다 — ①은 그 인원대가 **어디로도 못 가게** 만들었고,
//   이건 갈 곳을 **하나 더** 주는 것이었다.
//
// 그런데도 좁히지 않기로 했다. 근거 둘:
//   · 좁히려면 「레이아웃 분기」를 정의해야 하는데, **그 정의가 다음에 누가 인원수로
//     뭔가를 가를 때 통과시킬 구멍이 된다.** 세 번 되돌려진 자리면 그 구멍이 네 번째를 부른다.
//   · **잃는 것이 작다.** 초대 카드는 이미 조건 없이 늘 그려진다(TeamHomeTab). 다만
//     최근 글 아래라 화면 한참 밑이다. 「입구가 없다」가 아니라 「명단 자리에서
//     권하지 않는다」이고, 그 둘은 다르다.
//
// **같은 생각을 하는 사람은 여기서 멈춰라.** 그래도 하겠다면 먼저 물어라 —
// 초대 카드를 위로 올리는 것으로 풀리는 문제인가?
//
// 붙드는 것:
//   1. 인원수로 모양이 갈리지 않는가 (①의 함정)
//   2. 전원이 같은 칸인가 (②의 「내 행만 크게」가 안 돌아오는가)
//   3. 내 칸이 구분되는가 — 크기가 아니라 링과 뱃지로
//   4. 포지션이 없을 때 빈칸을 안 그리는가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlyMatch } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');

// ── 1. 인원수로 모양이 갈리지 않는다 ────────────────────────────────
{
  /* 주석에는 「soloList가 있었다」가 남아 있어야 한다 — 근거를 지우지 않았다.
     그래서 이름이 아니라 **쓰이는 자리**를 본다: 스타일 정의와 styles.X 참조 */
  assert.ok(!/styles\.soloList|styles\.soloAvatar|styles\.soloName/.test(tab),
    'soloList 갈래가 돌아왔다 — 인원수로 모양이 갈린다');
  assert.ok(!/^  solo\w+: \{/m.test(tab), 'soloList 스타일이 남아 있다');
  assert.ok(
    !/visibleMembers\.length <= 2|members\.length <= 2/.test(tab),
    '인원수로 멤버 섹션의 모양을 가른다'
  );
  // 접지 않는다 — 가로 스크롤이라 인원이 늘어도 줄이 안 넘친다.
  // 「+N」은 접어서 감추는 장치였고, 감춘 사람은 이름도 포지션도 안 보였다
  assert.ok(!/\+\{others\.length - 5\}|slice\(0, 5\)/.test(tab), '멤버 줄이 다시 다섯에서 끊긴다');
}

// ── 2. 전원이 같은 칸이다 ───────────────────────────────────────────
//
// 「내 행」이 전체 폭 한 줄로 따로 있던 시절이 있다. 근거는 「1명 팀에서 62px 아바타
// 하나가 폭에 혼자 놓이면 오른쪽이 통째로 빈다」였는데, 지금은 1명 팀이어도 내 칸 +
// 초대 칸이라 줄이 비지 않는다 — 그 원인이 사라졌다.
{
  assert.ok(!/styles\.selfRow/.test(tab), '내 행 강조가 돌아왔다 — 전원이 같은 크기의 칸이다');
  assert.ok(/orderedMembers\.map\(\(m\) => \{/.test(tab), '멤버를 한 목록으로 안 그린다');

  // 나를 맨 앞에 세운다 — 명단에서 자기를 먼저 찾는다
  const ordered = onlyMatch(tab, /const orderedMembers = \[[\s\S]*?\];/, '멤버 순서');
  assert.ok(/m\.id === selfMemberId/.test(ordered) && /m\.id !== selfMemberId/.test(ordered),
    `나를 앞에 안 세운다: ${ordered.replace(/\s+/g, ' ').slice(0, 90)}`);

  // 칸 폭이 고정이다 — 이름 길이로 칸이 들쭉날쭉하면 줄이 흔들린다
  const cell = onlyMatch(tab, /memberCell: \{[^}]+\}/, '멤버 칸');
  assert.ok(/width: \d+/.test(cell), `칸 폭이 이름 길이를 따라간다: ${cell}`);
}

// ── 3. 내 칸은 크기가 아니라 링과 뱃지로 구분한다 ───────────────────
{
  const me = onlyMatch(tab, /memberAvatarMe: \{[^}]+\}/, '내 아바타');
  assert.ok(/borderColor: colors\.green/.test(me), `내 칸에 초록 링이 없다: ${me}`);
  // 크기를 키우지 않는다 — 키우면 「내 행만 크게」가 다른 이름으로 돌아온다
  assert.ok(!/width|height/.test(me), `내 칸이 크기로 구분된다: ${me}`);
  assert.ok(/memberSelfBadge/.test(tab), '내 칸 뱃지가 없다');
  assert.ok(/\(나\)/.test(tab), '내 칸 이름에 「(나)」가 없다');
}

// ── 4. 포지션이 없으면 그 줄을 안 그린다 ────────────────────────────
//
// 「미지정」으로 채우면 줄이 정보가 아니라 빈칸 목록이 된다 — 팀 소개 줄에서 이미
// 안 하기로 한 것이고, 여기는 칸마다 반복되니 더 그렇다.
{
  assert.ok(/\{!!pos && \(/.test(tab), '포지션이 없어도 줄을 그린다');
  /* 「미지정」이라는 **이름**은 왜 안 쓰는지 적은 주석에 남아 있어야 한다.
     그래서 이름이 아니라 **채우는 꼴**을 본다 — 폴백 연산자가 붙는 자리다
     (anchor.ts 세 번째 구분: 「이름이 없는가」와 「쓰이지 않는가」는 다르다) */
  const cellBlock = tab.slice(tab.indexOf('const pos = toPosition(m.position);'), tab.indexOf('memberInviteCircle'));
  assert.ok(cellBlock.length > 0, '멤버 칸을 못 찾았다');
  assert.ok(!/\?\?\s*'[^']*지정|:\s*'[^']*지정/.test(cellBlock), '빈 포지션을 글자로 채운다');
  // positionLabel은 null에 「포지션 선택」을 준다 — 명단 칸에서는 그게 할 일 목록이 된다
  assert.ok(!/positionLabel\(/.test(cellBlock), '멤버 칸이 positionLabel을 쓴다 — 비면 「포지션 선택」이 찍힌다');
}

// ── 5. 줄 끝이 초대다 ───────────────────────────────────────────────
{
  assert.ok(/memberInviteCircle/.test(tab), '멤버 줄 끝에 초대 칸이 없다');
  const strip = tab.slice(tab.indexOf('styles.memberStrip'), tab.indexOf('</ScrollView>'));
  assert.ok(strip.indexOf('orderedMembers') < strip.indexOf('memberInviteCircle'),
    '초대 칸이 멤버보다 앞에 있다 — 명단의 마지막 칸이 「한 명 더」다');
}

console.log('memberstrip ok');
