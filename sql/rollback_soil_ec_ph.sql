-- Restore the ingestion function saved BEFORE add_soil_ec_ph.sql.
-- Preserve all records and the added columns; the old Pi program still works.
begin;
do $$
declare definition text;
begin
    select function_definition into definition from monitor_private.ecph_program_backup
    where backup_key='ecph-20260928';
    if definition is null then raise exception 'Missing EC/pH backup; refusing rollback'; end if;
    execute definition;
end;
$$;
notify pgrst,'reload schema';
commit;
