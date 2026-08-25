// scripts/jsxcomment.check.ts — JSX 자식 자리의 주석이 중괄호에 싸여 있는가
//
// JSX 안에서 {/* */} 대신 /* */ 를 쓰면 주석이 아니라 **자식 텍스트**가 된다.
// tsc도 통과하고 다른 검사도 통과하고, 화면에 주석 본문이 그대로 그려진다.
// 스크린샷을 봐야만 발견된다 — 실제로 그렇게 한 번 새어 나갔다(배너를 옮길 때).
//
// 정규식으로 「앞줄이 >로 끝나면 자식 자리」라고 봤더니 오탐이 9건 나왔다. 속성 목록이나
// 함수 본문 안의 정상 주석까지 앞줄이 } 나 > 로 끝난다. 줄 모양으로는 못 가른다.
//
// 그래서 TypeScript 파서에게 묻는다. 주석이 자식 자리에 놓이면 파서가 그걸 주석이 아니라
// JsxText 노드로 만든다 — 그게 곧 「글자로 그려진다」는 뜻이라, 판정이 추측이 아니다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import ts from 'typescript';

// Windows에서 URL.pathname은 「/C:/…」이라 fs가 못 읽는다. 경로 문자열로 다룬다
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (statSync(child).isDirectory()) out.push(...walk(child));
    else if (name.endsWith('.tsx')) out.push(child);
  }
  return out;
}

const offenders: string[] = [];

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const t = node.getText().trim();
      if (t.startsWith('/*') || t.startsWith('//')) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        offenders.push(`${basename(file)}:${line + 1}  ${t.split('\n')[0].slice(0, 56)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

assert.deepEqual(
  offenders,
  [],
  `JSX 자식 자리의 주석이 중괄호에 안 싸여 있다 — 화면에 본문으로 그려진다:\n  ${offenders.join('\n  ')}`,
);

console.log('jsxcomment ok');
