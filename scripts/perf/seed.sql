-- Phase 13: a ~20k-person Howdy for measuring (never run against dev or prod). Reproducible (setseed).
-- Communities of ~200 people (a college / a neighbourhood): most links stay inside one, a few cross.
-- Every random pick is a LATERAL subquery that mentions its outer row, so Postgres draws a fresh number per row
-- (a bare random() in a join condition is re-drawn per candidate row and matches almost nothing).
select setseed(0.1302);

insert into users (email, handle, email_verified_at, created_at)
select 'user' || n || '@perf.example', 'user' || n, now(), now() - (random() * interval '700 days')
from generate_series(1, 20000) n;

create table ix as
select row_number() over (order by handle::text collate "C") as n, id,
  (row_number() over (order by handle::text collate "C") - 1) / 200 as community
from users where email like '%@perf.example';
create index on ix (n);

insert into profiles (user_id, display_name) select id, 'Person ' || n from ix;

-- ~10 Pals each: 5 picks per person, 90% inside their community.
insert into posse_links (user_low, user_high, status, requested_by, created_at, responded_at)
select least(a.id, b.id), greatest(a.id, b.id), 'accepted', a.id, p.t, p.t
from ix a
cross join generate_series(1, 5) k
cross join lateral (
  select case when random() < 0.9 + 0 * k
    then (a.community * 200 + 1 + floor(random() * 200))::bigint
    else (1 + floor(random() * 20000))::bigint end as bn,
    now() - (random() * interval '600 days') as t
) p
join ix b on b.n = p.bn
where a.id <> b.id
on conflict do nothing;

insert into posse_links (user_low, user_high, status, requested_by)
select least(a.id, b.id), greatest(a.id, b.id), 'requested', a.id
from ix a
cross join lateral (select (a.community * 200 + 1 + floor(random() * 200))::bigint + 0 * a.n as bn) p
join ix b on b.n = p.bn
where a.n % 40 = 0 and a.id <> b.id
on conflict do nothing;

insert into user_controls (actor_id, target_id, kind)
select a.id, b.id, p.kind
from ix a
cross join lateral (
  select (1 + floor(random() * 20000))::bigint + 0 * a.n as bn,
    (array['block', 'mute', 'restrict'])[1 + floor(random() * 3)::int] as kind
) p
join ix b on b.n = p.bn
where a.n % 4 = 0 and a.id <> b.id
on conflict do nothing;

insert into scouts (scout_id, scoutee_id)
select a.id, b.id from ix a
cross join lateral (select (1 + floor(random() * 20000))::bigint + 0 * a.n as bn) p
join ix b on b.n = p.bn
where a.n % 2 = 0 and a.id <> b.id on conflict do nothing;

-- 300k Post Cards over two years: 40% on one's own Fence, the rest by someone in the same community.
insert into post_cards (fence_owner_id, author_id, body, status, created_at)
select o.id, case when p.own then o.id else w.id end, 'Howdy card ' || g,
  case when p.pub then 'published' else 'pending' end, p.at
from generate_series(1, 300000) g
cross join lateral (
  select (1 + floor(random() * 20000))::bigint + 0 * g as on_, random() < 0.4 as own, random() < 0.97 as pub,
    now() - (random() * interval '730 days') as at, floor(random() * 200)::bigint as wo
) p
join ix o on o.n = p.on_
join ix w on w.n = o.community * 200 + 1 + p.wo;

create table cx as select row_number() over () as n, id from post_cards;
create index on cx (n);

insert into card_replies (card_id, author_id, body, created_at)
select c.id, u.id, 'reply ' || g, p.at
from generate_series(1, 150000) g
cross join lateral (
  select (1 + floor(random() * 300000))::bigint + 0 * g as cn, (1 + floor(random() * 20000))::bigint as un,
    now() - (random() * interval '700 days') as at
) p
join cx c on c.n = p.cn
join ix u on u.n = p.un;

insert into yos (card_id, user_id, kind)
select c.id, u.id, p.kind
from generate_series(1, 500000) g
cross join lateral (
  select (1 + floor(random() * 300000))::bigint + 0 * g as cn, (1 + floor(random() * 20000))::bigint as un,
    (array['yo', 'laugh', 'fire', 'popcorn', 'love'])[1 + floor(random() * 5)::int] as kind
) p
join cx c on c.n = p.cn
join ix u on u.n = p.un
on conflict do nothing;

-- Chimes: 90 days' worth (the retention window), ~15 per person, a third unread.
insert into notifications (recipient_id, actor_id, type, card_id, created_at, read_at)
select r.id, a.id, p.type, case when p.type in ('card_created', 'yo_given', 'reply_created') then c.id end,
  p.at, case when p.read then p.at end
