// Only fixed labels cross from native proof results into the teaching panel.
export const proofCheckLabels = {
  roundtrip: 'Encrypted file restored correctly',
  'wrong-key': 'Wrong key rejected',
  'wrong-owner': 'Wrong clip owner rejected',
  tamper: 'Altered ciphertext rejected',
  truncation: 'Incomplete ciphertext rejected',
  oversize: 'File-size limit enforced',
  'destination-preserved': 'Existing destination preserved',
  'plaintext-cleanup': 'Failed plaintext output cleaned up',
  'key-loss-fail-closed': 'Missing wrapping key does not reset data',
  'keyset-loss-fail-closed': 'Missing media keyset does not reset data',
} as const;

export interface MediaVaultProofNative {
  prepareProof(): Promise<{ fixtureBytes: number }>;
  verifyProof(): Promise<{ fixtureBytes: number; checks: string[] }>;
}

type Check = keyof typeof proofCheckLabels;
type ProofState = {
  status: 'unavailable' | 'idle' | 'preparing' | 'prepared' | 'verifying' | 'verified' | 'failed';
  fixtureBytes: number | null;
  checks: Check[];
};

export function createMediaVaultProof(native: MediaVaultProofNative | null) {
  let state: ProofState = { status: native ? 'idle' : 'unavailable', fixtureBytes: null, checks: [] };
  const listeners = new Set<() => void>();
  const update = (next: ProofState) => { state = next; listeners.forEach(listener => listener()); };

  async function run(operation: 'prepare' | 'verify') {
    if (!native || state.status === 'preparing' || state.status === 'verifying') return;
    update({ status: operation === 'prepare' ? 'preparing' : 'verifying', fixtureBytes: null, checks: [] });
    try {
      const result = operation === 'prepare' ? await native.prepareProof() : await native.verifyProof();
      if (!Number.isInteger(result.fixtureBytes) || result.fixtureBytes <= 0 || result.fixtureBytes > 4 * 1024 * 1024) throw new Error('Invalid proof response');
      const checks = operation === 'verify' && 'checks' in result ? result.checks : [];
      if (operation === 'verify' && (!Array.isArray(checks) || checks.length !== Object.keys(proofCheckLabels).length ||
        new Set(checks).size !== checks.length || checks.some(check => !Object.hasOwn(proofCheckLabels, check)))) {
        throw new Error('Incomplete proof');
      }
      update({ status: operation === 'prepare' ? 'prepared' : 'verified', fixtureBytes: result.fixtureBytes, checks: checks as Check[] });
    } catch {
      // Native exceptions may contain file paths or key material. Never retain them.
      update({ status: 'failed', fixtureBytes: null, checks: [] });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    prepare: () => run('prepare'),
    verify: () => run('verify'),
  };
}
