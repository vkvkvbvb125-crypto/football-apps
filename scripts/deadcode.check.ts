/*
  선언해 놓고 아무도 안 쓰는 것.

  ── 왜 생겼나 ──────────────────────────────────────────────────────
  2026-09-02 하루에 「있는데 부르는 자리가 없다」를 **넷** 찾았다. 셋은 손으로 찾았고
  넷째(HomeScreen의 handleShare)는 이 검사를 만들다가 걸렸다.

  넷을 git으로 갈라 보니 **두 부류**였고, 찾는 방법이 다르다:

    ⑴ 이었다가 끊어진 것 — 셋
       remindNotVoted   7feab7f가 「독촉 알림 보내기」 버튼과 함께 만들었고
                        6d7d639이 **버튼만 지웠다**
       송금 시트(홈)     6d7d639이 붙였고 9bd4f0b이 **여는 자리만 지웠다**
       handleShare      같은 계열. 정산 링크 공유가 홈에서 사라졌다
       ⚠ 셋 다 **「정리」 커밋이 부르는 자리를 지우면서 불리던 것을 남겼다.**
         지우는 사람은 화면을 보고 지운다 — 화면에서 사라진 것과 코드에서
         사라진 것이 같지 않다. **이 부류는 컴파일러가 찾는다.** 그게 이 검사다.

    ⑵ 만들어 두고 잇지 않은 것 — 하나
       onPoke/onPokeAll  737f6c5(외부 코드 반영)가 프롭으로 들여왔고
                         **한 번도 넘어간 적이 없다**
       ⚠ 이건 컴파일러가 못 찾는다. optional 프롭은 안 넘겨도 문법이 맞다.
         **그쪽은 「?.()로 부르는데 아무도 안 넘기는가」로 훑는다** —
         RosterSheet를 고치고 전수 조사해서 SendMoneySheet의 셋을 더 찾았다.
         구조로는 **필수 프롭**이 답이다(안 넘기면 tsc가 막는다).

  둘을 가르는 값은 「한 번이라도 이어진 적이 있는가」다. git log -S로 갈린다.

  ── 왜 tsconfig.json에 noUnusedLocals를 안 켜는가 ─────────────────
  켜면 63개가 걸리는데 그중 30개가 `colors`·`styles`다. 테마 전환 때
  useThemed(makeStyles)가 `colors`를 **같은 이름으로 돌려주도록** 만들어서
  컴포넌트 본문을 한 글자도 안 고치고 64개 파일을 옮겼다(그 자리는 의도다).
  전부 켜면 그 의도를 되돌리게 되므로, 여기서 그 둘만 걷어내고 나머지를 본다.
*/
import { execFileSync } from 'node:child_process';

const NL = String.fromCharCode(10);

/*
  ── 상한 이력 ──────────────────────────────────────────────────────
  33  최초 측정 (2026-09-02). 이 커밋의 결과다.
      ⚠ 이 숫자는 「고쳐야 할 것 33개」가 아니다. 안 쓰는 import가 대부분이고
        위험한 것은 **함수·상태**다(handleShare · paidCount · unpaidCount …).
        성격별로 걷어내면서 낮춘다.
  ... 죽은 함수부터 걷어낸 뒤에 다시 낮춘다
*/
const MAX_UNUSED = 33;

/*
  useThemed가 같은 이름으로 돌려주는 둘. 안 쓰는 자리가 있어도 그대로 둔다 —
  ⚠ 지우면 나중에 그 컴포넌트에 색을 하나 쓸 때 다시 넣어야 하고,
    그때 이름을 다르게 붙이면 파일마다 다른 규칙이 된다.
*/
const THEME_BINDINGS = /'(colors|styles)' is declared/;

/*
  ⚠ npx를 못 쓴다. 윈도에서 .cmd를 shell 없이 부르면 EINVAL이고(Node 20+의 보안 수정),
    shell:true로 부르면 인자가 이어붙는다는 경고가 뜬다. tsc를 node로 직접 부른다.
*/
const TSC = 'node_modules/typescript/bin/tsc';
let out = '';
let exit = 0;
try {
  out = execFileSync(process.execPath, [TSC, '--noEmit', '-p', 'tsconfig.deadcode.json'], {
    encoding: 'utf8',
  });
} catch (e) {
  const err = e as { stdout?: string; status?: number; code?: string; message?: string };
  out = String(err.stdout ?? '');
  exit = err.status ?? -1;
  /*
    ⚠ **여기가 이 검사에서 제일 조심할 자리다.**
    tsc가 아예 안 돌아도 걸린 것이 0곳이라 「깨끗하다」로 읽힌다 —
    「못 찾았다」와 「문제없다」가 같은 출력이 되는 그 모양이다.
    실제로 한 번 그렇게 통과했다(npx.cmd EINVAL, 출력 0바이트, 0/33 ok).
    돌지 않은 것은 **통과가 아니라 실패**로 끝낸다.
  */
  if (exit === -1)
    throw new Error(`tsc를 못 돌렸다 (${err.code ?? '?'}: ${err.message ?? ''}) — 통과가 아니라 실패다`);
}

const lines = out.split(NL).filter((l) => l.includes('error TS6133'));

/*
  ⚠ 카나리아. useThemed가 살아 있는 한 colors·styles가 반드시 여럿 걸린다.
    하나도 안 걸렸다면 tsc가 이 프로젝트를 안 본 것이다 — 설정이나 경로가 틀렸다.
    이 단언이 없으면 위의 exit 검사를 빠져나온 조용한 실패를 못 잡는다.
*/
const themeBound = lines.length - lines.filter((l) => !THEME_BINDINGS.test(l)).length;
if (themeBound === 0)
  throw new Error(
    `tsc가 돌긴 했는데 colors·styles가 하나도 안 걸렸다 (출력 ${out.length}바이트, exit ${exit}) — ` +
      'useThemed를 걷어낸 게 아니라면 tsc가 엉뚱한 것을 봤다'
  );

const real = lines.filter((l) => !THEME_BINDINGS.test(l));

if (real.length > MAX_UNUSED) {
  console.error(
    [
      `  x 안 쓰는 선언이 ${real.length}곳 — 상한 ${MAX_UNUSED}을 넘었다.`,
      '    「화면에서 지웠는데 코드가 남은」 자리일 수 있다. 부르는 자리가 사라진 것인지 보고 지워라.',
      ...real.slice(0, 12).map((l) => '    ' + l.trim()),
    ].join(NL)
  );
  process.exit(1);
}

console.log(`deadcode ok (안 쓰는 선언 ${real.length}/${MAX_UNUSED} · 테마 바인딩 ${lines.length - real.length}곳 제외)`);
