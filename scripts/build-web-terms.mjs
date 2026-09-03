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


/*
  계정·데이터 삭제 안내 — /delete-account

  ⚠ **약관(TERMS)에 넣지 않는다.** TERMS는 가입 화면의 동의 체크박스를 만드는 목록이라,
    여기 항목을 넣으면 「계정 삭제에 동의합니다」 체크박스가 생긴다.
    동의받을 문서가 아니라 안내 페이지이므로 이 스크립트가 따로 낸다.

  ⚠ Play는 계정을 만들 수 있는 앱에 **앱 밖에서도 닿는 삭제 요청 경로**를 요구한다.
    앱을 지운 사람도 요청할 수 있어야 해서 앱 안 메뉴만으로는 안 된다.
    무엇이 지워지고 무엇이 남는지, 어떻게 요청하는지가 적혀 있어야 한다.
    남는 것을 안 적으면 「다 지운다」로 읽히고, 실제와 다르면 그게 문제가 된다.
*/
const DELETE_ACCOUNT_BODY = `앱에서 바로 지우기

설정 > 회원 탈퇴 에서 직접 지울 수 있습니다. 즉시 처리되며 따로 요청하지 않아도 됩니다.

⚠ 팀에 총무가 나 혼자인 경우에는 먼저 다른 분에게 총무를 넘겨야 합니다.
  넘기지 않고 탈퇴하면 남은 팀원이 경기와 정산을 관리할 수 없게 되기 때문입니다.
  앱이 이 경우를 알려주고 인계 화면으로 안내합니다.

앱 없이 요청하기

앱을 이미 지우셨거나 로그인할 수 없는 경우, 가입하신 이메일 주소로
contact@kickday.app 에 「계정 삭제 요청」이라고 보내주세요.
본인 확인 후 처리하고 완료되면 회신드립니다.

무엇이 지워지나

· 계정 정보 — 이메일, 이름, 프로필 사진
· 팀 소속과 역할, 포지션·등번호·실력
· 참석 투표 응답
· 내 정산 몫 — 금액과 입금 여부
· 내가 쓴 게시글과 댓글
· 푸시 알림 토큰
· 총무로 등록한 입금 계좌

무엇이 남나

· 팀의 경기 기록과 정산 기록 — 작성자 표시만 지워지고 기록 자체는 남습니다.
  같은 팀의 다른 분들에게 필요한 기록이라 함께 지우지 않습니다.
  그 안에서 회원의 몫은 위와 같이 삭제됩니다.
· 내가 만든 팀, 내가 올린 공지와 투표 — 작성자 표시가 지워진 채 남습니다.
  팀과 공지는 남은 분들이 계속 쓰는 것이라 함께 지우지 않습니다.
· 접속 기록 — 통신비밀보호법에 따라 3개월간 보관 후 파기합니다.

자세한 보유 기간은 개인정보 처리방침의 「보유 및 이용 기간」을 참고하세요.

문의

contact@kickday.app`;

/*
  ── 내는 것과 쓰는 것을 가른다 ──────────────────────────────────────
  render()는 파일을 안 건드리고 { 경로: HTML }만 돌려준다.
  webterms.check.ts가 이걸 불러 web/ 과 대조한다 — **검사가 자기 사본을 시험하지
  않게** 하려는 것이다. 검사에 같은 조립 코드를 한 벌 더 두면 둘이 갈리는 날
  검사는 통과하는데 배포본은 옛 문장인 상태가 된다.
*/
export function render() {
  const out = {};

  // 각 약관을 /{key}/ 로 낸다. 스토어에 적을 주소는 /privacy 다.
  for (const doc of TERMS) {
    out[`web/${doc.key}/index.html`] = page(doc.title, bodyToHtml(doc.body));
  }

  out['web/delete-account/index.html'] = page('계정 및 데이터 삭제', bodyToHtml(DELETE_ACCOUNT_BODY));

  // 랜딩 페이지 하단 링크가 /terms 를 가리키므로 이용약관은 그 주소로도 낸다
  const tos = TERMS.find((t) => t.key === 'tos');
  if (tos) out['web/terms/index.html'] = page(tos.title, bodyToHtml(tos.body));

  return out;
}

/* 직접 돌렸을 때만 파일을 쓴다. import는 render()만 가져간다 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  for (const [rel, html] of Object.entries(render())) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, html, 'utf8');
    console.log('생성  /' + rel.split('/')[1]);
  }
}
