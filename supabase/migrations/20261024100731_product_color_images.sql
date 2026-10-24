-- Additive: existing galleries, colors, codes and orders stay unchanged.
alter table public.products add column if not exists color_images jsonb not null default '{}'::jsonb
  check (jsonb_typeof(color_images) = 'object');
