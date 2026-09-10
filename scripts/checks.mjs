// scripts/checks.mjs — 검사 전부를 돌린다
//
// ── 커밋 규칙 ────────────────────────────────────────────────────────
//
//   FAIL이 하나라도 있으면 커밋하지 않는다.
//   고쳐서 통과시킨 뒤에 커밋하거나, 왜 실패해도 되는지 보고하고 멈춘다.
//
// 이 규칙이 필요해진 이유가 있다. 히어로에 「팀 설정 ›」을 넣은 커밋을 uidetail이
// FAIL인 채로 올렸다. 실패는 커밋 직전 출력에 찍혀 있었고, 보고는 했지만 커밋을
// 멈추지는 않았다. 그건 앞의 것들을 무의미하게 만든다 — CRLF 때문에 항상 실패하던
// 검사, 절대 실패할 수 없던 죽은 단언, 성공을 말하던 조용한 return, 전부 「검사가
// 실제로 무언가를 보고 있는가」를 지키려던 일이었다. 그 검사가 FAIL을 찍었는데
// 커밋이 나가면 남는 것은 「검사가 있다」는 사실뿐이고, 그건 오히려 안심 신호가 된다.
//
// ── 왜 목록을 손으로 들고 다니지 않는가 ─────────────────────────────
//
// 그전에는 돌릴 검사 이름을 손으로 나열했다. 그러다 19개만 돌리고 있었다 —
// board·mentions·score·sendapp·settingswipe·settleaccount·teamprofile·timerring
// 여덟 개가 목록에서 빠져 있었고, 빠졌다는 사실 자체를 아무도 몰랐다.
// 디렉터리를 읽어서 전부 돈다. 새 검사를 만들면 그날부터 자동으로 포함된다.
//
//   목록을 손으로 들고 다니지 않는다.
//
// 「빠른 확인용으로 몇 개만」이 바로 그 여덟 개를 만든 경로다. 관련 있어 보이는 것만
// 골라 돌리기 시작하면, 고르는 사람이 관련 없다고 판단한 검사가 목록에서 빠지고
// 빠졌다는 사실이 아무 데도 안 남는다. 느리면 느린 대로 전부 돌린다.
//
// ── 목록을 자동으로 만드는 것과, 그 목록이 전부를 덮는 것은 다르다 ──
//
// 위 절의 교훈으로 디렉터리를 읽게 만들었다. 그건 맞았다 — 새 검사를 만들면 그날부터
// 자동으로 포함된다. 그런데 **읽는 디렉터리가 scripts/ 하나였고, 거기 있는 것은
// scripts/*.check.ts뿐이었다.**
//
//   src/**/__tests__/*.test.ts   시험 파일 5개 · 48항목  ← 묶음 밖에 있었다
//   tsc --noEmit                 타입                    ← 묶음 밖에 있었다
//
// 2026-09-10에 드러났다. 알림 라우팅을 2단계로 바꾸고 `npm run check`가 **55개 전부
// 통과**를 찍었는데, `npx vitest run`을 따로 돌리니 1단계 전제를 못 박아 둔 시험이
// 실패했다. 「검사에 FAIL이 하나라도 있으면 커밋하지 않는다」가 저 48개는 안 지키고
// 있었던 것이다. 같은 날 deadcode 쪽에서 tsc를 안 돌린 채 통과로 읽은 일도 있었다.
//
//   자동 목록은 **그 디렉터리 안에서만** 전부다.
//   묶음이 무엇을 덮는지는 따로 물어야 한다 — 「빠진 게 있나」가 아니라
//   「이 앱이 깨졌는지 알려주는 것 중 여기 안 도는 게 뭔가」로 묻는다.
//
// 그래서 아래 TOOLS를 **손으로** 적었다. 이건 「검사 하나」가 아니라 「도구 하나」라
// 디렉터리에서 발견될 수 있는 것이 아니다. 손으로 적은 목록은 빠지기 마련이므로,
// 무엇을 왜 넣었는지를 여기 남긴다. 새 도구가 생기면 여기에 적어라.