from generate_series(1, 300000) g
cross join lateral (
  select (1 + floor(random() * 20000))::bigint + 0 * g as rn, floor(random() * 200)::bigint as ao,
    (1 + floor(random() * 300000))::bigint as cn,
    (array['posse_accepted', 'card_created', 'yo_given', 'reply_created', 'mark_given', 'whisper_received'])[1 + floor(random() * 6)::int] as type,
    now() - (random() * interval '90 days') as at, random() < 0.66 as read
) p
join ix r on r.n = p.rn
join ix a on a.n = r.community * 200 + 1 + p.ao
join cx c on c.n = p.cn
where r.id <> a.id
on conflict do nothing;

-- Whispers: ~30k threads between Pals, 200k messages in the last 7 days.
insert into conversations (user_low, user_high, last_message_at)
select user_low, user_high, now() - (random() * interval '7 days')
from posse_links where status = 'accepted' and random() < 0.35
on conflict do nothing;
create table vx as select row_number() over () as n, id, user_low, user_high from conversations;
create index on vx (n);
insert into messages (conversation_id, sender_id, seq, client_id, body, created_at)
select id, sender, row_number() over (partition by id order by at), gen_random_uuid()::text, 'whisper ' || g, at
from (
  select v.id, case when p.low then v.user_low else v.user_high end as sender, g, p.at
  from generate_series(1, 200000) g
  cross join lateral (
    select (1 + floor(random() * (select count(*) from vx)))::bigint + 0 * g as vn, random() < 0.5 as low,
      now() - (random() * interval '7 days') as at
  ) p
  join vx v on v.n = p.vn
) m;
update conversations c set last_seq = m.mx, last_message_at = m.last
from (select conversation_id, max(seq) mx, max(created_at) last from messages group by 1) m
where m.conversation_id = c.id;

insert into tracks (owner_id, visitor_id, seen_on)
select o.id, v.id, p.d
from generate_series(1, 50000) g
cross join lateral (
  select (1 + floor(random() * 20000))::bigint + 0 * g as on_, floor(random() * 200)::bigint as vo,
    (now() - (random() * interval '7 days'))::date as d
) p
join ix o on o.n = p.on_
join ix v on v.n = o.community * 200 + 1 + p.vo
where o.id <> v.id on conflict do nothing;

insert into tributes (owner_id, author_id, body, status, created_at)
select user_low, user_high, 'kind words', 'published', now() - (random() * interval '700 days')
from posse_links where status = 'accepted' and random() < 0.2;

insert into marks (rater_id, target_id, kind, from_pal, created_at)
select user_low, user_high, (array['gem', 'pure', 'chill', 'sharp', 'bold'])[1 + floor(random() * 5)::int], true,
  now() - (random() * interval '700 days')
from posse_links where status = 'accepted' and random() < 0.4;

insert into town_halls (owner_id, name, description, visibility, created_at)
select id, 'Town Hall ' || n, 'About ' || n, (array['open', 'members', 'invite'])[1 + floor(random() * 3)::int],
  now() - (random() * interval '600 days')
from ix where n % 40 = 0;
insert into town_hall_members (town_hall_id, user_id, role, status)
select id, owner_id, 'owner', 'active' from town_halls;
create table hx as select row_number() over () as n, id from town_halls;
insert into town_hall_members (town_hall_id, user_id, role, status)
select h.id, u.id, 'member', 'active'
from generate_series(1, 20000) g
cross join lateral (select (1 + floor(random() * 500))::bigint + 0 * g as hn, (1 + floor(random() * 20000))::bigint as un) p
join hx h on h.n = p.hn
join ix u on u.n = p.un
on conflict do nothing;

insert into reports (reporter_id, target_user_id, reason, status, created_at)
select a.id, b.id, 'spam', p.status, p.at
from ix a
cross join lateral (
  select (1 + floor(random() * 20000))::bigint + 0 * a.n as bn,
    case when random() < 0.3 then 'open' else 'dismissed' end as status, now() - (random() * interval '300 days') as at
) p
join ix b on b.n = p.bn
where a.n % 10 = 0 and a.id <> b.id
on conflict do nothing;

insert into time_capsules (author_id, recipient_id, body, open_on, created_at)
select user_low, user_high, 'sealed', (now() + (random() * interval '700 days'))::date, now()
from posse_links where status = 'accepted' and random() < 0.05;

drop table ix;
drop table cx;
drop table vx;
drop table hx;
analyze;
