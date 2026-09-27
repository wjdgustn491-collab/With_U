-- MVP operator-managed company data. No anonymous/browser access.
-- This does not implement individual customer accounts or tenant membership.
begin;
create table if not exists public.company_workspaces (
  id uuid primary key,
  name text not null check (length(name) between 1 and 120),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.company_workspaces enable row level security;
revoke all on public.company_workspaces from anon, authenticated;
grant select, insert, update on public.company_workspaces to service_role;
notify pgrst, 'reload schema';
commit;
