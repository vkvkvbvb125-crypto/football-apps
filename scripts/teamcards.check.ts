// scripts/teamcards.check.ts — 팀 홈에 카드 여덟이 다 있는가, 순서대로 있는가
//
// 이 검사가 생긴 이유가 있다. 「내 정보」 행을 걷어내면서 **「이번 달 활동」 카드의 JSX가
// 같이 지워졌다.** 두 블록이 소스에서 붙어 있었고, 지우는 범위를 「내 정보 시작 ~ 다음
// 경기 시작」으로 잡았는데 그 사이에 활동 카드가 들어 있었다.
//
// 검사 묶음은 전부 통과했다. props도 스타일도 남아 있어서 타입 검사도 조용했다 —
// 없어진 것은 그리는 부분뿐이었다. **렌더를 보고서야 알았다.**
//
// 그래서 여기서 보는 것은 값도 모양도 아니고 **「있는가, 그 순서인가」**다.
// 카드 하나가 조용히 사라지는 것을 소스에서 잡는 마지막 그물이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const tab = read('src/features/team/components/TeamHomeTab.tsx');

/* 주석에 적힌 이름이 아니라 **그리는 자리**를 집는다. 카드마다 그 카드에만 있는
   JSX 조각을 앵커로 쓴다 — 근거 주석에는 카드 이름이 남아 있어야 한다 */
const ANCHORS: [string, string][] = [
  ['1 히어로', '<View style={styles.banner}>'],
  ['2 스탯', '<View style={styles.teamStats}>'],
  ['3 멤버', 'contentContainerStyle={styles.memberStrip}'],
  ['4 이번 달 활동', '<View style={styles.monthCols}>'],
  ['5 다음 경기', '<View style={styles.nextRow}>'],
  ['6 최근 게시글', '<View style={styles.postBody}>'],
  ['7 초대', '<View style={styles.inviteActions}>'],
  ['8 4버튼', '<View style={styles.tiles}>'],
];

{
  const at = ANCHORS.map(([name, needle]) => {
    const i = tab.indexOf(needle);
    assert.ok(i >= 0, `${name} 카드가 화면에서 사라졌다 — 앵커를 못 찾았다: ${needle}`);
    // 두 번 나오면 어느 것이 그 카드인지 알 수 없다
    assert.equal(tab.split(needle).length - 1, 1, `${name} 앵커가 둘 이상이다: ${needle}`);
    return { name, i };
  });

  for (let k = 1; k < at.length; k += 1) {
    assert.ok(
      at[k].i > at[k - 1].i,
      `카드 순서가 어긋났다: ${at[k - 1].name} 다음에 ${at[k].name}이 와야 한다`,
    );
  }
}

/*
  걷어내기로 한 둘이 안 돌아왔는가.

  「팀 기록」 카드와 「내 정보」 행이다. 되살아나면 화면이 다시 길어지고, 미납 금액이
  팀 화면에 돌아온다(그 판단은 myrecord.check이 따로 본다).
*/
{
  assert.ok(!/styles\.myRecord\b/.test(tab), '「팀 기록」 카드가 돌아왔다');
  assert.ok(!/styles\.myInfoRow\b/.test(tab), '「내 정보」 행이 돌아왔다');
}

console.log('teamcards ok');
