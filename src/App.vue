<template>
  <div class="app-shell">
    <header class="top-bar">
      <div class="hero-copy">
        <p class="hero-pill">Spell & Spark</p>
        <h1>听力拼写练习</h1>
        <p class="app-sub">单一任务 · 极简 · 高专注</p>
        <div class="hero-stats">
          <span>听力 {{ wordsByMode.listening.length }} 条</span>
          <span>默写 {{ wordsByMode.dictation.length }} 条</span>
          <span>激活 {{ activeWords.length }} 条</span>
        </div>
      </div>
      <section class="control-card">
        <div class="source-input">
          <div class="source-input__meta">{{ practiceMode === 'listening' ? '听力词库链接' : '中文默写词库链接' }}</div>
          <div class="source-input__row">
            <input
              v-model="wordSourceUrl[practiceMode]"
              class="source-input__field"
              placeholder="请输入词库 TXT 链接"
              @keyup.enter="loadWordsFromUrl(practiceMode)"
            />
            <button
              type="button"
              class="action-btn action-btn--ghost"
              @click="loadWordsFromUrl(practiceMode)"
              :disabled="isLoadingWords[practiceMode]"
            >
              {{ isLoadingWords[practiceMode] ? '加载中…' : '读取词库' }}
            </button>
          </div>
        </div>
        <div class="control-row">
          <div class="chip-group">
            <button class="action-btn" :class="{ 'action-btn--muted': showList }" @click="showList = false">练习</button>
            <button class="action-btn" :class="{ 'action-btn--muted': !showList }" @click="showList = true">
              词库 {{ activeWords.length }}
            </button>
          </div>
          <div class="mode-toggle">
            <button
              class="mode-btn"
              :class="{ 'mode-btn--active': practiceMode === 'listening' }"
              type="button"
              :disabled="panelStatus.started"
              @click="practiceMode = 'listening'"
            >
              听力拼写
            </button>
            <button
              class="mode-btn"
              :class="{ 'mode-btn--active': practiceMode === 'dictation' }"
              type="button"
              :disabled="panelStatus.started"
              @click="practiceMode = 'dictation'"
            >
              中文默写
            </button>
          </div>
          <button class="action-btn action-btn--primary" @click="handleStart" :disabled="!hasWords">
            {{ hasWords ? '开始练习' : activeWords.length ? '恢复可练单词' : '请先导入' }}
          </button>
        </div>
      </section>
    </header>

    <p v-if="activeImportError" class="inline-error">{{ activeImportError }}</p>

    <div class="status-strip" :class="{ 'status-strip--inactive': showList }">
      <span>{{ statusMode === 'listening' ? '🎧 听力拼写' : '⌨️ 中文默写' }}</span>
      <template v-if="showList">
        <span>听力 {{ wordsByMode.listening.length }} 条 · 默写 {{ wordsByMode.dictation.length }} 条</span>
      </template>
      <template v-else>
        <span>
          {{ panelStatus.started ? `第 ${panelStatus.current} / ${panelStatus.total || sessionWords.length}` : '等待开始' }}
        </span>
        <span>正确率 {{ panelStatus.accuracy }}%</span>
      </template>
    </div>

    <main class="main-area">
      <PracticePanel
        v-if="!showList"
        :words="sessionWords"
        :start-signal="startSignal"
        :mode="statusMode"
        @completed="handlePracticeComplete"
        @status-change="handleStatusChange"
        @word-progress="handleWordProgress"
      />
      <WordListPage
        v-else
        :words="activeWords"
        :mode="practiceMode"
        @update:words="handleActiveWordsUpdate"
        @close="showList = false"
      />
    </main>

    <button class="help-fab" type="button" @click="helpVisible = !helpVisible">?</button>
    <div class="help-card" v-if="helpVisible">
      <p class="help-title">快捷键</p>
      <ul>
        <li>Enter · 提交</li>
        <li>Space · 下一题</li>
        <li>Ctrl+P · 重播</li>
        <li>Esc · 重置</li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import PracticePanel from './components/PracticePanel.vue';
