import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TradingController } from './tradingController';
import type { TradingSession } from '../storage/tradingTypes';
import type { Moment } from '../storage/types';

const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'Open';
export function TradingPanel({ controller, ink, muted, line, onMoment, onReflection }: {
  controller: TradingController; ink: string; muted: string; line: string;
  onMoment(moment: Moment): void; onReflection(session: TradingSession): void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<TradingSession | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  useEffect(() => { void controller.refresh(); }, [controller]);
  useEffect(() => { if (selected) { const latest = [...state.sessions, ...state.archived].find(row => row.id === selected.id); if (latest && latest !== selected) { setSelected(latest); setTitle(latest.title); setStart(latest.startedAt); setEnd(latest.endedAt ?? ''); } } }, [state.sessions, state.archived]);
  function choose(row: TradingSession) { setSelected(row); setTitle(row.title); setStart(row.startedAt); setEnd(row.endedAt ?? ''); void controller.timeline(row.id); }
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={[styles.button, { borderColor: line, opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: ink }}>{label}</Text></Pressable>;
  const input = (label: string, value: string, change: (text: string) => void) => <View><Text style={{ color: muted }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} autoCapitalize="none" style={[styles.input, { borderColor: line, color: ink }]} /></View>;
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={[styles.heading, { color: ink }]}>Trading sessions</Text>
    {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
    {state.active && <View style={[styles.card, { borderColor: line }]}><Text style={{ color: ink }}>Open: {state.active.title || stamp(state.active.startedAt)}</Text>
      {!state.acknowledged && <Text style={{ color: muted }}>This session was open when you returned. New moments are grouped here.</Text>}
      {!state.acknowledged && button('Resume session', controller.resume)}
      {button('End session', () => { void controller.end(); }, state.busy)}
    </View>}
    {!selected ? <>
      <View style={styles.row}>{button('Current sessions', () => { setArchived(false); void controller.loadSessions(false); })}{button('Archived sessions', () => { setArchived(true); void controller.loadSessions(true); })}</View>
      {(archived ? state.archived : state.sessions).map(row => <View key={row.id} style={[styles.card, { borderColor: line }]}>
        <Text style={{ color: ink }}>{row.title || stamp(row.startedAt)} {row.adjustedAt ? '· Adjusted' : ''}</Text>
        <Text style={{ color: muted }}>{stamp(row.startedAt)} → {stamp(row.endedAt)}</Text>
        {button(`Open session ${row.title || stamp(row.startedAt)}`, () => choose(row))}
      </View>)}
      {!archived && state.moreSessions && button('Older sessions', () => { void controller.loadSessions(false, true); })}
      {archived && state.moreArchived && button('Older archived sessions', () => { void controller.loadSessions(true, true); })}
    </> : <>
      {button('Back to sessions', () => { setSelected(null); void controller.loadSessions(archived); })}
      <Text style={[styles.heading, { color: ink }]}>{selected.title || stamp(selected.startedAt)}</Text>
      <Text style={{ color: muted }}>Start {stamp(selected.startedAt)} · End {stamp(selected.endedAt)}</Text>
      {selected.adjustedAt && <Text style={{ color: muted }}>Adjusted · Originally {stamp(selected.originalStartedAt)} → {stamp(selected.originalEndedAt)}</Text>}
      {input('Session title', title, setTitle)}
      <Text style={{ color: muted }}>Use ISO time with a timezone, for example 2026-09-23T10:00:00+05:45. Sessions may cross midnight.</Text>
      {input('Start date and time with timezone', start, setStart)}
      {selected.endedAt && input('End date and time with timezone', end, setEnd)}
      {button('Save session details', () => { void controller.adjust(selected.id, { title, startedAt: start, endedAt: selected.endedAt ? end : null }).then(() => { void controller.loadSessions(archived); }); }, state.busy)}
      {button('Session reflections', () => onReflection(selected))}
      {selected.endedAt && button(selected.archivedAt ? 'Restore session' : 'Archive session', () => { void controller.archive(selected.id, !selected.archivedAt).then(() => setSelected(null)); }, state.busy)}
      <Text style={[styles.heading, { color: ink }]}>Grouped moments</Text>
      {state.timelineStatus === 'loading' && <Text style={{ color: muted }}>Loading grouped moments…</Text>}
      {state.timelineStatus === 'failed' && <View><Text accessibilityRole="alert" style={styles.error}>Grouped moments could not load.</Text>{button('Retry grouped moments', () => { void controller.timeline(selected.id); })}</View>}
      {state.timeline.map(moment => <View key={moment.id} style={[styles.card, { borderColor: line }]}><Text style={{ color: ink }}>{moment.emotionLabel} · {stamp(moment.createdAt)}</Text>{button(`Open ${moment.emotionLabel} moment`, () => onMoment(moment))}</View>)}
      {state.timelineStatus === 'loadingOlder' && <Text style={{ color: muted }}>Loading older grouped moments…</Text>}
      {state.timelineStatus === 'failedOlder' && <Text accessibilityRole="alert" style={styles.error}>Older grouped moments could not load. Current moments are still here.</Text>}
      {state.moreTimeline && (state.timelineStatus === 'ready' || state.timelineStatus === 'failedOlder') && button(state.timelineStatus === 'failedOlder' ? 'Retry older grouped moments' : 'Older grouped moments', () => { void controller.timeline(selected.id, true); })}
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({ body: { padding: 24, paddingBottom: 40, gap: 14 }, heading: { fontSize: 27, marginVertical: 8 }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 9 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'flex-start' }, input: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 5 }, error: { color: '#b32318' } });
