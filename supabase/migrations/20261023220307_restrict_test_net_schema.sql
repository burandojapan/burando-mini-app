-- Best effort: Supabase-admin managed grants may remain on hosted net.
-- Credential isolation relies on private burando_jobs and Vault, not net usage.
-- The TEST cron executes as its database owner, not a client-facing role.
revoke usage on schema net from public,anon,authenticated;
