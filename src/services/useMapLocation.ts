import { useCallback, useEffect, useRef, useState } from 'react';
import { captureMessage, errorCode } from '../domain/CaptureState';
import { requestLocation, telemetry } from './NativeTelemetryAdapter';

type Position = { latitude: number; longitude: number };

export function useMapLocation(
  focused: boolean,
  foreground: boolean,
  onLocated: (position: Position) => void,
) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const phase = useRef<'idle' | 'permission' | 'waiting' | 'reading'>('idle');
  const visible = useRef({ focused, foreground });
  const callback = useRef(onLocated);
  visible.current = { focused, foreground };
  callback.current = onLocated;

  const cancel = useCallback(() => {
    generation.current += 1;
    phase.current = 'idle';
    telemetry.stopLocating();
    setLocating(false);
  }, []);

  const read = useCallback(async (request: number) => {
    const valid = () =>
      generation.current === request &&
      visible.current.focused &&
      visible.current.foreground;
    if (!valid()) return;
    phase.current = 'reading';
    try {
      const position = await telemetry.locate();
      if (valid()) callback.current(position);
    } catch (problem) {
      if (valid()) setError(captureMessage(errorCode(problem)));
    } finally {
      if (generation.current === request) {
        phase.current = 'idle';
        setLocating(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!focused || (!foreground && phase.current === 'reading')) cancel();
    else if (foreground && phase.current === 'waiting')
      read(generation.current);
  }, [focused, foreground, cancel, read]);

  useEffect(
    () => () => {
      generation.current += 1;
      phase.current = 'idle';
      telemetry.stopLocating();
    },
    [],
  );

  async function locate() {
    if (
      !visible.current.focused ||
      !visible.current.foreground ||
      phase.current !== 'idle'
    )
      return;
    const current = ++generation.current;
    const valid = () =>
      visible.current.focused && generation.current === current;
    phase.current = 'permission';
    setLocating(true);
    setError(null);
    try {
      const permitted = await requestLocation(false);
      if (!valid()) return;
      if (!permitted) {
        setError('Permite la ubicación para centrar el mapa en tu zona.');
        return;
      }
      // The Android permission activity can temporarily pause this app. Resume
      // this explicit request when it returns, without starting GPS in the background.
      if (!visible.current.foreground) phase.current = 'waiting';
      else await read(current);
    } catch (problem) {
      if (valid()) setError(captureMessage(errorCode(problem)));
    } finally {
      if (valid() && phase.current !== 'waiting') {
        phase.current = 'idle';
        setLocating(false);
      }
    }
  }

  return { locate, locating, error };
}
