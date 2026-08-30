-- 아바타 버킷 정책
--
-- 파일 경로를 `{user_id}/...`로 고정하고, 첫 폴더가 자기 uid인 파일만 쓰게 한다.
-- 이게 없으면 로그인한 아무나 남의 프로필 사진을 덮어쓸 수 있다.
--
-- 읽기는 전체 공개 — 팀원 사진은 어차피 서로 보는 것이고, 공개 버킷이라야
-- 이미지 URL을 그대로 <Image>에 넣을 수 있다(서명 URL을 매번 만들 필요가 없다).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read_all" on storage.objects;
create policy "avatars_read_all" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
