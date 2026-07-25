import { withSupabase } from 'npm:@supabase/server@^1';

function renderPage(code: string | null) {
  const safeCode = code ? code.replace(/[^a-zA-Z0-9-]/g, '') : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>킥데이 팀 초대</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0B0F0D; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 24px; text-align: center; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { color: #8A9490; font-size: 14px; }
  .code { margin-top: 16px; font-size: 28px; font-weight: 800; letter-spacing: 2px; color: #39D98A; }
</style>
</head>
<body>
  <h1>킥데이 팀에 초대되었어요</h1>
  <p>앱으로 자동 이동 중입니다. 이동이 안 되면 아래 코드를 앱에 직접 입력해주세요.</p>
  <div class="code">${safeCode}</div>
  <script>
    var code = ${JSON.stringify(safeCode)};
    if (code) {
      window.location.href = 'futsalclub://join?code=' + encodeURIComponent(code);
    }
  </script>
</body>
</html>`;
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    return new Response(renderPage(code), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }),
};
