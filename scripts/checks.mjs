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

const failed = [];
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
  console.error(`\n하나씩 보려면: npx tsx scripts/<이름>.check.ts`);
  process.exit(1);
}

console.log(`\n${files.length}개 전부 통과.`);
