-- =============================================================================
-- 0052_contact_messages.sql
-- Helpdesk / contact form submissions (inserted via Edge Function service role).
-- =============================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  email text not null,
  phone text not null,
  message text not null,
  word_count integer not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  sent_to_email_at timestamptz null,
  error_message text null,
  constraint contact_messages_status_check check (
    status in ('new', 'sent', 'error')
  ),
  constraint contact_messages_word_count_check check (word_count >= 0)
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

comment on table public.contact_messages is
  'Contactformulier via Helpdesk. Alleen service_role (Edge Function) mag schrijven; geen client SELECT.';

alter table public.contact_messages enable row level security;

-- Geen policies voor authenticated/anon: alleen service_role bypassed RLS.
