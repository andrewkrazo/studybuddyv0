create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  code text,
  professor text,
  term text,
  memory jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exam_dates (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  exam_date date not null,
  title text not null default 'Exam',
  created_at timestamptz not null default now()
);

create table if not exists lectures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  professor text,
  recorded_at timestamptz,
  transcript text not null,
  summary text,
  key_terms jsonb not null default '[]'::jsonb,
  artifacts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  lecture_id uuid references lectures(id) on delete cascade,
  type text not null,
  title text not null,
  status text not null default 'available',
  estimated_minutes integer not null default 10,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  lecture_id uuid references lectures(id) on delete set null,
  body text not null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists study_plans (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  exam_date date,
  plan jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists exercise_progress (
  user_id uuid not null references users(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  status text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create index if not exists courses_user_id_idx on courses(user_id);
create index if not exists lectures_course_id_idx on lectures(course_id);
create index if not exists exercises_course_id_idx on exercises(course_id);
create index if not exists exercises_lecture_id_idx on exercises(lecture_id);
create index if not exists notes_course_id_idx on notes(course_id);
create index if not exists study_plans_course_id_idx on study_plans(course_id);
