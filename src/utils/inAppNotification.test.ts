import {
  dequeueInAppNotification,
  enqueueInAppNotification,
  notificationOrderReference,
  shouldSuppressInAppNotification,
  type InAppNotificationPayload,
} from "./inAppNotification";

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

  console.log("inAppNotification tests passed");
}

if (require.main === module) {
  runInAppNotificationTests();
}
