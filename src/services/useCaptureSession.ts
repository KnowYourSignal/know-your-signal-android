import { useCallback, useEffect, useRef, useState } from 'react';
import { canCapture } from '../domain/CapturePolicy';
import { errorCode, type CaptureStatus } from '../domain/CaptureState';
import type { SensorReading } from '../specs/NativeTelemetry';
import { requestLocation, telemetry } from './NativeTelemetryAdapter';
import { useAppForeground } from './useAppForeground';

export function useCaptureSession(focused: boolean) {
  const foreground = useAppForeground();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sampleStep, setSampleStep] = useState(1);
  const freezing = useRef(false);
  const requesting = useRef(false);
  const session = useRef(0);

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
    session.current += 1;
    telemetry.stop();
    setEnabled(false);
    setReading(null);
    setProblem(null);
    setSampleStep(1);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!enabled || !focused || !foreground) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    let stabilizationTimeout: ReturnType<typeof setTimeout> | undefined;
    setStatus('reading');
    setReading(null);
    setSampleStep(1);

    function armStabilizationTimeout() {
      if (stabilizationTimeout) {
        clearTimeout(stabilizationTimeout);
      }
      stabilizationTimeout = setTimeout(() => {
        if (active && !freezing.current) {
          telemetry.stop();
          setEnabled(false);
          setReading(null);
          setProblem('LOCATION_TIMEOUT');
          setStatus('idle');
        }
      }, 60_000);
    }
    armStabilizationTimeout();

    async function refresh() {
      if (freezing.current) {
        timer = setTimeout(refresh, 200);
        return;
      }
      let nextDelay = 1_100;
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
        if (sample.sampleCount != null && sample.sampleCount > 0) {
          setSampleStep(sample.sampleCount);
        } else {
          setSampleStep(1);
        }

        const ready = canCapture(sample);
        const stabilizing =
          !ready &&
          sample.problem === null &&
          sample.validForMs > 0 &&
          sample.sampleCount != null &&
          sample.targetSamples != null &&
          sample.sampleCount < sample.targetSamples;

        if (stabilizing) {
          nextDelay = 550;
          armStabilizationTimeout();
        }

        setStatus(ready ? 'ready' : 'reading');
        if (ready) {
          if (stabilizationTimeout) {
            clearTimeout(stabilizationTimeout);
            stabilizationTimeout = undefined;
          }
          expiration = setTimeout(() => {
            if (active && !freezing.current) {
              setReading(null);
              setProblem('STALE_READING');
              setSampleStep(1);
              setStatus('reading');
              armStabilizationTimeout();
            }
          }, sample.validForMs);
        } else if (!stabilizationTimeout) {
          armStabilizationTimeout();
        }
      } catch (error) {
        if (active && !freezing.current) {
          setReading(null);
          setProblem(errorCode(error));
          setSampleStep(1);
          setStatus('reading');
        }
      } finally {
        if (active) {
          timer = setTimeout(refresh, nextDelay);
        }
      }
    }
    refresh();
    return () => {
      active = false;
      session.current += 1;
      telemetry.stop();
      if (timer) {
        clearTimeout(timer);
      }
      if (expiration) {
        clearTimeout(expiration);
      }
      if (stabilizationTimeout) {
        clearTimeout(stabilizationTimeout);
      }
    };
  }, [enabled, focused, foreground]);

  const capture = async () => {
    if (
      freezing.current ||
      !focused ||
      !foreground ||
      !enabled ||
      status !== 'ready' ||
      !canCapture(reading)
    ) {
      return null;
    }
    freezing.current = true;
    const captureSession = session.current;
    setStatus('freezing');
    try {
      const saved = await telemetry.freeze();
      if (captureSession !== session.current) {
        return null;
      }
      // The draft is held natively while the user completes the floor form.
      // Keep the explicit session enabled so returning to Medir starts a fresh
      // reading. Focus/foreground cleanup keeps sensors off while editing a room.
      session.current += 1;
      telemetry.stop();
      setReading(null);
      setProblem(null);
      setSampleStep(1);
      setStatus('reading');
      return saved;
    } catch (error) {
      if (captureSession === session.current) {
        setReading(null);
        setProblem(errorCode(error));
        setSampleStep(1);
        setStatus('reading');
      }
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
    sampleStep,
    canRecord: focused && foreground && status === 'ready',
    start,
    pause,
    capture,
  };
}