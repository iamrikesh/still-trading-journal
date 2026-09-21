import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { createClipRecoveryExercise } from './clipRecoveryExercise';

const results = {
  empty: 'No recovery test yet. Tap Prepare recovery test to begin.',
  incomplete: 'Preparation is incomplete. Tap Prepare recovery test to retry with the same test IDs.',
  restart: 'One saved clip, one pending clip. Fully close and restart the app, then tap Check recovery.',
  recovered: 'Two saved clips verified. No staging, pending or verification files remain.',
  deleted: 'Test moment deleted. Both clips are absent and deletion is recorded. Restart and Check recovery again.',
};
export function ClipRecoveryPanel({ exercise, ink, muted, line }: {
  exercise: ReturnType<typeof createClipRecoveryExercise>; ink: string; muted: string; line: string;
}) {
  const state = useSyncExternalStore(exercise.subscribe, exercise.getSnapshot);
  const busy = state.status === 'busy';
  const disabled = busy || state.status === 'unavailable';
  const message = state.status === 'idle' ? 'Prepare two generated clips, restart the app, then check recovery.'
    : state.status === 'busy' ? 'Working on the recovery test…'
    : state.status === 'unavailable' ? 'Clip recovery learning is unavailable in this build. Install the updated development app.'
    : state.status === 'failed' ? 'Recovery test could not complete. Existing data has not been reset. You can retry.'
    : state.result ? results[state.result.status] : '';
  return <View style={{ marginTop: 22, borderTopWidth: 1, borderColor: line, paddingTop: 18, gap: 12 }}>
    <Text style={{ color: ink, fontSize: 16, fontWeight: '600' }}>Learning: clip recovery</Text>
    <Text style={{ color: muted, lineHeight: 20 }}>Generated test clips only. No microphone is used. Prepare adds a sample moment to My moments.</Text>
    <View accessibilityLiveRegion="polite"><Text style={{ color: ink, lineHeight: 20 }}>{message}</Text></View>
    {state.result && <Text style={{ color: muted }}>{state.result.saved} saved · {state.result.pending} pending</Text>}
    {state.recoveryPending > 0 && <Text style={{ color: muted }}>Unfinished clip work: {state.recoveryPending}. New recording work waits for recovery; your journal remains usable.</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {([
        ['Prepare recovery test', exercise.prepare], ['Check recovery', exercise.check], ['Delete test moment', exercise.remove],
      ] as const).map(([label, action]) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled, busy }}
        disabled={disabled} onPress={() => { void action(); }}
        style={{ padding: 12, minHeight: 46, borderWidth: 1, borderColor: line, borderRadius: 18, opacity: disabled ? 0.5 : 1 }}>
        <Text style={{ color: ink }}>{label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
