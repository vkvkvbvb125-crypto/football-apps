/*
  두 팔레트가 같은 약속을 지키는가.

  이 검사가 생긴 이유. 라이트 팔레트를 만들 때 처음엔 **card 위에서** 대비를 쟀다.
  다크가 그렇게 재 놨기 때문이다. 그런데 라이트는 가장 어두운 면이 bgRoot라
  거기서 대비가 가장 낮다 — textDim 4.09 · textFaint 3.97로 AA 미달이었고,
  card 위에서만 보면 4.66 · 4.53으로 **통과처럼 보였다.**

  같은 이유로 greenBright도 틀렸다. 이름이 「밝은」이라 밝게 잡았는데,
  역할은 「더 튀는 것」(활성 탭 라벨)이라 흰 배경에서는 어두워야 한다.
  처음 값은 3.30 : 1로 안 읽혔다.

  둘 다 **화면을 열어봤으면 「좀 흐리네」로 넘어갔을** 크기다. 그래서 계산으로 센다.

  ⚠ 여기서 쓰는 값은 theme.ts에서 직접 읽는다. 검사가 자기 사본을 시험하면
    팔레트를 고쳐도 통과한다 — 이 저장소에서 세 번 걷어낸 구조다.
*/
import { readFileSync } from 'node:fs';
import { palettes, type ThemeName } from '../src/theme';

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

