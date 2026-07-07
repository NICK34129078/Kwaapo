-- Per-item read state for query-based social activity feed.

create table if not exists public.activity_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_key text not null,
  read_at timestamptz not null default now(),
  constraint activity_reads_user_key_unique unique (user_id, activity_key)
);

create index if not exists activity_reads_user_read_idx
  on public.activity_reads (user_id, read_at desc);

comment on table public.activity_reads is
  'Gelezen social activity items (likes, follows, comments, follow requests).';

alter table public.activity_reads enable row level security;

drop policy if exists "Users read own activity reads" on public.activity_reads;
create policy "Users read own activity reads"
  on public.activity_reads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own activity reads" on public.activity_reads;
create policy "Users insert own activity reads"
  on public.activity_reads
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own activity reads" on public.activity_reads;
create policy "Users update own activity reads"
  on public.activity_reads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
