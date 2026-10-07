-- Offline readings upload later: let the app send when the reading actually happened.
-- p_at is optional (defaults to now) and can't be in the future.
drop function record_attempt(uuid, uuid, real, bool, jsonb);
create function record_attempt(p_student uuid, p_lesson uuid, p_score real, p_passed bool, p_result jsonb, p_at timestamptz default now())
returns int language plpgsql security invoker as $$
declare new_level int;
begin
  -- security invoker: RLS hides other teachers' rows, so this rejects them
  if not exists (select 1 from students where id = p_student)
     or not exists (select 1 from lessons where id = p_lesson) then
    raise exception 'student or lesson not found' using errcode = 'insufficient_privilege';
  end if;
  insert into attempts (student_id, lesson_id, score, passed, result, created_at)
    values (p_student, p_lesson, p_score, p_passed, p_result, least(coalesce(p_at, now()), now()));
  update students s set level = s.level + 1
    where s.id = p_student and p_passed and s.level < 5
      and s.level = (select l.level from lessons l where l.id = p_lesson)
    returning s.level into new_level;
  if new_level is null then select level into new_level from students where id = p_student; end if;
  return new_level;
end $$;
grant execute on function record_attempt to authenticated;
