-- Remember each student's previous level. A trigger fills it on every level change
-- (automatic move-up after a reading, or a teacher changing it), so the app never has to.
alter table students add column prev_level int check (prev_level between 1 and 5);

create function remember_prev_level() returns trigger language plpgsql as $$
begin
  if new.level is distinct from old.level then new.prev_level := old.level; end if;
  return new;
end $$;

create trigger students_prev_level before update of level on students
  for each row execute function remember_prev_level();