// ── 변이를 주입했으면 들어갔는지 확인할 것 ──────────────────────────
//
// 「변이가 안 잡힌다」와 「변이가 안 들어갔다」는 다른 일인데 출력이 같다. 앵커를 못 찾아
// 주입이 실패하면 소스가 그대로이므로 검사가 통과하고, 그걸 「샘 ✗」으로 읽게 된다.
//
// 실제로 겪었다. tone="danger"를 tone="green"으로 바꾸는 변이를 넣었는데 그 문자열이
// 코드와 주석 둘에 있어 치환이 거부됐고, 검사는 멀쩡한 소스를 보고 통과했다.
// 「미납이 초록으로 강조돼도 안 잡힌다」로 보고할 뻔했다.
//
// CRLF로 검사가 항상 실패하던 것과 같은 계열이고 방향만 반대다. 그때는 무엇을 넣어도
// 「잡음」이 나왔고, 이번엔 무엇을 넣어도 「샘」이 나온다.
//
//   주입 → git diff로 그 파일이 실제로 바뀌었는지 확인 → 안 바뀌었으면 「주입 실패」
//
// 앵커가 코드와 주석 양쪽에 있는 경우가 흔하다. 주석에 근거를 적는 만큼 더 그렇다 —
// 줄 번호로 코드 줄만 집거나, 코드에만 있는 더 긴 앵커를 써라.
//
// ── 변이는 사본에서 하고, 원본은 사본으로 되돌린다 ──────────────────
//
// 되돌리기를 `git checkout -- <파일>`로 짰다가 방금 고친 것을 지울 뻔했다.
// 그 명령은 HEAD의 내용으로 덮어쓴다. 변이를 넣는 대상은 대개 **아직 커밋하지
// 않은 수정**이 들어 있는 파일이므로, 그건 변이만 지우는 명령이 아니라 고친 것을
// 통째로 지우는 명령이다.
//
// 실제로 파일이 망가졌다. 중첩 heredoc에서 이스케이프가 한 겹 먹혀 치환이 엉뚱하게
// 들어갔고, 그 상태로 checkout이 돌면서 뒤섞였다. 살아난 이유는 시작 전에 스크래치패드로
// 사본을 떠뒀기 때문이다.
//
//   변이 시험 전에 대상 파일의 사본을 뜬다.
//   각 변이 뒤 되돌리기는 그 사본을 다시 덮어쓰는 것으로 한다.
//   git은 「고치기 전」을 들고 있지 「고친 직후」를 들고 있지 않다.
//
// 그리고 변이 표는 별도 스크립트 파일에 두고 이름으로 부른다. 셸 함수 안에서
// heredoc으로 파이썬을 부르면 문자열이 셸을 두 번 지나가고, 그때마다 이스케이프가
// 한 겹씩 벗겨진다. 이 세션에서만 열 번을 넘었다 —
// **내용은 파일에 쓰고 셸에는 경로만 넘긴다.**
//
// ── 변이가 겨눈 자리가 맞는지도 확인할 것 ───────────────────────────
//
// 「치환됐다」와 「의도한 자리가 치환됐다」는 다르다. accountService.ts에는
// `if (error) throw error`가 둘 있는데(fetchDeletionStatus·deleteAccount)
// 첫 번째를 바꿔놓고 「검사가 deleteAccount를 안 지킨다」로 읽을 뻔했다.
// 같은 문자열이 여러 번 나오면 앵커를 함수 이름부터 잡는다.
//
// ── 파이프로 감싸지 말 것 ───────────────────────────────────────────
//
//   node scripts/checks.mjs | tail -2 && git commit ...
//
// 이렇게 쓰면 파이프라인의 exit code가 tail의 것이라 **FAIL이어도 0이 나오고 커밋이
// 나간다.** 러너를 아무리 잘 만들어도 무의미해진다. fb0009f가 나간 실제 경로가
// 이것이었을 수 있다 — 그때 출력에는 FAIL이 찍혀 있었다.
//
//   node scripts/checks.mjs > /tmp/chk.txt 2>&1; echo "exit=$?"
//
// 리다이렉트하고 $?를 눈으로 확인한 뒤에 커밋한다.
//
// ── 출력을 파일로 받으면 먼저 지울 것 ───────────────────────────────
//
// 위 리다이렉트에 함정이 하나 더 있다. **파일은 지난 실행의 결과를 들고 살아남는다.**
//
//   npx tsx scripts/one.check.ts && node scripts/checks.mjs > /tmp/chk.txt 2>&1
//   grep "전부 통과" /tmp/chk.txt      ← 앞이 실패해 checks가 안 돌아도 통과가 찍힌다
//
// 실제로 겪었다. 앞 명령이 컴파일 오류로 죽어 checks.mjs가 아예 안 돌았는데, 직전
// 실행이 남긴 파일에서 「32개 전부 통과」를 읽고 통과로 보고할 뻔했다.
//
// 파이프 금지와 짝이다. 그때는 **성공 코드**가 실패를 덮었고, 이번엔 **성공 출력**이
// 남아 있었다. 둘 다 「안 돈 실행」과 「통과한 실행」의 출력이 같아지는 경로다.
//
//   rm -f /tmp/chk.txt
//   node scripts/checks.mjs > /tmp/chk.txt 2>&1; RC=$?
//   echo "exit=$RC"        ← 파일이 아니라 이 값이 판정이다
//
// 지우고 실행하고, 판정은 $?로 한다. 파일 내용은 무엇이 실패했는지 읽을 때만 쓴다.
//
// 쓰는 법:  node scripts/checks.mjs        (또는 npm run check)
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const SCRIPTS = fileURLToPath(new URL('./', import.meta.url));
const ROOT = dirname(SCRIPTS);

