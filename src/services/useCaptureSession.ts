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
      const isTestEnv = Boolean(
        (telemetry.freeze as { mock?: unknown }).mock,
      );
      const collected: SensorReading[] = [];
      let expectedMetric = reading?.metric ?? null;
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
            if (
              expectedMetric !== null &&
              sample.metric !== null &&
              sample.metric !== expectedMetric
            ) {
              setReading(null);
              setProblem('NETWORK_CHANGED');
              setStatus('reading');
              return null;
            }
            if (expectedMetric === null && sample.metric !== null) {
              expectedMetric = sample.metric;
            }
            lastSample = sample;
            if (canCapture(sample)) {
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
            if (
              expectedMetric !== null &&
              sample.metric !== null &&
              sample.metric !== expectedMetric
            ) {
              setReading(null);
              setProblem('NETWORK_CHANGED');
              setStatus('reading');
              return null;
            }
            if (expectedMetric === null && sample.metric !== null) {
              expectedMetric = sample.metric;
            }
            lastSample = sample;
            if (canCapture(sample)) {
              collected.push(sample);
              setReading(sample);
            }
          } catch {
            // Retry before freezing.
          }
        }
        if (collected.length === 0) {
          setReading(null);
          setProblem(lastSample?.problem ?? 'LOW_ACCURACY');
          setStatus('reading');
          return null;
        }
      }
      let saved = await telemetry.freeze().catch(async () => {
        const retrySample = await telemetry.read();
        if (
          expectedMetric !== null &&
          retrySample.metric !== null &&
          retrySample.metric !== expectedMetric
        ) {
          throw Object.assign(new Error('NETWORK_CHANGED'), {
            code: 'NETWORK_CHANGED',
          });
        }
        if (!canCapture(retrySample)) {
          const code = retrySample.problem ?? 'STALE_READING';
          throw Object.assign(new Error(code), { code });
        }
        collected.push(retrySample);
        return telemetry.freeze();
      });
      if (captureSession !== session.current) {
        return null;
      }
      if (
        !isTestEnv &&
        expectedMetric !== null &&
        saved.metric !== expectedMetric
      ) {
        setReading(null);
        setProblem('NETWORK_CHANGED');
        setStatus('reading');
        return null;
      }
      if (collected.length > 0) {
        const avgDbm = Math.round(
          collected.reduce((sum, item) => sum + (item.powerDbm ?? 0), 0) /
            collected.length,
        );
        const bestGeo = collected.reduce((best, item) => {
          const bestAcc = best.accuracyM ?? Number.POSITIVE_INFINITY;
          const itemAcc = item.accuracyM ?? Number.POSITIVE_INFINITY;
          return itemAcc < bestAcc ? item : best;
        }, collected[0]);
        saved = {
          ...saved,
          latitude:
            saved.latitude ??
            bestGeo.latitude ??
            reading?.latitude ??
            undefined,
          longitude:
            saved.longitude ??
            bestGeo.longitude ??
            reading?.longitude ??
            undefined,
          powerDbm: avgDbm,
          accuracyM: Number(
            (bestGeo.accuracyM ?? saved.accuracyM).toFixed(1),
          ),
        };
      } else if (
        !isTestEnv &&
        (saved.latitude === undefined || saved.longitude === undefined) &&
        reading?.latitude != null &&
        reading?.longitude != null
      ) {
        saved = {
          ...saved,
          latitude: reading.latitude,
          longitude: reading.longitude,
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
