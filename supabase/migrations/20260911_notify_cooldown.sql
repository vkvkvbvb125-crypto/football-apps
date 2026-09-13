-- 20260911_notify_cooldown.sql
-- 독촉 알림의 서버 쪽 속도 제한.
--
-- ── 왜 서버인가 ──────────────────────────────────────────────────
-- 지금 가드는 화면 상태뿐이고, 셋 다 못 막는다:
--   · 시트를 닫았다 열면 지역 state(poked·pokedAll·reminded)가 초기화된다
--   · 다른 기기에는 그 상태가 아예 없다
--   · 총무가 둘이면 서로의 상태를 모른다
--
-- 실측(2026-09-11):
--   회비 독촉  remindUnpaid에 가드가 없고 버튼에 disabled도 없다.
--              `reminded`는 2초짜리 글자·색 변경일 뿐이다. 열 번 누르면 열 번 다 간다.
--   투표 독촉  `disabled={poking}`은 **전송 중에만** 막는다. 끝나면 다시 눌린다.
--              개별 칩의 `done`은 「전송됨」 글자만 바꾼다.
--
-- ⚠ 「투표는 votes 행이 막아준다」는 틀리다. 그건 속도 제한이 아니라 **대상 선정**이다 —
--    투표하면 명단에서 빠질 뿐, 투표 안 한 사람은 무한히 찌를 수 있다.
--    그래서 settlement와 deadline **둘 다** 건다. 한쪽만 막으면 반쪽이다.
--
-- ⚠ 다만 둘 사이에 진짜 비대칭이 하나 있다. 같은 쿨다운을 걸어도 결과가 다르다:
--      투표  투표하면 votes 행이 생겨 대상에서 빠진다 → **저절로 멎는 경로가 있다**
--      정산  송금은 앱 밖에서 일어나고 「입금했어요」를 눌러야 빠진다 → **안 멎는다**
--    그래서 정산 쪽이 더 오래 반복된다. 「왜 둘이 다르지」가 나오면 답은 여기다.
--
-- ── 왜 notifications를 재활용하지 않는가 ────────────────────────
-- notifications_delete_own 정책이 있어 팀원이 자기 알림을 지울 수 있다
-- (20260812_notifications_delete.sql). 알림함에서 밀어 지우면 쿨다운이 함께 사라진다 —
-- **막으려던 사람이 막는 것을 지울 수 있는 구조**가 된다.
-- 쿨다운은 사용자 데이터가 아니라 속도 제한이다. 그래서 따로 둔다.

create table if not exists public.notify_cooldown (
  team_id    uuid not null references public.teams(id) on delete cascade,

  -- 'settlement'(회비 독촉) · 'deadline'(투표 독촉). notify-team이 받는 kind 그대로다.
  -- ⚠ 공지·언급·댓글에는 걸지 않는다. 그건 독촉이 아니라 사건 알림이라,
  --    막으면 일어난 일을 못 알리게 된다.
  kind       text not null,

  -- 무엇에 대한 독촉인가. 회비는 settlement id, 투표는 match_date(ISO 문자열).
  -- ⚠ match_date를 키로 써도 안전하다 — matches_team_date_uniq가 (team_id, match_date)를
  --    유일하게 만든다(20260821_match_unique.sql). id가 아니어도 한 경기를 가리킨다.
  target_key text not null,

  /*
    ⚠ **키에 user_id가 들어간다. 대칭이 아닌 것이 실수처럼 보일 자리라 근거를 적는다.**

    대상(정산·경기)만으로 잡으면 이렇게 깨진다:

        총무가 A에게 개별 독촉  →  10분 뒤 「미투표 5명 독촉」이 **통째로** 막힌다
                                   B·C·D·E는 한 번도 못 받았는데도

    **막힌 사람 한 명 때문에 전체가 막히는 것**이 이 기능이 낼 수 있는 최악이다.
    독촉이 안 가는 것은 사용자가 눈치채지 못하고, 총무는 보냈다고 믿는다 —
    「찌르기가 한 번도 안 감」과 같은 모양이다.
    수신자별이라야 A만 건너뛰고 나머지 넷에게 간다.

    ⚠ 반대로 **「보낸 사람」은 키에 넣지 않는다.** 넣으면 총무 둘이 각각 보내 두 배가
      되고, 받는 사람에게는 누가 보냈든 같은 알림이다 — 애초에 막으려던 것이다.
  */
  user_id    uuid not null references public.profiles(id) on delete cascade,

  sent_at    timestamptz not null default now(),

  primary key (team_id, kind, target_key, user_id)
);

alter table public.notify_cooldown enable row level security;

-- ⚠ 정책을 하나도 만들지 않는다. 이 표는 service_role만 만진다
--    (notify-team이 supabaseAdmin으로 읽고 쓴다). RLS가 켜져 있고 정책이 없으면
--    일반 사용자에게는 없는 표와 같다 — 총무도 팀원도 읽지도 지우지도 못한다.
--    그게 이 표의 목적이고, 위 notifications 건이 바로 그 반례다.

-- 오래된 행 청소용. 창이 3시간이라 하루 지난 것은 의미가 없다.
create index if not exists notify_cooldown_sent_at_idx
  on public.notify_cooldown (sent_at);

-- ── 창 길이는 여기가 아니라 notify-team 안에 있다 ────────────────
--
-- 3시간이다. 값 자체는 함수 쪽 상수로 두었다 — 바꾸는 데 마이그레이션이 필요하면
-- 「조금 줄여보자」를 못 하게 된다.
--
-- ⚠ **이 3시간은 matchWindow.ts의 유예 3시간(MATCH_GRACE_MS)과 무관하다.
--    우연히 같은 값이다. 함께 바꾸지 마라.**
--      MATCH_GRACE_MS  「경기가 아직 진행 중으로 볼 수 있는 구간」
--                      근거: 풋살 한 경기가 1~2시간이라 3시간이면 뒤풀이까지 덮는다
--      쿨다운 3시간     「사람이 알림을 받고 반응할 시간」
--    다른 물음이라 한쪽이 바뀔 이유가 다른 쪽에 없다.
