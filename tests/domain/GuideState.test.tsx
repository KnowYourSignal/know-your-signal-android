import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  GuideProvider,
  useAutoGuide,
  useGuide,
} from '../../src/state/GuideContext';
import { GUIDE_STEPS } from '../../src/state/GuideSteps';

let mockForeground = true;
jest.mock('../../src/services/useAppForeground', () => ({
  useAppForeground: () => mockForeground,
}));
const mockSeen = jest.fn();
const mockMark = jest.fn();
jest.mock('../../src/specs/NativeFieldwork', () => ({
  __esModule: true,
  default: {
    getGuideStatus: () => mockSeen(),
    markGuideSeen: (scope: string) => mockMark(scope),
  },
}));
let guide!: ReturnType<typeof useGuide>;
let root: ReactTestRenderer.ReactTestRenderer;
const navigate = jest.fn();
function Consumer({ enabled = false }: { enabled?: boolean }) {
  guide = useGuide();
  useAutoGuide('overview', enabled);
  return null;
}
function Harness({ enabled = false }: { enabled?: boolean }) {
  return (
    <GuideProvider navigate={navigate}>
      <Consumer enabled={enabled} />
    </GuideProvider>
  );
}
beforeEach(() => {
  mockForeground = true;
  jest.useFakeTimers();
  mockSeen.mockReset().mockResolvedValue({ overview: false, room: false });
  mockMark.mockReset().mockResolvedValue(undefined);
  navigate.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  jest.useRealTimers();
});

test('the tour starts only after the host enables it and remembers an omission locally', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => jest.advanceTimersByTime(3000));
  expect(guide.active).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => root.update(<Harness enabled />));
  await act(async () => jest.advanceTimersByTime(650));
  expect(guide.run?.index).toBe(0);
  expect(mockMark).toHaveBeenCalledWith('overview');
  await act(async () => guide.finish());
  await act(async () => jest.advanceTimersByTime(3000));
  expect(guide.active).toBe(false);
  expect(mockMark).toHaveBeenCalledTimes(1);
});

test('replaying traverses actual tabs, supports back and returns to the original tab', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => guide.start('overview', 'Ajustes'));
  expect(navigate).toHaveBeenLastCalledWith('Medir');
  await act(async () => guide.move(-1));
  expect(guide.run?.index).toBe(0);
  for (let index = 1; index < GUIDE_STEPS.overview.length; index += 1) {
    await act(async () => guide.move(1));
    expect(guide.run?.index).toBe(index);
    expect(navigate).toHaveBeenLastCalledWith(GUIDE_STEPS.overview[index].tab);
  }
  await act(async () => guide.move(-1));
  expect(guide.run?.index).toBe(5);
  await act(async () => guide.move(1));
  await act(async () => guide.move(1));
  expect(guide.active).toBe(false);
  expect(navigate).toHaveBeenLastCalledWith('Ajustes');
});

test('the room tour stays on the captured form and preference failures do not block replay', async () => {
  mockSeen.mockRejectedValue(new Error('disk'));
  mockMark.mockRejectedValue(new Error('disk'));
  await act(async () => {
    root = ReactTestRenderer.create(<Harness enabled />);
  });
  await act(async () => jest.advanceTimersByTime(3000));
  expect(guide.active).toBe(false);
  await act(async () => guide.start('room'));
  expect(guide.run?.scope).toBe('room');
  await act(async () => guide.start('overview'));
  expect(guide.run?.scope).toBe('room');
  for (let index = 0; index < GUIDE_STEPS.room.length; index += 1) {
    await act(async () => guide.move(1));
  }
  expect(guide.active).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});

test('automatic guidance waits until the app is in the foreground', async () => {
  mockForeground = false;
  await act(async () => {
    root = ReactTestRenderer.create(<Harness enabled />);
  });
  await act(async () => jest.advanceTimersByTime(3000));
  expect(guide.active).toBe(false);
  expect(mockMark).not.toHaveBeenCalled();
  mockForeground = true;
  await act(async () => root.update(<Harness enabled />));
  await act(async () => jest.advanceTimersByTime(650));
  expect(guide.active).toBe(true);
});

test('a delayed preference response preserves the guide opened in the meantime', async () => {
  let resolve!: (value: { overview: boolean; room: boolean }) => void;
  mockSeen.mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    root = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => guide.start('overview'));
  await act(async () => resolve({ overview: false, room: true }));
  expect(guide.seen).toEqual({ overview: true, room: true });
});
