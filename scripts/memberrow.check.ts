// scripts/memberrow.check.ts — 멤버 목록 행의 불변식
//
// 화면으로는 잘 안 갈린다. 셰브론 조건이 틀려도 총무 계정에서는 똑같이 보이고,
// 포지션이 전원 비어 있는 팀에서는 「미지정」을 지웠는지 안 지웠는지가 안 드러난다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatRecentAttendance } from '../src/features/attendance/utils/attendanceRate';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tab = read('src/features/team/components/TeamMembersTab.tsx');
const modal = read('src/features/team/components/MemberListModal.tsx');

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

console.log('memberrow ok');
