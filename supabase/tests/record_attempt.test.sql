\set ON_ERROR_STOP 1
begin;
create schema t; create function t.is(got anyelement, want anyelement, msg text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FAIL: % (got %, want %)', msg, got, want; end if;
raise notice 'ok - %', msg; end $$;
grant usage on schema t to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
set local role authenticated;
insert into sections (id, grade, section) values ('10000000-0000-0000-0000-000000000001', 'Grade 1', 'A');
insert into students (id, section_id, name, level) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ana', 2);
insert into lessons (id, title, level) values
  ('30000000-0000-0000-0000-000000000001', 'L1', 1),
  ('30000000-0000-0000-0000-00000000002a', 'L2a', 2),
  ('30000000-0000-0000-0000-00000000002b', 'L2b', 2),
  ('30000000-0000-0000-0000-00000000003a', 'L3a', 3);
select t.is((record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000002a', 0.79, false, '{}', '2026-01-01T07:00:00Z')->>'level')::int, 2, 'not passed does not promote');
select t.is((record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000002a', 0.80, true, '{}', '2026-01-01T07:01:00Z')->>'level')::int, 3, 'passed promotes');
select t.is((record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000002b', 1.0, true, '{}', '2026-01-01T07:02:00Z')->>'level')::int, 3, 'second level-2 pass does not double-bump');
select t.is((record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1.0, true, '{}', '2026-01-01T07:03:00Z')->>'level')::int, 3, 'lower level pass never changes level');
select t.is((select count(*)::int from attempts), 4, 'every attempt recorded');
-- the same reading sent twice (lost reply, then re-sent from the offline queue) counts once
select t.is((record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000003a', 1.0, true, '{}', '2026-01-01T08:00:00Z')->>'level')::int, 4, 'passed promotes');
select t.is((record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000003a', 1.0, true, '{}', '2026-01-01T08:00:00Z')->>'level')::int, 4, 're-sent reading does not promote again');
select t.is((select count(*)::int from attempts), 5, 're-sent reading not stored twice');
-- RLS: another teacher sees nothing and cannot promote
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select t.is((select count(*)::int from students), 0, 'other teacher sees no students');
select t.is((select count(*)::int from lessons where teacher_id is not null), 0, 'other teacher sees no lessons');
do $$ begin
  perform record_attempt('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1.0, true, '{}');
  raise exception 'FAIL: other teacher could record an attempt';
exception when insufficient_privilege then raise notice 'ok - other teacher cannot record attempts';
end $$;
rollback;
