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
   97  묶음 4-a(스크림 14곳 + 탭 삼키개 5곳) 뒤. 이 커밋의 결과다.
       14는 role이 붙어 줄었고, 5는 **셀 대상이 아니라서** 빠졌다 — 성격이 다르다.
  ...  묶음 4-b(메뉴 항목 5 · 목록 행 11) · 4-c(나머지 버튼) 뒤에 다시 낮춘다
*/
const MAX_NO_ROLE = 97;
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
    /*
      ⚠ `<Text`만 보면 **JSX를 변수로 넘긴 자리가 거짓 양성이 된다.**
      HomeBanner가 카드를 `const card = (…)`로 만들어 `{card}`로 넣는다 —
      안에 Text가 잔뜩 있는데 여는 태그 안쪽 글자로는 안 보인다.
      규칙을 넓히자마자 그 하나가 걸렸다. 식 자식도 읽을 것으로 센다.
    */
    const hasText = /<Text[\s>]/.test(body) || /\{\s*[A-Za-z_$][\w$.]*\s*\}/.test(body);
    const hasIcon = /<Ionicons[\s>]/.test(body) || /<Image[\s>]/.test(body);

    /*
      ⚠ **세기 전에 「이것이 셀 대상인가」를 묻는다.**
      모달의 카드를 Pressable로 감싼 자리가 다섯 있다 — 스크림의 onPress가 안까지
      번지는 것을 막는 것뿐이고 `onPress={() => {}}`다. 누르는 것이 아니라
      role을 붙이면 그 자리가 거짓말을 시작한다(「눌러서 여는 무언가」로 읽히는데
      눌러도 아무 일도 안 난다). accessible={false}로 초점에서 빼고, 여기서도 뺀다.
      상한에 남겨 두면 「아직 안 붙인 것」과 「붙이면 안 되는 것」이 같은 숫자에 섞인다.
    */
    if (/accessible=\{false\}/.test(tag)) { i = src.indexOf('<Pressable', te); continue; }

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
      /*
        ⚠ 원래 `!hasText && hasIcon && !hasLabel`이었다 — **아이콘이 있을 때만** 봤다.
        변이로 스크림의 label을 떼었더니 통과했다. 스크림은 안이 비어 있어서
        hasIcon이 false라 조건에 아예 안 들어왔다. 읽을 것이 없는 것은 같은데
        아이콘이 있느냐로 갈린 것이다 — 「아이콘만」이 아니라 **「읽을 것이 없다」**가
        묻고 싶던 것이었다. 빈 Pressable이 오히려 더 나쁘다(초점은 잡히고 말은 없다).
      */
      if (!hasText && !hasLabel)
        badState.push(`${f.split('/').pop()}:${ln} 읽을 것이 없다 — 「버튼」으로만 읽힌다`);
      /*
        ⚠ **여기까지가 이 검사가 닿는 경계다.** 안이 빈 Pressable(자기닫는 스크림 6곳)은
        잡지만, 카드를 **감싸는** 스크림 8곳은 못 잡는다 — 자식의 Text가 hasText를
        참으로 만든다. 그 자리는 label을 떼도 조용히 통과한다(변이로 확인했다).
        감싸는 스크림은 label이 없으면 카드 내용을 다 읽고 「버튼」이라고 하는데,
        누르면 닫힌다 — 읽은 것과 하는 일이 무관하다. 기계로 가릴 방법을 못 찾았다.
        「감싼 것과 하는 일이 무관한가」는 사람이 봐야 한다. 못 잡는 것을 잡는다고
        적어 두면 그게 또 항상 참인 단언이 된다.
      */
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
