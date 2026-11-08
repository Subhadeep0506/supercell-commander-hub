/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

/*
 * The one failure mode that is both fatal and silent.
 *
 * Every gesture in the app -- currently pull-to-refresh on all five scrolling
 * containers -- is recognised only inside a GestureHandlerRootView. Without
 * one, nothing throws in a release build and nothing looks wrong; the gestures
 * simply never fire. That is exactly how pull-to-refresh shipped broken twice.
 *
 * RNGH does throw in __DEV__ on native, but **not on web** -- so the browser
 * checks, which are this project's main test surface, cannot catch its
 * absence. This test is what covers that gap.
 */
test('wraps the app in a GestureHandlerRootView, or no gesture will ever fire', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  const roots = tree!.root.findAllByType(GestureHandlerRootView);
  expect(roots.length).toBeGreaterThan(0);
});
