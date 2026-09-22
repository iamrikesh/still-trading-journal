import { useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordingController } from './controller';
import type { Moment } from '../storage/types';

export function clipTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function RecordingPanel({ controller, ink, muted, line, onOpenMoment }: { controller: RecordingController; ink: string; muted: string; line: string; onOpenMoment(moment: Moment): void }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const ready = s.phase === 'ready';
  const capturing = ['starting', 'recording', 'saving'].includes(s.phase);
  const showPending = s.pending > 0 && !capturing;
  const button = (title: string, action: () => void, enabled = true) => <Pressable accessibilityRole="button"
    accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={action}
    style={[styles.button, { borderColor: line, opacity: enabled ? 1 : 0.4 }]}><Text style={{ color: ink }}>{title}</Text></Pressable>;
  function remove(id: string, pending: boolean) {
    Alert.alert(pending ? 'Discard this clip?' : 'Delete this clip?', 'This removes this clip and its temporary files. Your moment stays saved.', [
      { text: 'Keep', style: 'cancel' }, { text: pending ? 'Discard' : 'Delete', style: 'destructive', onPress: () => { void controller.remove(id); } },
    ]);
  }
  return <View style={[styles.panel, { borderColor: line }]}>
    <Text style={[styles.title, { color: ink }]}>Voice clips</Text>
    <Text style={{ color: muted }}>Up to 4 minutes each. Add another clip whenever you need.</Text>
    {(s.phase === 'recording' || s.phase === 'playing') && <Text accessibilityLiveRegion="polite" style={[styles.timer, { color: ink }]}>
      {s.phase === 'recording' ? 'Recording' : 'Playing'} {clipTime(s.durationMs)}{s.phase === 'recording' ? ' / 4:00' : ''}
    </Text>}
    <View style={styles.row}>
      {button('Record', () => { void controller.record(); }, ready && s.pending === 0)}
      {(s.phase === 'recording' || s.phase === 'playing' || s.phase === 'cleanup') && button(s.phase === 'cleanup' ? 'Stop again' : 'Stop', () => { void controller.stop(); })}
    </View>
    {!['ready', 'recording', 'playing', 'unavailable', 'cleanup'].includes(s.phase) && <Text style={{ color: muted }}>
      {s.phase === 'permission' ? 'Checking microphone permission…' : s.phase === 'saving' ? 'Saving encrypted clip…' : 'Preparing audio…'}
    </Text>}
    {s.message && <Text accessibilityLiveRegion="polite" style={{ color: ink }}>{s.message}</Text>}
    {showPending && <Text style={{ color: muted }}>{s.pending} clip operation(s) need attention. Retry or discard pending clips in their moment before recording again.</Text>}
    {showPending && button('Retry pending work', () => { void controller.recover(); }, ready)}
    {showPending && s.pendingOwners.map(owner => <View key={owner.id}>
      {button(`Pending: ${owner.emotionLabel} · ${new Date(owner.createdAt).toLocaleString()}`, () => onOpenMoment(owner), ready)}
    </View>)}
    {s.clips.filter(clip => !capturing || clip.id !== s.activeId).map(clip => <View key={clip.id} style={[styles.clip, { borderColor: line }]}>
      <Text style={{ color: ink }}>{new Date(clip.createdAt).toLocaleString()} · {clip.durationMs === null ? 'Unfinished' : clipTime(clip.durationMs)}</Text>
      <Text style={{ color: muted }}>{clip.status === 'saved' ? 'Saved' : clip.status === 'cleanup-pending' ? 'Encrypted · cleanup pending' : 'Not saved · retry or discard'}</Text>
      <View style={styles.row}>
        {clip.status === 'saved'
          ? button('Play', () => { void controller.play(clip.id); }, ready)
          : button('Retry save', () => { void controller.retry(clip.id); }, ready)}
        {button(clip.status === 'saved' ? 'Delete clip' : 'Discard', () => remove(clip.id, clip.status !== 'saved'), ready)}
      </View>
    </View>)}
    {s.clips.length === 0 && ready && <Text style={{ color: muted }}>No clips on this page.</Text>}
    <View style={styles.row}>
      {button('Newest clips', () => { void controller.page(false); }, ready)}
      {s.older && button('Older clips', () => { void controller.page(true); }, ready)}
    </View>
    <Text style={{ color: muted }}>Audio storage: {(s.usageBytes / 1048576).toFixed(1)} MiB including temporary files.</Text>
    {s.usageBytes >= 250 * 1048576 && <Text style={{ color: ink }}>Audio uses over 250 MiB. Review clips you no longer need; nothing is deleted automatically.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { marginTop: 16, paddingTop: 18, borderTopWidth: 1, gap: 12 },
  title: { fontSize: 22, fontWeight: '600' }, timer: { fontSize: 26, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 17, paddingVertical: 13 },
  clip: { paddingTop: 14, borderTopWidth: 1, gap: 8 },
});
