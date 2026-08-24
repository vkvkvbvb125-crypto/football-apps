-- 계정 삭제 (D-1) — 삭제를 막고 있던 외래키 5개를 set null로
--
-- auth.users 삭제는 profiles → team_members까지 cascade로 내려가는데, 그 끝에
-- on delete 절이 없는 외래키가 4개 있다. 절이 없으면 기본이 NO ACTION(사실상 RESTRICT)
-- 이라서 삭제가 23503으로 막힌다. 경기를 한 번이라도 만든 사람은 탈퇴가 실패하고,
-- 총무는 거의 전원이 여기 걸린다.
--
-- 4개는 추측이 아니라 schema.sql에 마이그레이션을 전부 얹은 DB에서 세어 본 값이다.
-- schema.sql에 있는 payments.checked_by는 여기 없다 — 20260727 리디자인이 payments를
-- drop했다. settlements.created_by도 없다 — 그 리디자인이 이미 set null로 만들었다.
--
-- 지우지 않고 set null인 이유: 경기·공지·투표는 팀의 기록이지 만든 사람의 소유물이
-- 아니다. 작성자를 따라 지우면 남은 멤버들의 과거가 같이 사라진다. 화면은 작성자가
-- 없을 때 「(탈퇴한 멤버)」로 읽는다.
--
-- attendance_votes는 일부러 cascade로 남긴다 — 약관 제4조 ②가 「탈퇴하면 계정 정보는
-- 지체 없이 파기됩니다」라고 선언했고, 참석률의 분모가 현재 멤버 수라 분자와 분모가
-- 같이 빠져 팀 통계가 흔들리지 않는 것을 실측했다. 누가 왔는지 모르는 참석 기록은
-- 남겨도 쓸 데가 없다.
--
-- 제약 이름을 박지 않고 찾아 쓰는 이유: 전부 create table 안에서 인라인으로 만들어져
-- 이름이 Postgres 기본 규칙에 달려 있다. 지금 DB에 붙어서 확인할 수단이 없어서,
-- 이름을 추측해 넣는 대신 (테이블, 컬럼)으로 찾는다. 못 찾으면 조용히 넘어가지 않고 선다.
--
-- 되돌리기: supabase/rollback/20260824_account_deletion_fks.sql
--   not null 복구는 기존 데이터에 null이 있으면 실패한다. 그 파일이 먼저 세고 멈춘다.
do $$
declare
  r   record;
  con name;
  ref text;
begin
  for r in
    select * from (values
      ('teams',         'created_by', true),
      ('matches',       'created_by', true),
      ('announcements', 'author_id',  true),
      ('polls',         'author_id',  true)
    ) as v(tbl, col, was_not_null)
  loop
    select c.conname, c.confrelid::regclass::text
      into con, ref
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid = format('public.%I', r.tbl)::regclass
       and c.contype  = 'f'
       and a.attname  = r.col
       and cardinality(c.conkey) = 1;

    if con is null then
      raise exception '%.% 의 외래키를 못 찾았다 — 스키마가 예상과 다르다', r.tbl, r.col;
    end if;

    execute format('alter table public.%I drop constraint %I', r.tbl, con);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references %s(id) on delete set null',
      r.tbl, con, r.col, ref);

    if r.was_not_null then
      execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    end if;

    raise notice '% .% → set null (%)', r.tbl, r.col, con;
  end loop;
end $$;
