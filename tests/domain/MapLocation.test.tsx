import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useMapLocation } from '../../src/services/useMapLocation';

const mockPermission = jest.fn();
const mockLocate = jest.fn();
const mockStop = jest.fn();
jest.mock('../../src/services/NativeTelemetryAdapter', () => ({
  requestLocation: () => mockPermission(),
  telemetry: { locate: () => mockLocate(), stopLocating: () => mockStop() },
}));

let location!: ReturnType<typeof useMapLocation>;
let root: ReactTestRenderer.ReactTestRenderer | undefined;
const centered = jest.fn();
function Harness({ active }: { active: boolean }) {
  location = useMapLocation(active, centered);
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue(true);
  mockLocate.mockResolvedValue({ latitude: -33.45, longitude: -70.65 });
});
afterEach(async () => {
  await act(async () => root?.unmount());
});

test('leaving during the permission dialog never starts a background location read', async () => {
  const permission = deferred<boolean>();
  mockPermission.mockReturnValueOnce(permission.promise);
  await act(async () => {
    root = ReactTestRenderer.create(<Harness active />);
  });
  let request!: Promise<void>;
  await act(async () => {
    request = location.locate();
  });
  await act(async () => root!.update(<Harness active={false} />));
  await act(async () => {
    permission.resolve(true);
    await request;
  });
  expect(mockLocate).not.toHaveBeenCalled();
  expect(centered).not.toHaveBeenCalled();
  expect(location.locating).toBe(false);
});

test('backgrounding cancels GPS and ignores late results before allowing another request', async () => {
  const position = deferred<{ latitude: number; longitude: number }>();
  mockLocate.mockReturnValueOnce(position.promise);
  await act(async () => {
    root = ReactTestRenderer.create(<Harness active />);
  });
  let request!: Promise<void>;
  await act(async () => {
    request = location.locate();
  });
  expect(location.locating).toBe(true);
  await act(async () => root!.update(<Harness active={false} />));
  expect(mockStop).toHaveBeenCalled();
  await act(async () => {
    position.resolve({ latitude: 1, longitude: 2 });
    await request;
  });
  expect(centered).not.toHaveBeenCalled();
  await act(async () => root!.update(<Harness active />));
  await act(async () => {
    await location.locate();
  });
  expect(centered).toHaveBeenCalledWith({
    latitude: -33.45,
    longitude: -70.65,
  });
  expect(location.locating).toBe(false);
});

test('denying location leaves the map usable and does not read sensors', async () => {
  mockPermission.mockResolvedValue(false);
  await act(async () => {
    root = ReactTestRenderer.create(<Harness active />);
  });
  await act(async () => {
    await location.locate();
  });
  expect(location.error).toContain('Permite la ubicación');
  expect(mockLocate).not.toHaveBeenCalled();
  expect(location.locating).toBe(false);
});
