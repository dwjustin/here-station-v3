begin;

do $$
declare
    test_station_id text := 'schema-test-' || gen_random_uuid()::text;
    test_map_id uuid;
begin
    insert into public.stations (id, name, lines)
    values (test_station_id, '테스트 역', array['2', '3']);

    insert into public.station_maps (station_id, version, map_path)
    values (test_station_id, 'v1', 'test/map.json')
    returning id into test_map_id;

    assert exists (
        select 1 from public.station_maps
        where id = test_map_id and storage_bucket = 'station-maps' and glb_path is null
    ), 'Map defaults must be valid';

    begin
        insert into public.station_maps (station_id, version, map_path)
        values ('missing-' || gen_random_uuid()::text, 'v1', 'test/missing.json');
        raise exception 'A map must reference an existing station';
    exception when foreign_key_violation then null;
    end;

    begin
        insert into public.station_maps (station_id, version, map_path)
        values (test_station_id, 'v1', 'test/duplicate.json');
        raise exception 'A station cannot have duplicate map versions';
    exception when unique_violation then null;
    end;

    begin
        delete from public.stations where id = test_station_id;
        raise exception 'Deleting a station with maps must be blocked';
    exception when foreign_key_violation then null;
    end;

    begin
        insert into public.station_maps (station_id, version, map_path)
        values (test_station_id, 'v2', '');
        raise exception 'An empty map path must be rejected';
    exception when check_violation then null;
    end;

    assert (select relrowsecurity from pg_class where oid = 'public.stations'::regclass);
    assert (select relrowsecurity from pg_class where oid = 'public.station_maps'::regclass);
    assert not has_table_privilege('anon', 'public.stations', 'select');
    assert not has_table_privilege('authenticated', 'public.station_maps', 'select');
    assert has_table_privilege('service_role', 'public.stations', 'select');
    assert has_table_privilege('service_role', 'public.station_maps', 'select');
end;
$$;

rollback;
select 'PASS: station/map constraints and access permissions' as result;
