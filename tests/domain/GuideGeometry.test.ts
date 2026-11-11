import type React from 'react';
import type { View, MeasureInWindowOnSuccessCallback } from 'react-native';
import { measureGuideView } from '../../src/state/GuideContext';

const host = (
  measureInWindow: (callback: MeasureInWindowOnSuccessCallback) => void,
) => ({ measureInWindow } as unknown as React.ComponentRef<typeof View>);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a native view removed during a transition becomes a missing target rather than a rejected tour', async () => {
  const removed = host(() => {
    throw new Error('detached native view');
  });
  await expect(measureGuideView(removed)).resolves.toBeNull();
  await expect(measureGuideView(null)).resolves.toBeNull();
});

test('a measurement that never returns has a bounded timeout and ignores a late response', async () => {
  let callback!: (x: number, y: number, width: number, height: number) => void;
  const target = host(next => {
    callback = next;
  });
  const result = measureGuideView(target);
  jest.advanceTimersByTime(300);
  await expect(result).resolves.toBeNull();
  callback(10, 20, 100, 50);
  await expect(result).resolves.toBeNull();
});

test('a valid native measurement resolves promptly and clears the timeout', async () => {
  const target = host(callback => callback(10, 20, 100, 50));
  await expect(measureGuideView(target)).resolves.toEqual({
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  });
  expect(jest.getTimerCount()).toBe(0);
  const hidden = host(callback => callback(0, 0, 0, 0));
  await expect(measureGuideView(hidden)).resolves.toBeNull();
});
