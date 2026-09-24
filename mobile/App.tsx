import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, BackHandler, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { createJournalController } from './src/journal/controller';
import { emotions } from './src/journal/emotions';
import { openJournal, openJournalSession, isTemporaryJournal } from './src/storage/openJournal';
import { palettes, radius, spacing, typography, type Appearance } from './src/theme';
import { ActionButton } from './src/components/ActionButton';
import { backDestination, restoreSupport, type Page } from './src/journal/navigation';
import { MediaVaultProofPanel } from './src/development/MediaVaultProofPanel';
import { createMediaVaultProof, type MediaVaultProofNative } from './src/development/mediaVaultProof';
import { createClipRecoveryExercise } from './src/development/clipRecoveryExercise';
import { ClipRecoveryPanel } from './src/development/ClipRecoveryPanel';
import { createAppRecordingController } from './src/recording/runtime';
import { RecordingPanel } from './src/recording/RecordingPanel';
import type { Moment } from './src/storage/types';
import type { TradingRepository, TradingSession, WritingOwner } from './src/storage/tradingTypes';
import { createTradingController } from './src/journal/tradingController';
import { createWritingController } from './src/journal/writingController';
import { TradingPanel } from './src/journal/TradingPanel';
import { WritingPanel } from './src/journal/WritingPanel';
import { createNativeReminders } from './src/reminders/nativeReminders';
import { createAppearanceController, createCoordinatedRecordingController, createReminderController } from './src/reminders/controller';
import { ReminderEditor, ReminderManager } from './src/reminders/ReminderEditor';
import { ReminderSupport } from './src/reminders/ReminderSupport';

async function tradingRepository(): Promise<TradingRepository> {
  const trading = (await openJournalSession()).trading;
  if (!trading) throw new Error('Sessions and writing require the Android development build.');
  return trading;
}

export default function App() {
  return <SafeAreaProvider><JournalApp /></SafeAreaProvider>;
}

