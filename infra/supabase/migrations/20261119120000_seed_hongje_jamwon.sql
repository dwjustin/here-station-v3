insert into public.stations (id, name, lines) values
    ('hongje', '홍제', array['3']),
    ('jamwon', '잠원', array['3'])
on conflict (id) do nothing;
