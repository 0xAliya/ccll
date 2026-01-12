<template>
  <div class="practice-card">
    <div class="status-line">
      <div class="status-group">
        <span class="status-label">{{ mode.value === 'listening' ? '🎧 听力拼写' : '⌨️ 中文默写' }}</span>
        <span class="status-progress">
          {{ started ? `第 ${currentIndex + 1} / ${sessionWords.length}` : '等待开始' }}
        </span>
      </div>
      <span class="status-accuracy">正确率 {{ accuracy }}%</span>
      <button
        class="icon-btn"
        type="button"
        :disabled="mode.value === 'dictation' || !started || !currentWord"
        :title="mode.value === 'listening' ? 'Ctrl+P 重播' : '中文默写模式不支持重播'"
        @click="playCurrentWord"
      >
        🔁
      </button>
    </div>

    <div class="play-zone" :class="{ 'play-zone--idle': !started }">
      <template v-if="mode.value === 'listening'">
        <button class="play-button" type="button" :disabled="!started" @click="playCurrentWord">
          🔊
        </button>
        <p class="play-text">
          {{ started ? 'Ctrl+P 可随时重播' : '导入并点击“开始练习”后自动播报单词' }}
        </p>
      </template>
      <template v-else>
        <p class="dictation-prompt" v-if="started">
          {{ currentWord?.meaning || '等待开始' }}
        </p>
        <p class="play-text">
          {{ started ? '请根据中文释义输入对应英文，Enter 判分' : '开始后将展示中文释义' }}
        </p>
      </template>
    </div>

    <label class="slider-row" v-if="mode.value === 'listening'">
      <span>语速 {{ speechRate.toFixed(1) }}x</span>
      <input type="range" min="0.5" max="2" step="0.1" v-model.number="speechRate" />
    </label>

    <form class="answer-form" @submit.prevent="submitSpelling">
      <input
        v-model="userInput"
        :disabled="!started || showResult"
        :placeholder="mode.value === 'listening' ? '请输入听到的英文单词' : '根据中文输入英文句子/单词'"
        ref="inputRef"
      />
      <button type="submit" class="sr-only">提交</button>
    </form>

    <p class="shortcut-hint">
      {{ mode.value === 'listening' ? 'Enter 提交 · Space 下一题 · Ctrl+P 重播 · Esc 重置' : 'Enter 提交 · Space 下一题 · Esc 重置' }}
    </p>

    <div class="feedback" v-if="showResult">
      <p :class="isCorrect ? 'feedback-correct' : 'feedback-wrong'">{{ resultText }}</p>
      <div class="feedback-meaning">
        <p class="meaning-word">{{ currentWord?.word }}</p>
        <p class="meaning-translation">{{ currentWord?.meaning }}</p>
      </div>
    </div>
    <p v-else class="feedback-placeholder">输入后按 Enter 即可判分</p>
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
  border-radius: 24px;
  background: var(--bg-card);
  border: 1px solid rgba(31, 41, 55, 0.08);
  box-shadow: var(--shadow-card);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.status-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 14px;
  color: var(--text-secondary);
}
.status-group {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.status-label {
  font-weight: 600;
  color: var(--text-primary);
}
.status-progress {
  color: var(--text-secondary);
}
.status-accuracy {
  margin-left: auto;
  font-weight: 600;
  color: var(--text-primary);
}
.icon-btn {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.play-zone {
  border-radius: 20px;
  border: 1px dashed rgba(31, 41, 55, 0.12);
  padding: 28px;
  background: var(--bg-card-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.play-zone--idle {
  opacity: 0.85;
}
.dictation-prompt {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}
.play-button {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 26px;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
}
.play-button:disabled {
  background: var(--bg-card);
  color: var(--text-muted);
  box-shadow: none;
  cursor: not-allowed;
}
.play-text {
  font-size: 14px;
  color: var(--text-secondary);
}
.slider-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.slider-row input {
  flex: 1;
  accent-color: var(--primary);
}
.answer-form input {
  width: 100%;
  border-radius: 22px;
  border: 2px solid rgba(31, 41, 55, 0.12);
  padding: 22px 26px;
  font-size: 26px;
  background: #fff;
  color: var(--text-primary);
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.08);
}
.shortcut-hint {
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.feedback,
.feedback-placeholder {
  text-align: center;
  font-size: 16px;
}
.feedback-correct {
  color: var(--success);
  font-weight: 600;
}
.feedback-wrong {
  color: var(--error);
  font-weight: 600;
}
.feedback-meaning {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.meaning-word {
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.05em;
}
.meaning-translation {
  font-size: 20px;
  color: var(--text-secondary);
}
.feedback-placeholder {
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
@media (max-width: 640px) {
  .practice-card {
    padding: 24px;
  }
}
</style>
