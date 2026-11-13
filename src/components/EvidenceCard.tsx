// src/components/EvidenceCard.tsx
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export interface EvidenceCardProps {
  cardRef?: React.RefObject<any>;
  mapSnapshotUri?: string | null;
  floor: string;
  networkType: string;
  dateRangeLabel: string;
  sampleCount: number;
  avgDbm: number | null;
  minDbm: number | null;
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  cardRef,
  mapSnapshotUri,
  floor,
  networkType,
  dateRangeLabel,
  sampleCount,
  avgDbm,
  minDbm,
}) => {
  const isWifi =
    networkType.toLowerCase().includes('wifi') ||
    networkType.toLowerCase().includes('rssi');

  const scaleBands = isWifi
    ? {
        good: 'Favorable (≥ -67)',
        mid: 'Intermedia (-75 a -68)',
        weak: 'Débil (< -75)',
      }
    : {
        good: 'Favorable (≥ -90)',
        mid: 'Intermedia (-105 a -91)',
        weak: 'Débil (< -105)',
      };

  return (
    <View ref={cardRef} collapsable={false} style={styles.cardContainer}>
      {/* Encabezado limpio: sin botones, tokens ni identificadores de usuario */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTag}>KNOW YOUR SIGNAL · REPORTE TÉCNICO</Text>
          <Text style={styles.title}>Evidencia de Cobertura Interior</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Piso {floor}</Text>
        </View>
      </View>

      {/* Metadatos obligatorios según Ficha 8 IDA: tipo/métrica y rango de fechas */}
      <View style={styles.metaGrid}>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>RED Y MÉTRICA</Text>
          <Text style={styles.metaValue}>{networkType}</Text>
        </View>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>RANGO DE FECHAS</Text>
          <Text style={styles.metaValue}>{dateRangeLabel}</Text>
        </View>
      </View>

      {/* Superficie de captura del mapa */}
      <View style={styles.snapshotFrame}>
        {mapSnapshotUri ? (
          <Image
            source={{ uri: mapSnapshotUri }}
            style={styles.snapshotImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.snapshotPlaceholder}>
            <Text style={styles.placeholderText}>
              Esperando captura de mapa · {sampleCount} muestras
            </Text>
          </View>
        )}
      </View>

      {/* Resumen estadístico de potencia en dBm */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Muestras</Text>
          <Text style={styles.statValue}>{sampleCount}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Promedio</Text>
          <Text style={styles.statValue}>
            {avgDbm !== null ? `${avgDbm} dBm` : 'N/D'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Mínimo</Text>
          <Text style={[styles.statValue, { color: '#CB4444' }]}>
            {minDbm !== null ? `${minDbm} dBm` : 'N/D'}
          </Text>
        </View>
      </View>

      {/* Leyenda semántica vinculada a la métrica activa (Sección 4.6 IDA) */}
      <View style={styles.legendSection}>
        <Text style={styles.legendTitle}>Escala de potencia recibida (dBm):</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#278B58' }]} />
            <Text style={styles.legendText}>{scaleBands.good}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#D6A521' }]} />
            <Text style={styles.legendText}>{scaleBands.mid}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#CB4444' }]} />
            <Text style={styles.legendText}>{scaleBands.weak}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footerNote}>
        Documento técnico local · Sin tokens ni identificadores de dispositivo
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D7E1F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandTag: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#205DF5',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#183369',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#205DF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  metaBox: {
    flex: 1,
    backgroundColor: '#EDF2FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D7E1F5',
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#183369',
    opacity: 0.75,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#183369',
    marginTop: 2,
  },
  snapshotFrame: {
    width: '100%',
    height: 175,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EDF2FF',
    borderWidth: 1,
    borderColor: '#D7E1F5',
    marginBottom: 12,
  },
  snapshotImage: {
    width: '100%',
    height: '100%',
  },
  snapshotPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  placeholderText: {
    fontSize: 12,
    color: '#183369',
    fontWeight: '600',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#EDF2FF',
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D7E1F5',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#D7E1F5',
  },
  statLabel: {
    fontSize: 10,
    color: '#183369',
    opacity: 0.75,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#183369',
    marginTop: 2,
  },
  legendSection: {
    backgroundColor: '#EDF2FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D7E1F5',
    marginBottom: 10,
  },
  legendTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#183369',
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#183369',
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 9,
    color: '#183369',
    opacity: 0.7,
    textAlign: 'center',
  },
});