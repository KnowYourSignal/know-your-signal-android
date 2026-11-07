import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatSignal,
  metricLabel,
  networkLabel,
  signalQuality,
} from '../domain/Measurement';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { Icon } from './Icon';

export function NetworkBadge({
  connection,
  metric,
  dbm,
  technical,
}: {
  connection: string | null;
  metric: string | null;
  dbm: number | null;
  technical: boolean;
}) {
  const value =
    dbm !== null && metric
      ? formatSignal(dbm, metric, technical)
      : 'Sin lectura';
  const color =
    dbm !== null && metric
      ? SIGNAL_COLORS[signalQuality(dbm, metric)]
      : COLORS.textMuted;
  return (
    <View style={s.row}>
      <View style={s.icon}>
        <Icon name={metric === 'wifi_rssi' ? 'wifi' : 'signal'} size={20} />
      </View>
      <View style={s.copy}>
        <Text style={g.sectionTitle}>{networkLabel(connection)}</Text>
        <Text style={g.caption}>
          {metric ? metricLabel(metric) : 'Red actual'}
        </Text>
      </View>
      <Text style={[s.value, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.assistantGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  value: { fontSize: 14, flexShrink: 1, fontWeight: '800' },
});
