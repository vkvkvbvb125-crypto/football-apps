# Auth 메일 템플릿 — 2026-09-16

Supabase가 보내는 인증 메일의 문안. **대시보드에서만 바뀌고 저장소에 안 남으므로**
원본을 여기 둔다 — 대시보드 값이 날아가거나 누가 바꿨을 때 대조할 것이 있어야 한다.

    붙여넣는 곳:  Supabase → Authentication → Emails → Templates
    발신자:       KickDay <noreply@kickday.app>   (SMTP Settings의 Sender name / Sender email)

---

## ⚠ 넷 중 둘만 실제로 나간다

앱이 트리거하는 것을 코드로 셌다(2026-09-16):

| 템플릿 | 앱의 호출 | 상태 |
|---|---|---|
| **Confirm sign up** | `supabase.auth.signUp` (authService.ts:253) | ✅ **나간다** |
| **Reset password** | `supabase.auth.resetPasswordForEmail` (authService.ts:294) | ✅ **나간다** |
| Change email address | 없음 — `updateUser`는 비밀번호만 바꾼다(:289) | ⬜ 지금은 안 나감 |
| Magic link or OTP | 없음 — `signInWithOtp` 호출이 없다 | ⬜ 지금은 안 나감 |

⚠ **그래도 넷 다 채운다.** 안 채우면 영문 기본값이 남고, 나중에 그 기능을 켜는 사람이
템플릿까지 기억할 리 없다. 그때 영문 메일이 조용히 나간다 — 이 저장소가 여러 번 본
「켜 두고 잊는」 모양이다. 지금 넣는 비용은 붙여넣기 두 번이다.

---

## 스팸 판정을 낮추는 요소 — 왜 이 문장들이 들어 있나

문안을 줄이고 싶을 때 **이 셋은 지워선 안 된다.** 장식이 아니라 필터가 보는 값이다.

| 넣는 것 | 왜 |
|---|---|
| **수신 이유** (`{{ .Email }} 주소로 …가 요청되어`) | 「왜 나한테 왔나」가 없으면 사람이 스팸으로 신고한다. 신고가 쌓이면 도메인 평판이 내려가 **나중엔 진짜로 스팸함에 간다** |
| **발신자 정체** (KickDay가 무엇을 하는 앱인지 한 줄) | 받는 사람이 앱을 기억 못 할 수 있다. 특히 가입 직후가 아니라 며칠 뒤 열었을 때 |
| **문의처** (`contact@kickday.app`) | 답장할 곳이 없는 메일은 점수가 깎인다. 발신이 `noreply@`라 본문에 둔다 |
| **본인이 요청하지 않았다면** | 재설정 메일에서 특히 중요하다 — 남이 내 주소로 시도했을 때 알려야 한다 |

⚠ **피할 것**
- 제목에 느낌표·전부 대문자·「무료」「긴급」「지금 바로」
- **이미지만 있는 메일** — 이미지 한 장에 글자를 다 넣는 것이 가장 흔한 스팸 신호다.
  아래 문안은 전부 텍스트다(로고 이미지도 안 쓴다)
- **단축 URL** — `{{ .ConfirmationURL }}`을 다른 서비스로 감싸지 마라
- 링크를 버튼 하나로만 두는 것 — 버튼을 못 그리는 클라이언트가 있어 **주소를 글로도** 적는다

⚠ **발신자 이름과 도메인이 맞아야 한다** — `KickDay` / `kickday.app`. 이게 어긋나면
  DMARC가 통과해도 사람이 의심한다.

⚠ Supabase 템플릿은 **HTML 한 벌뿐**이라 plain-text 대체본을 따로 못 넣는다.
  그래서 HTML을 최소로 두고 글이 그대로 읽히게 쓴다.

---

## 공통 꼬리말

네 템플릿의 `<!-- FOOTER -->` 자리에 그대로 들어간다. 문장만 템플릿마다 바뀐다.

```html
<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px" />
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b7280">
  이 메일은 <b>{{ .Email }}</b> 주소로 ○○이 요청되어 발송됐습니다.
  본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280">
  KickDay · 풋살 모임의 일정 · 참석 · 회비를 한곳에서 관리하는 앱<br />
  문의: <a href="mailto:contact@kickday.app" style="color:#16a34a">contact@kickday.app</a>
</p>
```

---

## ① Confirm sign up — ✅ 나간다

**제목:** `KickDay 가입을 확인해주세요`

```html
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827">
  <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#16a34a">KickDay</p>
  <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">가입을 확인해주세요</h1>

  <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151">
    아래 버튼을 누르면 가입이 완료되고, 앱에서 로그인할 수 있어요.
  </p>

  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:14px 28px;background:#16a34a;color:#ffffff;
            border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">
    가입 확인하기
  </a>

  <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6b7280">
    버튼이 눌리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br />
    <span style="word-break:break-all;color:#374151">{{ .ConfirmationURL }}</span>
  </p>

  <!-- FOOTER: ○○ = KickDay 가입 -->
</div>
```

