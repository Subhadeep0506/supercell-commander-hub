import { useSyncExternalStore } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList, RouteName } from './routes';


export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let current: RouteName | undefined;
const listeners = new Set<() => void>();


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
