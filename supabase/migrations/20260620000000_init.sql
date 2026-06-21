-- 1. Create Profiles Table (User Holdings)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  holdings text[] default '{}'::text[],
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Profiles
alter table public.profiles enable row level security;

-- Drop policies if they exist to avoid migration errors
drop policy if exists "Users can view their own profile." on public.profiles;
drop policy if exists "Users can update their own profile." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;

create policy "Users can view their own profile." on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

-- Trigger: Automatically create profile on Auth Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, holdings)
  values (new.id, new.email, '{}'::text[])
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists to recreate it cleanly
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Create News Cache Table
create table if not exists public.news_cache (
  id bigint primary key, -- Finnhub Article ID
  headline text not null,
  summary text,
  source text,
  url text,
  datetime bigint not null,
  related text,
  category text,
  fetched_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for News Cache
alter table public.news_cache enable row level security;

-- Drop policy if exists to avoid migration errors
drop policy if exists "Authenticated users can read cached news" on public.news_cache;

-- Only authenticated users can read cached news. Write access is restricted to service_role / edge function.
create policy "Authenticated users can read cached news" on public.news_cache
  for select to authenticated using (true);
