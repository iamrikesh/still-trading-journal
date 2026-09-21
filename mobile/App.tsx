import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, BackHandler, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { createJournalController } from './src/journal/controller';
import { emotions } from './src/journal/emotions';
import { openJournal, isTemporaryJournal } from './src/storage/openJournal';
import { palettes, type Appearance } from './src/theme';
import { MediaVaultProofPanel } from './src/development/MediaVaultProofPanel';
import { createMediaVaultProof, type MediaVaultProofNative } from './src/development/mediaVaultProof';

export default function App() {
  return <SafeAreaProvider><JournalApp /></SafeAreaProvider>;
}

function JournalApp() {
  const systemTheme = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>('system');
  const dark = (appearance === 'system' ? systemTheme : appearance) === 'dark';
  const colors = palettes[dark ? 'dark' : 'light'];
  const styles = makeStyles(colors);
  const [controller] = useState(() => {
    let demoId = 0;
    return createJournalController({
      repository: openJournal,
      now: () => new Date().toISOString(),
      // Demo IDs stay in one in-memory app instance, including LAN HTTP previews.
      id: isTemporaryJournal ? () => `demo-${++demoId}` : randomUUID,
    });
  });
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [page, setPage] = useState<'now' | 'support' | 'history'>('now');
  const [deleteError, setDeleteError] = useState(false);
  // Keep one operation owner across page changes; the native vault also serializes calls.
  const [mediaProof] = useState(() => __DEV__ && Platform.OS === 'android' && !isTemporaryJournal
    ? createMediaVaultProof(requireOptionalNativeModule<MediaVaultProofNative>('StillMediaVault')) : null);

  useEffect(() => { void controller.refresh(); }, [controller]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 'now') return false;
      setPage('now');
      return true;
    });
    return () => back.remove();
  }, [page]);

  function removeMoment(id: string) {
    const remove = async () => {
      setDeleteError(false);
      try { await (await openJournal()).remove(id); await controller.refresh(); }
      catch { setDeleteError(true); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this moment? This cannot be undone.')) void remove();
    } else {
      Alert.alert('Delete this moment?', 'This cannot be undone.', [
        { text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(); } },
      ]);
    }
  }

  const chip = (label: string, onPress: () => void, selected = false) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.frame}>
        <View style={styles.header}>
          <Text style={styles.brand}>still<Text style={styles.brandDot}>.</Text></Text>
          <Text style={styles.eyebrow}>SPACE BEFORE ACTION</Text>
        </View>
        <View style={styles.demoBanner}>
          <Text style={styles.small}>{isTemporaryJournal ? 'Temporary demo · history resets when you reload' : 'Development build · use sample moments for now'}</Text>
        </View>

        {page === 'now' && <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.eyebrow}>A MOMENT FOR YOU</Text>
          <Text style={styles.title}>What’s coming{ '\n' }up right now?</Text>
          <Text style={styles.subtitle}>Notice it. Give yourself a little space.{ '\n' }One tap opens your reminder and logs the moment.</Text>
          <View style={styles.grid}>
            {emotions.map(emotion => <Pressable key={emotion.id} accessibilityRole="button" accessibilityLabel={emotion.label}
              onPress={() => { void controller.tap(emotion); setPage('support'); }}
              style={({ pressed }) => [styles.emotion, pressed && styles.pressed]}>
              <Text style={styles.symbol} accessible={false}>{emotion.symbol}</Text>
              <Text style={styles.emotionTitle}>{emotion.label}</Text>
              <Text style={styles.small}>{emotion.hint}</Text>
            </Pressable>)}
          </View>
          <Text style={styles.sectionLabel}>MAKE YOURSELF AT HOME</Text>
          <View style={styles.row}>{(['system', 'light', 'dark'] as const).map(mode => chip(mode.charAt(0).toUpperCase() + mode.slice(1), () => setAppearance(mode), appearance === mode))}</View>
          <Text style={styles.footnote}>There is no perfect label. “Unsure” is a place to start.</Text>
          {mediaProof && <MediaVaultProofPanel proof={mediaProof} ink={colors.ink} muted={colors.muted} line={colors.line} />}
        </ScrollView>}

        {page === 'support' && state.selected && <ScrollView contentContainerStyle={styles.body}>
          <Pressable accessibilityRole="button" onPress={() => setPage('now')} style={styles.back}><Text style={styles.link}>← All emotions</Text></Pressable>
          <Text style={styles.eyebrow}>{state.selected.label.toUpperCase()}</Text>
          <Text style={styles.title}>A little space.{ '\n' }A clearer choice.</Text>
          <View style={styles.supportCard}>
            <Text style={styles.sectionLabel}>YOUR INJECTING LOGIC</Text>
            <Text style={styles.supportText}>{state.selected.support}</Text>
            <View style={styles.rule} />
            <Text style={styles.small}>ONE POSSIBLE NEXT STEP</Text>
            <Text style={styles.action}>{state.selected.action}</Text>
          </View>
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.saveStatus, state.saveStatus === 'failed' && styles.error]}>
              {state.saveStatus === 'saving' ? 'Saving your moment…' : state.saveStatus === 'failed' ? state.saveError === 'capacity' ? 'Not logged: 50 moments are awaiting save. Retry those first. Your reminder is still here.' : state.saveError === 'capture' ? 'Could not log this tap. Your reminder is still here. Please try another tap.' : 'Not saved. Your reminder is still here.' : isTemporaryJournal ? '✓ Moment added to temporary demo history' : '✓ Moment saved on this device'}
            </Text>
          </View>
          {state.saveStatus === 'failed' && state.moment && chip('Retry save', () => { void controller.retry(state.moment!.id); })}
          <Text style={styles.footnote}>No explanation needed. Your emotion and the time are enough for this moment.</Text>
          {chip('See my moments', () => setPage('history'))}
          <Text style={styles.footnote}>Original starter reminder · personal editing and voice capture are coming in the next increments.</Text>
        </ScrollView>}

        {page === 'history' && <FlatList data={state.history} keyExtractor={item => item.id}
          contentContainerStyle={styles.body} initialNumToRender={10} windowSize={5}
          ListHeaderComponent={<>
            <Text style={styles.eyebrow}>YOUR RECENT MOMENTS</Text>
            <Text style={styles.title}>See it with{ '\n' }fresh eyes.</Text>
            <Text style={styles.subtitle}>A record of what you noticed.{ '\n' }Nothing to judge. Something to learn.</Text>
            <Text style={styles.small}>Showing up to 50 recent moments. Session grouping comes next.</Text>
            {state.historyStatus === 'failed' && <View style={styles.notice}><Text style={styles.error}>History couldn’t load. Saved moments have not been deleted.</Text>{chip('Try loading again', () => { void controller.refresh(); })}</View>}
            {deleteError && <Text accessibilityRole="alert" style={styles.error}>That moment could not be deleted. Please try again.</Text>}
          </>}
          ListEmptyComponent={<View style={styles.empty}>
            <Text style={styles.emotionTitle}>{state.historyStatus === 'loading' ? 'Opening your journal…' : state.historyStatus === 'failed' ? 'History is unavailable' : 'Your first moment starts with a tap.'}</Text>
            <Text style={styles.subtitle}>Choose an emotion whenever something comes up.</Text>
            {chip('Notice a moment', () => setPage('now'))}
          </View>}
          renderItem={({ item }) => <View style={styles.historyCard}>
            <View style={styles.historyHeading}><Text style={styles.emotionTitle}>{item.emotionLabel}</Text><Text style={styles.small}>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text></View>
            <Text style={styles.historyText}>{item.supportText}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.emotionLabel} moment`} onPress={() => removeMoment(item.id)} style={styles.delete}><Text style={styles.small}>Delete moment</Text></Pressable>
          </View>}
        />}

        {state.failed.length > 0 && <View style={styles.failureBar}>
          <Text style={styles.error}>{state.failed.length} moment{state.failed.length > 1 ? 's' : ''} not saved. Retry before closing.</Text>
          {chip('Retry unsaved moments', () => { for (const moment of state.failed) void controller.retry(moment.id); })}
        </View>}
        <View style={styles.tabs}>
          {chip('Now', () => setPage('now'), page !== 'history')}
          {chip('My moments', () => { setPage('history'); void controller.refresh(); }, page === 'history')}
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: typeof palettes.light) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    frame: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' },
    header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    brand: { fontSize: 32, fontWeight: '700', letterSpacing: -2, color: c.ink }, brandDot: { color: c.accent },
    eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, color: c.muted, flexShrink: 1 },
    demoBanner: { paddingVertical: 9, paddingHorizontal: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line },
    body: { padding: 24, paddingBottom: 32 },
    title: { fontSize: 37, fontWeight: '500', letterSpacing: -1.2, color: c.ink, lineHeight: 44, marginTop: 14, marginBottom: 14, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
    subtitle: { fontSize: 14, color: c.muted, lineHeight: 23, marginBottom: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, marginBottom: 30 },
    emotion: { width: '47.5%', flexGrow: 1, minHeight: 136, padding: 18, borderWidth: 1, borderColor: c.line, borderRadius: 22, backgroundColor: c.surface, justifyContent: 'space-between' },
    symbol: { fontSize: 29, color: c.accent, marginBottom: 18 },
    emotionTitle: { fontSize: 16, color: c.ink, fontWeight: '600', marginBottom: 6 },
    small: { fontSize: 12, color: c.muted, lineHeight: 18 },
    sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: c.muted, marginBottom: 14 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
    chipSelected: { backgroundColor: c.soft, borderColor: c.accent },
    chipText: { fontSize: 13, color: c.ink, fontWeight: '600' }, pressed: { opacity: 0.65 },
    footnote: { fontSize: 12, color: c.muted, lineHeight: 20, marginTop: 20, marginBottom: 16 },
    back: { paddingVertical: 8, minHeight: 44, marginBottom: 18 }, link: { fontSize: 14, color: c.accent },
    supportCard: { backgroundColor: c.soft, borderRadius: 26, padding: 26, marginTop: 12 },
    supportText: { fontSize: 26, lineHeight: 36, color: c.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
    rule: { height: 1, backgroundColor: c.line, marginVertical: 24 },
    action: { fontSize: 15, color: c.ink, lineHeight: 23, marginTop: 9 },
    saveStatus: { fontSize: 12, color: c.accent, lineHeight: 20, marginTop: 22, marginBottom: 10 },
    historyCard: { marginTop: 14, padding: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 20 },
    historyHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    historyText: { fontSize: 14, color: c.muted, lineHeight: 23, marginTop: 10 },
    delete: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 8 },
    empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: 22, padding: 24, marginTop: 24 },
    error: { color: c.error, fontSize: 12, lineHeight: 19 }, notice: { marginTop: 16, gap: 12 },
    failureBar: { borderTopWidth: 1, borderColor: c.line, padding: 12, gap: 8 },
    tabs: { padding: 14, borderTopWidth: 1, borderColor: c.line, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  });
}
