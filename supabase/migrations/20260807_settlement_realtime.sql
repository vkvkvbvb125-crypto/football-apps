-- 20260807_settlement_realtime.sql
-- 정산 진행률을 실시간으로 갱신하기 위해 settlement_shares를 Realtime 발행 대상에 넣는다.
-- (settlement-flow.md 「진행률」 — 팀원이 "송금 완료"를 누르거나 총무가 확인하면
--  보고 있는 화면이 새로고침 없이 따라 바뀌어야 한다.)
--
-- 보안: Realtime은 해당 테이블의 RLS 정책을 그대로 따른다. settlement_shares에는
-- 이미 "팀 멤버만 select" 정책(settlement_shares_select)이 걸려 있으므로, 다른 팀의
-- 변경 이벤트가 새어나가지 않는다. 멀티테넌시 원칙은 유지된다.

-- UPDATE 이벤트에서 필터·RLS 판정에 쓸 수 있도록 이전 행 전체를 싣는다.
-- 기본값(primary key만)이면 settlement_id로 거는 필터가 UPDATE에서 헛돈다.
alter table settlement_shares replica identity full;

-- 이미 추가돼 있으면 alter publication이 에러를 내므로 존재 여부를 먼저 본다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'settlement_shares'
     )
  then
    alter publication supabase_realtime add table settlement_shares;
  end if;
end $$;
