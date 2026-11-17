/* Component-contract checks. These are not physical Android or visual acceptance. */
import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { WizardScreen } from '@sut/screens/WizardScreen';
import { CaptureButton } from '@sut/components/CaptureButton';
import { AccuracyIndicator } from '@sut/components/AccuracyIndicator';
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../cases/catalog.json'), 'utf8'),
);
const repeat = Number(process.env.KYS_QA_REPETITIONS || 3);
let mockSession;
jest.mock('@sut/services/useCaptureSession', () => ({
  useCaptureSession: () => mockSession,
}));
jest.mock('@sut/state/SettingsContext', () => ({
  useSettings: () => ({
    status: {
      technicalMode: false,
      activeSessionName: 'Sesión sintética',
    },
    refresh: jest.fn(),
  }),
}));
jest.mock('@sut/state/GuideContext', () => ({
  useGuide: () => ({
    active: false,
    start: jest.fn(),
  }),
  useAutoGuide: jest.fn(),
}));
// This adapter checks button state. Native measurement/layout is a separate
// Android and physical acceptance check, not simulated by this mock.
jest.mock('@sut/components/GuideTarget', () => {
  const { View, ScrollView } = require('react-native');
  return { GuideTarget: View, GuideScrollView: ScrollView };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));
describe('Robot QA - contrato del control de captura', () => {
  for (const item of catalog.cases.filter(x => x.adapter === 'jest-ui')) {
    for (let repetition = 1; repetition <= repeat; repetition++) {
      test(`[${item.case_id}] repetición ${repetition}: ${item.title}`, async () => {
        let root;
        mockSession = {
          enabled: true,
          status: 'reading',
          canRecord: false,
          problem: null,
          reading: {
            latitude: -33.45,
            longitude: -70.65,
            accuracyM: 7,
            powerDbm: -68,
            metric: 'wifi_rssi',
            technology: 'wifi',
            connection: 'wifi_privada',
            validForMs: 4000,
            problem: null,
          },
          sampleStep: 1,
          start: jest.fn(),
          pause: jest.fn(),
          capture: jest.fn(),
          ...item.input,
        };
        try {
          await act(async () => {
            root = ReactTestRenderer.create(
              <WizardScreen
                navigation={{
                  isFocused: () => true,
                  navigate: jest.fn(),
                }}
                route={{
                  key: 'robot',
                  name: 'Medir',
                }}
              />,
            );
          });
          const ready = root.root.findByType(CaptureButton).props.ready;
          expect(ready).toBe(item.expected);
          if (item.input.reading?.accuracyM != null)
            expect(root.root.findByType(AccuracyIndicator).props.accuracy).toBe(
              item.input.reading.accuracyM,
            );
        } finally {
          await act(async () => root?.unmount());
        }
      });
    }
  }
});
