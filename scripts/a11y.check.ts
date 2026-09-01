/*
  누를 수 있는 것이 스크린리더에 「무엇인지」 알려지는가.

  Pressable은 접근성 트리에 그냥 ViewGroup으로 나온다 — 눌리는 것인지조차 안 알려준다.
  에뮬레이터에서 접근성 트리를 떠서 확인했다:

      Button     -> "설정"      role + label 붙은 것
      ViewGroup  -> ""          role 없는 것

  ⚠ **상한을 0으로 두지 않는다.** 167곳이 한 커밋에 들어가면 잘못 붙은 것을 아무도
    못 본다. 성격별로 묶어 커밋하고 그때마다 상한을 낮춘다.
    상한이 왜 그 숫자인지는 아래 이력에 적는다 — 나중에 「이 숫자가 왜 167이지」가 나온다.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const BS = String.fromCharCode(92), NL = String.fromCharCode(10);

/*
  ── 상한 이력 ──────────────────────────────────────────────────────
  208  최초 측정 (2026-09-02)
  167  묶음 0(기존 흠 4곳) + 묶음 1(주 동작 42곳) 뒤. 이 커밋의 결과다.
       묶음 1 = RosterSheet 10 · MatchDetailCard 3 · CreateMatchSheet 11 ·
                SettlementScreen 9 · SettlementCard 3 · SendMoneySheet 5
  135  묶음 2(아이콘만 32곳) 뒤. 이 커밋의 결과다.
       상한이 33이었는데 실측이 32였다 — 묶음 0에서 RegionPickerModal을 고친 만큼이다.
  ...  묶음 3(진입·설정 줄) 뒤에 다시 낮춘다
*/
const MAX_NO_ROLE = 135;
/*
  아이콘만 있고 label도 없는 것 — role만 붙이면 「버튼」으로만 읽혀 헛되다.
  ⚠ 묶음 2에서 다 없앴다. **이제 상한이 아니라 0이다** — 새로 하나 생기면 그날 잡는다.
*/
const MAX_ICON_NO_LABEL = 0;

const files: string[] = [];
(function w(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) w(p);
    else if (n.endsWith('.tsx')) files.push(p.split(BS).join('/'));
  }
})('src');

let noRole = 0, iconNoLabel = 0;
const badState: string[] = [];

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  let i = src.indexOf('<Pressable');
  while (i >= 0) {
    /* 여는 태그의 끝 — 중괄호 안의 >는 건너뛴다 */
    let d = 0, j = i, te = -1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '{') d++; else if (c === '}') d--;
      else if (c === '>' && d === 0) { te = j; break; }
    }
    if (te < 0) break;
    const tag = src.slice(i, te + 1);
    let body = '';
    if (!tag.trimEnd().endsWith('/>')) {
      let dep = 1, k = te + 1;
      while (k < src.length && dep > 0) {
        if (src.startsWith('<Pressable', k)) dep++;
        else if (src.startsWith('</Pressable>', k)) dep--;
        if (dep === 0) break;
        k++;
      }
      body = src.slice(te + 1, k);
    }
    const role = tag.match(/accessibilityRole="(\w+)"/)?.[1];
    const hasLabel = /accessibilityLabel[=\s]/.test(tag);
    const hasText = /<Text[\s>]/.test(body);
    const hasIcon = /<Ionicons[\s>]/.test(body) || /<Image[\s>]/.test(body);

    if (!role) noRole++;
    if (!hasText && hasIcon && !hasLabel) iconNoLabel++;

    /*
      붙어 있는 것이 거짓말하지 않는가. **이건 상한이 아니라 0이다** —
      잘못 붙은 role은 없는 것보다 나쁘고, 지금 0이므로 늘어나면 그날 잡는다.
      ⚠ disabled를 안 알리면 「눌리는 줄 알고 눌렀는데 아무 일도 안 나는」 자리가 된다.
        화면에서는 흐릿해서 보이지만 스크린리더에는 그 흐림이 없다.
    */
    if (role) {
      const st = tag.match(/accessibilityState=\{\{([^}]*)\}\}/)?.[1] ?? '';
      const ln = src.slice(0, i).split(NL).length;
      if (['switch', 'checkbox'].includes(role) && !/checked/.test(st))
        badState.push(`${f.split('/').pop()}:${ln} role=${role}에 state.checked가 없다`);
      if (['radio', 'tab'].includes(role) && !/selected|checked/.test(st))
        badState.push(`${f.split('/').pop()}:${ln} role=${role}에 state.selected가 없다`);
      if (/\bdisabled=/.test(tag) && !/disabled/.test(st))
        badState.push(`${f.split('/').pop()}:${ln} disabled인데 state.disabled가 없다`);
      if (!hasText && hasIcon && !hasLabel)
        badState.push(`${f.split('/').pop()}:${ln} 아이콘만인데 label이 없다 — 「버튼」으로만 읽힌다`);
    }
    i = src.indexOf('<Pressable', te);
  }
}

const fails: string[] = [];
if (noRole > MAX_NO_ROLE)
  fails.push(`role 없는 Pressable이 ${noRole}곳 — 상한 ${MAX_NO_ROLE}을 넘었다. 새로 만든 것에 role을 붙여라`);
if (iconNoLabel > MAX_ICON_NO_LABEL)
  fails.push(`아이콘만 있고 label 없는 것이 ${iconNoLabel}곳 — 상한 ${MAX_ICON_NO_LABEL}을 넘었다`);
for (const b of badState) fails.push(b);

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(NL));
  process.exit(1);
}
console.log(`a11y ok (role 없음 ${noRole}/${MAX_NO_ROLE} · 아이콘 label 없음 ${iconNoLabel}/${MAX_ICON_NO_LABEL})`);
