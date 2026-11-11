import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { parseFloor } from '../domain/CapturePolicy';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { Chip } from './UI';
import { GuideTarget } from './GuideTarget';

export function FloorSelector({
  value,
  onChange,
  editable = true,
  guided = false,
}: {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
  guided?: boolean;
}) {
  const invalid =
    value.length > 0 && value !== '-' && parseFloor(value) === null;
  const input = (
    <TextInput
      accessibilityLabel="Piso o nivel"
      style={[s.input, invalid && s.invalid]}
      editable={editable}
      keyboardType="numeric"
      returnKeyType="done"
      maxLength={4}
      placeholder="Ej. 0, −1, 2"
      placeholderTextColor={COLORS.textMuted}
      value={value}
      onChangeText={onChange}
    />
  );
  return (
    <View style={s.group}>
      <Text style={g.sectionTitle}>Piso o nivel</Text>
      {guided ? <GuideTarget id="floor">{input}</GuideTarget> : input}
      {invalid ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          Ingresa un entero entre −10 y 150.
        </Text>
      ) : (
        <Text style={g.caption}>El 0 corresponde al nivel de acceso.</Text>
      )}
      {editable && (
        <View style={s.chips}>
          {[-1, 0, 1, 2, 3].map(floor => (
            <Chip
              label={String(floor)}
              key={floor}
              selected={value === String(floor)}
              onPress={() => onChange(String(floor))}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: 7 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    minHeight: 45,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 16,
    color: COLORS.navy,
  },
  invalid: { borderColor: COLORS.danger },
  error: { fontSize: 12, color: COLORS.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
