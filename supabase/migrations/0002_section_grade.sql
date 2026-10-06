-- Split a class into grade level + section, both required, unique per teacher.
-- name stays as the display label ("Grade 1 – Sampaguita") so other pages keep working.
alter table sections drop column name;
alter table sections
  add column grade text not null check (btrim(grade) <> ''),
  add column section text not null check (btrim(section) <> ''),
  add column name text generated always as (grade || ' – ' || section) stored;
-- case/space-insensitive: "sampaguita " and "Sampaguita" are the same section
create unique index sections_unique on sections (teacher_id, grade, lower(btrim(section)));
