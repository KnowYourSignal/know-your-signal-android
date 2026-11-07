import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ACCURACY_LIMIT_M } from '../domain/CapturePolicy';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

export function AccuracyIndicator({ accuracy }: { accuracy: number | null }) {
  const good = accuracy !== null && accuracy > 0 && accuracy < ACCURACY_LIMIT_M;
  const medium =
    accuracy !== null && accuracy >= ACCURACY_LIMIT_M && accuracy <= 20;
  const color = good ? COLORS.success : medium ? COLORS.warning : COLORS.danger;
  const segments = good ? 5 : medium ? 3 : accuracy === null ? 0 : 1;
  return (
    <View style={s.group}>
      <View style={[g.row, s.header]}>
        <Text style={g.sectionTitle}>Precisión de ubicación</Text>
        <Text
          style={[
            s.value,
            { color: accuracy === null ? COLORS.textMuted : color },
          ]}
        >
          {accuracy === null ? '—' : '±' + accuracy.toFixed(1) + ' m'}
        </Text>
      </View>
      <View style={s.meter} accessible={false}>
        {Array.from({ length: 5 }, (_, index) => (
          <View
            key={index}
            style={[
              s.segment,
              { backgroundColor: index < segments ? color : COLORS.border },
            ]}
          />
        ))}
      </View>
      <Text style={g.caption}>
        {good
          ? 'Precisión suficiente'
          : 'Se requiere una precisión menor a 10 m'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: 7 },
  header: { justifyContent: 'space-between', flexWrap: 'wrap' },
  value: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  meter: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
});
