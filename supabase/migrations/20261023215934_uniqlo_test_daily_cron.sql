-- TEST only. Requires UNIQLO_JOB_KEY in the TEST web service and an equal
-- Vault secret named burando_uniqlo_test_job_key, provisioned outside git.
-- No secret literal, customer data, or LIVE endpoint is present here.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists burando_jobs;
revoke all on schema burando_jobs from public,anon,authenticated,service_role;
create table if not exists burando_jobs.uniqlo_requests (
 request_id bigint primary key,
 created_at timestamptz not null default now()
);
alter table burando_jobs.uniqlo_requests enable row level security;
revoke all on burando_jobs.uniqlo_requests from public,anon,authenticated,service_role;
create or replace function burando_jobs.uniqlo_daily() returns bigint
language plpgsql security invoker set search_path='' as $$
declare job_key text; request_id bigint; stamp text; signed_token text;
begin
 select decrypted_secret into job_key from vault.decrypted_secrets
 where name='burando_uniqlo_test_job_key';
 if job_key is null or length(job_key)<32 then raise exception 'TEST daily credential not configured'; end if;
 stamp:=floor(extract(epoch from now()))::bigint::text;
 signed_token:='v1:'||stamp||':'||encode(extensions.hmac('uniqlo-test-daily:'||stamp,job_key,'sha256'),'hex');
 select net.http_post(
  url:='https://burando-v7-staging.onrender.com/api/internal/uniqlo/daily',
  body:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','X-Uniqlo-Job-Key',signed_token),
  timeout_milliseconds:=600000
 ) into request_id;
 insert into burando_jobs.uniqlo_requests(request_id) values(request_id);
 return request_id;
end $$;
revoke all on function burando_jobs.uniqlo_daily() from public,anon,authenticated,service_role;
select cron.schedule('burando-uniqlo-test-daily','0 21 * * *','select burando_jobs.uniqlo_daily();');
commit;
