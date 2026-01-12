export type WordTag = 'skip' | 'easy';

export type PracticeMode = 'listening' | 'dictation';

export interface WordItem {
  word: string;
  meaning: string;
  tag?: WordTag;
  correctCount?: number;
}

export interface WordProgressPayload {
  word: string;
  correctCount: number;
}
