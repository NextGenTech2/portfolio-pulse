alter table public.profiles add column if not exists saved_articles bigint[] default '{}'::bigint[];
