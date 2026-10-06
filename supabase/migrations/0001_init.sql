-- Basa reading app: schema, row-level security, level promotion.

create table sections (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  name text not null
);

create table students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  section_id uuid not null references sections on delete cascade,
  name text not null,
  level int not null default 1 check (level between 1 and 5)
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  title text not null,
  level int not null check (level between 1 and 4),
  language text not null default 'en-US',
  created_at timestamptz not null default now()
);

create table lesson_items (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons on delete cascade,
  position int not null,
  text text not null,
  image_path text,
  audio_path text
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  student_id uuid not null references students on delete cascade,
  lesson_id uuid not null references lessons on delete cascade,
  score real not null,
  passed bool not null,
  result jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table sections enable row level security;
alter table students enable row level security;
alter table lessons enable row level security;
alter table lesson_items enable row level security;
alter table attempts enable row level security;

create policy own on sections for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy own on students for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy own on lessons for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy own on attempts for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy own on lesson_items for all
  using (exists (select 1 from lessons l where l.id = lesson_id and l.teacher_id = auth.uid()))
  with check (exists (select 1 from lessons l where l.id = lesson_id and l.teacher_id = auth.uid()));

grant select, insert, update, delete on sections, students, lessons, lesson_items, attempts to authenticated;

-- Record an attempt; promote one level only when passed AND the lesson is at the
-- student's current level (so re-reads and lower levels never change it).
create function record_attempt(p_student uuid, p_lesson uuid, p_score real, p_passed bool, p_result jsonb)
returns int language plpgsql security invoker as $$
declare new_level int;
begin
  -- security invoker: RLS hides other teachers' rows, so this rejects them
  if not exists (select 1 from students where id = p_student)
     or not exists (select 1 from lessons where id = p_lesson) then
    raise exception 'student or lesson not found' using errcode = 'insufficient_privilege';
  end if;
  insert into attempts (student_id, lesson_id, score, passed, result)
    values (p_student, p_lesson, p_score, p_passed, p_result);
  update students s set level = s.level + 1
    where s.id = p_student and p_passed and s.level < 5
      and s.level = (select l.level from lessons l where l.id = p_lesson)
    returning s.level into new_level;
  if new_level is null then select level into new_level from students where id = p_student; end if;
  return new_level;
end $$;
grant execute on function record_attempt to authenticated;

-- Private bucket; each teacher reads/writes only under their own uid folder.
insert into storage.buckets (id, name, public) values ('lesson-images', 'lesson-images', false);
create policy "own folder" on storage.objects for all to authenticated
  using (bucket_id = 'lesson-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'lesson-images' and (storage.foldername(name))[1] = auth.uid()::text);
