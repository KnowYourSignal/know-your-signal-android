import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { canCapture } from '../domain/CapturePolicy';
import { errorCode, type CaptureStatus } from '../domain/CaptureState';
import type { SensorReading } from '../specs/NativeTelemetry';
import { requestLocation, telemetry } from './NativeTelemetryAdapter';

export function useCaptureSession(focused: boolean) {
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background',
  );
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const freezing = useRef(false);
  const requesting = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  const start = useCallback(async () => {
    if (requesting.current) {
      return;
    }
    requesting.current = true;
    setProblem(null);
    setStatus('permission');
    try {
      const granted = await requestLocation(true);
      setEnabled(granted);
      setStatus(granted ? 'reading' : 'idle');
      if (!granted) {
        setProblem('PERMISSION_DENIED');
      }
    } catch (error) {
      setProblem(errorCode(error));
      setStatus('idle');
    } finally {
      requesting.current = false;
    }
  }, []);

  const pause = useCallback(() => {
    setEnabled(false);
    setReading(null);
    setProblem(null);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!enabled || !focused || !foreground) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    setStatus('reading');
    setReading(null);

    async function refresh() {
      if (freezing.current) {
        timer = setTimeout(refresh, 200);
        return;
      }
      try {
        const sample = await telemetry.read();
        if (!active || freezing.current) {
          return;
        }
        if (expiration) {
          clearTimeout(expiration);
        }
        setReading(sample);
        setProblem(sample.problem);
        const ready = canCapture(sample);
        setStatus(ready ? 'ready' : 'reading');
        if (ready) {
          expiration = setTimeout(() => {
            if (active && !freezing.current) {
              setReading(null);
              setProblem('STALE_READING');
              setStatus('reading');
            }
          }, sample.validForMs);
        }
      } catch (error) {
        if (active && !freezing.current) {
          setReading(null);
          setProblem(errorCode(error));
          setStatus('reading');
        }
      } finally {
        if (active) {
          timer = setTimeout(refresh, 1_350);
        }
      }
    }
    refresh();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
      if (expiration) {
        clearTimeout(expiration);
      }
    };
  }, [enabled, focused, foreground]);

  const capture = async () => {
    if (
      freezing.current ||
      !focused ||
      !foreground ||
      status !== 'ready' ||
      !canCapture(reading)
    ) {
      return null;
    }
    freezing.current = true;
    setStatus('freezing');
    try {
      const saved = await telemetry.freeze();
      // The draft is held natively while the user completes the floor form.
      pause();
      return saved;
    } catch (error) {
      setReading(null);
      setProblem(errorCode(error));
      setStatus('reading');
      return null;
    } finally {
      freezing.current = false;
    }
  };

  return {
    status,
    reading,
    problem,
    enabled,
    canRecord: focused && foreground && status === 'ready',
    start,
    pause,
    capture,
  };
}
