import { useSyncExternalStore } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../theme';
import type { ReminderController } from './controller.ts';

type Colors = { ink: string; muted: string; line: string; soft: string; error: string };
export function ReminderSupport({ controller, colors }: { controller: ReminderController; colors: Colors }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const card = state.selected;
  if (!card) return null;
  const button = (label: string, onPress: () => void, enabled = true) => <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={onPress}
    style={[styles.button, { borderColor: colors.line, opacity: enabled ? 1 : 0.45 }]}><Text style={{ color: colors.ink }}>{label}</Text></Pressable>;
  return <View style={[styles.card, { backgroundColor: colors.soft }]}>
    <Text style={[styles.label, { color: colors.muted }]}>CURRENT SUPPORT · {card.label.toUpperCase()}</Text>
    {!!card.support && <Text style={[styles.support, { color: colors.ink }]}>{card.support}</Text>}
    {state.supportImage && <Image accessibilityLabel={`${card.label} reminder image`} resizeMode="contain"
      source={{ uri: `data:${state.supportImage.mime};base64,${state.supportImage.base64}` }} style={styles.image} />}
    {card.imageId && !state.supportImage && !state.error && <Text style={{ color: colors.muted }}>Loading current image…</Text>}
    {!!card.action && <><View style={[styles.rule, { backgroundColor: colors.line }]} />
      <Text style={[styles.label, { color: colors.muted }]}>One next step</Text>
      <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 23 }}>{card.action}</Text></>}
    {card.audioId && <View style={styles.row}>{button('Play reminder', () => { void controller.play(); }, state.playing === 'idle')}
      {(state.playing === 'playing' || state.playing === 'loading' || state.playing === 'cleanup') &&
        button(state.playing === 'cleanup' ? 'Stop again' : 'Stop', () => { void controller.stop(); })}</View>}
    {state.playing === 'loading' && <Text style={{ color: colors.muted }}>Preparing reminder audio…</Text>}
    {state.playing === 'playing' && <Text accessibilityLiveRegion="polite" style={{ color: colors.ink }}>Playing reminder · {Math.floor(state.durationMs / 1000)}s</Text>}
    {state.error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{state.error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: radius.surface, padding: spacing.xl, marginTop: spacing.md, gap: spacing.md }, label: typography.label,
  support: { fontSize: 22, lineHeight: 32 }, image: { width: '100%', height: 240 },
  rule: { height: 1, marginVertical: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderWidth: 1, borderRadius: radius.control, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
});
