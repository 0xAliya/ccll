import type { WordItem } from '../types/word';

export function normalizeWord(text: string): string {
  return text.replace(/_/g, ' ').trim();
}

export function parseWordFile(content: string, filename = 'remote.txt'): WordItem[] {
  let lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const words: WordItem[] = [];
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    // CSV: word,meaning
    lines = lines.filter(l => !/^word,?meaning$/i.test(l));
    for (const line of lines) {
      const [word, meaning] = line.split(',');
      if (word && meaning) {
        words.push({ word: normalizeWord(word), meaning: meaning.trim(), correctCount: 0 });
      }
    }
  } else {
    // TXT: word=meaning
    for (const line of lines) {
      const [word, meaning] = line.split('=');
      if (word && meaning) {
        words.push({ word: normalizeWord(word), meaning: meaning.trim(), correctCount: 0 });
      }
    }
  }
  return words;
}