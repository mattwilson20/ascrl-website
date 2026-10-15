-- Hosted Supabase maintenance; requires database administrator privileges.
-- Separate from portable application migrations because pg_cron is provider-specific.
-- The named job is upserted, so reapplying does not create duplicate jobs.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'ascrl-expire-import-previews',
  '0 * * * *',
  $$update public.rc_imports
    set payload = null, status = 'expired'
    where status = 'preview' and expires_at < now();$$
);

-- Published results, original classifications, hashes, and audit records remain intact.
