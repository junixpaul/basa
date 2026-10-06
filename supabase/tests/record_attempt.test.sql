\set ON_ERROR_STOP 1
begin;
create schema t; create function t.is(got anyelement, want anyelement, msg text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FAIL: % (got %, want %)', msg, got, want; end if;
raise notice 'ok - %', msg; end $$;
grant usage on schema t to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
set local role authenticated;
insert into sections (id, name) values ('10000000-0000-0000-0000-000000000001', 'G1');
insert into students (id, section_id, name, level) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ana', 2);
insert into lessons (id, title, level) values
  ('30000000-0000-0000-0000-000000000001', 'L1', 1),
  ('30000000-0000-0000-0000-00000000002a', 'L2a', 2),
  ('30000000-0000-0000-0000-00000000002b', 'L2b', 2);
select t.is(record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000002a', 0.79, false, '{}'), 2, 'not passed does not promote');
select t.is(record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000002a', 0.80, true, '{}'), 3, 'passed promotes');
select t.is(record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000002b', 1.0, true, '{}'), 3, 'second level-2 pass does not double-bump');
select t.is(record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1.0, true, '{}'), 3, 'lower level pass never changes level');
select t.is((select count(*)::int from attempts), 4, 'every attempt recorded');
-- RLS: another teacher sees nothing and cannot promote
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select t.is((select count(*)::int from students), 0, 'other teacher sees no students');
select t.is((select count(*)::int from lessons), 0, 'other teacher sees no lessons');
rollback;
