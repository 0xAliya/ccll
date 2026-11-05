<template>
  <div class="practice-card" :class="{ 'practice-card--idle': !started }">
    <div class="practice-header">
      <div class="mode-flag">
        <span class="mode-icon">{{ modeIcon }}</span>
        <div class="mode-meta">
          <p class="mode-title">{{ modeTitle }}<span v-if="isRetryRound" class="round-chip">错词重练</span></p>
          <p class="session-progress">{{ sessionProgressText }}</p>
        </div>
      </div>
      <div class="metrics">
        <span class="metrics-text" v-if="started">⏱ {{ elapsedText }}</span>
        <span class="metrics-text">正确率 {{ accuracy }}%</span>
        <div class="progress-track">
          <span class="progress-fill" :style="{ width: `${progressPercent}%` }"></span>
        </div>
      </div>
      <button
        v-if="started"
        class="stop-btn"
        type="button"
        @click="resetPractice"
        title="停止练习 (Esc)"
      >
        ⏹
      </button>
    </div>

    <div class="summary" v-if="summary && !started">
      <p class="summary-title">{{ summaryHeadline }}</p>
      <div class="summary-grid">
        <div class="summary-stat">
          <span class="summary-value">{{ summary.total }}</span>
          <span class="summary-label">本轮词数</span>
        </div>
        <div class="summary-stat">
          <span class="summary-value">{{ summaryAccuracy }}%</span>
          <span class="summary-label">首答正确率</span>
        </div>
        <div class="summary-stat">
          <span class="summary-value">{{ formatSeconds(summary.seconds) }}</span>
          <span class="summary-label">用时</span>
        </div>
        <div class="summary-stat">
          <span class="summary-value">{{ summary.wrongWords.length }}</span>
          <span class="summary-label">错词</span>
        </div>
      </div>
      <div class="summary-wrong" v-if="summary.wrongWords.length">
        <p class="summary-sub">本轮错词</p>
        <ul>
          <li v-for="item in summary.wrongWords" :key="item.word" @click="speak(item.word, 'en-US', speechRate)">
            <strong>{{ item.word }}</strong>
            <span>{{ item.meaning }}</span>
          </li>
        </ul>
        <button type="button" class="summary-btn" @click="retryWrong">🔁 只练这 {{ summary.wrongWords.length }} 个错词</button>
      </div>
    </div>

    <div class="practice-main" v-else>
      <div class="prompt-stack">
        <div class="playback-hint" :class="{ 'playback-hint--idle': !started }">
          <button
            v-if="mode === 'listening'"
            class="playback-trigger"
            type="button"
            :disabled="!started"
            @click="playCurrentWord"
            title="播放单词 (Ctrl+P)"
          >
            🔊
          </button>
          <div class="playback-copy" v-if="mode === 'dictation' && started">
            <p class="dictation-prompt">{{ dictationPrompt }}</p>
          </div>
        </div>
      </div>

      <p class="letter-hint" v-if="started && !showResult">{{ letterHint }}</p>

      <form class="answer-form" @submit.prevent="submitSpelling">
        <input
          v-model="userInput"
          class="answer-input"
          :class="answerState"
          :disabled="!started || showResult"
          :placeholder="mode === 'listening' ? '请输入听到的英文' : '根据中文输入英文'"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          ref="inputRef"
        />
        <button type="submit" class="sr-only">提交</button>
      </form>

      <div class="assist-row" v-if="started && !showResult">
        <button type="button" class="assist-btn" @click="revealLetter" title="提示下一个字母 (Tab)">💡 提示</button>
        <button type="button" class="assist-btn" @click="giveUp" title="直接看答案">🙈 不会</button>
      </div>
    </div>

    <label class="slider-row" v-if="mode === 'listening' && started">
      <span>语速 {{ speechRate.toFixed(1) }}x</span>
      <input type="range" min="0.5" max="2" step="0.1" v-model.number="speechRate" />
    </label>

    <div class="feedback" v-if="showResult">
      <p :class="isCorrect ? 'feedback-correct' : 'feedback-wrong'">{{ resultText }}</p>
      <p class="feedback-diff" v-if="!isCorrect && lastInput">
        你的答案：<span class="diff-user">{{ lastInput }}</span>
      </p>
      <div class="feedback-meaning">
        <p class="meaning-word">
          <span v-for="(c, i) in answerDiff" :key="i" :class="{ 'diff-bad': !isCorrect && !c.ok && c.char !== ' ' }">{{ c.char }}</span>
          <button type="button" class="meaning-play" @click="speak(currentWord?.word || '', 'en-US', speechRate)">🔊</button>
        </p>
        <p class="meaning-translation">{{ currentWord?.meaning }}</p>
      </div>
      <p class="feedback-next">按 Space 继续</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import type { WordItem, WordProgressPayload, PracticeMode, PracticeOrderMode, SessionSummary } from '../types/word';
