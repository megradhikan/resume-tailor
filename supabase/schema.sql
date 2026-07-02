-- Resume Tailor schema
-- Run this in the Supabase SQL editor (supabase.com → project → SQL editor)

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  company         text,
  role            text,
  ats_score       float not null check (ats_score >= 0 and ats_score <= 100),
  seniority_match text not null,
  jd_summary      text,
  job_description text,
  resume_text     text,
  status          text not null default 'saved'
                    check (status in ('saved','applied','interviewing','rejected','offer')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists rewrite_decisions (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid references applications(id) on delete cascade not null,
  suggestion_index int not null check (suggestion_index >= 0),
  section          text,
  original_line    text,
  suggested_line   text,
  accepted         boolean not null,
  created_at       timestamptz not null default now()
);

-- ── Auto-update trigger for updated_at ───────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_set_updated_at on applications;
create trigger applications_set_updated_at
  before update on applications
  for each row execute function set_updated_at();

-- ── Row-level security ───────────────────────────────────────────────────────

alter table applications enable row level security;
alter table rewrite_decisions enable row level security;

-- Applications: full CRUD scoped to authenticated owner
create policy "users select own applications"
  on applications for select
  using (auth.uid() = user_id);

create policy "users insert own applications"
  on applications for insert
  with check (auth.uid() = user_id);

create policy "users update own applications"
  on applications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own applications"
  on applications for delete
  using (auth.uid() = user_id);

-- Rewrite decisions: scoped via parent application ownership
-- Use EXISTS instead of IN for index-friendly evaluation at scale
create policy "users select own decisions"
  on rewrite_decisions for select
  using (
    exists (
      select 1 from applications
      where applications.id = rewrite_decisions.application_id
        and applications.user_id = auth.uid()
    )
  );

create policy "users insert own decisions"
  on rewrite_decisions for insert
  with check (
    exists (
      select 1 from applications
      where applications.id = rewrite_decisions.application_id
        and applications.user_id = auth.uid()
    )
  );

create policy "users update own decisions"
  on rewrite_decisions for update
  using (
    exists (
      select 1 from applications
      where applications.id = rewrite_decisions.application_id
        and applications.user_id = auth.uid()
    )
  );

create policy "users delete own decisions"
  on rewrite_decisions for delete
  using (
    exists (
      select 1 from applications
      where applications.id = rewrite_decisions.application_id
        and applications.user_id = auth.uid()
    )
  );

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists applications_user_id_idx
  on applications(user_id);

create index if not exists rewrite_decisions_application_id_idx
  on rewrite_decisions(application_id);
