-- Add image column to news_cache table to store Finnhub article image URLs
alter table public.news_cache add column if not exists image text;
