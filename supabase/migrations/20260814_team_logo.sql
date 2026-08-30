-- 팀 로고
--
-- 아바타와 버킷을 나눈 이유: 아바타 정책은 "첫 폴더 = 내 uid"로 검사한다.
-- 팀 로고는 경로가 `{teamId}/…`라 그 규칙에 걸려 무조건 거부된다.
-- 검사 기준 자체가 다르므로(내 것이냐 → 내가 이 팀 총무냐) 버킷을 따로 둔다.
alter table public.teams
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

drop policy if exists "team_logos_read_all" on storage.objects;
create policy "team_logos_read_all" on storage.objects
  for select using (bucket_id = 'team-logos');

-- 쓰기는 그 팀의 총무만. 팀원이 팀 로고를 바꾸면 안 되고,
-- 남의 팀 폴더에 올리는 것도 막아야 한다.
drop policy if exists "team_logos_write_admin" on storage.objects;
create policy "team_logos_write_admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and exists (
      select 1 from public.team_members tm
      where tm.team_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

drop policy if exists "team_logos_update_admin" on storage.objects;
create policy "team_logos_update_admin" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team-logos'
    and exists (
      select 1 from public.team_members tm
      where tm.team_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

drop policy if exists "team_logos_delete_admin" on storage.objects;
create policy "team_logos_delete_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and exists (
      select 1 from public.team_members tm
      where tm.team_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );
