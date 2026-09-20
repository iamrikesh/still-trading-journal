export type Emotion = {
  id: string;
  label: string;
  hint: string;
  symbol: string;
  support: string;
  action: string;
};

// Original starter copy. Personal support cards will become editable in a later increment.
export const emotions: readonly Emotion[] = [
  { id: 'fomo', label: 'FOMO', hint: 'The urge to chase', symbol: '↗', support: 'A moving price is not an instruction. I can let this move go.', action: 'Return to my entry checklist.' },
  { id: 'hesitation', label: 'Hesitation', hint: 'Looking for certainty', symbol: '◌', support: 'I can follow a well-defined process without knowing the outcome of this trade.', action: 'Check the setup against my own rules.' },
  { id: 'frustration', label: 'Frustration', hint: 'Nothing feels right', symbol: '≈', support: 'I can notice frustration without letting it choose my next action.', action: 'Step back and take a quiet moment.' },
  { id: 'revenge', label: 'Revenge urge', hint: 'Wanting it back', symbol: '↶', support: 'The next trade does not owe me the last loss.', action: 'Pause and check my session limits.' },
  { id: 'overconfidence', label: 'Overconfidence', hint: 'Feeling invincible', symbol: '↑', support: 'A winning trade does not change the uncertainty of the next one.', action: 'Check my size and risk rules.' },
  { id: 'unsure', label: 'Unsure', hint: 'No label needed', symbol: '·', support: 'I do not have to name this feeling to notice it.', action: 'Notice a thought, sensation, or urge.' },
];
