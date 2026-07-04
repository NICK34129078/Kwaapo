# Push notifications — development build plan

Remote push does **not** work in Expo Go. Use this checklist for a real iOS/Android push test on staging.

## Prerequisites

1. **EAS development build** with `expo-notifications` native module linked.
2. **Apple Push Notification service (APNs)** key/certificate in EAS credentials (iOS).
3. **FCM** configured for Android (EAS handles most of this).
4. Staging Supabase migration `0045_order_notification_copy_and_push_tokens.sql` applied.
5. Worker secrets (staging only):
   - `PUSH_NOTIFICATIONS_ENABLED=1`
   - `EXPO_ACCESS_TOKEN` (Expo access token for push API)
6. App env (development build):
   - `EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=1`

## Architecture (already in repo)

| Layer | File |
| --- | --- |
| Token storage | `push_device_tokens` table (RLS: user owns row) |
| Client register | `src/services/pushNotificationService.ts` |
| Server send | `worker-push-notifications.js` (called from `worker-stripe.js` after seller paid notify) |
| Tap handler | `App.tsx` → `OrderDetail` with `orderId` + optional `focusTracking` |
| In-app (Expo Go) | `InAppNotificationContext` + Supabase Realtime INSERT |

## iOS TestFlight / dev build steps

1. `eas build --profile development --platform ios`
2. Install build on device; log in as `staging_seller` or `staging_buyer`.
3. Open **Profiel → Instellingen** once (or any post-login screen) — permission prompt appears only when `EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=1`.
4. Confirm row in `push_device_tokens` for your `user_id`.
5. Run staging checkout (buyer) → seller receives DB notification + optional push.
6. Mark order shipped (seller) → buyer receives DB notification; buyer push requires a future DB webhook hook (in-app banner works via Realtime today).
7. Background the app; repeat payment on another device — seller should get system notification.
8. Tap notification → app opens `OrderDetail` for that order.

## Buyer shipment push (follow-up)

Shipment notifications are created by Postgres trigger `notify_buyer_order_shipped`. To send push server-side without client involvement, add one of:

- Supabase Database Webhook → staging Worker endpoint `?buyerNotificationPush=1`, or
- `pg_net` HTTP call from trigger (not recommended in trigger transaction).

Until then, **in-app Realtime banners** cover buyer shipment on staging.

## Safety

- Push send failures are logged only; never block checkout or shipment.
- Unique constraints on `seller_notifications` / `buyer_notifications` prevent duplicate in-app rows.
- No `service_role` or push secrets in the Expo client.
