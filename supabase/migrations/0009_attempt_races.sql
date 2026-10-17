-- Races in record_attempt:
-- 1. Two readings for one student at once (two tabs/devices, or an upload retry) both read the old level and
--    both promote, skipping a step. `for update` makes the second call wait for the first.
-- 2. A reading sent twice (reply lost on a weak signal, then re-sent from the offline queue) counted twice.
--    Each reading carries its own p_at, so the same student + lesson + time is the same reading: skip it.
create or replace function record_attempt(p_student uuid, p_lesson uuid, p_score real, p_passed bool, p_result jsonb, p_at timestamptz default now())
returns jsonb language plpgsql security invoker as $$
declare st students; ls lessons; next_fam int; at timestamptz := least(coalesce(p_at, now()), now());
begin
  -- security invoker: RLS hides other teachers' rows, so this rejects them
  select * into st from students where id = p_student for update;
  select * into ls from lessons where id = p_lesson;
  if st.id is null or ls.id is null then
    raise exception 'student or lesson not found' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from attempts where student_id = p_student and lesson_id = p_lesson and created_at = at) then
    return jsonb_build_object('level', st.level, 'family_no', st.family_no);
  end if;
  insert into attempts (student_id, lesson_id, score, passed, result, created_at)
    values (p_student, p_lesson, p_score, p_passed, p_result, at);
  if p_passed and st.level < 5 and ls.level = st.level and coalesce(ls.family_no, st.family_no) = st.family_no then
    if st.level < 4 then
      update students set level = level + 1 where id = p_student;
    else
      select min(family_no) into next_fam from lessons where family_no > st.family_no;
      if next_fam is null then update students set level = 5 where id = p_student;
      else update students set family_no = next_fam, level = 1 where id = p_student; end if;
    end if;
  end if;
  return (select jsonb_build_object('level', level, 'family_no', family_no) from students where id = p_student);
end $$;

-- Every attempts read filters by teacher (RLS) or student and sorts by time; without these each one scans the whole table.
create index if not exists attempts_student on attempts (student_id, created_at);
create index if not exists attempts_teacher on attempts (teacher_id);
