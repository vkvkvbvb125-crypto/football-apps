#!/bin/bash
# scripts/apkperm.sh — 산출물(APK)의 권한을 센다. **도구가 없으면 0이 아니라 실패다.**
#
# ── 왜 이 스크립트가 있나 ──────────────────────────────────────────
# 2026-09-29에 `aapt2 dump permissions`가 **권한 총수 0 · AD_ID 0**을 뱉었다.
# 숫자만 보면 「광고 권한이 안 붙었다」는 판정이 되는데, 실제로는
# `$ANDROID_HOME`이 비어 `/build-tools/36.0.0/aapt2`를 실행하려다 실패한 것이었다.
# **없는 도구가 0을 만들었고, 0은 그럴듯했다.**
#
# 같은 날 Git Bash가 `/mnt/c/...`를 윈도 경로로 바꿔 스크립트 자체를 못 찾은 일도 있었다
# (`MSYS_NO_PATHCONV=1` 필요). 인용과 경로를 사람이 매번 맞추는 대신 여기 모은다.
#
# ⚠ **이 저장소의 규칙이다: 안 돌아간 도구의 출력은 측정값이 아니다.**
#   그래서 아래 셋 중 하나라도 어긋나면 **숫자를 찍지 않고 exit 1**이다:
#     ① aapt2를 못 찾음      ② APK를 못 찾음      ③ 권한이 0건
#   ③이 핵심이다 — 이 앱은 최소 INTERNET을 갖는다. 0은 물리적으로 불가능하고,
#   0이 나왔다면 그건 「권한이 없다」가 아니라 **「못 읽었다」**다.
#
# 쓰는 법:  bash scripts/apkperm.sh <apk 경로>
set -u

APK="${1:-}"
if [ -z "$APK" ]; then
  echo "사용법: bash scripts/apkperm.sh <apk 경로>" >&2
  exit 2
fi

# ① aapt2 — PATH → ANDROID_HOME → 흔한 자리 순으로 찾는다
AAPT="$(command -v aapt2 2>/dev/null || true)"
if [ -z "$AAPT" ]; then
  for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Android/Sdk"; do
    [ -n "$d" ] || continue
    cand="$(ls -1 "$d"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)"
    if [ -n "$cand" ]; then AAPT="$cand"; break; fi
  done
fi
if [ -z "$AAPT" ] || [ ! -x "$AAPT" ]; then
  echo "x aapt2를 못 찾았다. ANDROID_HOME을 세우거나 PATH에 넣어라." >&2
  echo "  (WSL이면 '. ~/kdenv.sh' 먼저. 숫자를 0으로 읽지 않으려고 여기서 끊는다)" >&2
  exit 1
fi

# ② APK
if [ ! -f "$APK" ]; then
  echo "x APK가 없다: $APK" >&2
  exit 1
fi

P="$("$AAPT" dump permissions "$APK" 2>/dev/null)"
TOTAL="$(printf '%s\n' "$P" | grep -c "^uses-permission")"

# ③ 0건은 「없다」가 아니라 「못 읽었다」다
if [ "$TOTAL" -eq 0 ]; then
  echo "x 권한이 0건이다 — 이 앱은 최소 INTERNET을 갖는다. 못 읽은 것이지 없는 것이 아니다." >&2
  echo "  aapt2=$AAPT" >&2
  echo "  apk=$APK" >&2
  exit 1
fi

count() { printf '%s\n' "$P" | grep -c "$1"; }

echo "aapt2: $AAPT"
echo "apk:   $APK"
echo "uses-permission 총수        : $TOTAL"
echo "gms AD_ID                  : $(count 'gms.permission.AD_ID')"
echo "ACCESS_ADSERVICES_*        : $(count 'ACCESS_ADSERVICES_')"
echo "SYSTEM_ALERT_WINDOW        : $(count 'permission.SYSTEM_ALERT_WINDOW')"
echo "FOREGROUND_SERVICE         : $(count 'permission.FOREGROUND_SERVICE')"
echo "--- 전체 ---"
printf '%s\n' "$P" | grep "^uses-permission" | sed "s/uses-permission: name='//; s/'$//" | sort | sed 's/^/  /'
