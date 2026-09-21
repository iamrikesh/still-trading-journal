import type { ExerciseOperations, ExerciseResult } from './sessionExercise.ts';

type State = { status: 'idle' | 'busy' | 'ready' | 'failed' | 'unavailable'; result: ExerciseResult | null; recoveryPending: number };
export function createClipRecoveryExercise(open: () => Promise<{ exercise: ExerciseOperations | null; recovery?: () => Promise<{ pending: number }> }>) {
  let state: State = { status: 'idle', result: null, recoveryPending: 0 };
  const listeners = new Set<() => void>();
  const update = (next: State) => { state = next; listeners.forEach(listener => listener()); };
  async function run(action: keyof ExerciseOperations) {
    if (state.status === 'busy') return;
    update({ status: 'busy', result: null, recoveryPending: 0 });
    try {
      const session = await open();
      if (!session.exercise) { update({ status: 'unavailable', result: null, recoveryPending: 0 }); return; }
      let recoveryPending = (await session.recovery?.())?.pending ?? 0;
      try {
        const result = await session.exercise[action]();
        recoveryPending = (await session.recovery?.())?.pending ?? 0;
        update({ status: 'ready', result, recoveryPending });
      } catch {
        recoveryPending = (await session.recovery?.())?.pending ?? 0;
        update({ status: 'failed', result: null, recoveryPending });
      }
    } catch { update({ status: 'failed', result: null, recoveryPending: 0 }); }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    prepare: () => run('prepare'), check: () => run('check'), remove: () => run('remove'),
  };
}
