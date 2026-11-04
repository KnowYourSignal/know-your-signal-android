// src/services/useCaptureSession.ts

import { useState, useEffect } from 'react';
import { CaptureStatus, TelemetrySnapshot } from '../domain/CaptureState';

export const useCaptureSession = () => {
  const [status, setStatus] = useState<CaptureStatus>('STABILIZING');
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    accuracyM: 35.5, // Empieza alto
    powerDbm: -72,
    networkType: 'Wi-Fi privada',
    isReady: false,
    rejectionReason: 'Precisión insuficiente',
  });

  // Simulación del sensor nativo (para probar la UI)
  useEffect(() => {
    if (status !== 'STABILIZING' && status !== 'READY') return;

    const interval = setInterval(() => {
      setTelemetry(prev => {
        // Simulamos que la precisión mejora poco a poco
        const newAccuracy = prev.accuracyM !== null ? Math.max(8, prev.accuracyM - 2.5) : 30;
        const isNowReady = newAccuracy <= 10; // Menor a 10m según arquitectura
        
        if (isNowReady && status !== 'READY') {
          setStatus('READY');
        }

        return {
          ...prev,
          accuracyM: newAccuracy,
          powerDbm: prev.powerDbm !== null ? prev.powerDbm + (Math.random() > 0.5 ? 1 : -1) : -70,
          isReady: isNowReady,
          rejectionReason: isNowReady ? null : 'Precisión insuficiente',
        };
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [status]);

  const captureSnapshot = () => {
    if (telemetry.isReady) {
      setStatus('CAPTURED');
      // Aquí en el futuro llamaremos a Kotlin: NativeTelemetryAdapter.captureSnapshot()
    }
  };

  return {
    status,
    telemetry,
    captureSnapshot,
  };
};