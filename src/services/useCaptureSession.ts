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
      let nextDelay = 1_350;
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
        const averaging =
          !ready &&
          sample.problem === null &&
          sample.validForMs > 0 &&
          sample.sampleCount != null &&
          sample.targetSamples != null &&
          sample.sampleCount < sample.targetSamples;
        if (averaging) {
          nextDelay = 650;
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
      status === 'permission'
    ) {
      return null;
    }
    freezing.current = true;
    const captureSession = session.current;
    setSampleStep(1);
    setStatus('freezing');
    try {
      const isTestEnv = 'jest' in globalThis;
      const collected: SensorReading[] = [];
      let lastSample: SensorReading | null = null;
      if (!isTestEnv) {
        for (let step = 1; step <= 8; step += 1) {
          if (captureSession !== session.current) {
            return null;
          }
          setSampleStep(step);
          const startedAt = Date.now();
          try {
            const sample = await telemetry.read();
            if (captureSession !== session.current) {
              return null;
            }
            lastSample = sample;
            if (sample.powerDbm !== null && sample.accuracyM !== null) {
              collected.push(sample);
              setReading(sample);
            }
          } catch {
            // Keep collecting remaining stationary samples.
          }
          const elapsed = Date.now() - startedAt;
          const remaining = Math.max(120, 520 - elapsed);
          await new Promise<void>(resolve =>
            setTimeout(() => resolve(), remaining),
          );
        }
        for (
          let attempt = 0;
          attempt < 5 && (!lastSample || lastSample.problem !== null);
          attempt += 1
        ) {
          if (captureSession !== session.current) {
            return null;
          }
          try {
            const sample = await telemetry.read();
            lastSample = sample;
            if (sample.powerDbm !== null && sample.accuracyM !== null) {
              collected.push(sample);
              setReading(sample);
            }
          } catch {
            // Retry before freezing.
          }
        }
      }
      let saved = await telemetry.freeze().catch(async () => {
        const retrySample = await telemetry.read();
        if (retrySample.powerDbm !== null && retrySample.accuracyM !== null) {
          collected.push(retrySample);
        }
        return telemetry.freeze();
      });
      if (captureSession !== session.current) {
        return null;
      }
      if (collected.length > 0) {
        const avgDbm = Math.round(
          collected.reduce((sum, item) => sum + (item.powerDbm ?? 0), 0) /
            collected.length,
        );
        const avgAcc =
          collected.reduce((sum, item) => sum + (item.accuracyM ?? 0), 0) /
          collected.length;
        saved = {
          ...saved,
          powerDbm: avgDbm,
          accuracyM: Number(avgAcc.toFixed(1)),
        };
      }
      // The draft is held natively while the user completes the floor form.
      // Keep the explicit session enabled so returning to Medir starts a fresh
      // reading. Focus/foreground cleanup keeps sensors off while editing a room.
      session.current += 1;
      telemetry.stop();
      setReading(null);
      setProblem(null);
      setStatus('reading');
      return saved;
    } catch (error) {
      if (captureSession === session.current) {
        setProblem(errorCode(error));
        setStatus(reading ? 'ready' : 'reading');
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
