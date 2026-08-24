-- 되돌리기 — 20260824_account_deletion_fks.sql
--
-- ⚠ 이 파일은 supabase/migrations/ 밖에 있다. 거기 두면 CLI가 다음 마이그레이션으로
--    집어삼켜서 방금 적용한 것을 그 자리에서 되돌린다. 손으로만 실행한다.
--
-- not null 복구는 되돌리기의 어려운 쪽이다. 이미 탈퇴한 사람이 하나라도 있으면 그 자리에
-- null이 들어가 있고, 그러면 alter ... set not null이 실패한다. 실패 자체는 안전하지만
-- (DDL이 트랜잭션이라 통째로 롤백된다) 어디에 몇 개인지 모르면 손을 못 댄다.
-- 그래서 건드리기 전에 먼저 센다.
--
-- null이 나오면: 그 행들의 주인을 정하거나(다른 멤버로 UPDATE) 행을 지운 뒤 다시 실행한다.
-- 되돌린다는 건 「탈퇴한 사람이 없던 때로 간다」는 뜻이라, 그 결정을 자동으로 할 수는 없다.

-- ── 1. 막을 것이 있는지 먼저 센다 ──────────────────────────────────
do $$
declare
  r record;
  n bigint;
  msg text := '';
begin
  for r in
    select * from (values
      ('teams',         'created_by'),
      ('matches',       'created_by'),
      ('announcements', 'author_id'),
      ('polls',         'author_id')
    ) as v(tbl, col)
  loop
    execute format('select count(*) from public.%I where %I is null', r.tbl, r.col) into n;
    if n > 0 then
      msg := msg || format(E'\n    %s.%s : %s행', r.tbl, r.col, n);
    end if;
  end loop;

  if msg <> '' then
    raise exception E'null이 있어 not null을 복구할 수 없다:%\n  이 행들의 주인을 정하거나 지운 뒤 다시 실행할 것.', msg;
  end if;
end $$;

-- ── 2. set null을 떼고 not null을 되돌린다 ──────────────────────────
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
      ('polls',         'author_id',  true),
      ('payments',      'checked_by', false)   -- 원래부터 nullable이라 not null을 안 건다
    ) as v(tbl, col, restore_not_null)
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
      raise exception '%.% 의 외래키를 못 찾았다', r.tbl, r.col;
    end if;

    execute format('alter table public.%I drop constraint %I', r.tbl, con);
    -- on delete 절 없음 = NO ACTION. 마이그레이션 이전 상태가 정확히 이것이다
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references %s(id)',
      r.tbl, con, r.col, ref);

    if r.restore_not_null then
      execute format('alter table public.%I alter column %I set not null', r.tbl, r.col);
    end if;

    raise notice '% .% → 되돌림 (%)', r.tbl, r.col, con;
  end loop;
end $$;
