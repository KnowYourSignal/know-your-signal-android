// src/components/AccuracyIndicator.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme/theme';

interface AccuracyIndicatorProps {
  accuracyM: number | null;
  targetM?: number;
}

export const AccuracyIndicator: React.FC<AccuracyIndicatorProps> = ({ accuracyM, targetM = 10 }) => {
  const isReady = accuracyM !== null && accuracyM <= targetM;
  const isWarning = accuracyM !== null && accuracyM > targetM && accuracyM <= 25;
  
  let color = COLORS.danger; // Rojo (muy impreciso o sin dato)
  if (isReady) color = COLORS.success; // Verde (menor a 10m)
  else if (isWarning) color = COLORS.warning; // Amarillo (cerca de la meta)

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Precisión estimada:</Text>
      <Text style={[styles.value, { color }]}>
        {accuracyM !== null ? `${accuracyM.toFixed(1)} m` : 'Buscando...'}
      </Text>
      <Text style={styles.targetText}>Objetivo: menos de {targetM} m</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
  },
  label: {
    fontSize: 16,
    color: COLORS.textDark,
    marginBottom: 4,
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  targetText: {
    fontSize: 14,
    color: COLORS.textDark,
    opacity: 0.7,
  },
});