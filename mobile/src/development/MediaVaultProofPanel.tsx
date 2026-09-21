import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createMediaVaultProof, proofCheckLabels } from './mediaVaultProof';

const messages = {
  unavailable: 'This installed build does not include the file test yet.',
  idle: 'Prepare a generated test file, then restart the app and verify it.',
  preparing: 'Preparing the encrypted test file…',
  prepared: 'Test file prepared. Restart the app, then tap Verify test file.',
  verifying: 'Checking the stored test file and failure handling…',
  verified: 'File checks passed. This is not a complete security audit.',
  failed: 'Test-file check failed. Prepare first if no test file exists.',
};

export function MediaVaultProofPanel({ proof, ink, muted, line }: {
  proof: ReturnType<typeof createMediaVaultProof>; ink: string; muted: string; line: string;
}) {
  const state = useSyncExternalStore(proof.subscribe, proof.getSnapshot);
  const busy = state.status === 'preparing' || state.status === 'verifying';
  const disabled = busy || state.status === 'unavailable';
  return <View style={{ marginTop: 22, borderTopWidth: 1, borderColor: line, paddingTop: 18, gap: 12 }}>
    <Text style={{ color: ink, fontSize: 16, fontWeight: '600' }}>Learning: encrypted files</Text>
    <Text style={{ color: muted, lineHeight: 20 }}>Generated test data only. No microphone or journal contents are used.</Text>
    <View accessibilityLiveRegion="polite">
      <Text style={{ color: ink, lineHeight: 20 }}>{messages[state.status]}</Text>
    </View>
    {state.fixtureBytes !== null && <Text style={{ color: muted }}>Test file: {state.fixtureBytes.toLocaleString()} bytes</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {([
        ['Prepare test file', proof.prepare], ['Verify test file', proof.verify],
      ] as const).map(([label, action]) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled, busy }}
        disabled={disabled} onPress={() => { void action(); }}
        style={{ padding: 12, minHeight: 46, borderWidth: 1, borderColor: line, borderRadius: 18, opacity: disabled ? 0.5 : 1 }}>
        <Text style={{ color: ink }}>{label}</Text>
      </Pressable>)}
    </View>
    {state.checks.map(check => <Text key={check} style={{ color: ink, lineHeight: 20 }}>✓ {proofCheckLabels[check]}</Text>)}
  </View>;
}
