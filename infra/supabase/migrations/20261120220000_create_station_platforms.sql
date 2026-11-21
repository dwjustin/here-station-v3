create table public.station_platforms (
    station_id varchar(100) not null references public.stations(id) on delete restrict,
    line_name varchar(20) not null check (btrim(line_name) <> ''),
    up_down text not null check (up_down in ('상행', '하행')),
    platform_poi_id varchar(100) not null check (btrim(platform_poi_id) <> ''),
    source text not null check (btrim(source) <> ''),
    primary key (station_id, line_name, up_down)
);

comment on table public.station_platforms is '역·호선·상하행과 보행 지도 승강장 POI의 연결';
comment on column public.station_platforms.platform_poi_id is '해당 역 지도 JSON pois의 kind=platform인 id. 지도 변경 시 함께 확인';

alter table public.station_platforms enable row level security;
revoke all on public.station_platforms from anon, authenticated;
grant select, insert, update, delete on public.station_platforms to service_role;

insert into public.stations (id, name, lines) values
    ('policehosp', '경찰병원', array['3'])
on conflict (id) do nothing;

insert into public.station_platforms (station_id, line_name, up_down, platform_poi_id, source) values
    ('hongje', '3호선', '상행', 'platform1', '기존 보행 지도의 공용 승강장 POI'),
    ('hongje', '3호선', '하행', 'platform1', '기존 보행 지도의 공용 승강장 POI'),
    ('jamwon', '3호선', '상행', 'platform2', '사용자가 확인한 기존 승강장 연결 (2026-11-20)'),
    ('jamwon', '3호선', '하행', 'platform1', '사용자가 확인한 기존 승강장 연결 (2026-11-20)'),
    ('policehosp', '3호선', '상행', 'platform1', '사용자 제공 입체도·지도 방위 추론, 사용자 적용 승인 (2026-11-20); 현장 검증 전'),
    ('policehosp', '3호선', '하행', 'platform2', '사용자 제공 입체도·지도 방위 추론, 사용자 적용 승인 (2026-11-20); 현장 검증 전')
on conflict (station_id, line_name, up_down) do nothing;
