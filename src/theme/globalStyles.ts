import { StyleSheet } from 'react-native';
import { COLORS } from './theme';

export const globalStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.surface },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  heading: {
    color: COLORS.navy,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  sectionTitle: { color: COLORS.textDark, fontSize: 17, fontWeight: '700' },
  body: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  caption: { color: COLORS.textMuted, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
});
