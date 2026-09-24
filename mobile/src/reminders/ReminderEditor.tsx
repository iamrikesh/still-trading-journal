import { useSyncExternalStore } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EmotionCard } from '../storage/reminderTypes.ts';
import type { Appearance } from '../storage/reminderTypes.ts';
import type { AppearanceState, ReminderController } from './controller.ts';

type Colors = { ink: string; muted: string; line: string; surface: string; soft: string; accent: string; error: string };
type Base = { controller: ReminderController; colors: Colors };

function Button({ label, accessibilityLabel, onPress, colors, disabled = false }: { label: string; accessibilityLabel?: string; onPress(): void; colors: Colors; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, { borderColor: colors.line, opacity: disabled ? 0.45 : 1 }]}><Text style={{ color: colors.ink }}>{label}</Text></Pressable>;
}

export function ReminderManager({ controller, colors, onEdit, onAdd }: Base & { onEdit(card: EmotionCard): void; onAdd(): void }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const render = (cards: EmotionCard[], archived: boolean) => cards.map((card, index) => <View key={card.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
    <Text style={[styles.heading, { color: colors.ink }]}>{card.symbol} {card.label}</Text>
    {!!card.hint && <Text style={{ color: colors.muted }}>{card.hint}</Text>}
    <Text style={{ color: colors.muted }}>{card.imageId ? 'Image · ' : ''}{card.audioId ? 'Audio · ' : ''}{card.support ? 'Text' : ''}</Text>
    <View style={styles.row}>
      <Button label="Edit" accessibilityLabel={`Edit ${card.label}`} colors={colors} onPress={() => onEdit(card)} />
      {index > 0 && <Button label="Move up" accessibilityLabel={`Move ${card.label} up`} colors={colors} onPress={() => { void controller.move(card.id, 'up'); }} />}
      {index < cards.length - 1 && <Button label="Move down" accessibilityLabel={`Move ${card.label} down`} colors={colors} onPress={() => { void controller.move(card.id, 'down'); }} />}
      <Button label={archived ? 'Restore' : 'Archive'} accessibilityLabel={`${archived ? 'Restore' : 'Archive'} ${card.label}`} colors={colors} onPress={() => { void controller.archive(card.id, !archived); }} />
    </View>
  </View>);
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={[styles.title, { color: colors.ink }]}>Your reminder buttons</Text>
    <Text style={{ color: colors.muted }}>Choose the words and media that help you pause. Older moments keep what was captured then.</Text>
    <View style={styles.row}><Button label="Add button" colors={colors} onPress={onAdd} disabled={state.active.length + state.archived.length >= 40} />
      {state.loadStatus === 'failed' && <Button label="Retry loading" colors={colors} onPress={() => { void controller.refresh(); }} />}</View>
    <Text style={{ color: colors.muted }}>{state.active.length + state.archived.length} of 40 buttons saved. Keep at least one active.</Text>
    {state.active.length + state.archived.length >= 40 && <Text style={{ color: colors.muted }}>The 40 button limit is reached. Existing buttons can still be edited or archived.</Text>}
    {state.error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{state.error}</Text>}
    {state.loadStatus !== 'ready' && <Text style={{ color: colors.muted }}>{state.loadStatus === 'loading' ? 'Loading saved buttons…' : 'Saved buttons are unavailable.'}</Text>}
    <Text style={[styles.heading, { color: colors.ink }]}>Active</Text>{render(state.active, false)}
    <Text style={[styles.heading, { color: colors.ink }]}>Archived</Text>{state.archived.length ? render(state.archived, true) : <Text style={{ color: colors.muted }}>No archived buttons.</Text>}
  </ScrollView>;
}

export function ReminderEditor({ controller, colors, appearance, appearanceStatus, onAppearance, onAppearanceRetry, onAppearanceLoadRetry, onBack, onSaved }: Base & { appearance: Appearance; appearanceStatus: AppearanceState['status']; onAppearance(value: Appearance): void; onAppearanceRetry(): void; onAppearanceLoadRetry(): void; onBack(): void; onSaved(): void }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const draft = state.draft;
  if (!draft) return null;
  const field = (name: 'label' | 'hint' | 'symbol' | 'support' | 'action', title: string, max: number, multiline = false) => <View style={styles.field}>
    <Text style={{ color: colors.ink }}>{title} · {draft.card[name].length}/{max}</Text>
    <TextInput accessibilityLabel={title} value={draft.card[name]} onChangeText={value => controller.change(name, value)}
      editable={state.busy !== 'saving'} maxLength={max} multiline={multiline}
      placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface }, multiline && styles.multiline]} />
  </View>;
  const hasImage = !!(draft.image?.id ?? (draft.image !== null && draft.card.imageId));
  const hasAudio = !!(draft.audio?.id ?? (draft.audio !== null && draft.card.audioId));
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={[styles.title, { color: colors.ink }]}>{draft.card.label ? `Edit ${draft.card.label}` : 'New reminder button'}</Text>
    <Text style={{ color: colors.muted }}>Edits stay here until Save. Label up to 40, hint 120, symbol 8, support 4000 and next action 500 characters. Include text, an image or audio.</Text>
    <Text style={{ color: colors.muted }}>Appearance · {appearance}</Text>
    <View style={styles.row}>{(['system', 'light', 'dark'] as const).map(mode => <Button key={mode} label={mode === appearance ? `${mode} ✓` : mode} colors={colors} onPress={() => onAppearance(mode)} />)}</View>
    {appearanceStatus === 'failed' && <View><Text accessibilityRole="alert" style={{ color: colors.error }}>Appearance not saved. Your choice remains for this run.</Text><Button label="Retry appearance" colors={colors} onPress={onAppearanceRetry} /></View>}
    {appearanceStatus === 'loadFailed' && <View><Text accessibilityRole="alert" style={{ color: colors.error }}>Saved appearance could not load. System appearance is temporary.</Text><Button label="Retry loading appearance" colors={colors} onPress={onAppearanceLoadRetry} /></View>}
    {field('label', 'Label', 40)}{field('hint', 'Hint', 120)}{field('symbol', 'Symbol', 8)}
    {field('support', 'Support text', 4000, true)}{field('action', 'Next action', 500, true)}
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Text style={[styles.heading, { color: colors.ink }]}>Image</Text>
      <Text style={{ color: colors.muted }}>JPEG or PNG · up to 2 MiB, 4 million pixels and 4096 pixels per side. Saved attachments share a 32 MiB limit.</Text>
      {draft.imagePreview && <Image accessibilityLabel="Reminder image preview" source={{ uri: `data:${draft.imagePreview.mime};base64,${draft.imagePreview.base64}` }} resizeMode="contain" style={styles.image} />}
      {hasImage && !draft.imagePreview && <Text style={{ color: colors.muted }}>Saved image attached. Preview loading or unavailable.</Text>}
      <View style={styles.row}><Button label={hasImage ? 'Replace image' : 'Import image'} colors={colors} onPress={() => { void controller.importMedia('image'); }} disabled={state.busy !== 'idle'} />
        {hasImage && <Button label="Remove image" colors={colors} onPress={() => controller.removeMedia('image')} disabled={state.busy === 'saving'} />}</View>
    </View>
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Text style={[styles.heading, { color: colors.ink }]}>Audio</Text>
      <Text style={{ color: colors.muted }}>WAV, MP3 or MP4-AAC · up to 4 MiB and 4 minutes. Audio plays only when you press Play.</Text>
      {hasAudio && <Text style={{ color: colors.muted }}>Audio attached.</Text>}
      <View style={styles.row}><Button label={hasAudio ? 'Replace audio' : 'Import audio'} colors={colors} onPress={() => { void controller.importMedia('audio'); }} disabled={state.busy !== 'idle'} />
        {hasAudio && <Button label="Remove audio" colors={colors} onPress={() => controller.removeMedia('audio')} disabled={state.busy === 'saving'} />}
      {hasAudio && <Button label="Play reminder" colors={colors} disabled={state.playing !== 'idle'} onPress={() => { void controller.play(); }} />}
      {(state.playing === 'playing' || state.playing === 'loading' || state.playing === 'cleanup') && <Button label={state.playing === 'cleanup' ? 'Stop again' : 'Stop'} colors={colors} onPress={() => { void controller.stop(); }} />}</View>
    </View>
    {state.busy === 'importing' && <Text style={{ color: colors.muted }}>Importing selected media…</Text>}
    {state.busy === 'saving' && <Text style={{ color: colors.muted }}>Saving complete reminder…</Text>}
    {state.error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{state.error}</Text>}
    <View style={styles.row}><Button label="Save" colors={colors} disabled={state.busy !== 'idle'} onPress={() => { void controller.save().then(saved => { if (saved) onSaved(); }); }} />
      <Button label="Cancel" colors={colors} onPress={onBack} disabled={state.busy === 'saving'} /></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  body: { padding: 24, paddingBottom: 42, gap: 14 }, title: { fontSize: 28, fontWeight: '600', marginBottom: 4 },
  heading: { fontSize: 18, fontWeight: '600' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 }, button: { minHeight: 44, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11 },
  field: { gap: 6 }, input: { borderWidth: 1, borderRadius: 12, minHeight: 44, padding: 12 }, multiline: { minHeight: 90, textAlignVertical: 'top' },
  image: { width: '100%', height: 200 },
});
