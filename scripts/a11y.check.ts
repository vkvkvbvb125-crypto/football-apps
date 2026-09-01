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
  116  묶음 3(고르는 것 19곳) 뒤. 이 커밋의 결과다.
       ProfileDetail 2 · BoardPanel 3 · TeamSettings 5 · TeamStart 2 · SignUp 2 ·
       PollCard 1 · PlaceSearch 1 · SettlementDetailSettings 2 · SettlementProgress 1
       ⚠ 붙이기 전에 트리로 쟀다 — RN은 selected를 스스로 넘기지 않는다.
         화면에서 초록으로 켜진 칩이 트리에는 sel=false로 나온다. ⑵의 disabled와 다르다.
  ...  묶음 4(나머지) 뒤에 다시 낮춘다
*/
const MAX_NO_ROLE = 116;
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
    */
    const ln = src.slice(0, i).split(NL).length;

    /*
      ⚠ 여기 원래 「disabled 프롭이 있는데 state.disabled가 없다」가 있었다. **항상 참이라 지웠다.**
      RN의 Pressable이 스스로 넘긴다 — Pressable.js:236

          _accessibilityState = disabled != null ? {..._accessibilityState, disabled} : ...

      프롭이 있으면 RN이 채우고, 심지어 손으로 적은 state.disabled를 **덮어쓴다**.
      기기에서도 확인했다 — ProfileDetailScreen의 「저장」은 disabled= 하나뿐이고
      role도 state도 없는데 트리에 enabled=false로 나온다. 통과가 아무 뜻이 없던 줄이다.

      그래서 반대로 잡는다: **state에 disabled가 있으면 안 된다.**
        · 프롭이 있으면  → 무의미하다 (RN이 덮는다)
        · 프롭이 없으면  → 거짓말이다. 「사용 안 함」으로 읽히는데 눌리면 동작한다.
      후자를 셋 잡았다 — 독촉 버튼들(RosterSheet 2 · SettlementScreen 1)이
      보낸 뒤 state.disabled=true였는데 핸들러가 막지 않아 다시 보내졌다.
      못 누르게 하는 건 찌르기 동작을 바꾸는 일이라 여기서 하지 않았다.
      「전송됨」이라는 글자가 이미 안에 있어서 스크린리더는 그걸 읽는다.

      role이 없는 것도 본다 — 거짓말은 role과 상관없이 state가 한다.
    */
    if (/accessibilityState=\{\{[^}]*disabled/.test(tag))
      badState.push(
        `${f.split('/').pop()}:${ln} state에 disabled가 있다 — 프롭이 있으면 무의미하고 없으면 거짓말이다`,
      );

    if (role) {
      const st = tag.match(/accessibilityState=\{\{([^}]*)\}\}/)?.[1] ?? '';
      if (['switch', 'checkbox'].includes(role) && !/checked/.test(st))
        badState.push(`${f.split('/').pop()}:${ln} role=${role}에 state.checked가 없다`);
      if (['radio', 'tab'].includes(role) && !/selected|checked/.test(st))
        badState.push(`${f.split('/').pop()}:${ln} role=${role}에 state.selected가 없다`);
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
