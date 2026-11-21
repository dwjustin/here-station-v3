create table public.stations (
    id varchar(100) primary key check (btrim(id) <> ''),
    name varchar(100) not null check (btrim(name) <> ''),
    lines text[] not null check (
        cardinality(lines) > 0
        and array_ndims(lines) = 1
        and array_position(lines, null) is null
        and not ('' = any(lines))
    )
);

create table public.station_maps (
    id uuid primary key default gen_random_uuid(),
    station_id varchar(100) not null references public.stations(id) on delete restrict,
    version varchar(100) not null check (btrim(version) <> ''),
    storage_bucket varchar(100) not null default 'station-maps' check (btrim(storage_bucket) <> ''),
    map_path text not null check (btrim(map_path) <> ''),
    glb_path text check (glb_path is null or btrim(glb_path) <> ''),
    unique (station_id, version)
);

alter table public.stations enable row level security;
alter table public.station_maps enable row level security;
revoke all on public.stations, public.station_maps from anon, authenticated;
grant select, insert, update, delete on public.stations, public.station_maps to service_role;

insert into public.stations (id, name, lines) values
    ('ilwon', '일원', array['3']),
    ('hakyeoul', '학여울', array['3']),
    ('seongsu', '성수', array['2']),
    ('guui', '구의', array['2']),
    ('gyodae', '교대', array['2', '3']);
