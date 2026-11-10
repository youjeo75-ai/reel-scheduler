-- Free 15-minute trigger for the publishing engine.
--
-- Vercel's Hobby plan only allows cron jobs that run once per day, so the
-- */15 schedule is driven from Supabase instead (pg_cron + pg_net, both free).
-- Run this once in the Supabase SQL editor after replacing the two placeholders.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'publish-reels',
  '*/15 * * * *',
  $$
  select net.http_get(
    url     := 'https://YOUR-APP.vercel.app/api/cron/publish',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);

-- Inspect runs:   select * from cron.job_run_details order by start_time desc limit 20;
-- Remove the job: select cron.unschedule('publish-reels');
