-- Stripe Checkout session tracking (test/live via Worker secrets).

alter table public.orders
  add column if not exists stripe_checkout_session_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists paid_at timestamptz null;

create index if not exists orders_stripe_checkout_session_idx
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on column public.orders.stripe_checkout_session_id is
  'Stripe Checkout Session id (cs_...) for payment confirmation.';

comment on column public.orders.stripe_payment_intent_id is
  'Stripe PaymentIntent id when checkout completes.';

comment on column public.orders.paid_at is
  'Timestamp when payment_status became paid.';
