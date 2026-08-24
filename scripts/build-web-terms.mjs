// scripts/build-web-terms.mjs
// src/features/auth/terms.ts 하나에서 웹 공개용 약관 페이지를 만들어낸다.
//
//   node scripts/build-web-terms.mjs
//
// 왜 손으로 안 쓰고 만들어내나:
// 앱 안에서 동의받는 문서와 웹에 공개하는 문서는 같은 내용이어야 한다. 두 벌로 두면
// 한쪽만 고쳐지는 날이 오고, 그때 "동의받은 내용과 공개된 내용이 다른" 상태가 된다.
// 그건 약관에서는 단순한 불일치가 아니라 분쟁거리다.
//
// 스토어 심사는 웹에 공개된 개인정보처리방침 URL을 요구한다 — 앱 안 모달로는 안 된다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
// 윈도우 경로("C:\...")를 그대로 import()에 넘기면 'c:'를 프로토콜로 읽어 실패한다
const { TERMS } = await import(pathToFileURL(join(root, 'src/features/auth/terms.ts')).href);

/** HTML에 그대로 넣으면 안 되는 문자 — 약관 본문에 <, & 가 들어갈 수 있다 */
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 본문은 평문이다. 줄바꿈을 살리고, 조문 제목("제3조 (…)")만 굵게 만든다 */
function bodyToHtml(body) {
  return body
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return '<p class="gap"></p>';
      if (/^제\d+조/.test(t) || /^\d+\.\s/.test(t) || t === '부칙') {
        return `<p class="head">${esc(t)}</p>`;
      }
      if (/^\[.+\]$/.test(t)) return `<p class="sub">${esc(t)}</p>`;
      return `<p>${esc(line)}</p>`;
    })
    .join('\n');
}

const page = (title, bodyHtml) => `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} — KickDay</title>
    <meta name="robots" content="index" />
    <style>
      :root { --bg:#07100d; --card:#101a16; --border:#1d2a24; --text:#e8f0ec; --dim:#8fa69c; --green:#4ade80; }
      * { box-sizing: border-box; }
      body { margin:0; background:var(--bg); color:var(--text); padding:32px 20px 64px;
        font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;
        line-height:1.75; font-size:14.5px; }
      main { max-width: 680px; margin: 0 auto; }
      a.back { color:var(--dim); text-decoration:none; font-size:13px; }
      h1 { font-size:22px; margin:20px 0 28px; letter-spacing:-0.5px; }
      p { margin:0; }
      p.head { font-weight:700; margin-top:22px; margin-bottom:4px; color:var(--green); }
      p.sub { font-weight:700; margin-top:14px; color:var(--text); }
      p.gap { height:10px; }
      nav { margin-top:48px; padding-top:20px; border-top:1px solid var(--border); font-size:13px; }
      nav a { color:var(--dim); text-decoration:none; margin-right:14px; }
      @media (prefers-color-scheme: light) {
        :root { --bg:#ffffff; --card:#f6f8f7; --border:#e3e8e5; --text:#12201a; --dim:#5c6b64; --green:#177a45; }
      }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="/">← KickDay</a>
      <h1>${esc(title)}</h1>
      ${bodyHtml}
      <nav>
        ${TERMS.map((t) => `<a href="/${t.key}">${esc(t.title)}</a>`).join('\n        ')}
      </nav>
    </main>
  </body>
</html>
`;

// 각 약관을 /{key}/ 로 낸다. 스토어에 적을 주소는 /privacy 다.
for (const doc of TERMS) {
  const dir = join(root, 'web', doc.key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(doc.title, bodyToHtml(doc.body)), 'utf8');
  console.log('생성  /' + doc.key);
}

// 랜딩 페이지 하단 링크가 /terms 를 가리키므로 이용약관은 그 주소로도 낸다
const tos = TERMS.find((t) => t.key === 'tos');
if (tos) {
  const dir = join(root, 'web', 'terms');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(tos.title, bodyToHtml(tos.body)), 'utf8');
  console.log('생성  /terms');
}
