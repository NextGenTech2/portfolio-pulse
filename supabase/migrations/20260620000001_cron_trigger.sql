create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'invoke-sync-news-every-15-min',
  '*/15 * * * *',
  $$
  select
    net.http_post(
        url:='https://dkzaqjvtjromwyebrkbo.supabase.co/functions/v1/sync-news',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremFxanZ0anJvbXd5ZWJya2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3Mjc0MzEsImV4cCI6MjA5NjMwMzQzMX0.FpCCycywS5diSuZxTaPp4uqFpEBrY4blFgHbMbdaX1Y"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
