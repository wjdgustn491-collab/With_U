-- Company accounts, administrator-only device assignment and server sessions.
begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.withu_accounts (
 id uuid primary key default gen_random_uuid(), username text unique not null,
 password_hash text not null, role text not null check(role in ('admin','company')),
 company_id uuid unique references public.company_workspaces(id),
 check ((role='company' and company_id is not null) or (role='admin' and company_id is null))
);
create table if not exists public.withu_sessions (
 token_hash text primary key check(length(token_hash)=64), account_id uuid not null references public.withu_accounts(id) on delete cascade,
 expires_at timestamptz not null
);
create index if not exists withu_session_expiry on public.withu_sessions(expires_at);
create table if not exists public.withu_auth_attempts(client_hash text primary key, window_start timestamptz not null, attempts integer not null);
create table if not exists public.company_devices (
 device_id text primary key check(device_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 company_id uuid not null references public.company_workspaces(id), assigned_at timestamptz not null default now()
);
create index if not exists company_device_owner on public.company_devices(company_id);
-- Existing administrator is seeded once. No administrator signup or role promotion endpoint.
insert into public.withu_accounts(username,password_hash,role)
values('admin',extensions.crypt('1234',extensions.gen_salt('bf',10)),'admin') on conflict(username) do nothing;
create or replace function public.withu_authenticate(p_action text,p_username text,p_password text,p_name text,p_boundary text,p_session_hash text,p_client_hash text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare u public.withu_accounts; c uuid; counter integer; dummy text;
begin
 if p_action not in ('signup','login','admin-login') or p_username !~ '^[a-z0-9][a-z0-9_.-]{2,49}$' or octet_length(p_password)>72 or length(p_password)<1 or p_session_hash !~ '^[a-f0-9]{64}$' or p_client_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status',400); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_hash,0));
 insert into public.withu_auth_attempts values(p_client_hash,now(),1)
 on conflict(client_hash) do update set attempts=case when withu_auth_attempts.window_start < now()-interval '15 minutes' then 1 else withu_auth_attempts.attempts+1 end,
 window_start=case when withu_auth_attempts.window_start < now()-interval '15 minutes' then now() else withu_auth_attempts.window_start end
 returning attempts into counter;
 if counter>20 then return jsonb_build_object('status',429); end if;
 if p_action='signup' then
  if p_username='admin' or length(p_password)<8 or coalesce(length(btrim(p_name)),0) not between 1 and 120 or coalesce(length(btrim(p_boundary)),0) not between 1 and 500 then return jsonb_build_object('status',400); end if;
  perform pg_advisory_xact_lock(hashtextextended('username:'||p_username,0));
  if exists(select 1 from public.withu_accounts where username=p_username) then return jsonb_build_object('status',409); end if;
  c=gen_random_uuid();
  insert into public.company_workspaces(id,name,document) values(c,p_name,jsonb_build_object('version',1,'id',c,'name',p_name,'boundary',p_boundary,'emissions','[]'::jsonb,'credits','[]'::jsonb,'surveys','[]'::jsonb,'reports','[]'::jsonb));
  insert into public.withu_accounts(username,password_hash,role,company_id) values(p_username,extensions.crypt(p_password,extensions.gen_salt('bf',10)),'company',c) returning * into u;
 else
  select * into u from public.withu_accounts where username=p_username;
  select password_hash into dummy from public.withu_accounts where username='admin';
  if extensions.crypt(p_password,coalesce(u.password_hash,dummy)) is distinct from u.password_hash or u.id is null or (p_action='admin-login')<>(u.role='admin') then return jsonb_build_object('status',401); end if;
 end if;
 delete from public.withu_sessions where expires_at<now();
 insert into public.withu_sessions values(p_session_hash,u.id,now()+interval '8 hours');
 return jsonb_build_object('status',200,'user',jsonb_build_object('id',u.id,'username',u.username,'role',u.role,'company_id',u.company_id));
end $$;
alter table public.withu_accounts enable row level security;
alter table public.withu_sessions enable row level security;
alter table public.withu_auth_attempts enable row level security;
alter table public.company_devices enable row level security;
revoke all on public.withu_accounts,public.withu_sessions,public.withu_auth_attempts,public.company_devices from anon,authenticated;
grant select,insert,update,delete on public.withu_accounts,public.withu_sessions,public.withu_auth_attempts,public.company_devices to service_role;
revoke all on function public.withu_authenticate(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.withu_authenticate(text,text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
