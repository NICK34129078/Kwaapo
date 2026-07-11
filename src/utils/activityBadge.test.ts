import { resolveActivityTabBadgeCount } from "./activityBadge";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runActivityBadgeTests(): void {
  assert(resolveActivityTabBadgeCount(3, false) === 3, "shows count when tab inactive");
  assert(resolveActivityTabBadgeCount(3, true) === 0, "hides when tab active");
  assert(resolveActivityTabBadgeCount(0, false) === 0, "zero stays zero");
}

if (require.main === module) {
  runActivityBadgeTests();
  console.log("activityBadge.test.ts: ok");
}
