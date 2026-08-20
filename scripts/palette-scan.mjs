// scripts/palette-scan.mjs — theme.ts에 없는 색 리터럴을 찾는다.
// 결과 해석과 묶음별 권고는 docs/palette-audit.md 참고.
//   node scripts/palette-scan.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(p) && !p.endsWith('theme.ts') ? [p] : [];
  });
}
const files = process.argv.length > 2 ? process.argv.slice(2) : walk('src');
const theme = readFileSync('src/theme.ts','utf8');
const known = new Set();
for (const m of theme.matchAll(/'(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))'/g)) known.add(m[1].toLowerCase().replace(/\s/g,''));
const rows = [];
for (const f of files) {
  const src = readFileSync(f,'utf8');
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(/(#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|rgba?\([^)]*\))/g)) {
      const v = m[1].toLowerCase().replace(/\s/g,'');
      if (known.has(v)) continue;
      rows.push({ f: f.replace('src/',''), n: i+1, v: m[1], line: line.trim().slice(0,70) });
    }
  });
}
const KAKAO = ['#fee500','#000000'];
const out = rows.filter(r => !KAKAO.includes(r.v.toLowerCase()));
console.log(`팔레트 밖 색 ${out.length}건\n`);
const by = {};
for (const r of out) (by[r.f] ??= []).push(r);
for (const [f, list] of Object.entries(by)) {
  console.log('── ' + f);
  for (const r of list) console.log(`   ${String(r.n).padStart(4)}  ${r.v.padEnd(26)} ${r.line}`);
}
