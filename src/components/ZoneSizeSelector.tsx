import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ZONES, type ZoneSize } from '../domain/Measurement';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

export function ZoneSizeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ZoneSize | null;
  onChange: (value: ZoneSize) => void;
  disabled: boolean;
}) {
  return (
    <View style={s.group}>
      <Text style={g.sectionTitle}>Tamaño del recinto</Text>
      <View accessibilityRole="radiogroup" style={s.grid}>
        {ZONES.map(zone => {
          const checked = value === zone.value;
          return (
            <Pressable
              key={zone.value}
              accessibilityRole="radio"
              accessibilityLabel={zone.label + '. ' + zone.description}
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => onChange(zone.value)}
              style={({ pressed }) => [
                s.tile,
                checked && s.selected,
                pressed && s.pressed,
              ]}
            >
              <Text style={[s.label, checked && s.selectedLabel]}>
                {zone.label}
              </Text>
              <Text style={g.caption}>{zone.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 64,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 9,
    gap: 3,
  },
  selected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.assistantGlow,
  },
  pressed: { opacity: 0.75 },
  label: { fontSize: 13, color: COLORS.textDark, fontWeight: '700' },
  selectedLabel: { color: COLORS.primary },
});
