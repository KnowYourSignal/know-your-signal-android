import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { FieldStatus } from '../../src/specs/NativeFieldwork';
import { SettingsProvider, useSettings } from '../../src/state/SettingsContext';

const mockGetStatus = jest.fn();
let mockForeground = true;

jest.mock('../../src/specs/NativeFieldwork', () => ({
  __esModule: true,
  default: { getStatus: () => mockGetStatus() },
}));
jest.mock('../../src/services/useAppForeground', () => ({
  useAppForeground: () => mockForeground,
}));

const waiting: FieldStatus = {
  choice: 'community',
  consentPending: false,
  technicalMode: false,
  total: 1,
  pending: 1,
  synced: 0,
  failed: 0,
  syncAvailable: true,
  syncProblem: null,
};
const finished: FieldStatus = { ...waiting, pending: 0, synced: 1 };
let settings!: ReturnType<typeof useSettings>;
let root: ReactTestRenderer.ReactTestRenderer | undefined;

function Consumer() {
  settings = useSettings();
  return null;
}

function Harness() {
  return (
    <SettingsProvider>
      <Consumer />
    </SettingsProvider>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockForeground = true;
  mockGetStatus.mockReset().mockResolvedValue(waiting);
  root = undefined;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  jest.useRealTimers();
});

test('receipts update shared history state and stop polling when the queue settles', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Harness />);
  });
  expect(settings.status?.pending).toBe(1);
  mockGetStatus.mockResolvedValue(finished);

  await act(async () => jest.advanceTimersByTime(4_000));
  expect(settings.status?.synced).toBe(1);
  expect(settings.status?.pending).toBe(0);
  const requests = mockGetStatus.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(12_000));
  expect(mockGetStatus).toHaveBeenCalledTimes(requests);
});

test('a blocked queue waits for user retry without polling the disk indefinitely', async () => {
  mockGetStatus.mockResolvedValue({
    ...waiting,
    syncProblem: 'CONSENT_BLOCKED',
  });
  await act(async () => {
    root = ReactTestRenderer.create(<Harness />);
  });
  const requests = mockGetStatus.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(120_000));
  expect(mockGetStatus).toHaveBeenCalledTimes(requests);
  expect(settings.status?.pending).toBe(1);

  mockGetStatus.mockResolvedValue(waiting);
  await act(async () => {
    await settings.refresh();
  });
  mockGetStatus.mockResolvedValue(finished);
  await act(async () => jest.advanceTimersByTime(4_000));
  expect(settings.status?.synced).toBe(1);
});

test('backgrounding drops an old status response and foregrounding reads the current queue', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Harness />);
  });
  let resolve!: (value: FieldStatus) => void;
  const delayed = new Promise<FieldStatus>(done => {
    resolve = done;
  });
  mockGetStatus.mockReturnValueOnce(delayed);
  let request!: Promise<void>;
  await act(async () => {
    request = settings.refresh();
  });

  mockForeground = false;
  await act(async () => root!.update(<Harness />));
  const requests = mockGetStatus.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(12_000));
  expect(mockGetStatus).toHaveBeenCalledTimes(requests);
  await act(async () => {
    resolve(finished);
    await request;
  });
  expect(settings.status?.pending).toBe(1);

  mockGetStatus.mockResolvedValue(finished);
  mockForeground = true;
  await act(async () => root!.update(<Harness />));
  expect(settings.status?.synced).toBe(1);
  expect(settings.status?.pending).toBe(0);
});
