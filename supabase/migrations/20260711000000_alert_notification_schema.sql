-- LEAN ARCHITECTURE FOR MVP ALERTS

-- 1. Upgraded News Articles Table
create table if not exists public.news_articles (
  id text primary key, -- URL hash or event hash
  event_hash text unique not null, -- For deduplication across sources
  headline text not null,
  summary text,
  source text,
  url text not null,
  language text default 'en',
  image_url text,
  author text,
  sentiment text,
  mentioned_symbols text[] default '{}'::text[],
  mentioned_people text[] default '{}'::text[],
  mentioned_sectors text[] default '{}'::text[],
  categories text[] default '{}'::text[],
  published_at timestamp with time zone not null,
  ingested_at timestamp with time zone default timezone('utc'::text, now()) not null,
  processed_at timestamp with time zone
);

create index if not exists idx_news_articles_event_hash on public.news_articles(event_hash);
create index if not exists idx_news_articles_published_at on public.news_articles(published_at desc);

-- Add FTS index on headline and summary
alter table public.news_articles add column if not exists fts tsvector 
  generated always as (setweight(to_tsvector('english', coalesce(headline, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B')) stored;

create index if not exists idx_news_articles_fts on public.news_articles using gin (fts);

alter table public.news_articles enable row level security;
drop policy if exists "Anyone can read news articles" on public.news_articles;
create policy "Anyone can read news articles" on public.news_articles for select using (true);

-- 2. User Alert Rules (Custom Alerts)
create table if not exists public.user_alert_rules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  keywords text[] not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_user_alert_rules_user on public.user_alert_rules(user_id);

alter table public.user_alert_rules enable row level security;
drop policy if exists "Users can manage alert rules" on public.user_alert_rules;
create policy "Users can manage alert rules" on public.user_alert_rules for all using (auth.uid() = user_id);

-- 3. Notifications (In-app inbox)
DO $$ BEGIN
    CREATE TYPE public.notification_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.notification_type AS ENUM ('PORTFOLIO', 'CUSTOM', 'MARKET', 'SYSTEM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null,
  summary text,
  stock_symbol text,
  source text,
  action_url text,
  importance integer check (importance >= 1 and importance <= 10),
  severity public.notification_severity not null,
  categories text[] default '{}'::text[],
  reasoning jsonb default '{}'::jsonb,
  expires_at timestamp with time zone,
  is_read boolean default false,
  clicked_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  delivered_at timestamp with time zone,
  push_sent boolean default false,
  push_clicked boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_unread on public.notifications(user_id) where is_read = false;
create index if not exists idx_notifications_expires on public.notifications(expires_at) where expires_at is not null;

alter table public.notifications enable row level security;
drop policy if exists "Users can manage notifications" on public.notifications;
create policy "Users can manage notifications" on public.notifications for all using (auth.uid() = user_id);

-- 4. Push Subscriptions
create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "Users can manage push subscriptions" on public.push_subscriptions;
create policy "Users can manage push subscriptions" on public.push_subscriptions for all using (auth.uid() = user_id);

-- 5. Helper function to find users holding a symbol
create or replace function public.get_users_holding(search_symbol text)
returns table(id uuid) as $$
begin
  return query
  select p.id
  from public.profiles p, unnest(p.holdings) as h
  where h ilike search_symbol || '.%';
end;
$$ language plpgsql security definer;
