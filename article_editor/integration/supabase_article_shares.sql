-- 보관함 기사 공유(보기·가져오기). Supabase SQL Editor 에서 한 번 실행한다. 기존 객체는 지우지 않는다.
--
-- article_shares        : 기사 하나당 공유 하나(소유자만 직접 읽고 쓴다). sealed = 공유본 암호문(base64).
-- article_share_members : 이메일로 초대한 사람과 권한(viewer=보기, importer=보기+내 보관함으로 가져오기).
-- 받는 사람은 표를 직접 읽지 못하고 아래 함수(security definer)로만 자기에게 허락된 공유를 읽는다.
-- 암호문의 키는 우리 백엔드가 공유마다 파생해 준다(/ai/share-key) — 백엔드는 article_share_role 로 권한을 확인한 뒤에만 준다.
--
-- 초대는 로그인 이메일(auth.jwt() 의 email)로 맞춘다. Supabase Auth 의 이메일 확인이 꺼져 있으면
-- 아직 가입하지 않은 주소로 누군가 먼저 가입해 초대를 받을 수 있으니, 운영에서는 이메일 확인을 켜거나 백엔드 ALLOWED_EMAILS 로 계정을 제한한다.

create table if not exists public.article_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email text not null default coalesce(auth.jwt() ->> 'email', ''),
  article_id text not null check (article_id ~ '^[a-f0-9]{32}$'),
  title text not null default '' check (char_length(title) <= 500),
  sealed text not null default '' check (octet_length(sealed) <= 14000000),
  -- 링크 토큰(무작위 64자). 소유자만 읽을 수 있다(링크 다시 복사용)
  link_token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  general_access text not null default 'restricted' check (general_access in ('restricted', 'link')),
  link_role text not null default 'viewer' check (link_role in ('viewer', 'importer')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, article_id)
);

create table if not exists public.article_share_members (
  share_id uuid not null references public.article_shares(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  role text not null default 'viewer' check (role in ('viewer', 'importer')),
  created_at timestamptz not null default now(),
  primary key (share_id, email)
);

create or replace function public.article_shares_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.owner_id := old.owner_id;  -- 소유자·링크 토큰은 바꿀 수 없다
  new.link_token := old.link_token;
  return new;
end $$;
drop trigger if exists article_shares_touch on public.article_shares;
create trigger article_shares_touch before update on public.article_shares for each row execute function public.article_shares_touch();

alter table public.article_shares enable row level security;
alter table public.article_share_members enable row level security;

create policy "article_shares_owner_select" on public.article_shares for select to authenticated using (owner_id = (select auth.uid()));
create policy "article_shares_owner_insert" on public.article_shares for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "article_shares_owner_update" on public.article_shares for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "article_shares_owner_delete" on public.article_shares for delete to authenticated using (owner_id = (select auth.uid()));

create policy "article_share_members_owner_all" on public.article_share_members for all to authenticated
  using (exists (select 1 from public.article_shares s where s.id = share_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.article_shares s where s.id = share_id and s.owner_id = (select auth.uid())));

-- 지금 로그인한 사람의 권한: owner | importer | viewer | null(권한 없음·만료)
-- 초대 권한과 링크 권한이 둘 다 맞으면 더 넓은 쪽(importer)을 준다.
create or replace function public.article_share_role(p_share uuid, p_token text default null)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when s.owner_id = auth.uid() then 'owner'
    when s.expires_at is not null and s.expires_at <= now() then null
    when m.role = 'importer' or (s.general_access = 'link' and p_token = s.link_token and s.link_role = 'importer') then 'importer'
    when m.role = 'viewer' or (s.general_access = 'link' and p_token = s.link_token) then 'viewer'
  end
  from public.article_shares s
  left join public.article_share_members m on m.share_id = s.id and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  where s.id = p_share
$$;

-- 공유 하나 열기(공유 id 또는 링크 토큰) → 권한이 있으면 한 줄, 없으면 빈 결과
create or replace function public.article_share_open(p_share uuid default null, p_token text default null)
returns table (id uuid, title text, owner_email text, role text, sealed text, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.owner_email, r.role, s.sealed, s.updated_at, s.expires_at
  from public.article_shares s
  cross join lateral (select public.article_share_role(s.id, p_token) as role) r
  where (s.id = p_share or (p_share is null and p_token is not null and s.link_token = p_token))
    and r.role is not null
$$;

-- 나에게(내 로그인 이메일로) 초대된 공유 목록
create or replace function public.article_shares_received()
returns table (id uuid, title text, owner_email text, role text, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.owner_email, m.role, s.updated_at, s.expires_at
  from public.article_share_members m
  join public.article_shares s on s.id = m.share_id
  where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and s.owner_id <> auth.uid()
    and (s.expires_at is null or s.expires_at > now())
  order by s.updated_at desc
$$;

revoke all on function public.article_share_role(uuid, text) from public, anon;
revoke all on function public.article_share_open(uuid, text) from public, anon;
revoke all on function public.article_shares_received() from public, anon;
grant execute on function public.article_share_role(uuid, text) to authenticated;
grant execute on function public.article_share_open(uuid, text) to authenticated;
grant execute on function public.article_shares_received() to authenticated;
