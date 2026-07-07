import {
  buyerOrderShippedToastBody,
  buyerOrderShippedToastTitle,
  dequeueInAppNotification,
  enqueueInAppNotification,
  inAppToastPendingCutoffIso,
  IN_APP_NOTIFICATION_VISIBLE_MS,
  IN_APP_ORDER_TOAST_DURATION_MS,
  isPendingToastTooOld,
  IN_APP_TOAST_PENDING_MAX_AGE_MS,
  notificationOrderReference,
  sellerNewOrderToastBody,
  sellerNewOrderToastSubtitle,
  sellerNewOrderToastTitle,
  shouldSuppressInAppNotification,
  type InAppNotificationPayload,
} from "./inAppNotification";

import { initI18n } from "../i18n/index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makePayload(
  overrides: Partial<InAppNotificationPayload> = {}
): InAppNotificationPayload {
  return {
    id: "notif-1",
    orderId: "6994982d-aaaa-bbbb-cccc-ddddeeeeffff",
    audience: "seller",
    notificationType: "new_paid_order",
    title: "Nieuwe bestelling! 🎉",
    body: "Je hebt Test Tee verkocht voor €19,99.",
    orderReference: "#6994982d",
    createdAt: "2026-07-04T10:00:00.000Z",
    ...overrides,
  };
}

export function runInAppNotificationTests(): void {
  initI18n("nl-NL");
  const first = makePayload({ id: "a" });
  const second = makePayload({ id: "b", audience: "buyer", notificationType: "order_shipped" });

  const queued = enqueueInAppNotification([], first);
  assert(queued.length === 1, "enqueue first");
  assert(
    enqueueInAppNotification(queued, first).length === 1,
    "dedupe same notification id"
  );
  assert(
    enqueueInAppNotification(queued, second).length === 2,
    "queue second notification"
  );
  assert(dequeueInAppNotification([first, second]).length === 1, "dequeue keeps tail");

  assert(
    shouldSuppressInAppNotification("OrderDetail", first.orderId, first),
    "suppress on same order detail"
  );
  assert(
    !shouldSuppressInAppNotification("OrderDetail", "other-order", first),
    "do not suppress on different order"
  );
  assert(
    !shouldSuppressInAppNotification("MainTabs", first.orderId, first),
    "do not suppress on other routes"
  );

  assert(
    notificationOrderReference("6994982d-aaaa-bbbb-cccc-ddddeeeeffff") === "#6994982d",
    "order reference"
  );

  assert(
    sellerNewOrderToastTitle() === "Nieuwe bestelling ontvangen 📦",
    "seller toast title"
  );
  assert(
    sellerNewOrderToastSubtitle() === "Klaar om af te handelen.",
    "seller toast subtitle"
  );
  assert(
    sellerNewOrderToastBody("Staging Live Notification Test Tee", "€19,99") ===
      "Staging Live Notification Test Tee verkocht voor €19,99.",
    "seller toast body"
  );

  const now = Date.parse("2026-07-04T12:00:00.000Z");
  const cutoff = inAppToastPendingCutoffIso(now);
  const expectedMs = now - IN_APP_TOAST_PENDING_MAX_AGE_MS;
  assert(
    Date.parse(cutoff) === expectedMs,
    "in-app toast pending cutoff"
  );

  assert(
    isPendingToastTooOld("2026-07-04T11:58:00.000Z", now),
    "toast older than 60s is too old"
  );
  assert(
    !isPendingToastTooOld("2026-07-04T11:59:30.000Z", now),
    "toast within 60s is not too old"
  );

  assert(
    IN_APP_NOTIFICATION_VISIBLE_MS === 5000,
    "buyer/seller toast visible duration"
  );
  assert(
    IN_APP_ORDER_TOAST_DURATION_MS === IN_APP_NOTIFICATION_VISIBLE_MS,
    "order toast duration alias"
  );
  assert(
    buyerOrderShippedToastTitle() === "Je bestelling is onderweg 📦",
    "buyer shipped toast title"
  );
  assert(
    buyerOrderShippedToastBody("Vintage Jacket", "Nick Shop") ===
      "Vintage Jacket is verzonden door Nick Shop.",
    "buyer shipped toast body"
  );
  assert(
    buyerOrderShippedToastBody(null, null).includes("verzonden"),
    "buyer shipped toast body fallbacks"
  );

  console.log("inAppNotification tests passed");
}

if (require.main === module) {
  runInAppNotificationTests();
}
