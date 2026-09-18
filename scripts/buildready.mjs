// scripts/buildready.mjs — `eas build`를 걸기 전에 **커밋된 상태**를 확인한다
//
// ── 왜 게이트가 아니라 여기인가 ─────────────────────────────────────
// `checks.mjs`는 **작업 트리**를 본다. 커밋은 `git add`에 내가 **명시한 목록**만 담는다.
// 둘이 다른 것을 보므로, 게이트가 통과해도 **커밋에 빠진 파일이 있을 수 있다.**
//
// 2026-09-19에 실제로 그랬다. `c142635`에서 네 파일이 빠졌고:
//
//     HEAD의 teamStore에 leaveTeamRequest import   1개
//     HEAD의 teamService에 leaveTeam 정의          0개   ← 없는 것을 import한다
//
// **게이트는 통과했다** — 작업 트리에는 둘 다 있었기 때문이다.
// ⚠ EAS는 작업 트리가 아니라 **커밋된 상태**를 올린다. 그대로 걸었으면 20분 뒤에
//   컴파일 오류로 죽었다.
//
// ⚠ **게이트에 넣을 수 없다.** 게이트는 커밋 전에 도는데, 「커밋에 다 담겼나」는
//   커밋이 끝나야 답이 나온다. 시점이 다른 질문이라 같은 자리에 못 둔다.
//   빌드는 하루에 몇 번 안 걸리고 실패 비용이 20분이다 — 여기가 맞는 자리다.
//
// ── 쓰는 법 — 빌드와 한 문장으로 묶는다 ─────────────────────────────
//
//     node scripts/buildready.mjs && npx eas build --platform android --profile production-apk …
//
// 인자로 커밋을 주면 ②를 그 커밋에 대고 잰다 — **변이 시험용**이다.
// 사고가 났던 커밋에 대고 실제로 FAIL이 나는지 확인할 수 있다:
//
//     node scripts/buildready.mjs c142635
//
// ⚠ `&&`로 묶는 이유는 AGENTS.md의 「게이트와 커밋은 한 문장으로 묶는다」와 같다 —
//   출력을 읽고 사람이 판단하는 자리로 두면, 읽고도 지나간다. 실제로 그랬다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* 기본은 HEAD. 인자를 주면 그 커밋을 잰다 (변이 시험용 — 머리말 참고) */
const REF = process.argv[2] || 'HEAD';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

let failed = false;
const fail = (what, detail) => {
  failed = true;
  console.log(`  ✗ ${what}`);
  if (detail) console.log(detail.replace(/^/gm, '      '));
};
const ok = (what) => console.log(`  ✓ ${what}`);

/* ── ① 커밋 안 된 것이 남아 있지 않은가 ──────────────────────────── */
{
  const status = run('git', ['status', '--short']).trimEnd();
  /*
    ⚠ 추적 안 되는 잡파일(`??`)은 EAS에 안 올라가므로 빌드를 깨뜨리지 않는다.
      하지만 **새로 만든 소스 파일**도 `??`로 보인다 — 그건 올라가지 않아서
      더 위험하다. 그래서 `src/`·`scripts/`·`web/` 아래의 `??`는 막고,
      루트의 임시 파일(gate.txt 같은 것)은 지나간다.
  */
  const lines = status ? status.split('\n') : [];
  const tracked = lines.filter((l) => !l.startsWith('??'));
  const newSource = lines.filter(
    (l) => l.startsWith('??') && /^\?\?\s+(src|scripts|web|supabase|assets)\//.test(l)
  );
  const blocking = [...tracked, ...newSource];

  if (blocking.length) {
    fail(
      `커밋 안 된 변경이 ${blocking.length}건 있다 — EAS는 **커밋된 상태**를 올린다`,
      blocking.join('\n')
    );
  } else {
    ok('커밋 안 된 소스 변경 없음');
  }
}

/* ── ② 커밋된 상태만으로 타입이 서는가 ───────────────────────────── */
{
  /*
    ⚠ **작업 트리가 아니라 HEAD를 푼다.** 이것이 ①을 통과해도 남는 질문을 막는다 —
      예를 들어 커밋 순서가 엇갈려 앞 커밋이 뒤 커밋의 export를 참조하는 경우.
      2026-09-19의 사고가 정확히 그 모양이었다.
  */
  const dir = mkdtempSync(join(tmpdir(), 'kickday-head-'));
  try {
    const tar = run('git', ['archive', REF], { encoding: 'buffer', maxBuffer: 1 << 28 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });

    /* node_modules는 무겁다 — 링크로 빌린다. 윈도에서 실패하면 복사로 떨어진다 */
    const nm = join(dir, 'node_modules');
    try {
      symlinkSync(join(process.cwd(), 'node_modules'), nm, 'junction');
    } catch {
      cpSync(join(process.cwd(), 'node_modules'), nm, { recursive: true });
    }
    if (!existsSync(join(dir, 'tsconfig.json'))) {
      fail(`${REF}에 tsconfig.json이 없다 — 커밋 상태가 온전하지 않다`);
    } else {
      try {
        run('npx', ['tsc', '--noEmit'], { cwd: dir, shell: true });
        ok(`${REF}만으로 tsc 통과`);
      } catch (e) {
        fail(`${REF}만으로는 타입이 안 선다 — 커밋에서 빠진 파일이 있다`, String(e.stdout || e.message).slice(0, 1200));
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
if (failed) {
  console.log('빌드 준비 FAIL — 걸지 마라. 위를 고치고 다시 확인해라.');
  process.exit(1);
}
console.log('빌드 준비 ok — 커밋된 상태만으로 선다.');
