-- Course details shown in the library, plus publication state.
-- "professor" stays as the instructor name column for compatibility;
-- the app treats it as a generic teacher/professor/instructor name.

alter table courses add column if not exists school text not null default '';
alter table courses add column if not exists section text not null default '';
alter table courses add column if not exists instructor_bio text not null default '';
alter table courses add column if not exists description text not null default '';
alter table courses add column if not exists cover_image_url text not null default '';
alter table courses add column if not exists status text not null default 'draft';
alter table courses add column if not exists published_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_status_check') then
    alter table courses add constraint courses_status_check check (status in ('draft', 'published'));
  end if;
end $$;

create index if not exists courses_status_idx on courses(status);
