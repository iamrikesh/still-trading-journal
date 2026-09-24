import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, typography, type Palette } from '../theme';

export function ActionButton({ label, onPress, colors, primary = false, selected = false, disabled = false, style }: {
  label: string; onPress(): void; colors: Palette; primary?: boolean; selected?: boolean;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ minHeight: 48, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderRadius: radius.control, borderWidth: 1, borderColor: primary || selected ? colors.accent : colors.line,
      backgroundColor: primary ? colors.accent : selected ? colors.soft : colors.surface,
      alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }, style]}>
    <Text style={[typography.label, { color: primary ? colors.background : colors.ink, textAlign: 'center' }]}>{label}</Text>
  </Pressable>;
}
