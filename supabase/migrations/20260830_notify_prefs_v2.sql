-- 20260830_notify_prefs_v2.sql
-- 알림 설정을 셋에서 넷으로 — 종류는 여덟인데 끌 수 있는 것이 넷뿐이었다.
--
-- 실제로 보내는 자리를 인자 위치로 세어 보니 여덟이고, kind를 실어 보내는 것이
-- 넷뿐이었다. kind가 없으면 notify-team이 아무도 거르지 않는다(그건 의도다 —
-- 종류를 안 밝힌 알림까지 임의로 끄면 사용자가 끈 적 없는 알림이 사라진다).
-- 그래서 「못 끄는 알림」이 넷 있었다: 우천 안내 · 멘션 · 댓글 · 회비 독촉.
--
-- 토글을 여덟로 늘리지는 않는다. 설정이 길어지면 아무도 안 본다. 넷으로 묶는다:
--
--   경기    새 경기 · 투표 독촉 · 우천 안내      notify_match
--   공지    공지 등록                          notify_announcement  (기존 그대로)
--   게시판  멘션 · 댓글                        notify_board
--   정산    회비 독촉                          notify_settlement
--
-- ── 기존 설정을 어떻게 접는가 ────────────────────────────────────────
--
--   notify_match = notify_new_match AND notify_deadline
--
-- OR가 아니라 AND다. 둘 중 하나라도 끈 사람은 「경기 알림을 줄이고 싶다」는
-- 뜻이었고, OR로 접으면 명시적으로 끈 것이 되살아난다. 이 작업의 목적이 원치 않는
-- 알림을 줄이는 것이니 「끔」을 존중하는 쪽이 맞다.
--
-- 적용 시점에 끈 사람이 없어서(확인함) 실제 결과는 어느 쪽이든 같다. 규칙을
-- 적어두는 이유는 나중에 이 파일을 읽는 사람이 「왜 이렇게 접었나」를 묻기 때문이다.
--
-- 새 컬럼 둘은 기본 true다. 지금까지 끌 수 없이 전원에게 가던 것이라 그게 현상
-- 유지고, 마이그레이션이 조용히 알림을 끄면 안 된다(20260814_notify_prefs.sql의 원칙).
--
-- ⚠ notify_new_match·notify_deadline은 **지우지 않는다.** 읽기만 멈춘다.
--    카카오 유래 컬럼 때와 같다(5e42779) — 되돌릴 여지를 남기고, drop은 서랍에 둔다.

alter table public.team_members
  add column if not exists notify_match      boolean not null default true,
  add column if not exists notify_board      boolean not null default true,
  add column if not exists notify_settlement boolean not null default true;

-- 기존 값을 새 컬럼으로 접는다. 이미 접힌 뒤 다시 돌려도 결과가 같도록,
-- 아직 손대지 않은 행(=기본값 true인 행)만 대상으로 한다.
update public.team_members
   set notify_match = (notify_new_match and notify_deadline)
 where notify_match is true
   and not (notify_new_match and notify_deadline);
