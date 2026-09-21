import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaVaultProof, proofCheckLabels } from '../src/development/mediaVaultProof.ts';

const report = () => ({ fixtureBytes: 8193, checks: Object.keys(proofCheckLabels) });

test('proof is explicit and preparation does not claim verification', async () => {
  let prepares = 0;
  const proof = createMediaVaultProof({ prepareProof: async () => { prepares++; return { fixtureBytes: 8193 }; }, verifyProof: async () => report() });
  assert.equal(prepares, 0);
  assert.equal(proof.getSnapshot().status, 'idle');
  await proof.prepare();
  assert.equal(prepares, 1);
  assert.equal(proof.getSnapshot().status, 'prepared');
  assert.deepEqual(proof.getSnapshot().checks, []);
  await proof.verify();
  assert.equal(proof.getSnapshot().status, 'verified');
  assert.equal(proof.getSnapshot().checks.length, Object.keys(proofCheckLabels).length);
});

test('an old APK with no proof module remains usable', async () => {
  const proof = createMediaVaultProof(null);
  assert.equal(proof.getSnapshot().status, 'unavailable');
  await proof.prepare();
  await proof.verify();
  assert.equal(proof.getSnapshot().status, 'unavailable');
});

test('concurrent prepare/verify presses invoke only the active operation', async () => {
  let finish!: (value: { fixtureBytes: number }) => void;
  let prepares = 0;
  let verifies = 0;
  const proof = createMediaVaultProof({
    prepareProof: () => { prepares++; return new Promise(resolve => { finish = resolve; }); },
    verifyProof: async () => { verifies++; return report(); },
  });
  const pending = proof.prepare();
  await proof.prepare();
  await proof.verify();
  assert.equal(prepares, 1);
  assert.equal(verifies, 0);
  finish({ fixtureBytes: 8193 });
  await pending;
  assert.equal(proof.getSnapshot().status, 'prepared');
});

test('native errors and unexpected check strings cannot leak into display state', async () => {
  const proof = createMediaVaultProof({
    prepareProof: async () => { throw new Error('private path/key/fixture content'); },
    verifyProof: async () => ({ fixtureBytes: 8193, checks: ['private path/key/fixture content'] }),
  });
  await proof.prepare();
  assert.equal(proof.getSnapshot().status, 'failed');
  assert.equal(JSON.stringify(proof.getSnapshot()).includes('private'), false);
  await proof.verify();
  assert.equal(proof.getSnapshot().status, 'failed');
  assert.deepEqual(proof.getSnapshot().checks, []);
});

test('incomplete verification and invalid fixture sizes are rejected', async () => {
  for (const fixtureBytes of [0, -1, 4 * 1024 * 1024 + 1, NaN, 1.5]) {
    const proof = createMediaVaultProof({ prepareProof: async () => ({ fixtureBytes }), verifyProof: async () => ({ ...report(), fixtureBytes }) });
    await proof.prepare();
    assert.equal(proof.getSnapshot().status, 'failed');
    await proof.verify();
    assert.equal(proof.getSnapshot().status, 'failed');
  }
  const proof = createMediaVaultProof({ prepareProof: async () => ({ fixtureBytes: 8193 }), verifyProof: async () => ({ fixtureBytes: 8193, checks: ['roundtrip'] }) });
  await proof.verify();
  assert.equal(proof.getSnapshot().status, 'failed');
});

test('a later failure clears an earlier successful verification', async () => {
  let fail = false;
  const proof = createMediaVaultProof({ prepareProof: async () => ({ fixtureBytes: 8193 }), verifyProof: async () => { if (fail) throw new Error('failure'); return report(); } });
  await proof.verify();
  assert.equal(proof.getSnapshot().status, 'verified');
  fail = true;
  await proof.verify();
  assert.equal(proof.getSnapshot().status, 'failed');
  assert.deepEqual(proof.getSnapshot().checks, []);
});
