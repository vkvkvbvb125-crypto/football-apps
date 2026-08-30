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

```
Cloudflare 대시보드 → Workers & Pages → Create → Pages
  → 이 폴더를 업로드하거나 Git 저장소를 연결
  → Custom domain 으로 kickday.app 연결
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
