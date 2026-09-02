// scripts/rostervote.check.ts — 명단 시트의 「내 응답 변경」
//
// 시트는 두 화면이 렌더한다(AttendanceScreen, HomeScreen). 그래서 한 화면만 보고
// 고치면 다른 쪽이 조용히 빠진다 — 홈은 스토어 error를 아예 구독하지 않아서,
// 시트가 자기 문구를 안 그리면 홈에서는 실패가 어디에도 안 뜬다.
//
// 마감 판정(스토어 ↔ 카드 ↔ 시트)은 여기가 아니라 voteguard.check.ts가 한자리에서 본다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다.
// (leaveteam.check가 이것 때문에 항상 실패하면서 변이 3건을 전부 「잡음」으로 냈다)
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const sheet = read('src/features/attendance/components/RosterSheet.tsx');
const screen = read('src/features/attendance/screens/AttendanceScreen.tsx');
const home = read('src/features/home/screens/HomeScreen.tsx');

// CRLF 정규화가 실제로 되는지는 6번의 여러 줄 정규식이 대신 증명한다 — CR이 남아 있으면
// 그 단언이 개행을 못 찾고 실패한다. 여기서 read 결과에 CR이 없는지 따로 확인하지 않는 이유는
// read()가 이미 CR을 지우고 넘겨서 그 단언이 절대 실패할 수 없기 때문이다 — 죽은 단언이다.

// ── 1. 라벨 네 갈래 — pending과 undecided를 가른다 ──────────────────
//
// 「아직 안 찍었어요」와 「미정으로 찍었어요」는 나에게 다른 사실이다. 시트 탭은 둘을
// 「미투표」로 묶지만(총무가 독촉할 대상이 같다), 내 상태를 말하는 자리는 다르다.
{
  const block = sheet.slice(sheet.indexOf('const MY_VOTE_LABEL'));
  const map = block.slice(0, block.indexOf('};'));
  const labels: Record<string, string> = {};
  for (const m of map.matchAll(/(pending|attend|absent|undecided): '([^']+)'/g)) labels[m[1]] = m[2];

  assert.equal(Object.keys(labels).length, 4, `라벨이 네 갈래가 아니다: ${Object.keys(labels)}`);
  assert.notEqual(
    labels.pending,
    labels.undecided,
    `아직 안 찍은 것과 미정으로 찍은 것이 같은 문구다: ${labels.pending}`
  );
  assert.equal(new Set(Object.values(labels)).size, 4, '네 갈래 중 겹치는 문구가 있다');

  // 지금 상태를 라벨에 담는다 — 「변경하기」만 있으면 뭐로 찍었는지 열어봐야 안다
  for (const k of ['attend', 'absent', 'undecided'] as const) {
    assert.ok(labels[k].includes('내 응답'), `${k} 라벨이 현재 상태를 말하지 않는다: ${labels[k]}`);
  }
  assert.ok(!labels.pending.includes('내 응답'), '안 찍었는데 「내 응답」이라고 적는다');
}