---

## ② Reset password — ✅ 나간다

**제목:** `KickDay 비밀번호를 새로 설정해주세요`

⚠ 꼬리말의 「본인이 요청하지 않았다면」이 **여기서 가장 중요하다** — 남이 내 주소로
시도했을 때 알 수 있는 유일한 통로다. 한 문장 더 붙인다.

```html
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827">
  <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#16a34a">KickDay</p>
  <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">비밀번호를 새로 설정해주세요</h1>

  <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151">
    아래 버튼을 누르면 새 비밀번호를 정하는 화면으로 이동해요.
  </p>

  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:14px 28px;background:#16a34a;color:#ffffff;
            border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">
    비밀번호 재설정하기
  </a>

  <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6b7280">
    버튼이 눌리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br />
    <span style="word-break:break-all;color:#374151">{{ .ConfirmationURL }}</span>
  </p>

  <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#6b7280">
    요청한 적이 없다면 <b>비밀번호는 그대로</b>입니다. 이 메일만 무시하시면 돼요.
  </p>

  <!-- FOOTER: ○○ = 비밀번호 재설정 -->
</div>
```

---

## ③ Change email address — ⬜ 지금은 안 나간다

**제목:** `KickDay 이메일 주소 변경을 확인해주세요`

⚠ `{{ .NewEmail }}`은 **이 템플릿에서만** 쓸 수 있다. 바뀌는 주소를 보여주는 것이
이 메일의 핵심이다 — 어디로 바뀌는지 모르면 확인할 수가 없다.

```html
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827">
  <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#16a34a">KickDay</p>
  <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">이메일 주소 변경을 확인해주세요</h1>

  <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151">
    계정의 이메일 주소를 아래로 바꾸려고 해요.
  </p>

  <p style="margin:0 0 24px;padding:14px 16px;background:#f3f4f6;border-radius:10px;
            font-size:15px;line-height:1.7;color:#111827">
    {{ .Email }} → <b>{{ .NewEmail }}</b>
  </p>

  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:14px 28px;background:#16a34a;color:#ffffff;
            border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">
    변경 확인하기
  </a>

  <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6b7280">
    버튼이 눌리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br />
    <span style="word-break:break-all;color:#374151">{{ .ConfirmationURL }}</span>
  </p>

  <!-- FOOTER: ○○ = 이메일 주소 변경 -->
</div>
```

---

## ④ Magic link or OTP — ⬜ 지금은 안 나간다

**제목:** `KickDay 로그인 링크입니다`

⚠ 이 템플릿은 **링크와 6자리 코드 둘 다** 쓸 수 있다(`{{ .Token }}`). 앱이 어느 쪽을
쓸지 정해지지 않았으므로 **둘 다 넣어 둔다** — 링크를 못 여는 환경에서 코드가 대안이 된다.
⚠ 실제로 켤 때 하나만 쓰기로 하면 나머지 줄을 지워라. 둘 다 보여주면 무엇을 하라는 건지
  헷갈린다.

```html
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827">
  <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#16a34a">KickDay</p>
  <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">로그인 링크입니다</h1>

  <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151">
    아래 버튼을 누르면 비밀번호 없이 로그인돼요.
  </p>

  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:14px 28px;background:#16a34a;color:#ffffff;
            border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">
    로그인하기
  </a>

  <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6b7280">
    앱에서 코드를 입력하는 화면이라면 이 숫자를 넣어주세요.
  </p>
  <p style="margin:6px 0 0;font-size:24px;font-weight:700;letter-spacing:4px;color:#111827">
    {{ .Token }}
  </p>

  <!-- FOOTER: ○○ = 로그인 -->
</div>
```

---

## 붙여넣은 뒤 확인

⚠ **「저장했다」로 끝내지 마라.** 오늘 `HTTP 200`이 두 번 거짓말했다.

1. Supabase 템플릿 화면에서 저장
2. 새 주소로 **실제 가입** → Resend `Emails` 로그에 **`Delivered`**
3. **받은편지함에 도착**(스팸함도 본다) → 제목·발신자가 한글로 보이는가
4. 링크 클릭 → `https://kickday.app/auth/confirm` → **앱에서 로그인 성공**

⚠ 2번이 이번 사태의 핵심이다. `confirmation_sent_at`도 Supabase의 200도
**나갔다는 뜻이 아니었다**(2026-09-16, 기본 SMTP가 조직 밖 주소로는 아예 안 보냈다).
**수신 서버의 응답이 찍히는 곳은 Resend 로그뿐이다.**
