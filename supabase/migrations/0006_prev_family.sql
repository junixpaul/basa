-- Prev level also remembers the family, so "Prev level" can show e.g. "Level 1 (-at) · Short Story".
alter table students add column prev_family_no int;

create or replace function remember_prev_level() returns trigger language plpgsql as $$
begin
  if new.level is distinct from old.level or new.family_no is distinct from old.family_no then
    new.prev_level := old.level; new.prev_family_no := old.family_no;
  end if;
  return new;
end $$;

drop trigger students_prev_level on students;
create trigger students_prev_level before update of level, family_no on students
  for each row execute function remember_prev_level();
