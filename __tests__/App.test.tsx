import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Button, ChoiceTile } from '../src/components/UI';
import App from '../App';

const mockSetConsent = jest.fn();

jest.mock('../src/specs/NativeFieldwork', () => ({
  __esModule: true,
  default: {
    getStatus: async () => ({
      choice: 'undecided',
      consentPending: false,
      syncAvailable: true,
      technicalMode: false,
      total: 0,
      pending: 0,
      synced: 0,
      failed: 0,
      syncProblem: null,
    }),
    setConsent: (...args: unknown[]) => mockSetConsent(...args),
  },
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Circle: 'Circle',
  PROVIDER_GOOGLE: 'google',
}));

test('opens onboarding with neither privacy choice preselected', async () => {
  let root!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    root = ReactTestRenderer.create(<App />);
  });
  for (let step = 0; step < 3; step += 1) {
    const next = root.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Continuar')!;
    await act(async () => next.props.onPress());
  }
  const choices = root.root.findAllByType(ChoiceTile);
  expect(choices).toHaveLength(2);
  expect(choices.every(choice => !choice.props.selected)).toBe(true);
  expect(
    root.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Comenzar')?.props.disabled,
  ).toBe(true);
  expect(mockSetConsent).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
