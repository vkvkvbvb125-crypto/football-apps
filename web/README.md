# kickday.app 정적 페이지

Cloudflare Pages에 이 폴더를 그대로 올린다. 두 가지 일을 한다.

1. 앱이 없는 사람이 정산 링크를 눌렀을 때 보는 안내 페이지 (`index.html`)
2. 유니버설 링크·앱 링크 인증 파일 (`.well-known/`)

## 아직 채워야 하는 값

| 파일 | 자리 | 어디서 얻나 |
|---|---|---|
| `.well-known/apple-app-site-association` | `[APPLE_TEAM_ID]` | Apple Developer → Membership (10자리) |
| `.well-known/assetlinks.json` | `[ANDROID_SHA256_FINGERPRINT]` | `npx eas credentials` → Android → 업로드 키의 SHA-256 |
| `index.html` | `[APP_STORE_ID]` | App Store Connect에서 앱을 만들면 나오는 숫자 |

값을 못 채운 채로 올려도 사이트는 뜬다. 다만 링크를 눌렀을 때 앱이 자동으로 열리지 않고
안내 페이지가 뜬다 — 인증에 실패하면 OS가 그냥 브라우저로 보낸다.

## 배포

⚠ **Pages가 아니라 Worker다.** 이 폴더는 Cloudflare **Workers static assets**로 나간다.
설정은 저장소 루트의 `wrangler.toml`이 들고 있고 `[assets] directory = "./web"`가 여기를 가리킨다.
대시보드에서 Pages 프로젝트를 새로 만들면 같은 도메인을 두 곳이 다투게 된다.

```bash
# 저장소 루트(app/)에서
npx wrangler login      # 최초 1회. 브라우저가 열리고 Cloudflare 계정을 고르면 끝난다
npx wrangler deploy
```

⚠ 대시보드 업로더를 쓰지 않는 이유는 `wrangler.toml` 머리말에 있다 —
`.well-known` 같은 숨김 폴더를 빠뜨리거나 중간에 멈추는 일이 있었다.

### 배포됐는지 확인

⚠ **200이 배포됐다는 뜻이 아니다.** `not_found_handling = "single-page-application"`
때문에 **없는 경로도 `index.html`을 200으로 돌려준다.** 상태 코드 말고 내용을 봐야 한다.

```bash
# 계정 삭제 페이지 — 랜딩 페이지가 오면 아직 안 올라간 것이다
curl -sL https://kickday.app/delete-account | grep -c "무엇이 지워지나"   # 1이어야 한다

# 약관 시행일 — [시행일]이 보이면 옛 배포본이다
curl -sL https://kickday.app/privacy | grep -o "이 방침은 [^부]*부터"
```

## 확인 방법

```bash
# Content-Type이 application/json이어야 한다. text/plain이면 iOS가 무시한다.
curl -I https://kickday.app/.well-known/apple-app-site-association

# 안드로이드는 구글이 대신 검사해준다
# https://developers.google.com/digital-asset-links/tools/generator
```

**주의:** `apple-app-site-association`은 확장자가 없어야 하고, 리다이렉트 없이 200으로 응답해야 한다.
Cloudflare Pages는 `.well-known`을 그대로 서빙하지만, `_headers` 파일로 Content-Type을 지정해야
할 수도 있다.