import WordListPage from './components/WordListPage.vue';
import { parseWordFile, normalizeWord } from './utils/wordParser';
import type { WordItem, WordProgressPayload, PracticeMode } from './types/word';

interface PanelStatus {
  current: number;
  total: number;
  accuracy: number;
  started: boolean;
}

const MODES: PracticeMode[] = ['listening', 'dictation'];
const STORAGE_KEY_PREFIX = 'ielts_word_list';
const SOURCE_URL_KEY_PREFIX = 'ielts_word_source_url';

function storageKey(mode: PracticeMode) {
  return `${STORAGE_KEY_PREFIX}_${mode}`;
}
function sourceKey(mode: PracticeMode) {
  return `${SOURCE_URL_KEY_PREFIX}_${mode}`;
}
function resolveDefaultWordUrl(mode: PracticeMode) {
  const filename = mode === 'listening' ? 'wordlist.txt' : 'dictation.txt';
  const fallback = `${import.meta.env.BASE_URL}${filename}`;
  if (typeof window === 'undefined') return fallback;
  const base = window.location.origin + import.meta.env.BASE_URL;
  return new URL(filename, base).toString();
}

function saveWordsToStorage(mode: PracticeMode, words: WordItem[]) {
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(words));
  } catch {}
}
function loadWordsFromStorage(mode: PracticeMode): WordItem[] {
  try {
    const raw = localStorage.getItem(storageKey(mode));
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr
          .filter((w: any) => typeof w.word === 'string' && typeof w.meaning === 'string')
          .map((w: WordItem) => ({ ...w, word: normalizeWord(w.word) }));
      }
    }
  } catch {}
  return [];
}

function withDefaults(word: WordItem): WordItem {
  return {
    word: normalizeWord(word.word),
    meaning: word.meaning,
    tag: word.tag,
    correctCount: typeof word.correctCount === 'number' ? word.correctCount : 0,
  };
}

const wordsByMode = reactive<Record<PracticeMode, WordItem[]>>({
  listening: loadWordsFromStorage('listening').map(withDefaults),
  dictation: loadWordsFromStorage('dictation').map(withDefaults),
});
const importErrors = reactive<Record<PracticeMode, string>>({ listening: '', dictation: '' });
const isLoadingWords = reactive<Record<PracticeMode, boolean>>({ listening: false, dictation: false });

const startSignal = ref(0);
const panelStatus = ref<PanelStatus>({ current: 0, total: 0, accuracy: 0, started: false });
const helpVisible = ref(false);
const showList = ref(false);
const practiceMode = ref<PracticeMode>('listening');
const sessionMode = ref<PracticeMode>('listening');

const initialSources: Record<PracticeMode, string | null> = {
  listening: null,
  dictation: null,
};
for (const mode of MODES) {
  try {
    initialSources[mode] = localStorage.getItem(sourceKey(mode));
  } catch {
    initialSources[mode] = null;
  }
}

const wordSourceUrl = reactive<Record<PracticeMode, string>>({
  listening: initialSources.listening ?? resolveDefaultWordUrl('listening'),
  dictation: initialSources.dictation ?? resolveDefaultWordUrl('dictation'),
});

function persistSourceUrl(mode: PracticeMode, value: string) {
  try {
    localStorage.setItem(sourceKey(mode), value);
  } catch {}
}

for (const mode of MODES) {
  if (!initialSources[mode]) {
    persistSourceUrl(mode, wordSourceUrl[mode]);
  }
  watch(
    () => wordSourceUrl[mode],
    val => persistSourceUrl(mode, val)
  );
}

