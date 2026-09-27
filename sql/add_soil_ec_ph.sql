-- Existing project: bznnysiowulkxzhkcird. Add EC/pH without changing old rows.
-- DFRobot SEN0604 register reference: https://wiki.dfrobot.com/sen0604/docs/20297
begin;
create table if not exists monitor_private.ecph_program_backup (
    backup_key text primary key,
    saved_at timestamptz not null default now(),
    function_definition text not null,
    row_count bigint not null
);
alter table monitor_private.ecph_program_backup enable row level security;
revoke all on monitor_private.ecph_program_backup from public, anon, authenticated;
insert into monitor_private.ecph_program_backup (backup_key,function_definition,row_count)
select 'ecph-20260928',pg_get_functiondef('public.ingest_environment(text,jsonb)'::regprocedure),
       (select count(*) from public.environment_readings)
on conflict (backup_key) do nothing;

alter table public.environment_readings
    add column if not exists soil_ec double precision check (soil_ec between 0 and 20000),
    add column if not exists soil_ph double precision check (soil_ph between 0 and 14);

create or replace function public.ingest_environment(p_token text,p_records jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_device text;
    v_record jsonb;
    v_count integer := 0;
begin
    select device_id into v_device from monitor_private.devices
    where token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
      and enabled;
    if v_device is null then raise exception 'Invalid device token' using errcode = '28000'; end if;
    if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Expected array'; end if;
    if jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) > 100 then
        raise exception 'Batch must contain 1..100 records';
    end if;
    for v_record in select value from jsonb_array_elements(p_records) loop
        if v_record->>'device_id' is distinct from v_device or v_record->>'source' is distinct from 'hardware' then
            raise exception 'Device or source mismatch';
        end if;
        insert into public.environment_readings
            (id,device_id,timestamp,source,air_temperature,air_humidity,
             soil_temperature,soil_moisture,soil_ec,soil_ph,errors)
        values (
            (v_record->>'id')::uuid,v_device,(v_record->>'timestamp')::timestamptz,'hardware',
            (v_record->>'air_temperature')::double precision,(v_record->>'air_humidity')::double precision,
            (v_record->>'soil_temperature')::double precision,(v_record->>'soil_moisture')::double precision,
            (v_record->>'soil_ec')::double precision,(v_record->>'soil_ph')::double precision,
            coalesce(v_record->'errors','{}'::jsonb)
        ) on conflict (id) do nothing;
        v_count := v_count + 1;
    end loop;
    return v_count;
end;
$$;
revoke all on function public.ingest_environment(text,jsonb) from public;
grant execute on function public.ingest_environment(text,jsonb) to anon, authenticated;
-- New devices use this endpoint so a missing migration cannot silently drop EC/pH.
create or replace function public.ingest_environment_ecph(p_token text,p_records jsonb)
returns integer language sql security definer set search_path = '' as $$
    select public.ingest_environment(p_token,p_records);
$$;
revoke all on function public.ingest_environment_ecph(text,jsonb) from public;
grant execute on function public.ingest_environment_ecph(text,jsonb) to anon, authenticated;
notify pgrst,'reload schema';
commit;

select backup_key,saved_at,row_count from monitor_private.ecph_program_backup
where backup_key='ecph-20260928';
