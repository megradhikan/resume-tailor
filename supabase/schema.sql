-- Resume Tailor schema
-- Run this in the Supabase SQL editor (supabase.com → project → SQL editor)

-- Applications: one row per resume+JD analysis run
create table if not exists applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  company      text,
  role         text,
  date         timestamptz default now(),
  ats_score    float not null,
  seniority_match text not null,
  jd_summary   text,
  job_description text,
  resume_text  text,
  status       text not null default 'saved'
                 check (status in ('saved','applied','interviewing','rejected','offer')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Rewrite decisions: accept/reject per suggestion per application
create table if not exists rewrite_decisions (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid references applications(id) on delete cascade not null,
  suggestion_index int not null,
  section         text,
  original_line   text,
  suggested_line  text,
  accepted        boolean not null,
  created_at      timestamptz default now()
);

-- Row-level security: users only see their own data
alter table applications enable row level security;
alter table rewrite_decisions enable row level security;

create policy "users read own applications"
  on applications for select
  using (auth.uid() = user_id);

create policy "users insert own applications"
  on applications for insert
  with check (auth.uid() = user_id);

create policy "users update own applications"
  on applications for update
  using (auth.uid() = user_id);

create policy "users delete own applications"
  on applications for delete
  using (auth.uid() = user_id);

create policy "users read own decisions"
  on rewrite_decisions for select
  using (
    application_id in (
      select id from applications where user_id = auth.uid()
    )
  );

create policy "users insert own decisions"
  on rewrite_decisions for insert
  with check (
    application_id in (
      select id from applications where user_id = auth.uid()
    )
  );

create policy "users delete own decisions"
  on rewrite_decisions for delete
  using (
    application_id in (
      select id from applications where user_id = auth.uid()
    )
  );

-- Index for fast per-user lookups
create index if not exists applications_user_id_idx on applications(user_id);
create index if not exists rewrite_decisions_application_id_idx on rewrite_decisions(application_id);
