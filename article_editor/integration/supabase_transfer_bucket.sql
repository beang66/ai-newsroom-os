-- 다른 PC로 이전(서버 경유)용 비공개 저장 공간. Supabase SQL Editor 에서 한 번 실행한다. 기존 객체는 지우지 않는다.
-- 이 버킷은 두 기능이 함께 쓴다: 이전 마법사(<user id>/transfer.db)와 작성 중 기사 서버 백업(<user id>/backups/<기사 id>.enc).
-- 앱은 사용자 JWT 로만 접근하고, 계정마다 자기 폴더(<user id>/transfer.db) 한 칸만 읽고 쓴다.
-- 파일은 앱이 일회용 코드로 암호화한 암호문이다(서버에는 코드가 없다).
-- file_size_limit 50MB 는 무료 플랜의 파일당 한도와 같다(앱도 이보다 크면 서버로 보내지 않는다).
insert into storage.buckets (id, name, public, file_size_limit)
values ('transfers', 'transfers', false, 52428800)
on conflict (id) do nothing;

create policy "transfers_owner_read" on storage.objects for select to authenticated
using (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "transfers_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- 같은 이름으로 다시 올릴 때(덮어쓰기)는 update 권한이 필요하다
create policy "transfers_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "transfers_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid()::text));
