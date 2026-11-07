import React from 'react';
import type { CaptureStatus } from '../domain/CaptureState';
import { Button } from './UI';

export function CaptureButton({
  status,
  active,
  ready,
  onStart,
  onCapture,
}: {
  status: CaptureStatus;
  active: boolean;
  ready: boolean;
  onStart: () => void;
  onCapture: () => void;
}) {
  if (!active) {
    return (
      <Button
        label="Activar sensores"
        icon="radar"
        busy={status === 'permission'}
        onPress={onStart}
      />
    );
  }
  return (
    <Button
      label={status === 'freezing' ? 'Preparando captura' : 'Registrar señal'}
      icon="arrow"
      busy={status === 'freezing'}
      disabled={!ready && status !== 'freezing'}
      onPress={onCapture}
    />
  );
}
