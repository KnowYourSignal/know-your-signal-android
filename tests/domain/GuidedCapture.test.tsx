import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AccuracyIndicator } from '../../src/components/AccuracyIndicator';
import { CaptureButton } from '../../src/components/CaptureButton';
import { Button } from '../../src/components/UI';
import { WizardScreen } from '../../src/screens/WizardScreen';
import { telemetry } from '../../src/services/NativeTelemetryAdapter';
import type { SensorReading } from '../../src/specs/NativeTelemetry';
import { GuideProvider, useGuide } from '../../src/state/GuideContext';
import { SettingsProvider } from '../../src/state/SettingsContext';

const mockConsent = jest.fn();
jest.mock('../../src/specs/NativeFieldwork', () => ({
  __esModule: true,
  default: {
    getStatus: async () => ({
      choice: 'local',
      technicalMode: false,
      consentPending: false,
      total: 0,
      pending: 0,
      synced: 0,
      failed: 0,
      syncAvailable: true,
      syncProblem: null,
    }),
    getGuideStatus: async () => ({ overview: true, room: true }),
    markGuideSeen: async () => {},
    setConsent: (...args: unknown[]) => mockConsent(...args),
  },
}));
jest.mock('../../src/services/NativeTelemetryAdapter', () => ({
  requestLocation: jest.fn().mockResolvedValue(true),
  telemetry: { read: jest.fn(), stop: jest.fn(), freeze: jest.fn() },
}));
jest.mock('../../src/services/useAppForeground', () => ({
  useAppForeground: () => true,
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

const sample: SensorReading = {
  latitude: -33.45,
  longitude: -70.65,
  accuracyM: 7,
  powerDbm: -68,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  validForMs: 4000,
  problem: null,
};
let guide!: ReturnType<typeof useGuide>;
let root: ReactTestRenderer.ReactTestRenderer | undefined;
function Screen() {
  guide = useGuide();
  return (
    <WizardScreen
      navigation={{ isFocused: () => true, navigate: jest.fn() } as never}
      route={{ key: 'measure', name: 'Medir' }}
    />
  );
}
async function mount() {
  await act(async () => {
    root = ReactTestRenderer.create(
      <SettingsProvider>
        <GuideProvider navigate={() => {}}>
          <Screen />
        </GuideProvider>
      </SettingsProvider>,
    );
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(telemetry.read).mockResolvedValue(sample);
  root = undefined;
});
afterEach(async () => {
  await act(async () => root?.unmount());
});

test('opening the guide suspends collection, hides the old values and resumes with a fresh sample', async () => {
  await mount();
  await act(async () => root!.root.findByType(CaptureButton).props.onStart());
  expect(root!.root.findByType(CaptureButton).props.ready).toBe(true);
  expect(root!.root.findByType(AccuracyIndicator).props.accuracy).toBe(7);
  await act(async () => guide.start('overview'));
  expect(telemetry.stop).toHaveBeenCalledTimes(1);
  expect(root!.root.findByType(CaptureButton).props.ready).toBe(false);
  expect(root!.root.findByType(AccuracyIndicator).props.accuracy).toBeNull();
  expect(telemetry.read).toHaveBeenCalledTimes(1);
  expect(telemetry.freeze).not.toHaveBeenCalled();
  expect(mockConsent).not.toHaveBeenCalled();

  jest
    .mocked(telemetry.read)
    .mockResolvedValueOnce({ ...sample, accuracyM: 4 });
  await act(async () => guide.finish());
  expect(telemetry.read).toHaveBeenCalledTimes(2);
  expect(root!.root.findByType(AccuracyIndicator).props.accuracy).toBe(4);
  expect(root!.root.findByType(CaptureButton).props.ready).toBe(true);
});

test('a tour never reactivates a session that the user paused manually', async () => {
  await mount();
  await act(async () => root!.root.findByType(CaptureButton).props.onStart());
  const pause = root!.root
    .findAllByType(Button)
    .find(button => button.props.label === 'Pausar lectura')!;
  await act(async () => pause.props.onPress());
  const reads = jest.mocked(telemetry.read).mock.calls.length;
  await act(async () => guide.start('overview'));
  await act(async () => guide.finish());
  expect(root!.root.findByType(CaptureButton).props.active).toBe(false);
  expect(root!.root.findByType(CaptureButton).props.ready).toBe(false);
  expect(telemetry.read).toHaveBeenCalledTimes(reads);
  expect(telemetry.freeze).not.toHaveBeenCalled();
  expect(mockConsent).not.toHaveBeenCalled();
});
