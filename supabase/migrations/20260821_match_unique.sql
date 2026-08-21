-- 같은 팀의 같은 시각 경기를 하나로.
--
-- 8월 18일 20:00 세 건, 8월 5일 20:00 세 건이 쌓여 있었다. 원인이 셋:
--   1) 「경기 만들기」가 캘린더에서 고른 날짜를 써서 지난 날짜로 만들어짐 (앱에서 수정)
--   2) 제출 중에도 버튼이 눌려 같은 요청이 두 번 감 — 실제로 7초·9초 차 (앱에서 수정)
--   3) DB에 아무 제약이 없어 무엇도 막지 않음 (여기)
-- 앱을 고쳐도 두 기기에서 동시에 누르는 경우는 남는다. 마지막 방어선은 DB다.
--
-- match_date는 timestamptz라 시각까지 들어 있다 — 하루 두 타임(오전 자체 경기,
-- 저녁 다른 팀과)은 서로 다른 값이라 그대로 허용된다.

-- ── 1) 기존 중복 정리 ────────────────────────────────────────────
-- 남기는 기준: 딸린 데이터(투표·정산·팀배정)가 가장 많은 행. 같으면 먼저 만든 것.
-- 연타로 생긴 쪽은 대개 아무것도 안 달려 있어서 이 기준으로 저절로 걸러진다.
--
-- ⚠ 데이터가 붙어 있는 행이 한 그룹에 둘 이상이면 이 문장이 한쪽을 지운다.
--    실행 전에 아래로 확인한다:
--      with dup as (select team_id, match_date from public.matches
--                   group by 1,2 having count(*) > 1)
--      select m.id, m.created_at,
--             (select count(*) from public.attendance_votes v where v.match_id = m.id) votes,
--             (select count(*) from public.settlements s where s.match_id = m.id) settles
--      from public.matches m join dup d using (team_id, match_date) order by 1;
with ranked as (
  select
    m.id,
    row_number() over (
      partition by m.team_id, m.match_date
      order by
        (select count(*) from public.attendance_votes v  where v.match_id = m.id)
        + (select count(*) from public.settlements s     where s.match_id = m.id)
        + (select count(*) from public.team_assignments a where a.match_id = m.id) desc,
        m.created_at asc
    ) as rn
  from public.matches m
)
delete from public.matches
where id in (select id from ranked where rn > 1);

-- ── 2) 제약 ──────────────────────────────────────────────────────
alter table public.matches
  drop constraint if exists matches_team_date_uniq;

alter table public.matches
  add constraint matches_team_date_uniq unique (team_id, match_date);