const activeWords = computed(() => wordsByMode[practiceMode.value]);
const sessionWords = computed(() => wordsByMode[sessionMode.value]);
const activeImportError = computed(() => importErrors[practiceMode.value]);
const hasWords = computed(() => activeWords.value.some(w => w.tag !== 'skip'));
const statusMode = computed<PracticeMode>(() => (panelStatus.value.started ? sessionMode.value : practiceMode.value));

onMounted(() => {
  for (const mode of MODES) {
    if (!wordsByMode[mode].length && wordSourceUrl[mode].trim()) {
      loadWordsFromUrl(mode, true);
    }
  }
});

watch(practiceMode, newMode => {
  if (!panelStatus.value.started) {
    sessionMode.value = newMode;
  }
});

async function loadWordsFromUrl(mode: PracticeMode, auto = false) {
  importErrors[mode] = '';
  const url = wordSourceUrl[mode].trim();
  if (!url) {
    if (!auto) importErrors[mode] = '请填写词库链接';
    return;
  }
  isLoadingWords[mode] = true;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('request failed');
    }
    const text = await response.text();
    const remoteName = url.toLowerCase().endsWith('.csv') ? 'remote.csv' : 'remote.txt';
    const parsed = parseWordFile(text, remoteName);
    const sanitized = parsed.map(withDefaults);
    if (!sanitized.length) {
      if (!auto) importErrors[mode] = '词库为空或格式错误';
      wordsByMode[mode] = [];
      saveWordsToStorage(mode, []);
    } else {
      wordsByMode[mode] = sanitized;
      saveWordsToStorage(mode, sanitized);
    }
  } catch (err) {
    if (!auto) importErrors[mode] = '读取词库失败，请检查链接或网络';
  } finally {
    isLoadingWords[mode] = false;
  }
}

function handleStart() {
  if (!activeWords.value.length) {
    importErrors[practiceMode.value] = '请先导入词库文件';
    return;
  }
  if (!hasWords.value) {
    importErrors[practiceMode.value] = '所有单词都被标记为跳过，请先恢复一些单词';
    return;
  }
  importErrors[practiceMode.value] = '';
  sessionMode.value = practiceMode.value;
  startSignal.value++;
}

function handlePracticeComplete() {
  // 保留面板，方便再次开始
}

function handleWordsUpdate(mode: PracticeMode, newWords: WordItem[]) {
  const sanitized = newWords.map(withDefaults);
  wordsByMode[mode] = sanitized;
  saveWordsToStorage(mode, sanitized);
}

function handleActiveWordsUpdate(newWords: WordItem[]) {
  handleWordsUpdate(practiceMode.value, newWords);
}

function handleStatusChange(payload: PanelStatus) {
  panelStatus.value = payload;
}

function handleWordProgress(payload: WordProgressPayload) {
  const currentMode = sessionMode.value;
  let changed = false;
  const updated = wordsByMode[currentMode].map(item => {
    if (normalizeWord(item.word).toLowerCase() === normalizeWord(payload.word).toLowerCase()) {
      changed = true;
      const isMastered = payload.correctCount >= 5;
      const nextTag = item.tag === 'skip' ? 'skip' : isMastered ? 'easy' : item.tag;
      return { ...item, correctCount: payload.correctCount, tag: nextTag };
    }
    return item;
  });
  if (changed) {
    wordsByMode[currentMode] = updated;
    saveWordsToStorage(currentMode, updated);
  }
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: 48px 24px 132px;
  background: var(--page-gradient);
  position: relative;
  isolation: isolate;
}
.app-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 10% 15%, rgba(255, 255, 255, 0.4), transparent 60%),
    radial-gradient(circle at 80% 0%, rgba(255, 182, 193, 0.25), transparent 45%),
    radial-gradient(circle at 50% 80%, rgba(255, 192, 149, 0.18), transparent 50%);
  z-index: -1;
}
.top-bar {
  max-width: 1180px;
  margin: 0 auto 36px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 32px;
  align-items: stretch;
}
.hero-copy {
  background: var(--hero-card);
  border-radius: 30px;
  padding: 36px;
  box-shadow: var(--shadow-card);
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.hero-pill {
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--text-subtle);
  margin: 0 0 12px;
  display: inline-block;
}
.hero-copy h1 {
  margin: 0;
  font-size: 38px;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}
