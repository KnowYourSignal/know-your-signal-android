import { useEffect, useRef, useState } from 'react';
import { captureMessage, errorCode } from '../domain/CaptureState';
import { requestLocation, telemetry } from './NativeTelemetryAdapter';

type Position = { latitude: number; longitude: number };

export function useMapLocation(
  active: boolean,
  onLocated: (position: Position) => void,
) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const enabled = useRef(active);
  const callback = useRef(onLocated);
  enabled.current = active;
  callback.current = onLocated;

  useEffect(() => {
    if (!active) setLocating(false);
    return () => {
      generation.current += 1;
      pending.current = false;
      telemetry.stopLocating();
    };
  }, [active]);

  async function locate() {
    if (!enabled.current || pending.current) return;
    const current = ++generation.current;
    const valid = () => enabled.current && generation.current === current;
    pending.current = true;
    setLocating(true);
    setError(null);
    try {
      const permitted = await requestLocation(false);
      if (!valid()) return;
      if (!permitted) {
        setError('Permite la ubicación para centrar el mapa en tu zona.');
        return;
      }
      const position = await telemetry.locate();
      if (valid()) callback.current(position);
    } catch (problem) {
      if (valid()) setError(captureMessage(errorCode(problem)));
    } finally {
      if (valid()) {
        pending.current = false;
        setLocating(false);
      }
    }
  }

  return { locate, locating, error };
}
