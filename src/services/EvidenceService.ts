import type { ComponentRef } from 'react';
import type { View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { fieldwork } from './LocalRepositoryAdapter';

export async function shareEvidence(
  card: ComponentRef<typeof View>,
): Promise<void> {
  const path = await captureRef(card, { format: 'png', result: 'tmpfile' });
  try {
    await fieldwork().shareEvidence(path);
  } finally {
    releaseCapture(path);
  }
}
