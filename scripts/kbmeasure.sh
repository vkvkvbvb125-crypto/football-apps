# scripts/kbmeasure.sh '<버튼 글자>' — 키보드가 그 버튼을 덮는가를 숫자로 낸다
#
# ── 왜 있나 ────────────────────────────────────────────────────────
# 「키보드가 버튼을 덮는다」를 화면을 보고 판정하면 단정이 되지 측정이 안 된다.
# 판정 기준은 **버튼 하단 < 키보드 상단** 하나뿐인데 양쪽 다 모서리라,
# 눈으로도 한 점 읽기로도 안 잡힌다.
#
#   키보드 상단   dumpsys window 의 `type=ime frame=[0,Y][...]`  ← 창 관리자가 주는 값
#   버튼 하단     uiautomator dump 의 `bounds="[x1,y1][x2,y2]"` 의 y2
#
# 폼 5개 × 화면 2종 × 방법 3개를 손으로 재면 어긋난다. 그래서 스크립트다.
#
# ── ⚠ 이 스크립트가 막으려는 가짜 통과 ────────────────────────────
# 2026-09-17에 에뮬레이터의 Gboard가 **떠 있는(floating) 모드**였다. 하드웨어 키보드가
# 붙은 AVD(config.ini의 hw.keyboard=yes)에서 Gboard가 도구막대 + 떠 있는 키보드로
# 바뀌는데, **떠 있는 키보드는 IME 인셋을 0으로 보고하고 앱 바닥을 안 덮는다.**
#
#   떠 있을 때   type=ime frame=[0,2337][1080,2400]   ← 63px, 내비게이션 바다
#   고정일 때    type=ime frame=[0,1517][1080,2400]   ← 883px, 진짜 키보드다
#
# **이 상태로 재면 무엇을 고쳐도 통과한다** — 덮는 것이 애초에 없기 때문이다.
# 그래서 인셋 높이를 먼저 보고 수상하면 멈춘다. 고치는 법:
#
#   adb shell pm clear com.google.android.inputmethod.latin
#   adb shell settings put secure show_ime_with_hard_keyboard 1
#
# (Gboard 설정을 기본으로 되돌린다. 기본 IME 선택은 Settings.Secure에 있어 살아남는다.
#  AVD를 다시 만들 필요도, 에뮬레이터를 재시작할 필요도 없다 — 2026-09-17에 확인했다.)
#
# ── 쓰는 법 ────────────────────────────────────────────────────────
#   1. 앱에서 입력칸을 눌러 키보드를 띄운다
#   2. bash scripts/kbmeasure.sh '가입하기'
#
# ⚠ 버튼 글자로 찾는다. 「잠시만요…」처럼 **누르는 동안 글자가 바뀌는** 버튼은
#   바뀐 글자로 찾아야 한다. 안 찾아지면 그대로 실패로 낸다 — 못 찾은 것을
#   통과로 내면 그게 가장 나쁜 출력이다.
set -u

BTN="${1:-}"
[ -z "$BTN" ] && { echo "쓰는 법: bash scripts/kbmeasure.sh '<버튼 글자>'"; exit 2; }

TMP="${TMPDIR:-/tmp}/kbmeasure.$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

# ── 1. 키보드가 실제로 떠 있는가 ──────────────────────────────────
shown=$(adb shell dumpsys input_method 2>/dev/null | grep -o "mInputShown=true" | head -1)
if [ -z "$shown" ]; then
  echo "FAIL  키보드가 안 떠 있다 (mInputShown=false) — 입력칸을 먼저 눌러라"
  exit 1
fi

# ── 2. 키보드 상단 ────────────────────────────────────────────────
ime=$(adb shell dumpsys window 2>/dev/null \
      | grep -oE "type=ime frame=\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]" | head -1)
if [ -z "$ime" ]; then
  echo "FAIL  IME 인셋을 못 읽었다 — dumpsys window의 출력 모양이 바뀌었나"
  exit 1
fi
ktop=$(echo "$ime" | sed -E 's/.*frame=\[[0-9]+,([0-9]+)\].*/\1/')
kbot=$(echo "$ime" | sed -E 's/.*\]\[[0-9]+,([0-9]+)\]$/\1/')
kh=$((kbot - ktop))