const files = readdirSync(SCRIPTS)
  .filter((f) => f.endsWith('.check.ts'))
  .sort();

/*
  검사 파일 밖의 게이트. 위 머리말 참고 — 디렉터리로는 못 찾는 것들이라 손으로 적는다.

    tsc      타입이 깨졌는데 검사가 통과하는 일이 있었다. 검사들은 tsx로 도는데
             tsx는 타입을 안 본다 — 즉 이 묶음은 타입에 관해 아무 말도 안 했다.
    vitest   순수 함수 시험 48항목. 라우팅·정원·알림 대상처럼 「틀리면 조용히 엉뚱한
             결과를 내는」 것들이라 검사보다 여기가 본체인 자리도 있다.

  먼저 돈다. 타입이나 시험이 깨진 채로 검사 55개를 돌리면 엉뚱한 실패가 쏟아진다.
*/
const TOOLS = [
  { name: 'tsc', argv: ['tsc', '--noEmit'] },
  { name: 'vitest', argv: ['vitest', 'run'] },
];

const failed = [];

for (const { name, argv } of TOOLS) {
  process.stdout.write(name.padEnd(18));
  try {
    /*
      ⚠ execFileSync는 종료 코드가 0이 아니면 **던진다.** 그래서 catch가 곧 FAIL이다.
        파이프(`| tail`)로 감싸면 마지막 명령의 코드가 남아 실패가 가려진다 —
        이 저장소에서 이미 겪은 자리라 여기서는 파이프를 안 쓴다.
      ⚠ 변이로 확인했다: 시험 하나를 틀리게, 타입을 하나 깨뜨려 각각 FAIL이 났다.
    */
    execFileSync('npx', argv, { cwd: ROOT, stdio: 'pipe', shell: true });
    console.log('ok');
  } catch (e) {
    console.log('FAIL');
    failed.push({ name, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() });
  }
}
for (const f of files) {
  const name = f.replace('.check.ts', '');
  process.stdout.write(name.padEnd(18));
  try {
    execFileSync('npx', ['tsx', join(SCRIPTS, f)], { cwd: ROOT, stdio: 'pipe', shell: true });
    console.log('ok');
  } catch (e) {
    console.log('FAIL');
    failed.push({ name, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() });
  }
}

if (failed.length) {
  console.error(`\n${failed.length}개 실패 — 커밋하지 마라.\n`);
  for (const { name, out } of failed) {
    // 첫 단언 실패 줄만 보여준다. 스택은 그 검사를 직접 돌리면 나온다
    const line = out.split('\n').find((l) => /AssertionError|Error:/.test(l)) ?? out.split('\n')[0];
    console.error(`  ${name}: ${line.trim().slice(0, 160)}`);
  }
  console.error(`\n하나씩 보려면: npx tsx scripts/<이름>.check.ts\n도구는: npx tsc --noEmit  ·  npx vitest run`);
  process.exit(1);
}

console.log(`\n도구 ${TOOLS.length}개 + 검사 ${files.length}개, 전부 통과.`);
