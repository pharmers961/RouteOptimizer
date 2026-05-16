-- RouteOptimizer schema. Apply via the Supabase dashboard SQL editor or
-- `supabase db push` if you use the CLI.

create extension if not exists "pgcrypto";

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  display_name text,
  lat double precision not null,
  lon double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_addresses_user_id_idx
  on public.saved_addresses (user_id, created_at desc);

alter table public.saved_addresses enable row level security;

drop policy if exists "Users can read their own saved addresses" on public.saved_addresses;
create policy "Users can read their own saved addresses"
  on public.saved_addresses
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own saved addresses" on public.saved_addresses;
create policy "Users can insert their own saved addresses"
  on public.saved_addresses
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved addresses" on public.saved_addresses;
create policy "Users can update their own saved addresses"
  on public.saved_addresses
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved addresses" on public.saved_addresses;
create policy "Users can delete their own saved addresses"
  on public.saved_addresses
  for delete
  using (auth.uid() = user_id);

-- Enable realtime so the app's onSnapshot-equivalent (postgres_changes
-- channel) receives INSERT/UPDATE/DELETE events.
alter publication supabase_realtime add table public.saved_addresses;