# ⚠ 떠 있는 키보드 걸러내기 — 위 머리말 참고. 내비게이션 바만 잡히면 높이가 100 미만이다
if [ "$kh" -lt 300 ]; then
  echo "FAIL  IME 인셋이 ${kh}px뿐이다 — 키보드가 떠 있는(floating) 모드다. 이대로 재면 무엇이든 통과한다."
  echo "      adb shell pm clear com.google.android.inputmethod.latin"
  echo "      adb shell settings put secure show_ime_with_hard_keyboard 1"
  exit 1
fi

# ── 3. 버튼 하단 ──────────────────────────────────────────────────
# ⚠ adb pull에 로컬 경로를 넘기지 마라. Git Bash가 //sdcard를 안 건드리게 하려고
#   MSYS_NO_PATHCONV=1을 쓰면 **로컬 목적지까지** 변환이 꺼져서 adb(윈도 실행파일)가
#   /tmp/... 에 못 쓴다. 리다이렉션으로 받으면 adb에 로컬 경로가 안 간다.
adb shell uiautomator dump //sdcard/kbm.xml >/dev/null 2>&1
adb exec-out cat //sdcard/kbm.xml > "$TMP/u.xml" 2>/dev/null
[ -s "$TMP/u.xml" ] || { echo "FAIL  uiautomator 덤프를 못 받았다"; exit 1; }

# 그 글자를 가진 노드의 bounds. 한 줄에 여러 노드가 오므로 노드 단위로 쪼갠다
bounds=$(tr '>' '\n' < "$TMP/u.xml" | grep -F "text=\"$BTN\"" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1)
if [ -z "$bounds" ]; then
  echo "FAIL  화면에서 「$BTN」을 못 찾았다 — 글자가 바뀌었거나 그 화면이 아니다"
  echo "      지금 화면의 글자들:"
  grep -oE 'text="[^"]+"' "$TMP/u.xml" | sort -u | head -12 | sed 's/^/        /'
  exit 1
fi
btop=$(echo "$bounds" | sed -E 's/.*bounds="\[[0-9]+,([0-9]+)\].*/\1/')
bbot=$(echo "$bounds" | sed -E 's/.*\]\[[0-9]+,([0-9]+)\]"$/\1/')

# ⚠ **뒤집힌 bounds는 「화면 밖」이다.** uiautomator는 노드를 부모의 보이는 영역으로
#   잘라내므로, 노드가 통째로 잘림선 아래면 y2가 y1보다 작게 나온다.
#   그대로 y2를 하단으로 쓰면 「키보드 상단과 0px 차이」로 찍혀 **아슬아슬하게 못 미친
#   것처럼 보인다** — 실제로는 전부 밖이다. 2026-09-17에 ㉮를 재다 걸렸다
#   (bounds="[466,1726][614,1517]" → 하단=1517, 키보드 상단도 1517이라 「0px」이 나왔다).
if [ "$bbot" -le "$btop" ]; then
  echo "버튼 「$BTN」  $bounds   ← 뒤집힌 값 = 보이는 영역 밖으로 잘렸다"
  echo "키보드        $ime   상단=$ktop  (높이 ${kh}px)"
  echo "FAIL  버튼이 화면에 안 보인다 (실제 상단 $btop, 잘림선 $bbot). 스크롤로 닿는지는 따로 확인해라"
  exit 1
fi

# ── 4. 판정 ───────────────────────────────────────────────────────
echo "버튼 「$BTN」  $bounds   하단=$bbot"
echo "키보드        $ime   상단=$ktop  (높이 ${kh}px)"
if [ "$bbot" -lt "$ktop" ]; then
  echo "PASS  버튼 하단 $bbot < 키보드 상단 $ktop   (여유 $((ktop - bbot))px)"
  exit 0
else
  echo "FAIL  버튼 하단 $bbot >= 키보드 상단 $ktop   ($((bbot - ktop))px 만큼 키보드 아래에 있다)"
  exit 1
fi
