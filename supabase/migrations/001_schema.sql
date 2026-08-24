-- ============================================================================
-- JOBASSIST DATABASE SCHEMA
-- Run this once in Supabase SQL Editor to create all tables.
-- ============================================================================

-- Stores every unique job posting found by the scraper
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  title text not null,
  location text,
  job_url text,
  posted_date date,
  source text not null,              -- 'adzuna' | 'greenhouse' | 'ashby' | 'lever'
  experience text,
  key_skills text,
  employment_type text,
  description text,
  unique_key text not null unique,   -- company+title+location, used to prevent duplicates
  created_at timestamptz default now()
);

create index if not exists idx_jobs_company on jobs (company);
create index if not exists idx_jobs_created_at on jobs (created_at);

-- One row per user, holds their resume text + parsed profile info
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  resume_text text,
  skills text[],
  years_experience int,
  target_roles text[],
  target_locations text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AI-generated match score between a user and a job
create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  score int,                          -- 0-100
  reasons text,
  strengths text,
  gaps text,
  created_at timestamptz default now(),
  unique(user_id, job_id)
);

-- User's application pipeline (Applied -> Interview -> Offer etc.)
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  stage text default 'Applied',       -- Applied, First Call, Interview, Offer, Rejected
  cover_letter text,
  applied_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security: users can only see their own profile/matches/applications.
-- Jobs table is public-read (everyone can see the job list).
alter table jobs enable row level security;
alter table profiles enable row level security;
alter table job_matches enable row level security;
alter table applications enable row level security;

create policy "jobs are viewable by everyone" on jobs for select using (true);
create policy "users manage own profile" on profiles for all using (auth.uid() = id);
create policy "users see own matches" on job_matches for all using (auth.uid() = user_id);
create policy "users manage own applications" on applications for all using (auth.uid() = user_id);
