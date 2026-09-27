-- Apply once to the existing carboncredit Supabase project.
-- Only the registered device token may ingest GPS fixes; admins use the
-- Vercel server API, whose service key must never enter browser code.
begin;
create table if not exists public.device_locations (
  device_id text primary key,
  latitude double precision not null check (latitude between -85 and 85),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null check (source in ('gpsd','admin')),
  accuracy_m double precision check (accuracy_m between 0 and 10000),
  updated_at timestamptz not null default now()
);
alter table public.device_locations enable row level security;
revoke all on public.device_locations from anon, authenticated;
grant select, insert, update on public.device_locations to service_role;
create or replace function public.ingest_device_location(
  p_token text, p_latitude double precision, p_longitude double precision,
  p_accuracy_m double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_device text;
begin
  select device_id into v_device from monitor_private.devices
  where token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
    and enabled;
  if v_device is null then raise exception 'Invalid device token' using errcode = '28000'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -85 and 85
    or p_longitude not between -180 and 180 or
    (p_accuracy_m is not null and p_accuracy_m not between 0 and 10000) then
    raise exception 'Invalid GPS fix';
  end if;
  insert into public.device_locations(device_id,latitude,longitude,source,accuracy_m,updated_at)
  values(v_device,p_latitude,p_longitude,'gpsd',p_accuracy_m,now())
  on conflict(device_id) do update set latitude=excluded.latitude,
    longitude=excluded.longitude,source=excluded.source,
    accuracy_m=excluded.accuracy_m,updated_at=excluded.updated_at
  where power((excluded.latitude-public.device_locations.latitude)*111320,2) +
    power((excluded.longitude-public.device_locations.longitude)*111320*
      cos(radians(public.device_locations.latitude)),2) >= 225;
end;
$$;
revoke all on function public.ingest_device_location(text,double precision,double precision,double precision) from public;
grant execute on function public.ingest_device_location(text,double precision,double precision,double precision) to anon, authenticated;
notify pgrst, 'reload schema';
commit;

