<template>
  <div class="practice-card" :class="{ 'practice-card--idle': !started }">
    <div class="practice-header">
      <div class="mode-flag">
        <span class="mode-icon">{{ modeIcon }}</span>
        <div class="mode-meta">
          <p class="mode-title">{{ modeTitle }}</p>
          <p class="session-progress">{{ sessionProgressText }}</p>
        </div>
      </div>
      <div class="metrics">
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

    <div class="practice-main">
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

      <form class="answer-form" @submit.prevent="submitSpelling">
        <input
          v-model="userInput"
          class="answer-input"
          :class="answerState"
          :disabled="!started || showResult"
          :placeholder="mode === 'listening' ? '请输入听到的英文单词' : '根据中文输入英文句子/单词'"
          ref="inputRef"
        />
        <button type="submit" class="sr-only">提交</button>
      </form>
    </div>

    <label class="slider-row" v-if="mode === 'listening' && started">
      <span>语速 {{ speechRate.toFixed(1) }}x</span>
      <input type="range" min="0.5" max="2" step="0.1" v-model.number="speechRate" />
    </label>

    <div class="feedback" v-if="showResult">
      <p :class="isCorrect ? 'feedback-correct' : 'feedback-wrong'">{{ resultText }}</p>
      <div class="feedback-meaning">
        <p class="meaning-word">{{ currentWord?.word }}</p>
        <p class="meaning-translation">{{ currentWord?.meaning }}</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import type { WordItem, WordProgressPayload, PracticeMode } from '../types/word';
import { speak } from '../utils/speech';

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
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'completed'): void;
  (e: 'status-change', value: PanelStatusPayload): void;
  (e: 'word-progress', value: WordProgressPayload): void;
}>();

const mode = computed(() => props.mode);

const started = ref(false);
const currentIndex = ref(0);
const userInput = ref('');
const showResult = ref(false);
const isCorrect = ref(false);
const resultText = ref('');
const correctCount = ref(0);
const answeredCount = ref(0);
const speechRate = ref(1);
const inputRef = ref<HTMLInputElement | null>(null);
const sessionWords = ref<WordItem[]>([]);

const accuracy = computed(() =>
  answeredCount.value
    ? Math.round((correctCount.value / answeredCount.value) * 100)
    : 0
);
const currentWord = computed(() => sessionWords.value[currentIndex.value]);
const modeIcon = computed(() => (mode.value === 'listening' ? '🎧' : '⌨️'));
const modeTitle = computed(() => (mode.value === 'listening' ? '听力拼写' : '中文默写'));
const sessionProgressText = computed(() =>
  started.value ? `第 ${currentIndex.value + 1} / ${sessionWords.value.length}` : '等待开始'
);

const dictationPrompt = computed(() => {
  if (mode.value !== 'dictation') return '';
  if (started.value && currentWord.value?.meaning) {
    return currentWord.value.meaning;
  }
  const preview = props.words.find(w => w.tag !== 'skip');
  return preview?.meaning || '等待开始';
});
const dictationPromptTitle = computed(() =>
  started.value ? '当前中文释义' : '预览中文释义'
);
const progressPercent = computed(() => {
  const total = sessionWords.value.length;
  if (!total || !started.value) return 0;
  const completed = Math.min(currentIndex.value + (showResult.value ? 1 : 0), total);
  return Math.round((completed / total) * 100);
});
const answerState = computed(() => {
  if (!showResult.value) return '';
  return isCorrect.value ? 'answer-input--correct' : 'answer-input--wrong';
});

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

function startPractice() {
  const available = props.words.filter(w => w.tag !== 'skip');
  if (!available.length) {
    resetPractice();
    return;
  }
  sessionWords.value = shuffle(available.map(w => ({ ...w })));
  started.value = true;
  currentIndex.value = 0;
  userInput.value = '';
  showResult.value = false;
  isCorrect.value = false;
  resultText.value = '';
  correctCount.value = 0;
  answeredCount.value = 0;
  speakCurrent();
  focusInput();
}

function playCurrentWord() {
  if (mode.value === 'dictation') return;
  if (currentWord.value) {
    speak(currentWord.value.word, 'en-US', speechRate.value);
  }
}

function speakCurrent() {
  if (mode.value === 'dictation') return;
  playCurrentWord();
}

function submitSpelling() {
  if (showResult.value || !currentWord.value) return;
  const input = userInput.value.trim().toLowerCase();
  const answer = currentWord.value.word.trim().toLowerCase();
  isCorrect.value = input === answer;
  showResult.value = true;
  answeredCount.value++;
  if (isCorrect.value) {
    resultText.value = '✔️ 正确！';
    correctCount.value++;
    const newCount = (currentWord.value.correctCount ?? 0) + 1;
    sessionWords.value[currentIndex.value].correctCount = newCount;
    emit('word-progress', { word: currentWord.value.word, correctCount: newCount });
  } else {
    resultText.value = '❌ 错误！';
    sessionWords.value.push(currentWord.value);
  }
}

function nextWord() {
  if (!showResult.value) return;
  if (currentIndex.value < sessionWords.value.length - 1) {
    currentIndex.value++;
    userInput.value = '';
    showResult.value = false;
    isCorrect.value = false;
    resultText.value = '';
    speakCurrent();
    focusInput();
  } else {
    finishSession();
  }
}

function resetPractice() {
  started.value = false;
  currentIndex.value = 0;
  userInput.value = '';
  showResult.value = false;
  isCorrect.value = false;
  resultText.value = '';
  correctCount.value = 0;
  answeredCount.value = 0;
  sessionWords.value = [];
  emit('completed');
}

function finishSession() {
  started.value = false;
  emit('completed');
}

function focusInput() {
  requestAnimationFrame(() => inputRef.value?.focus());
}

function handleKeydown(e: KeyboardEvent) {
  if (!started.value) return;
  if (mode.value === 'listening' && e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
    // Ctrl+P: 播放
    e.preventDefault();
    playCurrentWord();
  } else if (e.key === 'Escape') {
    // Esc: 重置
    e.preventDefault();
    resetPractice();
  } else if (e.key === 'Enter') {
    // Enter: 提交
    e.preventDefault();
    submitSpelling();
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
