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
// 比较答案时忽略大小写、首尾标点和多余空格
export function canonicalAnswer(text: string): string {
  return normalizeWord(text)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"“”。，！？；：]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DiffChar {
  char: string;
  ok: boolean;
}

// 逐字符对比，标出用户答案里错的位置
export function diffAnswer(input: string, answer: string): DiffChar[] {
  const result: DiffChar[] = [];
  for (let i = 0; i < answer.length; i++) {
    const a = answer[i];
    const b = input[i];
    result.push({ char: a, ok: b !== undefined && b.toLowerCase() === a.toLowerCase() });
  }
  return result;
}
