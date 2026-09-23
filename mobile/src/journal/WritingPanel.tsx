import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { findOpeningWriting, findWritingById, type WritingController } from './writingController';
import type { TradingRepository, Writing, WritingOwner } from '../storage/tradingTypes';

export function WritingPanel({ controller, repository, owner, initialKind, ink, muted, line, onBack }: {
  controller: WritingController; repository(): Promise<TradingRepository>; owner: WritingOwner;
  initialKind: Writing['kind'];
  ink: string; muted: string; line: string; onBack(): void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [rows, setRows] = useState<Writing[]>([]);
  const [older, setOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  async function load(openEditor: boolean) {
    const token = ++request.current;
    const version = controller.version();
    try { const repo = await repository(); const result = await repo.writings(owner); const existing = openEditor ? await findOpeningWriting(repo, owner, initialKind, result) : undefined;
      if (token !== request.current) return;
      setRows(result); setOlder(result.length === 30); setLoading(false); setError(null);
      if (openEditor) controller.openIfCurrent(version, owner, initialKind, existing);
    } catch { if (token === request.current) { setError('Writing could not load. Please try again.'); setLoading(false); } }
  }
  useEffect(() => { setLoading(true); setError(null); setRows([]); void load(true); return () => { ++request.current; }; }, [owner.kind, owner.id, initialKind, repository, controller]);
  useEffect(() => () => { void controller.background(); }, [controller, owner.id]);
  async function reload() { await load(!!error); }
  async function loadOlder() { const last = rows.at(-1); if (!last) return; const token = ++request.current; try { const result = await (await repository()).writings(owner, { at: last.finalisedAt ?? last.updatedAt, id: last.id }); if (token === request.current) { setRows([...rows, ...result]); setOlder(result.length === 30); } } catch { if (token === request.current) setError('Older writing could not load. Please try again.'); } }
  async function selectWriting(kind: Writing['kind'], id?: string) {
    const token = ++request.current;
    const version = controller.version();
    try {
      const repo = await repository();
      const found = id ? await findWritingById(repo, owner, id) : await findOpeningWriting(repo, owner, kind, await repo.writings(owner));
      if (token !== request.current) return;
      if (id && !found) { setError('Writing could not load. Please try again.'); return; }
      controller.openIfCurrent(version, owner, kind, found);
    } catch { if (token === request.current) setError('Writing could not load. Please try again.'); }
  }
  function discard() { const action = () => { void controller.discard().then(reload); }; if (Platform.OS === 'web') { if (window.confirm('Discard this draft? Saved text will be removed.')) action(); } else Alert.alert('Discard draft?', 'Saved draft text will be removed. The moment or session and its clips stay.', [{ text: 'Keep', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: action }]); }
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={[styles.button, { borderColor: line, opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: ink }}>{label}</Text></Pressable>;
  const writing = state.writing;
  return <ScrollView contentContainerStyle={styles.body}>
    {button('Back from writing', onBack)}
    <Text style={[styles.heading, { color: ink }]}>{owner.kind === 'moment' ? 'Moment writing' : 'Session reflections'}</Text>
    {loading && <Text style={{ color: muted }}>Opening saved writing…</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {error && button('Retry loading writing', () => { void reload(); })}
    {!loading && !error && <>
      {owner.kind === 'moment' && button('Original note', () => { void selectWriting('note'); }, state.busy)}
      {rows.filter(row => row.kind === 'reflection').map(row => button(`${row.finalisedAt ? 'Reflection' : 'Draft reflection'} · ${new Date(row.createdAt).toLocaleString()}`, () => { void selectWriting('reflection', row.id); }, state.busy))}
      {older && button('Older writing', () => { void loadOlder(); })}
      {button('Add follow-up reflection', () => { ++request.current; controller.open(owner, 'reflection'); }, state.busy)}
      {writing && <View style={[styles.card, { borderColor: line }]}>
        <Text style={{ color: ink }}>{writing.kind === 'note' ? 'Original note' : 'Reflection'} · captured {new Date(writing.createdAt).toLocaleString()}</Text>
        {writing.finalisedAt && <Text style={{ color: muted }}>Finalised {new Date(writing.finalisedAt).toLocaleString()}</Text>}
        {writing.finalisedAt ? <Text selectable style={{ color: ink }}>{writing.text}</Text> : <TextInput accessibilityLabel={writing.kind === 'note' ? 'Original note text' : 'Reflection text'} editable={!state.busy} multiline value={state.text} onChangeText={text => { void controller.edit(text); }} placeholder="Write what you noticed" placeholderTextColor={muted} style={[styles.input, { borderColor: line, color: ink }]} />}
        <Text accessibilityLiveRegion="polite" style={{ color: state.status === 'Not saved' ? '#b32318' : muted }}>{state.status}</Text>
        {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
        {!writing.finalisedAt && <View style={styles.row}>{button('Done writing', () => { void controller.done().then(reload); }, state.busy)}{state.status === 'Not saved' && button('Retry saving draft', () => { void controller.retry(); }, state.busy)}{button('Discard draft', discard, state.busy)}</View>}
      </View>}
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({ body: { padding: 24, paddingBottom: 40, gap: 14 }, heading: { fontSize: 27 }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 }, button: { borderWidth: 1, borderRadius: 16, padding: 12, alignSelf: 'flex-start' }, input: { borderWidth: 1, borderRadius: 12, minHeight: 150, padding: 12, textAlignVertical: 'top' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, error: { color: '#b32318' } });
