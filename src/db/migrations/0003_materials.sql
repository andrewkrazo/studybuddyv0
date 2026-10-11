-- Uploaded course files and the text passages extracted from them.
-- source_segments is what the Class AI searches and cites.

create table if not exists materials (
  id uuid primary key,
  course_id uuid not null references courses(id) on delete cascade,
  kind text not null check (kind in ('syllabus', 'slides', 'notes', 'cover')),
  filename text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  storage_key text not null,
  status text not null check (status in ('ready', 'no_text')),
  status_detail text not null default '',
  page_count integer,
  segment_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists materials_course_id_idx on materials(course_id);

create table if not exists source_segments (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  ordinal integer not null,
  text text not null,
  location jsonb not null default '{}'::jsonb,
  citation text not null,
  search tsvector generated always as (to_tsvector('english', text)) stored
);

create index if not exists source_segments_course_id_idx on source_segments(course_id);
create index if not exists source_segments_material_id_idx on source_segments(material_id);
create index if not exists source_segments_search_idx on source_segments using gin(search);