import { speak } from '../utils/speech';
import { canonicalAnswer, diffAnswer } from '../utils/wordParser';

interface PanelStatusPayload {
  current: number;
  total: number;
  accuracy: number;
  started: boolean;
}

interface Props {
  words: WordItem[];
  startSignal: number;
  mode: PracticeMode;
  orderMode: PracticeOrderMode;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'completed', value: SessionSummary | null): void;
  (e: 'status-change', value: PanelStatusPayload): void;
  (e: 'word-progress', value: WordProgressPayload): void;
}>();

const mode = computed(() => props.mode);
const orderMode = computed(() => props.orderMode ?? 'shuffle');

const started = ref(false);
const currentIndex = ref(0);
const userInput = ref('');
const lastInput = ref('');
const showResult = ref(false);
const isCorrect = ref(false);
const resultText = ref('');
const correctCount = ref(0);
const answeredCount = ref(0);
const speechRate = ref(1);
const inputRef = ref<HTMLInputElement | null>(null);
const sessionWords = ref<WordItem[]>([]);
const uniqueTotal = ref(0);
const hintsUsed = ref(0);
const wrongMap = ref(new Map<string, WordItem>());
const summary = ref<SessionSummary | null>(null);
const isRetryRound = ref(false);
const startedAt = ref(0);
const now = ref(Date.now());
let timer: number | undefined;

const accuracy = computed(() =>
  answeredCount.value
    ? Math.round((correctCount.value / answeredCount.value) * 100)
    : 0
);
const currentWord = computed(() => sessionWords.value[currentIndex.value]);
const modeIcon = computed(() => (mode.value === 'listening' ? '🎧' : '⌨️'));
const modeTitle = computed(() => (mode.value === 'listening' ? '听力拼写' : '中文默写'));
const sessionProgressText = computed(() => {
  if (started.value) return `第 ${currentIndex.value + 1} / ${sessionWords.value.length}`;
  return summary.value ? '本轮完成' : '等待开始';
});
const elapsedText = computed(() => formatSeconds(Math.floor((now.value - startedAt.value) / 1000)));

const dictationPrompt = computed(() => {
  if (mode.value !== 'dictation') return '';
  if (started.value && currentWord.value?.meaning) {
    return currentWord.value.meaning;
  }
  const preview = props.words.find(w => w.tag !== 'skip');
  return preview?.meaning || '等待开始';
});
// 字母占位提示：每个字母一个下划线，已提示的字母直接显示
const letterHint = computed(() => {
  const word = currentWord.value?.word ?? '';
  return word
    .split('')
    .map((c, i) => (c === ' ' ? '  ' : /[a-z]/i.test(c) ? (i < hintsUsed.value ? c : '_') : c))
    .join(' ');
});
const answerDiff = computed(() => diffAnswer(lastInput.value, currentWord.value?.word ?? ''));
const progressPercent = computed(() => {
  const total = sessionWords.value.length;
  if (!total || !started.value) return summary.value ? 100 : 0;
  const completed = Math.min(currentIndex.value + (showResult.value ? 1 : 0), total);
  return Math.round((completed / total) * 100);
});
const answerState = computed(() => {
  if (!showResult.value) return '';
  return isCorrect.value ? 'answer-input--correct' : 'answer-input--wrong';
});
const summaryAccuracy = computed(() => {
  const s = summary.value;
  if (!s || !s.total) return 0;
  return Math.round(((s.total - s.wrongWords.length) / s.total) * 100);
});
const summaryHeadline = computed(() => {
  const acc = summaryAccuracy.value;
  if (acc === 100) return '🏆 全对！完美的一轮';
  if (acc >= 85) return '🎉 很棒，继续保持';
  if (acc >= 60) return '💪 不错，把错词再过一遍';
  return '📚 先把错词练熟再往下走';
});

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function pushStatus() {
  emit('status-change', {
    current: started.value ? Math.min(currentIndex.value + 1, sessionWords.value.length) : 0,
    total: sessionWords.value.length,
    accuracy: accuracy.value,
    started: started.value,
  });
}

