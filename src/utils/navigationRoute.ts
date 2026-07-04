import type { NavigationContainerRef, NavigationState } from "@react-navigation/native";

function getFocusedRouteName(state: NavigationState | undefined): string | undefined {
  if (!state?.routes?.length) {
    return undefined;
  }
  const index = state.index ?? 0;
  const route = state.routes[index];
  if (!route) {
    return undefined;
  }
  if (route.state) {
    return getFocusedRouteName(route.state as NavigationState) ?? route.name;
  }
  return route.name;
}

/** True when the user is on the Home tab (ReelsScreen) inside MainTabs. */
export function isOnHomeReelsRoute(
  navigationRef: NavigationContainerRef<any> | null
): boolean {
  if (!navigationRef?.isReady()) {
    return false;
  }
  const rootState = navigationRef.getRootState();
  const focused = getFocusedRouteName(rootState);
  if (focused !== "Home") {
    return false;
  }
  const rootRoute = rootState.routes[rootState.index ?? 0];
  return rootRoute?.name === "MainTabs";
}
