-- AI Chat Hub additive Phase 1 schema.
-- Apply to O-Agent Postgres after owner_id/auth model is finalized.

create table if not exists public.channels (
  id text primary key,
  owner_id uuid,
  name text not null,
  provider text not null check (provider in ('facebook', 'line')),
  status text not null check (status in ('connected', 'pending', 'error', 'disabled')),
  webhook_url text not null,
  token_secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flows (
  id text primary key,
  owner_id uuid,
  name text not null,
  status text not null check (status in ('active', 'inactive', 'draft')),
  channel_provider text check (channel_provider in ('facebook', 'line', 'manual')),
  graph jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id text primary key,
  owner_id uuid,
  conversation_id text not null,
  message_id text,
  score integer not null check (score between 1 and 10),
  risk text not null check (risk in ('low', 'medium', 'high')),
  reasoning text not null,
  suggestion text not null,
  status text not null check (status in ('pass', 'fail')),
  created_at timestamptz not null default now()
);

create table if not exists public.flow_runs (
  id text primary key,
  owner_id uuid,
  flow_id text references public.flows(id),
  conversation_id text not null,
  status text not null check (status in ('running', 'passed', 'blocked', 'failed')),
  steps jsonb not null default '[]'::jsonb,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.channels enable row level security;
alter table public.flows enable row level security;
alter table public.reviews enable row level security;
alter table public.flow_runs enable row level security;

create index if not exists idx_reviews_conversation_created on public.reviews(conversation_id, created_at desc);
create index if not exists idx_flow_runs_conversation_created on public.flow_runs(conversation_id, created_at desc);
create index if not exists idx_channels_owner_provider on public.channels(owner_id, provider);
