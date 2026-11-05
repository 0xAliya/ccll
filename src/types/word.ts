export type WordTag = 'skip' | 'easy';

export type PracticeMode = 'listening' | 'dictation';
export type PracticeOrderMode = 'sequential' | 'shuffle';

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

export interface PresetBank {
  file: string;
  name: string;
  desc: string;
}

export interface SessionSummary {
  total: number;
  correct: number;
  answered: number;
  seconds: number;
  wrongWords: WordItem[];
}
