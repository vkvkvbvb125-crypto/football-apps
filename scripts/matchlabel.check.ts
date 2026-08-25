// scripts/matchlabel.check.ts — 경기 한 줄 요약이 두 화면에서 같은가
//
// RosterSheet의 matchLabel을 만드는 곳이 둘이다 — 홈 경기 카드와 일정 화면.
// 각자 만들면 같은 경기가 화면마다 다르게 적히고, 사용자는 두 화면이 같은 경기를
// 말하는 건지 알 수 없다. 「내 기록」과 멤버 행이 같은 값을 다르게 적던 것과 같은 구조다.
//
// 화면으로는 잘 안 갈린다 — 한 화면씩 보면 둘 다 그럴듯하다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchDateTimeLabel, matchLabel } from '../src/features/attendance/utils/matchLabel';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const home = read('src/features/home/screens/HomeScreen.tsx');
const attendance = read('src/features/attendance/screens/AttendanceScreen.tsx');
const sheet = read('src/features/attendance/components/RosterSheet.tsx');

// ── 1. 문구는 순수 함수가 만든다 ────────────────────────────────────
{
  const d = new Date(2026, 7, 26, 20, 0); // 2026-08-26 20:00 (수)
  assert.equal(matchDateTimeLabel(d), '8월 26일 (수) 20:00');
  assert.equal(matchLabel(d, '강남 풋살장'), '8월 26일 (수) 20:00 · 강남 풋살장');

  // 장소가 없으면 「· 」로 끝나지 않는다 — 뭔가 잘린 것처럼 보인다
  assert.equal(matchLabel(d, null), '8월 26일 (수) 20:00');
  assert.equal(matchLabel(d, undefined), '8월 26일 (수) 20:00');
  assert.equal(matchLabel(d, ''), '8월 26일 (수) 20:00');

  // 오전/오후로 갈리면 안 된다. 기기 설정에 따라 사람마다 다르게 보인다
  assert.equal(matchDateTimeLabel(new Date(2026, 7, 26, 9, 5)), '8월 26일 (수) 09:05');
  assert.ok(!/오전|오후/.test(matchDateTimeLabel(new Date(2026, 7, 26, 20, 0))), '12시간제로 적는다');

  // 문자열 ISO도 받는다 — 부르는 쪽이 match_date를 그대로 넘긴다
  assert.equal(matchLabel(d.toISOString(), '강남'), matchLabel(d, '강남'));
}

// ── 2. 두 화면이 그 함수를 쓴다 ─────────────────────────────────────
// 「파일에 matchLabel이 있는가」로는 import만 있어도 통과한다. 넘기는 그 자리를 본다.
{
  assert.ok(/matchLabel=\{matchLabel\(next\.match_date, next\.location\)\}/.test(home),
    '홈 경기 카드가 공용 함수로 라벨을 만들지 않는다');
  assert.ok(/matchLabel\(rosterMatch\.match_date, rosterMatch\.location\)/.test(attendance),
    '일정 화면이 공용 함수로 라벨을 만들지 않는다');

  // 직접 조립한 흔적이 남아 있으면 한쪽만 바뀔 수 있다.
  // (부정 단언 — 주입해서 실패하는 것을 확인했다: toLocaleDateString('ko-KR', { month: 'long'을
  //  각 파일에 넣으면 잡힌다)
  for (const [src, who] of [[home, '홈'], [attendance, '일정']] as const) {
    assert.ok(!/toLocaleDateString\('ko-KR', \{ month: 'long', day: 'numeric', weekday: 'short'/.test(src),
      `${who} 화면이 경기 라벨을 직접 조립한다 — 포맷이 갈린다`);
  }
}

// ── 3. 시트가 그 라벨을 실제로 그린다 ───────────────────────────────
// 받기만 하고 안 그리면 모달이 뒤 카드를 가린 채 「어느 경기인지」가 사라진다.
{
  assert.ok(/<Text style=\{styles\.subtitle\}>\{matchLabel\}<\/Text>/.test(sheet),
    '시트가 경기 요약을 그리지 않는다 — 모달이 뒤 카드를 가려서 어느 경기인지 알 수 없다');
}

console.log('matchlabel ok');
