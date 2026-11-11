import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Animated, Modal, Text } from 'react-native';
import { Dialog } from '../../src/components/UI';

let mockReduced = false;
let mockForeground = true;
jest.mock('../../src/components/Motion', () => ({
  useReducedMotion: () => mockReduced,
  Reveal: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../../src/services/useAppForeground', () => ({
  useAppForeground: () => mockForeground,
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

let root: ReactTestRenderer.ReactTestRenderer | undefined;
let completions: Array<(result: { finished: boolean }) => void>;
let timing: jest.SpyInstance;
const afterClose = jest.fn();
const close = jest.fn();
function Surface({
  visible,
  name = 'Captura A',
  dismissible = true,
}: {
  visible: boolean;
  name?: string;
  dismissible?: boolean;
}) {
  return (
    <Dialog
      visible={visible}
      title="Evidencia"
      onClose={close}
      onAfterClose={afterClose}
      dismissible={dismissible}
    >
      {name && <Text>{name}</Text>}
    </Dialog>
  );
}
beforeEach(() => {
  mockReduced = false;
  mockForeground = true;
  root = undefined;
  completions = [];
  afterClose.mockClear();
  close.mockClear();
  timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: callback => {
      if (callback) completions.push(callback);
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  timing.mockRestore();
});

test('closing retains the complete evidence until exit and only then invokes navigation', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Surface visible />);
  });
  expect(timing).not.toHaveBeenCalled();
  await act(async () => root!.root.findByType(Modal).props.onShow());
  await act(async () => completions.at(-1)!({ finished: true }));
  await act(async () => root!.update(<Surface visible={false} name="" />));
  expect(root!.root.findAllByType(Modal)).toHaveLength(1);
  expect(
    root!.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Captura A'),
  ).toBe(true);
  expect(afterClose).not.toHaveBeenCalled();
  await act(async () => completions.at(-1)!({ finished: true }));
  expect(root!.root.findAllByType(Modal)).toHaveLength(0);
  expect(afterClose).toHaveBeenCalledTimes(1);
});

test('an interrupted exit cannot close a quickly reopened dialog', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Surface visible />);
  });
  await act(async () => root!.update(<Surface visible={false} />));
  const obsoleteExit = completions.at(-1)!;
  await act(async () => root!.update(<Surface visible name="Captura B" />));
  await act(async () => obsoleteExit({ finished: true }));
  expect(root!.root.findAllByType(Modal)).toHaveLength(1);
  expect(afterClose).not.toHaveBeenCalled();
  expect(
    root!.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Captura B'),
  ).toBe(true);
  await act(async () => root!.update(<Surface visible={false} />));
  await act(async () => completions.at(-1)!({ finished: true }));
  expect(afterClose).toHaveBeenCalledTimes(1);
});

test('a consent or export transaction blocks close and Android back consistently', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(<Surface visible dismissible={false} />);
  });
  const button = root!.root
    .findAllByProps({ accessibilityLabel: 'Cerrar' })
    .find(node => typeof node.props.onPress === 'function')!;
  expect(button.props.disabled).toBe(true);
  await act(async () => button.props.onPress());
  await act(async () => root!.root.findByType(Modal).props.onRequestClose());
  expect(close).not.toHaveBeenCalled();
});

test.each(['reduced', 'background'])(
  '%s completes dismissal without leaving an invisible blocking surface',
  async mode => {
    await act(async () => {
      root = ReactTestRenderer.create(<Surface visible />);
    });
    if (mode === 'reduced') mockReduced = true;
    else mockForeground = false;
    await act(async () => root!.update(<Surface visible={false} />));
    expect(root!.root.findAllByType(Modal)).toHaveLength(0);
    expect(afterClose).toHaveBeenCalledTimes(1);
  },
);
