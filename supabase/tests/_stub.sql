-- Minimal Supabase stand-ins so migrations run on plain Postgres (tests only).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public bool);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable
  as $$ select string_to_array(name, '/') $$;
