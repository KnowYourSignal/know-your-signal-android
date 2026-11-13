// src/services/EvidenceService.ts
import { RefObject } from 'react';
import { NativeModules, Share } from 'react-native';
import MapView from 'react-native-maps';
import { captureRef } from 'react-native-view-shot';

const NativeShareModule = NativeModules.ShareModule;

export interface EvidenceSummaryMetrics {
  sampleCount: number;
  avgDbm: number | null;
  minDbm: number | null;
  dateRangeLabel: string;
}

export class EvidenceService {
  public static buildSanitizedSummary(
    samples: Array<{ dbm: number; timestamp?: string | number }>,
  ): EvidenceSummaryMetrics {
    if (!samples || samples.length === 0) {
      return {
        sampleCount: 0,
        avgDbm: null,
        minDbm: null,
        dateRangeLabel: new Date().toLocaleDateString('es-CL'),
      };
    }

    const dbmValues = samples.map((s) => s.dbm).filter((v) => Number.isFinite(v));
    const sum = dbmValues.reduce((acc, val) => acc + val, 0);
    const avgDbm = dbmValues.length > 0 ? Math.round(sum / dbmValues.length) : null;
    const minDbm = dbmValues.length > 0 ? Math.min(...dbmValues) : null;

    const validLabels = samples
      .map((s) => s.timestamp)
      .filter((t): t is string | number => t !== undefined && t !== null)
      .map((t) =>
        typeof t === 'number'
          ? new Date(t).toLocaleDateString('es-CL')
          : String(t),
      );

    const dateRangeLabel =
      validLabels.length >= 2 && validLabels[0] !== validLabels[validLabels.length - 1]
        ? `${validLabels[0]} – ${validLabels[validLabels.length - 1]}`
        : validLabels[0] ?? new Date().toLocaleDateString('es-CL');

    return {
      sampleCount: samples.length,
      avgDbm,
      minDbm,
      dateRangeLabel,
    };
  }

  /**
   * Ficha 8 IDA: Verifica que el mapa esté listo y captura el snapshot nativo.
   * Si falla o retorna vacío, lanza error controlado para no declarar éxito con mapa en blanco.
   */
  public static async captureMapSnapshot(
    mapRef: RefObject<MapView | null>,
    isMapReady: boolean,
  ): Promise<string> {
    if (!mapRef.current || !isMapReady) {
      throw new Error('El mapa aún no ha terminado de renderizar la capa de calor.');
    }

    const uri = await mapRef.current.takeSnapshot({
      width: 800,
      height: 450,
      format: 'png',
      quality: 0.95,
      result: 'file',
    });

    if (!uri || uri.trim().length === 0) {
      throw new Error('La captura del mapa devolvió una imagen vacía.');
    }

    return uri;
  }

  /**
   * Compone la EvidenceCard como PNG limpio y abre el selector nativo de Android.
   */
  public static async exportAndShareCard(
    cardRef: RefObject<any>,
    options: { floor: string; metricLabel: string; hasMapSnapshot: boolean },
  ): Promise<string> {
    if (!options.hasMapSnapshot) {
      throw new Error('No se puede exportar evidencia sin la captura válida del mapa.');
    }

    if (!cardRef.current) {
      throw new Error('La vista de EvidenceCard no está montada.');
    }

    const pngUri = await captureRef(cardRef, {
      format: 'png',
      quality: 1.0,
      result: 'tmpfile',
    });

    if (!pngUri) {
      throw new Error('No se pudo generar el archivo PNG de evidencia.');
    }

    const title = `Evidencia de Señal - Piso ${options.floor} (${options.metricLabel})`;
    const message = `Reporte técnico de cobertura generado con KnowYourSignal (Piso ${options.floor} · ${options.metricLabel}).`;

    if (NativeShareModule?.sharePng) {
      await NativeShareModule.sharePng(pngUri, title, message);
    } else {
      await Share.share({
        title,
        message: `${message}\n${pngUri}`,
        url: pngUri,
      });
    }

    return pngUri;
  }
}