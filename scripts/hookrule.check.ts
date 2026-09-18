/*
  훅을 **컴포넌트나 커스텀 훅 밖에서** 부르지 않는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  2026-09-18에 참석 명단이 **Render Error**로 죽었다:

      Rendered more hooks than during the previous render.

  원인은 `MatchWeatherBlock.tsx`의 `weatherAccent(level)`이었다. **컴포넌트가 아니라
  JSX 안에서 값으로 불리는 일반 함수**인데 안에서 `useThemed(makeStyles)`를 불렀다.
  `useThemed`는 훅 셋을 무조건 부르므로, 그 함수의 호출 여부가 곧 훅 수 차이가 됐다:

      const { colors, styles } = useThemed(makeStyles);   훅 3개
      if (!weather?.available) return (…);                 ← 여기서 끝나면 3개
      <Text style={{ color: 그 함수(...) }}>               ← 여기까지 오면 6개

  **`available`이 false → true로 바뀌는 렌더에서만** 터진다. 날씨는 비동기로 붙으므로
  그 전환이 실제로 일어난다. 그래서 **어떤 화면에서는 멀쩡하고 어떤 화면에서만** 죽는다 —
  코드를 읽어서는 잘 안 보이고, 그 경기를 열어야 보인다.

  ⚠ 정규식으로는 못 잡는다. 처음에 함수 경계를 「다음 선언까지」로 잡았더니
    **바깥 컴포넌트의 훅을 안쪽 함수 것으로 세어** 여덟 곳을 거짓으로 지목했다.
    그래서 TypeScript 파서로 AST를 훑는다 — 호출이 **어느 함수 안에 있는가**를
    정확히 알아야 하는 검사다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  `use*` 호출을 감싸는 가장 가까운 함수의 이름이
    · 대문자로 시작하면 (컴포넌트)      → 괜찮다
    · `use`로 시작하면 (커스텀 훅)      → 괜찮다
    · 이름이 없으면 (익명 콜백)         → 괜찮다. useEffect(() => …) 안이 대부분이고,
                                          그건 훅 호출이 아니라 그 안의 코드다
    · 그 외 소문자 이름이면             → **FAIL**

  ⚠ 못 보는 것: 조건부 훅 자체(`if (x) useEffect(...)`)는 안 본다. 그건 eslint의
    react-hooks/rules-of-hooks가 볼 자리고, 이 검사는 **그 규칙이 못 보는 모양**
    — 「함수를 거쳐 조건부가 되는 것」 — 을 본다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';

const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (!p.includes('__tests__')) walk(p, out);
    } else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
};

const files = walk('src');
assert.ok(files.length > 50, `src를 못 훑었다(${files.length}개) — 경로가 바뀌었나`);

type Owner = { name: string | null } | null;
const offenders: string[] = [];

for (const file of files) {
  const src = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const nameOf = (n: ts.Node): string | null => {
    if (ts.isFunctionDeclaration(n)) return n.name?.text ?? null;
    if (ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
      return null;
    }
    return null;
  };
  const isFn = (n: ts.Node) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);

  const visit = (node: ts.Node, owner: Owner) => {
    /*
      ⚠ **호출은 「자기를 감싸는」 함수 소속이다.** 노드가 함수면 그 아래 자식들의
        소유자가 바뀌지만, 이 노드 자체가 호출이라면 소유자는 아직 바깥이다.
        순서를 뒤집으면 `const x = () => useState()` 같은 꼴에서 소유자를 잘못 잡는다.
    */
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^use[A-Z]/.test(node.expression.text)
    ) {
      const n = owner?.name ?? null;
      if (n && !/^[A-Z]/.test(n) && !/^use[A-Z]/.test(n)) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart());
        offenders.push(
          `${file.split(sep).join('/')}:${line + 1}  ${n}() 안에서 ${node.expression.text}()`
        );
      }
    }
    const next: Owner = isFn(node) ? { name: nameOf(node) } : owner;
    ts.forEachChild(node, (c) => visit(c, next));
  };
  ts.forEachChild(src, (c) => visit(c, null));
}

assert.deepEqual(
  [...new Set(offenders)],
  [],
  `컴포넌트도 커스텀 훅도 아닌 함수가 훅을 부른다 — 그 함수를 조건부로 부르면 ` +
    `렌더마다 훅 수가 달라져 「Rendered more hooks than during the previous render」로 죽는다. ` +
    `팔레트·값을 인자로 받는 순수 함수로 바꿔라:\n  ${[...new Set(offenders)].join('\n  ')}`
);

console.log(`hookrule ✓ ${files.length}개 파일: 훅이 컴포넌트·커스텀 훅 안에서만 불린다`);