// ── 2. 고르는 것과 저장하는 것이 나뉘어 있다 ────────────────────────
//
// 알약이 명단 바로 아래라 스크롤하다 스치기 쉽고, 투표는 남에게 보이는 값이다.
{
  // 알약은 고르기만 한다. onPress에서 바로 저장하면 「확인」이 장식이 된다
  const pill = sheet.match(/onPress=\{\(\) => setChoice\(k\)\}/);
  assert.ok(pill, '알약이 setChoice로 고르지 않는다 — 눌리는 즉시 저장될 수 있다');

  const choiceBlock = sheet.slice(sheet.indexOf('{CHOICES.map((k)'), sheet.indexOf('</View>\n\n                  {!!voteError'));
  // (부정 단언 — choiceBlock 안에 submit() 호출을 넣어 실패하는 것을 확인했다)
  assert.ok(!/submit\(\)/.test(choiceBlock), '알약을 누르면 바로 저장한다 — 「확인」 없이 저장된다');
  assert.ok(!/onVote\(/.test(choiceBlock), '알약이 onVote를 직접 부른다 — 「확인」 없이 저장된다');

  // 저장은 확인 버튼 하나에서만 일어난다
  assert.ok(/onPress=\{submit\}/.test(sheet), '확인 버튼이 저장을 부르지 않는다');
  assert.equal(sheet.match(/await onVote\(/g)?.length, 1, 'onVote를 부르는 곳이 하나가 아니다');
  assert.ok(/disabled=\{!choice \|\| saving\}/.test(sheet), '아무것도 안 골랐는데 확인이 눌린다');
}

// ── 3. 낙관 반영을 시트가 또 하지 않는다 ────────────────────────────
//
// 반영과 롤백은 스토어 vote()가 한다. 시트가 자기 상태로도 반영하면 이중으로 그려지고,
// 시트가 닫힌 뒤에는 되돌릴 주체가 없어진다.
// (부정 단언 — sheet 전체를 보므로 파일 어디에든 주입하면 실패한다. 확인했다)
{
  assert.ok(!/putMyVote|makeOptimisticVote|rollbackTarget/.test(sheet), '시트가 낙관 반영을 자기도 한다 — 이중 반영이다');
  assert.ok(!/setMembers|members\.map\(\(m\) => \(m\.isMe/.test(sheet), '시트가 넘겨받은 명단을 자기가 고친다');
  // 내 상태는 넘겨받은 members에서 읽는다 — 스토어가 갱신하면 자동으로 따라온다
  assert.ok(
    /const myStatus: VoteStatus = members\.find\(\(m\) => m\.isMe\)\?\.status \?\? 'pending';/.test(sheet),
    '시트가 내 응답을 members에서 읽지 않는다 — 스토어 갱신이 안 비친다'
  );
}

// ── 4. 실패 문구를 시트가 자기 자리에 그린다 ────────────────────────
//
// 스토어 error를 구독하면 loadMatches()가 error를 null로 밀어 지워진다. 그리고 홈은
// 스토어 error를 아예 안 읽는다 — 시트가 안 그리면 홈에서는 실패가 안 보인다.
{
  assert.ok(/const \[voteError, setVoteError\] = useState<string \| null>\(null\)/.test(sheet),
    '실패 문구를 시트가 자기 상태로 안 든다');
  assert.ok(/setVoteError\(e instanceof Error \? e\.message : /.test(sheet),
    '스토어가 던진 문구를 안 쓴다 — 여기서 새로 지으면 카드 경로와 갈린다');
  assert.ok(/\{!!voteError && <Text style=\{styles\.voteError\}>\{voteError\}<\/Text>\}/.test(sheet),
    '시트가 실패 문구를 그리지 않는다 — 홈에서는 어디에도 안 뜬다');

  // 두 화면 다 onVote를 넘긴다. 한쪽만 넘기면 그쪽에서만 바꿀 수 있다
  assert.ok(/onVote=\{rosterMatch \? \(status\) => vote\(rosterMatch\.id, status\) : undefined\}/.test(screen),
    '일정 화면이 시트에 onVote를 안 넘긴다');
  assert.ok(/onVote=\{\(status\) => vote\(next\.id, status\)\}/.test(home), '홈이 시트에 onVote를 안 넘긴다');
}

// ── 5. 완료 — 체크 뒤 스스로 닫힌다 ─────────────────────────────────
{
  assert.ok(/const DONE_CLOSE_MS = 400;/.test(sheet), '자동 닫힘 시간이 400ms가 아니다');
  assert.ok(/setTimeout\(onClose, DONE_CLOSE_MS\)/.test(sheet), '저장 후 스스로 닫히지 않는다');
  assert.ok(/return \(\) => clearTimeout\(t\)/.test(sheet), '타이머를 정리하지 않는다 — 닫힌 뒤에 onClose가 또 불린다');

  // 확인 버튼을 하나 더 두지 않는다. 방금 「확인」을 눌렀는데 또 누르라면 저장이 안 된 것처럼 읽힌다
  const doneBlock = sheet.slice(sheet.indexOf('{done ? ('), sheet.indexOf(') : picking ? ('));
  // (부정 단언 — doneBlock 안에 Pressable을 넣어 실패하는 것을 확인했다)
  assert.ok(!/<Pressable/.test(doneBlock), '완료 화면에 버튼이 있다 — 자동으로 닫히는데 누르라고 한다');
}

// ── 6. 「동작 줄이기」 — 커지는 것만 건너뛴다 ────────────────────────
//
// 시간까지 없애면 눌렀는데 아무것도 안 보이고 닫힌다. 체크는 띄우고 애니메이션만 뺀다.
{
  assert.ok(/const reduceMotion = useReduceMotion\(\);/.test(sheet),
    '시트가 「동작 줄이기」를 안 본다 — 배너와 다른 규칙이 된다');
  assert.ok(
    /if \(reduceMotion\) checkScale\.setValue\(1\);\n\s*else Animated\.timing\(checkScale/.test(sheet),
    '「동작 줄이기」를 켜도 체크가 애니메이션으로 커진다'
  );
  // 켰을 때도 닫히기 전에 체크가 보여야 한다 — setValue(1)이 그 자리다
  assert.ok(!/if \(reduceMotion\) \{?\s*onClose\(\)/.test(sheet),
    '「동작 줄이기」면 체크 없이 바로 닫는다 — 눌렀는데 아무것도 안 보인다');
}

// ── 7. 독촉 — 버튼이 있으면 핸들러도 있다 ───────────────────────────
//
// 2026-09-02에 재서 안 것. 독촉 버튼은 있는데 **두 화면 다 핸들러를 안 넘기고
// 있었다.** 시트는 `onPoke?.(m.id)`로 불렀고 optional 호출은 조용히 넘어간다 —
// 버튼은 눌리고 「전송됨」으로 바뀌었다. 총무는 보냈다고 믿는데 한 번도 안 갔다.
//
// 「실패와 성공의 출력이 같다」의 새 모양이다. 여기서는 **없는 기능**이 성공처럼 보였다.
// 그래서 셋을 한자리에서 본다 — 하나만 봐도 나머지가 다시 끊길 수 있다.
{
  // ⑴ optional 호출로 되돌아가지 않는다. 이것이 조용함의 원인이었다
  //
  // ⚠ **주석을 걷어내고 본다.** 안 걷으면 이 단언은 항상 실패한다 —
  //   시트의 프롭 주석이 옛 코드 `onPoke?.(m.id)`를 근거로 인용하고 있다.
  //   anchor.ts의 「쓰이지 않는가」 항목에 적힌 바로 그 함정이고, 여기서 또 났다.
  //   근거를 적으면 그 이름이 주석에 남는다. 「이름이 없는가」와 「쓰이지 않는가」는 다르다.
  const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/onPoke\?\.\(/.test(code) && !/onPokeAll\?\.\(/.test(code),
    '독촉을 optional 호출(?.())로 부른다 — 핸들러가 없으면 조용히 넘어간다');

  // ⑵ 핸들러가 없으면 버튼을 안 그린다. onVote가 이미 쓰는 방식이다
  assert.ok(/const showPoke = [^;]*!!onPoke\b/.test(sheet),
    '개별 독촉 버튼이 onPoke에 안 물려 있다 — 안 넘겨도 버튼이 그려진다');
  assert.ok(/counts\.pending > 0 && !!onPokeAll/.test(sheet),
    '전체 독촉 버튼이 onPokeAll에 안 물려 있다');

  // ⑶ 보낸 뒤에 표시를 바꾼다. 먼저 바꾸면 실패해도 「전송됨」이 남는다
  for (const [fn, flag] of [['handlePoke', 'setPoked'], ['handlePokeAll', 'setPokedAll']] as const) {
    const at = sheet.indexOf(`const ${fn} =`);
    assert.ok(at > 0, `${fn}이 없다`);
    let d = 0, end = at;
    for (let i = sheet.indexOf('{', at); i < sheet.length; i += 1) {
      if (sheet[i] === '{') d += 1;
      else if (sheet[i] === '}') { d -= 1; if (d === 0) { end = i; break; } }
    }
    const body = sheet.slice(at, end + 1);
    assert.ok(body.indexOf('await') < body.indexOf(flag),
      `${fn}이 보내기 전에 ${flag}을 부른다 — 실패해도 「전송됨」이 남는다`);
    assert.ok(/catch \(e\)/.test(body) && /setPokeError/.test(body),
      `${fn}이 실패를 안 알린다`);
  }

  // ⑷ **두 화면 다 넘긴다.** 한쪽만 이으면 같은 시트가 화면마다 다르게 동작한다
  for (const [name, src] of [['AttendanceScreen', screen], ['HomeScreen', home]] as const) {
    assert.ok(/onPoke=\{/.test(src), `${name}이 onPoke를 안 넘긴다 — 개별 독촉이 안 그려진다`);
    assert.ok(/onPokeAll=\{/.test(src), `${name}이 onPokeAll을 안 넘긴다`);
  }
}

console.log('rostervote ok');