watch(
  [started, currentIndex, () => sessionWords.value.length, () => accuracy.value],
  () => pushStatus(),
  { immediate: true }
);

watch(
  () => props.startSignal,
  (val, prev) => {
    if (val > 0 && val !== prev) {
      startPractice();
    }
  }
);

watch(
  () => props.words.filter(w => w.tag !== 'skip').length,
  (len) => {
    if (!len) {
      resetPractice();
    }
  }
);

function beginSession(list: WordItem[], retry: boolean) {
  const prepared = list.map(w => ({ ...w }));
  sessionWords.value = orderMode.value === 'shuffle' || retry ? shuffle(prepared) : prepared;
  uniqueTotal.value = prepared.length;
  isRetryRound.value = retry;
  wrongMap.value = new Map();
  summary.value = null;
  started.value = true;
  currentIndex.value = 0;
  correctCount.value = 0;
  answeredCount.value = 0;
  startedAt.value = Date.now();
  now.value = startedAt.value;
  window.clearInterval(timer);
  timer = window.setInterval(() => (now.value = Date.now()), 1000);
  resetQuestion();
  speakCurrent();
  focusInput();
}

function startPractice() {
  const available = props.words.filter(w => w.tag !== 'skip');
  if (!available.length) {
    resetPractice();
    return;
  }
  beginSession(available, false);
}

function retryWrong() {
  if (!summary.value?.wrongWords.length) return;
  beginSession(summary.value.wrongWords, true);
}

function resetQuestion() {
  userInput.value = '';
  lastInput.value = '';
  showResult.value = false;
  isCorrect.value = false;
  resultText.value = '';
  hintsUsed.value = 0;
}

function playCurrentWord() {
  if (currentWord.value) {
    speak(currentWord.value.word, 'en-US', speechRate.value);
  }
}

function speakCurrent() {
  if (mode.value === 'dictation') return;
  playCurrentWord();
}

function revealLetter() {
  if (!started.value || showResult.value || !currentWord.value) return;
  const word = currentWord.value.word;
  if (hintsUsed.value >= word.length) return;
  hintsUsed.value++;
  while (hintsUsed.value < word.length && !/[a-z]/i.test(word[hintsUsed.value - 1])) hintsUsed.value++;
  userInput.value = word.slice(0, hintsUsed.value);
  focusInput();
}

function markWrong(word: WordItem) {
  wrongMap.value.set(word.word.toLowerCase(), word);
  // 错的词放到队尾再考一次
  sessionWords.value.push({ ...word });
}

function giveUp() {
  if (showResult.value || !currentWord.value) return;
  lastInput.value = '';
  isCorrect.value = false;
  showResult.value = true;
  answeredCount.value++;
  resultText.value = '👀 记住它，稍后再考一次';
  markWrong(currentWord.value);
  playCurrentWord();
}

function submitSpelling() {
  if (showResult.value || !currentWord.value) return;
  if (!userInput.value.trim()) return;
  lastInput.value = userInput.value.trim();
  isCorrect.value = canonicalAnswer(userInput.value) === canonicalAnswer(currentWord.value.word);
  showResult.value = true;
  answeredCount.value++;
  if (isCorrect.value) {
    correctCount.value++;
    // 用了提示的不算掌握次数
    if (hintsUsed.value === 0) {
      resultText.value = '✔️ 正确！';
      const newCount = (currentWord.value.correctCount ?? 0) + 1;
      sessionWords.value[currentIndex.value].correctCount = newCount;
      emit('word-progress', { word: currentWord.value.word, correctCount: newCount });
    } else {
      resultText.value = '✔️ 正确（用了提示，不计入掌握）';
    }
  } else {
    resultText.value = '❌ 错误！';
    markWrong(currentWord.value);
  }
  if (mode.value === 'dictation') playCurrentWord();
}

