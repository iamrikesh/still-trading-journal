import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeReminders } from '../src/reminders/nativeReminders.ts';

const png = 'iVBORw0KGgo=';
const image = { kind: 'image', mime: 'image/png', bytes: 8, base64: png, width: 1, height: 1, durationMs: null };

test('missing reminder bridge is unavailable', () => {
  assert.equal(createNativeReminders(null), null);
  assert.equal(createNativeReminders({ pickReminder() {} }), null);
});

test('adapter accepts bounded canonical payload and cancellation', async () => {
  const native = createNativeReminders({
    pickReminder: async () => image,
    playReminder: async () => {}, stopReminder: async () => {},
    reminderStatus: async () => ({ state: 'playing', durationMs: 1000 }),
  })!;
  assert.deepEqual(await native.pick('image'), image);
  assert.deepEqual(await native.status(), { state: 'playing', durationMs: 1000 });
});

test('adapter rejects malformed payload and removes private native errors', async () => {
  const bridge = {
    pickReminder: async () => ({ ...image, base64: `${png}\n` }),
    playReminder: async () => { throw Error('/private/path and content'); },
    stopReminder: async () => {},
    reminderStatus: async () => ({ state: 'bad', durationMs: 0 }),
  };
  const native = createNativeReminders(bridge)!;
  for (const operation of [() => native.pick('image'), () => native.status(), () => native.play(png)]) {
    await assert.rejects(operation, error => error instanceof Error && !error.message.includes('private'));
  }
  bridge.pickReminder = async () => ({ ...image, bytes: 9 });
  await assert.rejects(() => native.pick('image'));
});

test('play validates encoded byte cap before bridge call', async () => {
  let plays = 0;
  const native = createNativeReminders({
    pickReminder: async () => null,
    playReminder: async () => { plays++; }, stopReminder: async () => {},
    reminderStatus: async () => ({ state: 'idle', durationMs: 0 }),
  })!;
  await assert.rejects(() => native.play('A'.repeat(5592409)));
  assert.equal(plays, 0);
});

test('exact four MiB canonical audio remains admissible', async () => {
  const encoded = `${'A'.repeat(5592406)}==`;
  let plays = 0;
  const native = createNativeReminders({
    pickReminder: async () => ({ kind: 'audio', mime: 'audio/wav', bytes: 4194304, base64: encoded,
      width: null, height: null, durationMs: 12000 }),
    playReminder: async () => { plays++; }, stopReminder: async () => {},
    reminderStatus: async () => ({ state: 'idle', durationMs: 0 }),
  })!;
  assert.equal((await native.pick('audio'))?.bytes, 4194304);
  await native.play(encoded);
  assert.equal(plays, 1);
});
