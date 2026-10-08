-- Archive instead of delete: "Remove"/"Delete" set archived_at; the Archive page can restore or delete forever.
alter table sections add column archived_at timestamptz;
alter table students add column archived_at timestamptz;
alter table lessons add column archived_at timestamptz;

-- an archived class must not block making a new class with the same name
drop index sections_unique;
create unique index sections_unique on sections (teacher_id, grade, lower(btrim(section))) where archived_at is null;