function nextWord() {
  if (!showResult.value) return;
  if (currentIndex.value < sessionWords.value.length - 1) {
    currentIndex.value++;
    resetQuestion();
    speakCurrent();
    focusInput();
  } else {
    finishSession();
  }
}

function resetPractice() {
  window.clearInterval(timer);
  started.value = false;
  currentIndex.value = 0;
  resetQuestion();
  correctCount.value = 0;
  answeredCount.value = 0;
  sessionWords.value = [];
  summary.value = null;
  isRetryRound.value = false;
  emit('completed', null);
}

function finishSession() {
  window.clearInterval(timer);
  started.value = false;
  showResult.value = false;
  summary.value = {
    total: uniqueTotal.value,
    correct: correctCount.value,
    answered: answeredCount.value,
    seconds: Math.floor((Date.now() - startedAt.value) / 1000),
    wrongWords: [...wrongMap.value.values()],
  };
  emit('completed', summary.value);
}

function focusInput() {
  requestAnimationFrame(() => inputRef.value?.focus());
}

function handleKeydown(e: KeyboardEvent) {
  if (!started.value) return;
  // 焦点在别的输入框（如词库链接）时不抢按键
  const target = e.target as HTMLElement | null;
  if (target && target !== inputRef.value && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
    // Ctrl+P: 播放
    e.preventDefault();
    playCurrentWord();
  } else if (e.key === 'Tab') {
    // Tab: 提示一个字母
    e.preventDefault();
    revealLetter();
  } else if (e.key === 'Escape') {
    // Esc: 重置
    e.preventDefault();
    resetPractice();
  } else if (e.key === 'Enter') {
    // Enter: 提交 / 已出结果时进入下一题
    e.preventDefault();
    if (showResult.value) nextWord();
    else submitSpelling();
  } else if (e.key === ' ') {
    // 空格：下一个单词
    if (showResult.value) {
      e.preventDefault();
      nextWord();
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.clearInterval(timer);
});

watch(speechRate, () => {
  // 可选：语速变化时自动重播
  if (mode.value === 'listening' && started.value && currentWord.value) playCurrentWord();
});

function shuffle<T>(source: T[]): T[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
</script>

<style scoped>
.practice-card {
  border-radius: 28px;
  background: var(--practice-card-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: var(--shadow-card);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.practice-card--idle {
  opacity: 0.9;
}
.practice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.mode-flag {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mode-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--chip-surface);
  display: grid;
  place-items: center;
  font-size: 20px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.mode-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mode-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}
.session-progress {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.metrics {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}
.metrics-text {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
}
.stop-btn {
  border: 1px solid var(--border-soft);
  background: var(--chip-surface);
  border-radius: 12px;
  width: 36px;
  height: 36px;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
}
.stop-btn:hover {
  transform: translateY(-1px);
  background: var(--error);
  border-color: var(--error);
  color: #fff;
}
.progress-track {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--primary);
  transition: width 0.3s ease;
}
.practice-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  margin-top: 0;
}
.prompt-stack {
  width: 100%;
  display: flex;
  justify-content: center;
}
.playback-hint {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
}
.playback-hint--idle {
  opacity: 0.7;
}
.playback-trigger {
  border: none;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--primary);
  color: #0b0e14;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 16px 40px rgba(255, 143, 79, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.playback-trigger:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 20px 50px rgba(255, 143, 79, 0.4);
}
.playback-trigger:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: none;
}
.playback-copy {
  display: flex;
  flex-direction: column;
}
.dictation-prompt {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.dictation-panel {
  margin-top: -8px;
  border-radius: 28px;
  border: 1px solid var(--border-strong);
  background: var(--content-surface);
  padding: 20px 26px;
  box-shadow: var(--shadow-soft, 0 18px 50px rgba(0, 0, 0, 0.35));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dictation-panel__label {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.dictation-panel__text {
  margin: 0;
  font-size: clamp(20px, 4vw, 28px);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}
.answer-form {
  width: 100%;
  display: flex;
  justify-content: center;
  max-width: 960px;
}
.answer-input {
  width: 100%;
  border-radius: 24px;
  border: 1px solid var(--border-soft);
  padding: 20px 28px;
  font-size: clamp(20px, 4vw, 28px);
  font-weight: 600;
  background: var(--input-surface);
  color: var(--text-primary);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.04), 0 30px 60px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.answer-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 35px rgba(255, 143, 79, 0.35);
}
.answer-input:disabled {
  opacity: 0.6;
}
.answer-input--correct {
  border-color: var(--success);
  box-shadow: 0 0 35px rgba(16, 185, 129, 0.35);
  animation: glowPulse 0.6s ease;
}
.answer-input--wrong {
  border-color: var(--error);
  animation: shake 0.4s ease;
}
.slider-row {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--chip-surface);
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  padding: 10px 16px;
}
.slider-row input {
  flex: 1;
  accent-color: var(--primary);
}
.feedback {
  text-align: center;
  font-size: 15px;
}
.feedback-correct {
  color: var(--success);
  font-weight: 700;
}
.feedback-wrong {
  color: var(--error);
  font-weight: 700;
}
.feedback-meaning {
  margin-top: 14px;
  padding: 16px;
  border-radius: 18px;
  background: var(--chip-surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border-soft);
}
.meaning-word {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.06em;
}
.meaning-translation {
  font-size: 16px;
  color: var(--text-secondary);
}
.round-chip {
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: rgba(255, 123, 156, 0.16);
  color: var(--primary);
  vertical-align: middle;
}
.letter-hint {
  margin: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 18px;
  letter-spacing: 0.08em;
  color: var(--text-subtle);
  white-space: pre-wrap;
  text-align: center;
}
.assist-row {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.assist-btn {
  border: 1px solid var(--border-soft);
  background: var(--chip-surface);
  color: var(--text-secondary);
  border-radius: 14px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}
.assist-btn:hover {
  border-color: var(--primary);
  color: var(--text-primary);
}
.feedback-diff {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--text-subtle);
}
.diff-user {
  color: var(--error);
  text-decoration: line-through;
  font-weight: 600;
}
.diff-bad {
  color: var(--error);
  text-decoration: underline;
  text-underline-offset: 6px;
}
.meaning-play {
  margin-left: 10px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  vertical-align: middle;
}
.feedback-next {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
}
.summary-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}
.summary-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 8px;
  border-radius: 18px;
  background: var(--chip-surface);
  border: 1px solid var(--border-soft);
}
.summary-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
}
.summary-label {
  font-size: 12px;
  color: var(--text-subtle);
}
.summary-wrong {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-subtle);
}
.summary-wrong ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.summary-wrong li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--input-surface);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
}
.summary-wrong li strong {
  color: var(--text-primary);
  font-size: 15px;
}
.summary-btn {
  align-self: center;
  border: none;
  border-radius: 18px;
  padding: 12px 24px;
  background: var(--primary);
  color: #fffefd;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
}
@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
}
@keyframes glowPulse {
  0% {
    box-shadow: 0 0 0 rgba(16, 185, 129, 0.4);
  }
  50% {
    box-shadow: 0 0 35px rgba(16, 185, 129, 0.5);
  }
  100% {
    box-shadow: 0 0 0 rgba(16, 185, 129, 0.1);
  }
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-6px);
  }
  50% {
    transform: translateX(6px);
  }
  75% {
    transform: translateX(-4px);
  }
}
@media (max-width: 640px) {
  .practice-card {
    padding: 20px;
  }
  .practice-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .mode-flag {
    width: 100%;
  }
  .practice-main {
    gap: 14px;
  }
  .metrics {
    width: 100%;
    justify-content: flex-start;
  }
  .answer-input {
    padding: 16px 20px;
  }
}
</style>
