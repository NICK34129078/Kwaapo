# Worker routes — auth matrix (post JWT fix)

Identity source after fix: **`Authorization: Bearer <supabase_access_token>`** validated via `GET /auth/v1/user` (`worker-auth.js`).

`X-App-User-Id` is **removed** and must not be used.

| Route | Method | JWT | Stripe signature | Why | Identity after fix |
|-------|--------|-----|------------------|-----|-------------------|
| `?health=1` | GET | No | No | Public liveness | N/A |
| `?posts=1` | GET | No | No | Public global feed | N/A |
| `?userPosts=1&userId=` | GET | No | No | Public profile posts (non-deleted) | Query `userId` = whose posts |
| `?file=` / `?thumb=` / `?img=` | GET/HEAD | No | No | Public media streaming | N/A |
| `/post/:uuid` | GET | No | No | Share landing page | N/A |
| `?checkoutReturn=1` | GET | No | No | Stripe browser redirect HTML | Session from Stripe query |
| `?checkoutCancel=1` | GET | No | No | Cancel redirect + stock release server-side | `order_id` query only |
| `?stripeConnectReturn=1` | GET | No | No | Stripe Connect redirect | Stripe account in query/state |
| `?stripeConnectRefresh=1` | GET | No | No | Stripe Connect refresh | Stripe |
| `?stripeWebhook=1` | POST | No | **Yes** | Stripe webhook | Stripe event metadata |
| `?stripeCheckout=1` | POST | **Yes** | No | Buyer checkout | JWT `user.id` = buyer |
| `?checkoutReleaseStock=1` | POST | **Yes** | No | Release stock on cancel | JWT = buyer, must own order |
| `?stripeConfirm=1` | GET | **Yes** | No | Confirm payment after redirect | JWT = buyer |
| `?stripeConnectAccount=1` | POST | **Yes** | No | Create Connect account | JWT = seller |
| `?stripeConnectOnboardingLink=1` | POST | **Yes** | No | Onboarding URL | JWT = seller |
| `?stripeConnectPayoutManageLink=1` | POST | **Yes** | No | Express dashboard link | JWT = seller |
| `?stripeConnectStatus=1` | GET | **Yes** | No | Seller payout status | JWT = seller |
| `?kvkVerify=1` | POST | **Yes** | No | KVK verification | JWT = seller |
| `?uploadInit=1` | POST | **Yes** | No | Start video upload | JWT = uploader |
| `?videoPut=1` | PUT | **Yes** | No | Direct R2 video bytes | JWT = uploader |
| `?uploadComplete=1` | POST | **Yes** | No | Finalize post row | JWT = author |
| `?uploadThumbnail=1` | POST | **Yes** | No | Thumbnail upload | JWT = author |
| `?softDelete=1` | GET | **Yes** | No | Legacy soft delete | JWT must match post owner |
| POST (multipart legacy) | POST | **Yes** | No | Video/carousel upload | JWT = author |

## Removed (production)

- `?debugEnv=1`
- `?stripeConnectDebug=1`
- `?debugFile=`

## Client requirement

All authenticated worker calls must use `buildWorkerAuthHeaders()` from `src/services/workerRequest.ts`.

## Worker secret required for JWT validation

`SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` (already required for DB writes).
