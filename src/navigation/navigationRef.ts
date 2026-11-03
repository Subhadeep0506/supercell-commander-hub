import { useSyncExternalStore } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList, RouteName } from './routes';

/**
 * The top bar and bottom nav render *outside* the stack navigator, because the
 * reference app draws one persistent chrome around an `<Outlet/>` rather than
 * per-screen headers. Hooks like useNavigation and useNavigationState only
 * work inside a navigator, so the chrome addresses navigation through this
 * container ref instead.
 *
 * Screens themselves are inside the navigator and use useNavigation normally.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let current: RouteName | undefined;
const listeners = new Set<() => void>();

/** Called from NavigationContainer's onReady and onStateChange. */
export function syncCurrentRoute(): void {
  const next = navigationRef.isReady()
    ? (navigationRef.getCurrentRoute()?.name as RouteName | undefined)
    : undefined;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active route name, usable from chrome rendered outside the navigator. */
export function useCurrentRouteName(): RouteName | undefined {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

export function navigate<T extends RouteName>(
  name: T,
  params?: RootStackParamList[T],
): void {
  if (!navigationRef.isReady()) return;
  // The ref's navigate is typed per-route; the cast keeps this one helper
  // usable for every screen without a union of overloads.
  (navigationRef.navigate as (n: string, p?: object) => void)(name, params);
}