/* WCAG 상대 휘도 */
const chan = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
function lum(h: string) {
  const s = h.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/* rgba(...)는 배경이 있어야 계산되므로 이 검사에서는 뺀다 — 대상은 solid hex뿐 */
const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

const NAMES: ThemeName[] = ['dark', 'light'];

// ── ① 두 팔레트의 키가 같다 ──
{
  const [d, l] = NAMES.map((n) => Object.keys(palettes[n]).sort());
  ok(d.join(',') === l.join(','),
     '두 팔레트의 키가 다르다 — 한쪽에만 있는 색은 그 테마에서 undefined가 된다: ' +
     d.filter((k) => !l.includes(k)).concat(l.filter((k) => !d.includes(k))).join(', '));
}

// ── ② 글자가 가장 어두운 면 위에서 AA(4.5)를 넘는다 ──
/*
  ⚠ 「가장 어두운 면」이 테마마다 다르다. 다크는 bgRoot가 가장 어둡고 글자가 밝아서
    거기가 가장 **안전한** 자리인데, 라이트는 bgRoot가 가장 어둡고 글자도 어두워서
    거기가 가장 **위험한** 자리다. 그래서 「가장 낮은 대비가 나오는 면」을 찾아서 잰다.
*/
const TEXT = ['text', 'textStrong', 'textBody', 'textMuted', 'textDim', 'textFaint', 'navIdle'] as const;
const SURFACE = ['bgRoot', 'bgScreen', 'cardAlt', 'card', 'cardRaised'] as const;

/*
  cardRaised는 예외다. theme.ts가 이미 적어 뒀다:

    「⚠ 이 면 위에서는 textDim·textFaint를 쓰지 않는다. 사다리에서 가장 밝은 면이라
      두 단계가 AA(4.5)를 못 넘는다 — 각각 4.37, 4.19다. (…)
      여기서 가장 흐린 글자는 textMuted(5.25:1)까지다.」

  ⚠ 이건 **결함이 아니라 설계**다. 검사가 이걸 잡으면 고칠 것이 없는데 빨간불이
    켜지고, 그러면 언젠가 검사를 통째로 지우게 된다. 규칙을 검사에 담는다.
    대신 **규칙이 그 자리에 적혀 있는지**를 따로 센다 — 주석이 사라지면 다음 사람이
    cardRaised 위에 textFaint를 쓰고, 그때는 아무도 안 막는다.
  greenCore도 같다. 「CTA 그라디언트의 깊은 끝」이라 그 위에 검은 글자가 얹히지,
  그것이 밝은 면 위의 글자로 쓰이지 않는다.
*/
const EXCLUDED: Record<string, readonly string[]> = {
  cardRaised: ['textDim', 'textFaint', 'greenCore'],
};
for (const name of NAMES) {
  const p = palettes[name];
  for (const t of TEXT) {
    if (!isHex(p[t])) continue;
    let worst = Infinity, on = '';
    for (const s of SURFACE) {
      if (!isHex(p[s]) || EXCLUDED[s]?.includes(t)) continue;
      const r = ratio(p[t], p[s]);
      if (r < worst) { worst = r; on = s; }
    }
    ok(worst >= 4.5, `${name}: ${t}가 ${on} 위에서 ${worst.toFixed(2)} — AA(4.5) 미달`);
  }
  ok(ratio(p.placeholder, p.inputBg) >= 4.5,
     `${name}: placeholder가 inputBg 위에서 ${ratio(p.placeholder, p.inputBg).toFixed(2)} — AA 미달`);
}

// ── ③ 강조색도 면 위에서 읽힌다 ──
/*
  green·greenBright·danger·gold·blue는 **면 위의 글자·아이콘**으로 쓰인다.
  빠진 것 셋은 역할이 다르다:
    greenCore   CTA 그라디언트의 **깊은 끝**. 그 위에 글자가 얹히지, 이것이
                면 위의 글자로 쓰이지 않는다 — 아래 ③-2에서 그 방향으로 잰다.
    greenDeep   비활성 테두리
    greenTrack  트랙(막대 바닥). 글자가 안 얹힌다
  그 구분을 여기 적어 두는 이유는, 안 빼면 언젠가 「검사가 시끄럽다」고 통째로
  지우게 되기 때문이다.
*/
const ACCENT = ['green', 'greenBright', 'danger', 'gold', 'blue'] as const;
for (const name of NAMES) {
  const p = palettes[name];
  for (const a of ACCENT) {
    if (!isHex(p[a])) continue;
    let worst = Infinity, on = '';
    for (const s of SURFACE) {
      if (!isHex(p[s]) || EXCLUDED[s]?.includes(a)) continue;
      const r = ratio(p[a], p[s]);
      if (r < worst) { worst = r; on = s; }
    }
    ok(worst >= 4.5, `${name}: ${a}가 ${on} 위에서 ${worst.toFixed(2)} — AA 미달`);
  }
}

// ── ③-2 CTA 면 위의 글자 ──
/*
  green과 greenCore는 버튼의 그라디언트 양 끝이다. 그 위에 얹는 글자가 읽혀야 한다.
  다크는 검은 글자(bgRoot), 라이트는 흰 글자다 — 면이 밝냐 어둡냐로 갈린다.
*/
for (const name of NAMES) {
  const p = palettes[name];
  const on = name === 'dark' ? p.bgRoot : '#FFFFFF';
  for (const fill of ['green', 'greenCore'] as const) {
    const r = ratio(on, p[fill]);
    ok(r >= 4.5, `${name}: ${fill} 버튼 위의 글자가 ${r.toFixed(2)} — AA 미달`);
  }
}

// ── ④ 테두리는 낮은 대비다 ──
/*
  다크 주석: 「1.21:1은 낮은 대비가 아니라 아예 안 보이는 선이었다.
  반대로 1.8을 넘기면 선만 도드라져 화면이 와이어프레임처럼 읽힌다.」
  같은 창을 두 테마에 건다.
*/
for (const name of NAMES) {
  const p = palettes[name];
  for (const b of ['border', 'borderRaised', 'borderSoft', 'divider'] as const) {
    const r = ratio(p[b], p.card);
    ok(r >= 1.2 && r <= 2.0, `${name}: ${b}가 card 위에서 ${r.toFixed(2)} — 1.2~2.0을 벗어난다`);
  }
}

// ── ⑤ 브랜드 고정색은 두 테마가 같다 ──
for (const k of ['kakao', 'kakaoText'] as const) {
  ok(palettes.dark[k] === palettes.light[k],
     `${k}가 테마마다 다르다 — 브랜드 색은 고정이다. 바꾸면 사용자가 못 알아본다`);
}

// ── ⑥ 면 사다리 방향 ──
/*
  두 테마 다 「카드가 배경보다 밝다」. 라이트에서 이걸 뒤집으면(카드를 회색으로)
  카드가 배경에 파인 것처럼 보인다 — 그림자 방향과 싸운다.
*/
for (const name of NAMES) {
  const p = palettes[name];
  ok(lum(p.card) > lum(p.bgRoot), `${name}: card가 bgRoot보다 어둡다 — 사다리 방향이 뒤집혔다`);
}

// ── ⑦ 예외의 근거가 그 자리에 남아 있는가 ──
/*
  위 EXCLUDED는 「여기서는 이 글자를 안 쓴다」는 약속이다. 약속은 검사가 아니라
  **코드를 읽는 사람**이 지킨다 — 검사는 팔레트 값만 보지 누가 cardRaised 위에
  textFaint를 얹었는지는 모른다. 그 근거가 theme.ts에서 사라지면 다음 사람이
  모르고 쓴다.
*/
{
  const theme = readFileSync('src/theme.ts', 'utf8');
  ok(theme.includes('이 면 위에서는 textDim·textFaint를 쓰지 않는다'),
     'theme.ts에서 cardRaised의 사용 제한 주석이 사라졌다 — 검사의 예외만 남고 근거가 없어진다');
}

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(String.fromCharCode(10)));
  process.exit(1);
}
console.log('palette ok');
