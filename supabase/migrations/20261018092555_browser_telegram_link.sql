-- Additive only: no existing products, orders, keys, or notification settings change.
begin;
create table public.telegram_links (
  browser_hash text primary key check (browser_hash ~ '^[a-f0-9]{64}$'),
  approval_hash text not null unique check (approval_hash ~ '^[a-f0-9]{64}$'),
  confirmation_code text not null check (confirmation_code ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'confirmed')),
  telegram_user_id text not null default '',
  telegram_username text not null default '',
  display_name text not null default '',
  check (expires_at > created_at and expires_at <= created_at + interval '31 minutes'),
  check (state = 'pending' or telegram_user_id ~ '^[1-9][0-9]{0,19}$')
);
create index telegram_links_expiry_idx on public.telegram_links(expires_at);
alter table public.telegram_links enable row level security;
revoke all on table public.telegram_links from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_links to service_role;
commit;