.app-sub {
  margin: 8px 0 18px;
  color: var(--text-secondary);
  font-size: 15px;
}
.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.hero-stats span {
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.7);
  font-size: 13px;
  color: var(--text-primary);
}
.control-card {
  width: 100%;
  background: var(--panel-card);
  border-radius: 32px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: var(--shadow-card);
}
.source-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.source-input__meta {
  font-size: 12px;
  color: var(--text-subtle);
  letter-spacing: 0.08em;
}
.source-input__row {
  display: flex;
  gap: 12px;
  align-items: center;
}
.source-input__field {
  flex: 1;
  min-width: 200px;
  border-radius: 18px;
  border: 1px solid rgba(53, 42, 33, 0.14);
  background: var(--bg-card);
  padding: 14px 18px;
  font-size: 15px;
  color: var(--text-primary);
  transition: border-color 0.2s ease;
}
.source-input__field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(255, 123, 84, 0.15);
}
.control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}
.chip-group {
  display: inline-flex;
  gap: 10px;
}
.action-btn {
  border-radius: 999px;
  border: 1px solid rgba(53, 42, 33, 0.2);
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
}
.action-btn--ghost {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.65);
  color: var(--text-secondary);
}
.action-btn--primary {
  border: none;
  background: linear-gradient(120deg, var(--primary), var(--primary-hover));
  color: #fffdf9;
  box-shadow: var(--shadow-soft);
}
.action-btn--muted {
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-secondary);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
.mode-toggle {
  display: inline-flex;
  border-radius: 18px;
  border: 1px solid rgba(53, 42, 33, 0.14);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.8);
}
.mode-btn {
  border: none;
  background: transparent;
  padding: 10px 18px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 600;
}
.mode-btn--active {
  background: var(--primary);
  color: #fffdf9;
}
.inline-error {
  max-width: 1180px;
  margin: 6px auto 0;
  font-size: 13px;
  color: var(--error);
}
.status-strip {
  max-width: 960px;
  margin: 32px auto;
  background: var(--status-card);
  border-radius: 24px;
  padding: 18px 26px;
  display: flex;
  gap: 16px;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: var(--shadow-card);
  color: var(--text-secondary);
  font-size: 15px;
}
.status-strip span:first-child {
  font-weight: 600;
  color: var(--text-primary);
}
.status-strip--inactive {
  opacity: 0.75;
}
.main-area {
  max-width: 960px;
  margin: 0 auto;
}
.help-fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  width: 52px;
  height: 52px;
  border-radius: 18px;
  border: none;
  background: var(--text-primary);
  color: #fffdf9;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 25px 45px rgba(10, 13, 25, 0.25);
}
.help-card {
  position: fixed;
  right: 32px;
  bottom: 104px;
  width: 230px;
  background: var(--bg-card);
  border-radius: 20px;
  padding: 18px 20px;
  box-shadow: var(--shadow-card);
  border: 1px solid rgba(255, 255, 255, 0.6);
  font-size: 13px;
  color: var(--text-secondary);
}
.help-title {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 700;
}
.help-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.help-card li {
  line-height: 1.4;
}
@media (max-width: 768px) {
  .app-shell {
    padding: 28px 16px 120px;
  }
  .control-row {
    flex-direction: column;
    align-items: stretch;
  }
  .chip-group,
  .mode-toggle,
  .action-btn {
    width: 100%;
    justify-content: center;
    text-align: center;
  }
  .source-input__row {
    flex-direction: column;
    align-items: stretch;
  }
  .status-strip {
    flex-direction: column;
    align-items: flex-start;
  }
  .help-fab,
  .help-card {
    right: 16px;
  }
}
</style>