function JournalApp() {
  const insets = useSafeAreaInsets();
  const systemTheme = useColorScheme();
  const [appearanceController] = useState(() => createAppearanceController({ repository: async () => (await openJournalSession()).appearance ?? null }));
  const appearanceState = useSyncExternalStore(appearanceController.subscribe, appearanceController.getSnapshot);
  const appearance: Appearance = appearanceState.value;
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
  const [page, setPage] = useState<Page>('now');
  const [writingOrigin, setWritingOrigin] = useState<Page>('now');
  const [showSessionStart, setShowSessionStart] = useState(false);
  const [showDevelopment, setShowDevelopment] = useState(false);
  const [clipMoment, setClipMoment] = useState<Moment | null>(null);
  const [baseRecording] = useState(createAppRecordingController);
  const [reminder] = useState(() => createReminderController({
    repository: async () => (await openJournalSession()).reminders ?? null,
    native: Platform.OS === 'android' && !isTemporaryJournal ? createNativeReminders(requireOptionalNativeModule('StillMediaVault')) : null,
    recording: baseRecording, id: randomUUID,
  }));
  const reminderState = useSyncExternalStore(reminder.subscribe, reminder.getSnapshot);
  const [recording] = useState(() => createCoordinatedRecordingController(baseRecording, reminder));
  const [trading] = useState(() => createTradingController({ repository: tradingRepository, recording, id: randomUUID, now: () => new Date().toISOString() }));
  const tradingState = useSyncExternalStore(trading.subscribe, trading.getSnapshot);
  const [writing] = useState(() => createWritingController({ repository: tradingRepository, id: randomUUID, now: () => new Date().toISOString() }));
  const [writingOwner, setWritingOwner] = useState<WritingOwner | null>(null);
  const [writingKind, setWritingKind] = useState<'note' | 'reflection'>('note');
  const [startTitle, setStartTitle] = useState('');
  const [momentSession, setMomentSession] = useState<TradingSession | null>(null);
  const [groupSessions, setGroupSessions] = useState<TradingSession[]>([]);
  const [groupMore, setGroupMore] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const audioState = useSyncExternalStore(recording.subscribe, recording.getSnapshot);
  const recordingOwner = page === 'support' && state.saveStatus === 'saved' ? state.moment?.id ?? null : page === 'clips' ? clipMoment?.id ?? null : null;
  useEffect(() => { void recording.select(recordingOwner); }, [recording, recordingOwner]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { if (value === 'active') reminder.foreground(); else reminder.background(); void (value === 'active' ? recording.foreground() : recording.background()); if (value !== 'active') void writing.background(); });
    // Fast Refresh runs effect cleanup without an Android foreground event.
    if (AppState.currentState === 'active') reminder.foreground(); else reminder.background();
    void (AppState.currentState === 'active' ? recording.foreground() : recording.background());
    const timer = setInterval(() => { void recording.poll(); void reminder.poll(); }, 300);
    return () => { listener.remove(); clearInterval(timer); reminder.background(); void recording.background(); };
  }, [recording, reminder, writing]);
  const [deleteError, setDeleteError] = useState(false);
  // Keep one operation owner across page changes; the native vault also serializes calls.
  const [mediaProof] = useState(() => __DEV__ && Platform.OS === 'android' && !isTemporaryJournal
    ? createMediaVaultProof(requireOptionalNativeModule<MediaVaultProofNative>('StillMediaVault')) : null);
  const [clipExercise] = useState(() => __DEV__ && Platform.OS === 'android' && !isTemporaryJournal
    ? createClipRecoveryExercise(openJournalSession) : null);

  useEffect(() => { void controller.refresh(); void reminder.refresh(); void appearanceController.load(); if (!isTemporaryJournal) void trading.refresh(); }, [controller, trading, reminder, appearanceController]);
  useEffect(() => { if (page !== 'writing') void writing.background(); }, [page, writing]);
  useEffect(() => { if (clipMoment && page === 'clips' && !isTemporaryJournal) { void tradingRepository().then(repo => repo.membership(clipMoment.id)).then(setMomentSession).catch(() => setGroupError('Grouping could not load.')); } }, [clipMoment, page]);
  // Read existing state only: startup session recovery has already run. Never
  // automatically prepare fixtures or delete a moment on mounting this panel.
  useEffect(() => { if (clipExercise) void clipExercise.check(); }, [clipExercise]);
  function navigate(target: Page, after?: () => void) {
    if (target !== page && page === 'support') reminder.leaveSupport();
    else if (target !== page && page === 'editor') void reminder.stop();
    const finish = () => {
      if (page === 'editor' && target !== 'editor' && !reminder.discard()) return;
      after?.();
      if (target === 'support' && page === 'writing' && state.selected) void restoreSupport(reminder, state.selected.id);
      setPage(target);
      if (target === 'history' && page !== 'history' && page !== 'writing') void controller.refresh();
    };
    const draft = reminder.getSnapshot();
    if (page !== 'editor' || target === 'editor' || !draft.draft || !draft.dirty) { finish(); return; }
    const saveAndLeave = () => { void reminder.save().then(saved => { if (saved) finish(); }); };
    if (Platform.OS === 'web') {
      if (window.confirm('Save your reminder edits before leaving?')) saveAndLeave();
      else if (window.confirm('Discard your reminder edits?')) finish();
      return;
    }
    Alert.alert('Leave reminder editor?', 'Save your changes or discard this draft before leaving.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: finish },
      { text: 'Save', onPress: saveAndLeave },
    ]);
  }
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      const destination = backDestination(page, writingOrigin);
      if (!destination) return false;
      navigate(destination);
      return true;
    });
    return () => back.remove();
  }, [page, writingOrigin, reminder, controller]);

  function removeMoment(id: string) {
    const remove = async () => {
      setDeleteError(false);
      try { await controller.remove(id); }
      catch { setDeleteError(true); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this moment, its note, reflections and attached clips? This cannot be undone.')) void remove();
    } else {
      Alert.alert('Delete this moment?', 'This also deletes its note, reflections and attached clips. This cannot be undone.', [
        { text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(); } },
      ]);
    }
  }

  function openWriting(owner: WritingOwner, kind: 'note' | 'reflection' = owner.kind === 'session' ? 'reflection' : 'note') {
    if (page !== 'writing') setWritingOrigin(page);
    const current = writing.getSnapshot();
    if (!writing.canSwitch(owner, kind) && current.writing) {
      writing.open(owner, kind);
      setWritingOwner(current.writing.owner); setWritingKind(current.writing.kind); navigate('writing'); return;
    }
    setWritingKind(kind); setWritingOwner(owner); navigate('writing');
  }
  async function createNote() {
    if (isTemporaryJournal) return;
    const moment: Moment = { id: randomUUID(), emotionId: 'note', emotionLabel: 'Note', createdAt: new Date().toISOString(), supportText: '' };
    try { await (await openJournal()).save(moment); await controller.refresh(); setClipMoment(moment); openWriting({ kind: 'moment', id: moment.id }); }
    catch { setGroupError('Note could not be saved. Please try again.'); }
  }
  async function loadGrouping(older = false) {
    try { const last = older ? groupSessions.at(-1) : undefined; const rows = await (await tradingRepository()).sessions(false, last ? { at: last.startedAt, id: last.id } : undefined); setGroupSessions(older ? [...groupSessions, ...rows] : rows); setGroupMore(rows.length === 30); setGroupError(null); }
    catch { setGroupError('Sessions could not load. Please try again.'); }
  }
  async function assignSession(id: string | null) {
    if (!clipMoment) return;
    try { await (await tradingRepository()).assign(clipMoment.id, id); setMomentSession(await (await tradingRepository()).membership(clipMoment.id)); setGroupError(null); }
    catch { setGroupError('Grouping could not be saved. Please try again.'); }
  }

  const chip = (label: string, onPress: () => void, selected = false) =>
    <ActionButton key={label} label={label} onPress={onPress} selected={selected} colors={colors} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.frame} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
        <View style={styles.header}>
          <Text style={styles.brand}>still<Text style={styles.brandDot}>.</Text></Text>
          {chip(page === 'settings' ? 'Back to Now' : 'Settings', () => navigate(page === 'settings' ? 'now' : 'settings'))}
        </View>
        <View style={styles.demoBanner}>
          <Text style={styles.small}>{isTemporaryJournal ? 'Temporary demo · history resets on reload' : 'Development build · sample moments only'}</Text>
        </View>
        {!isTemporaryJournal && tradingState.active && <View style={styles.failureBar}>
          <Text style={styles.emotionTitle}>Open session: {tradingState.active.title || new Date(tradingState.active.startedAt).toLocaleString()}</Text>
          {!tradingState.acknowledged && <Text style={styles.small}>This session was open when you returned. New moments are grouped here.</Text>}
          <View style={styles.row}>
            {!tradingState.acknowledged && chip('Resume session', trading.resume)}
            {chip('End session', () => { void trading.end(); })}
          </View>
          {tradingState.error && <Text accessibilityRole="alert" style={styles.error}>{tradingState.error}</Text>}
        </View>}

        {page === 'now' && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text style={styles.title}>How are you feeling?</Text>
          <Text style={styles.subtitle}>Tap a reminder to pause and save the moment.</Text>
          {!isTemporaryJournal && <View style={styles.quickActions}>
            <ActionButton label="Write note" onPress={() => { void createNote(); }} colors={colors} primary style={styles.quickAction} />
            {!tradingState.active && <ActionButton label={showSessionStart ? 'Cancel session setup' : 'Start session'} onPress={() => setShowSessionStart(!showSessionStart)} colors={colors} style={styles.quickAction} />}
          </View>}
          {!isTemporaryJournal && !tradingState.active && showSessionStart && <View style={styles.sessionSetup}>
            <Text style={styles.emotionTitle}>Start a trading session</Text>
            <Text style={styles.small}>New moments will be grouped in this session.</Text>
            <TextInput accessibilityLabel="Optional session title" placeholder="Session title (optional)" placeholderTextColor={colors.muted} value={startTitle} onChangeText={setStartTitle} style={styles.input} />
            <ActionButton label="Begin session" disabled={tradingState.busy} colors={colors} primary onPress={() => { void trading.start(startTitle).then(() => { if (trading.getSnapshot().active) { setShowSessionStart(false); setStartTitle(''); } }); }} />
          </View>}
          {tradingState.error && <Text accessibilityRole="alert" style={styles.error}>{tradingState.error}</Text>}
          {groupError && <Text accessibilityRole="alert" style={styles.error}>{groupError}</Text>}
          {reminderState.loadStatus === 'loading' && !isTemporaryJournal && <Text style={styles.small}>Loading your saved buttons…</Text>}
          {reminderState.loadStatus === 'failed' && !isTemporaryJournal && <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.error}>Saved buttons could not load.</Text>
            {chip('Retry saved buttons', () => { void reminder.refresh(); })}
          </View>}
          <View style={styles.grid}>
            {(reminderState.loadStatus === 'ready' ? reminderState.active : isTemporaryJournal || reminderState.loadStatus === 'unavailable' ? emotions : []).map(emotion => <Pressable key={emotion.id} accessibilityRole="button" accessibilityLabel={emotion.label}
              onPress={() => { void controller.tap(emotion); const saved = reminderState.active.find(card => card.id === emotion.id); if (saved) void reminder.selectSupport(saved); navigate('support'); }}
              style={({ pressed }) => [styles.emotion, pressed && styles.pressed]}>
              <Text style={styles.emotionTitle}>{emotion.symbol ? `${emotion.symbol}  ` : ''}{emotion.label}</Text>
              <Text style={styles.small}>{emotion.hint}</Text>
            </Pressable>)}
          </View>
          <Text style={styles.footnote}>No perfect label needed. Unsure is a place to start.</Text>
        </ScrollView>}

        {page === 'settings' && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Make this space your own.</Text>
          {!isTemporaryJournal && reminderState.loadStatus === 'ready' && chip('Manage reminder buttons', () => navigate('reminders'))}
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.row}>{(['system', 'light', 'dark'] as const).map(mode => chip(mode.charAt(0).toUpperCase() + mode.slice(1), () => { void appearanceController.choose(mode); }, appearance === mode))}</View>
          {appearanceState.status === 'saving' && <Text style={styles.small}>Saving appearance…</Text>}
          {appearanceState.status === 'failed' && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>Appearance not saved. Your choice remains for this run.</Text>
            {chip('Retry appearance', () => { void appearanceController.retry(); })}</View>}
          {appearanceState.status === 'loadFailed' && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>Saved appearance could not load. System appearance is temporary.</Text>
            {chip('Retry loading appearance', () => { void appearanceController.load(); })}</View>}
          {appearanceState.status === 'unavailable' && <Text style={styles.small}>Appearance is temporary in this demo.</Text>}

          {isTemporaryJournal && <Text style={styles.footnote}>Sessions, notes and reflections need the Android development build.</Text>}
          {(mediaProof || clipExercise) && <View style={styles.notice}>
            {chip(showDevelopment ? 'Hide development tools' : 'Development tools', () => setShowDevelopment(!showDevelopment))}
            {showDevelopment && <>
              {mediaProof && <MediaVaultProofPanel proof={mediaProof} ink={colors.ink} muted={colors.muted} line={colors.line} />}
              {clipExercise && <ClipRecoveryPanel exercise={clipExercise} ink={colors.ink} muted={colors.muted} line={colors.line} />}
            </>}
          </View>}
        </ScrollView>}

        {page === 'support' && state.selected && <ScrollView contentContainerStyle={styles.body}>
          <Pressable accessibilityRole="button" onPress={() => navigate('now')} style={styles.back}><Text style={styles.link}>← All emotions</Text></Pressable>
          <Text style={styles.title}>{state.selected.label}</Text>
          {reminderState.selected ? <ReminderSupport controller={reminder} colors={colors} /> : <View style={styles.supportCard}>
            <Text style={styles.sectionLabel}>YOUR REMINDER</Text>
            <Text style={styles.supportText}>{state.selected.support}</Text>
            <View style={styles.rule} />
            <Text style={styles.small}>ONE POSSIBLE NEXT STEP</Text>
            <Text style={styles.action}>{state.selected.action}</Text>
          </View>}
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.saveStatus, state.saveStatus === 'failed' && styles.error]}>
              {state.saveStatus === 'saving' ? 'Saving your moment…' : state.saveStatus === 'failed' ? state.saveError === 'capacity' ? 'Not logged: 50 moments are awaiting save. Retry those first. Your reminder is still here.' : state.saveError === 'capture' ? 'Could not log this tap. Your reminder is still here. Please try another tap.' : 'Not saved. Your reminder is still here.' : isTemporaryJournal ? '✓ Moment added to temporary demo history' : '✓ Moment saved on this device'}
            </Text>
          </View>
          {state.saveStatus === 'failed' && state.moment && chip('Retry save', () => { void controller.retry(state.moment!.id); })}
          {!isTemporaryJournal && state.saveStatus === 'saved' && state.moment && <>
            {chip('Write original note', () => openWriting({ kind: 'moment', id: state.moment!.id }))}
            {chip('Add moment reflection', () => openWriting({ kind: 'moment', id: state.moment!.id }, 'reflection'))}
          </>}
          <Text style={styles.footnote}>No explanation needed. Your emotion and the time are enough for this moment.</Text>
          {chip('See my moments', () => navigate('history'))}
          {Platform.OS === 'android' && !isTemporaryJournal && state.saveStatus === 'saved' && <RecordingPanel controller={recording} ink={colors.ink} muted={colors.muted} line={colors.line} onOpenMoment={moment => { setClipMoment(moment); navigate('clips'); }} />}
        </ScrollView>}

        {page === 'reminders' && <ReminderManager controller={reminder} colors={colors}
          onEdit={card => { reminder.edit(card); navigate('editor'); }}
          onAdd={() => { if (reminder.add()) navigate('editor'); }} />}
        {page === 'editor' && <ReminderEditor controller={reminder} colors={colors}
          onBack={() => { reminder.discard(); void reminder.stop(); setPage('reminders'); }}
          onSaved={() => { void reminder.stop(); setPage('reminders'); }} />}

        {page === 'clips' && clipMoment && <ScrollView contentContainerStyle={styles.body}>
          {chip('← My moments', () => navigate('history'))}
          <Text style={styles.eyebrow}>{clipMoment.emotionLabel.toUpperCase()}</Text>
          <Text style={styles.small}>{new Date(clipMoment.createdAt).toLocaleString()}</Text>
          <Text style={styles.supportText}>{clipMoment.supportText}</Text>
          {!isTemporaryJournal && <>
            {chip('Open note and reflections', () => openWriting({ kind: 'moment', id: clipMoment.id }))}
            <Text style={styles.small}>Grouped in: {momentSession ? `${momentSession.title || new Date(momentSession.startedAt).toLocaleString()}${momentSession.archivedAt ? ' · Archived' : ''}` : 'Outside session'}</Text>
            {chip('Choose session grouping', () => { void loadGrouping(); })}
            {chip('Outside session', () => { void assignSession(null); })}
            {groupSessions.map(row => chip(`Group in ${row.title || new Date(row.startedAt).toLocaleString()}`, () => { void assignSession(row.id); }))}
            {groupMore && chip('Older grouping choices', () => { void loadGrouping(true); })}
            {groupError && <Text accessibilityRole="alert" style={styles.error}>{groupError}</Text>}
          </>}
          <RecordingPanel controller={recording} ink={colors.ink} muted={colors.muted} line={colors.line} onOpenMoment={moment => { setClipMoment(moment); navigate('clips'); }} />
        </ScrollView>}

        {page === 'sessions' && !isTemporaryJournal && <TradingPanel controller={trading} ink={colors.ink} muted={colors.muted} line={colors.line} onMoment={moment => { setClipMoment(moment); navigate('clips'); }} onReflection={session => openWriting({ kind: 'session', id: session.id })} />}
        {page === 'writing' && writingOwner && !isTemporaryJournal && <WritingPanel controller={writing} repository={tradingRepository} owner={writingOwner} initialKind={writingKind} colors={colors} onBack={() => navigate(writingOrigin)} />}

        {page === 'history' && <FlatList data={state.history} keyExtractor={item => item.id}
          contentContainerStyle={styles.body} initialNumToRender={10} windowSize={5}
          ListHeaderComponent={<>
            <Text style={styles.title}>My moments</Text>
            <Text style={styles.subtitle}>What you noticed, in your own time.</Text>
            {state.historyStatus === 'failed' && <View style={styles.notice}><Text style={styles.error}>History couldn’t load. Saved moments have not been deleted.</Text>{chip('Try loading again', () => { void controller.refresh(); })}</View>}
            {deleteError && <Text accessibilityRole="alert" style={styles.error}>That moment could not be deleted. Please try again.</Text>}
          </>}
          ListEmptyComponent={<View style={styles.empty}>
            <Text style={styles.emotionTitle}>{state.historyStatus === 'loading' ? 'Opening your journal…' : state.historyStatus === 'failed' ? 'History is unavailable' : 'Your first moment starts with a tap.'}</Text>
            <Text style={styles.subtitle}>Choose an emotion whenever something comes up.</Text>
            {chip('Notice a moment', () => navigate('now'))}
          </View>}
          renderItem={({ item }) => <View style={styles.historyCard}>
            <View style={styles.historyHeading}><Text style={styles.emotionTitle}>{item.emotionLabel}</Text><Text style={styles.small}>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text></View>
            {item.session && <Text style={styles.small}>Session: {item.session.title || new Date(item.session.startedAt).toLocaleString()}{item.session.archivedAt ? ' · Archived' : ''}</Text>}
            <Text style={styles.historyText}>{item.supportText}</Text>
            {!isTemporaryJournal && chip(`Open ${item.emotionLabel} writing`, () => { setClipMoment(item); openWriting({ kind: 'moment', id: item.id }); })}
            {Platform.OS === 'android' && !isTemporaryJournal && chip('Open voice clips', () => { setClipMoment(item); navigate('clips'); })}
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.emotionLabel} moment`} onPress={() => removeMoment(item.id)} style={styles.delete}><Text style={styles.small}>Delete moment</Text></Pressable>
          </View>}
          ListFooterComponent={<View style={styles.notice}>
            {state.historyStatus === 'ready' && <View style={styles.row}>
              {chip('Newest', () => { void controller.refresh(); })}
              {state.olderStatus !== 'end' && state.olderStatus !== 'loading' && chip(state.olderStatus === 'failed' ? 'Retry Older' : 'Older', () => { void controller.older(); })}
            </View>}
            {state.olderStatus === 'loading' && <Text style={styles.small}>Loading older moments…</Text>}
            {state.olderStatus === 'end' && state.history.length > 0 && <Text style={styles.small}>You have reached the oldest saved moment.</Text>}
            {state.olderStatus === 'failed' && <Text accessibilityRole="alert" style={styles.error}>Older moments could not load. Your current page is still here.</Text>}
          </View>}
        />}

        {audioState.phase === 'cleanup' && <View style={styles.failureBar}>
          <Text accessibilityRole="alert" style={styles.error}>{audioState.message}</Text>
          {chip('Stop again', () => { void recording.stop(); })}
        </View>}
        {reminderState.playing === 'cleanup' && <View style={styles.failureBar}>
          <Text accessibilityRole="alert" style={styles.error}>Reminder audio release is not confirmed. Stop again before other audio.</Text>
          {chip('Stop reminder again', () => { void reminder.stop(); })}
        </View>}
        {audioState.pending > 0 && <View style={styles.failureBar}>
          <Text style={styles.error}>{audioState.pending} clip operation(s) need attention.</Text>
          {chip('Retry pending clips', () => { void recording.recover(); })}
          {audioState.pendingOwners.map(owner => chip(`Open pending ${owner.emotionLabel} moment`, () => navigate('clips', () => setClipMoment(owner))))}
        </View>}
        {state.failed.length > 0 && <View style={styles.failureBar}>
          <Text style={styles.error}>{state.failed.length} moment{state.failed.length > 1 ? 's' : ''} not saved. Retry before closing.</Text>
          {chip('Retry unsaved moments', () => { for (const moment of state.failed) void controller.retry(moment.id); })}
        </View>}
        {page !== 'writing' && <View style={styles.tabs}>
          {chip('Now', () => navigate('now'), page === 'now')}
          {chip('My moments', () => navigate('history'), page === 'history')}
          {!isTemporaryJournal && chip('Sessions', () => navigate('sessions'), page === 'sessions')}
        </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: typeof palettes.light) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    frame: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' },
    header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    brand: { fontSize: 28, fontWeight: '700', letterSpacing: -1, color: c.ink }, brandDot: { color: c.accent },
    eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, color: c.muted, flexShrink: 1 },
    demoBanner: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderColor: c.line },
    body: { padding: spacing.xl, paddingBottom: spacing.section },
    title: { ...typography.title, color: c.ink, marginBottom: spacing.sm },
    subtitle: { ...typography.body, color: c.muted, marginBottom: spacing.xl },
    quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xxl },
    quickAction: { flexGrow: 1, flexBasis: 140 },
    sessionSetup: { gap: spacing.md, marginBottom: spacing.xxl },
    input: { ...typography.body, minHeight: 48, borderWidth: 1, borderColor: c.line, borderRadius: radius.control, padding: spacing.md, color: c.ink, backgroundColor: c.surface },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    emotion: { flexBasis: 145, flexGrow: 1, minHeight: 92, padding: spacing.lg, borderWidth: 1, borderColor: c.line, borderRadius: radius.surface, backgroundColor: c.surface, justifyContent: 'center' },
    symbol: { fontSize: 29, color: c.accent, marginBottom: 18 },
    emotionTitle: { ...typography.label, fontSize: 16, color: c.ink, marginBottom: spacing.xs },
    small: { ...typography.caption, color: c.muted },
    sectionLabel: { ...typography.heading, color: c.ink, marginTop: spacing.xxl, marginBottom: spacing.md },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
    chipSelected: { backgroundColor: c.soft, borderColor: c.accent },
    chipText: { fontSize: 13, color: c.ink, fontWeight: '600' }, pressed: { opacity: 0.65 },
    footnote: { fontSize: 12, color: c.muted, lineHeight: 20, marginTop: 20, marginBottom: 16 },
    back: { paddingVertical: spacing.md, minHeight: 48, marginBottom: spacing.sm }, link: { ...typography.label, color: c.accent },
    supportCard: { backgroundColor: c.soft, borderRadius: radius.surface, padding: spacing.xl, marginTop: spacing.md },
    supportText: { fontSize: 22, lineHeight: 32, color: c.ink },
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
    tabs: { padding: spacing.sm, borderTopWidth: 1, borderColor: c.line, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  });
}
