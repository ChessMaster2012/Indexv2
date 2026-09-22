-- Index account persistence
-- Run this once in a Supabase SQL editor for your Index project.

create table if not exists public.index_accounts (
  id text primary key,
  method text not null,
  email text,
  username text,
  google_id text,
  password_hash text,
  salt text,
  first_name text not null default '',
  last_name text not null default '',
  account_data jsonb,
  account_data_blob text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists index_accounts_email_unique
  on public.index_accounts (lower(email))
  where email is not null and email <> '';

create unique index if not exists index_accounts_username_unique
  on public.index_accounts (lower(username))
  where username is not null and username <> '';

create unique index if not exists index_accounts_google_unique
  on public.index_accounts (google_id)
  where google_id is not null and google_id <> '';

alter table public.index_accounts enable row level security;

-- No public policies are created intentionally.
-- Index talks to this table server-side with the Supabase service-role key.
-- Never place the service-role key in browser JavaScript.


-- Lightweight account-state storage:
-- the Index server stores compact, compressed account JSON in account_data_blob.
-- The older account_data column is retained only for backwards compatibility.
alter table public.index_accounts add column if not exists account_data_blob text;

-- Helpful database-side size guard for the compressed payload.
alter table public.index_accounts drop constraint if exists index_account_blob_size;
alter table public.index_accounts add constraint index_account_blob_size check (account_data_blob is null or length(account_data_blob) <= 2000000);


-- Explicit privileges for the Render server's Supabase service role.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.index_accounts to service_role;
