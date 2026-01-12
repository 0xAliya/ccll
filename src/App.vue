<template>
  <div class="app-shell">
    <header class="top-bar">
      <div>
        <p class="app-label">Spell & Spark</p>
        <h1>听力拼写练习</h1>
        <p class="app-sub">单一任务 · 极简 · 高专注</p>
      </div>
      <div class="top-actions">
        <div class="source-input">
          <input
            v-model="wordSourceUrl"
            class="source-input__field"
            placeholder="请输入词库 TXT 链接"
            @keyup.enter="loadWordsFromUrl()"
          />
          <button
            type="button"
            class="action-btn action-btn--ghost"
            @click="loadWordsFromUrl()"
            :disabled="isLoadingWords"
          >
            {{ isLoadingWords ? '加载中…' : '读取词库' }}
          </button>
        </div>
        <button class="action-btn" :class="{ 'action-btn--muted': showList }" @click="showList = false">
          练习
        </button>
        <button class="action-btn" :class="{ 'action-btn--muted': !showList }" @click="showList = true">
          词库 {{ words.length }}
        </button>
        <button class="action-btn action-btn--primary" @click="handleStart" :disabled="!hasWords">
          {{ hasWords ? '开始练习' : words.length ? '恢复可练单词' : '请先导入' }}
        </button>
      </div>
    </header>

    <p v-if="importError" class="inline-error">{{ importError }}</p>

    <div class="status-strip" :class="{ 'status-strip--inactive': showList }">
      <span>🎧 听力拼写</span>
      <template v-if="showList">
        <span>词库管理 · {{ words.length }} 条</span>
      </template>
      <template v-else>
        <span>
          {{ panelStatus.started ? `第 ${panelStatus.current} / ${panelStatus.total || words.length}` : '等待开始' }}
        </span>
        <span>正确率 {{ panelStatus.accuracy }}%</span>
      </template>
    </div>

    <main class="main-area">
      <PracticePanel
        v-if="!showList"
        :words="words"
        :start-signal="startSignal"
        @completed="handlePracticeComplete"
        @status-change="handleStatusChange"
        @word-progress="handleWordProgress"
      />
      <WordListPage
        v-else
        :words="words"
        @update:words="handleWordsUpdate"
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
import { ref, computed, watch, onMounted } from 'vue';
import PracticePanel from './components/PracticePanel.vue';
import WordListPage from './components/WordListPage.vue';
import { parseWordFile, normalizeWord } from './utils/wordParser';
import type { WordItem, WordProgressPayload } from './types/word';

interface PanelStatus {
  current: number;
  total: number;
  accuracy: number;
  started: boolean;
}

const STORAGE_KEY = 'ielts_word_list';
const SOURCE_URL_KEY = 'ielts_word_source_url';

function resolveDefaultWordUrl() {
  const fallback = `${import.meta.env.BASE_URL}wordlist.txt`;
  if (typeof window === 'undefined') return fallback;
  const base = window.location.origin + import.meta.env.BASE_URL;
  return new URL('wordlist.txt', base).toString();
}

function saveWordsToStorage(words: WordItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch {}
}
function loadWordsFromStorage(): WordItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

const words = ref<WordItem[]>(loadWordsFromStorage().map(withDefaults));
const importError = ref('');
const showList = ref(false);
const startSignal = ref(0);
const panelStatus = ref<PanelStatus>({ current: 0, total: 0, accuracy: 0, started: false });
const helpVisible = ref(false);
const defaultWordUrl = resolveDefaultWordUrl();
let storedSourceUrl: string | null = null;
try {
  storedSourceUrl = localStorage.getItem(SOURCE_URL_KEY);
} catch {}
const wordSourceUrl = ref(storedSourceUrl ?? defaultWordUrl);
if (!storedSourceUrl) {
  try {
    localStorage.setItem(SOURCE_URL_KEY, wordSourceUrl.value);
  } catch {}
}
const isLoadingWords = ref(false);

watch(wordSourceUrl, val => {
  try {
    localStorage.setItem(SOURCE_URL_KEY, val);
  } catch {}
});

const hasWords = computed(() => words.value.some(w => w.tag !== 'skip'));

async function loadWordsFromUrl(auto = false) {
  importError.value = '';
  const url = wordSourceUrl.value.trim();
  if (!url) {
    if (!auto) importError.value = '请填写词库链接';
    return;
  }
  isLoadingWords.value = true;
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
      if (!auto) importError.value = '词库为空或格式错误';
      words.value = [];
      saveWordsToStorage([]);
    } else {
      words.value = sanitized;
      saveWordsToStorage(sanitized);
    }
  } catch (err) {
    if (!auto) importError.value = '读取词库失败，请检查链接或网络';
  } finally {
    isLoadingWords.value = false;
  }
}

onMounted(() => {
  if (!words.value.length && wordSourceUrl.value.trim()) {
    loadWordsFromUrl(true);
  }
});

function handleStart() {
  if (!words.value.length) {
    importError.value = '请先导入词库文件';
    return;
  }
  if (!hasWords.value) {
    importError.value = '所有单词都被标记为跳过，请先恢复一些单词';
    return;
  }
  importError.value = '';
  startSignal.value++;
}

function handlePracticeComplete() {
  // 保留面板，方便再次开始
}

function handleWordsUpdate(newWords: WordItem[]) {
  const sanitized = newWords.map(withDefaults);
  words.value = sanitized;
  saveWordsToStorage(sanitized);
}

function handleStatusChange(payload: PanelStatus) {
  panelStatus.value = payload;
}

function handleWordProgress(payload: WordProgressPayload) {
  let changed = false;
  const updated = words.value.map(item => {
    if (normalizeWord(item.word).toLowerCase() === normalizeWord(payload.word).toLowerCase()) {
      changed = true;
      const isMastered = payload.correctCount >= 5;
      const nextTag = item.tag === 'skip' ? 'skip' : isMastered ? 'easy' : item.tag;
      return { ...item, correctCount: payload.correctCount, tag: nextTag };
    }
    return item;
  });
  if (changed) {
    words.value = updated;
    saveWordsToStorage(updated);
  }
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 32px 16px 96px;
}
.top-bar {
  max-width: 960px;
  margin: 0 auto 12px;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
}
.app-label {
  font-size: 10px;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.top-bar h1 {
  margin: 0;
  font-size: 28px;
  color: var(--text-primary);
}
.app-sub {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
.source-input {
  display: flex;
  flex: 1;
  min-width: 240px;
  gap: 8px;
  align-items: center;
}
.source-input__field {
  flex: 1;
  min-width: 180px;
  border-radius: 999px;
  border: 1px solid rgba(31, 41, 55, 0.12);
  background: var(--bg-card);
  padding: 10px 16px;
  font-size: 14px;
  color: var(--text-primary);
}
.action-btn {
  border-radius: 999px;
  border: 1px solid rgba(31, 41, 55, 0.08);
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 10px 18px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.action-btn--ghost {
  border-style: dashed;
  color: var(--text-secondary);
}
.action-btn--primary {
  border: none;
  background: var(--primary);
  color: #fff;
  box-shadow: var(--shadow-soft);
}
.action-btn--muted {
  background: var(--bg-card-soft);
  color: var(--text-secondary);
}
.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.hidden-input {
  display: none;
}
.inline-error {
  max-width: 960px;
  margin: 4px auto 0;
  font-size: 13px;
  color: var(--error);
}
.status-strip {
  max-width: 720px;
  margin: 24px auto;
  background: var(--bg-card);
  border-radius: 16px;
  padding: 12px 20px;
  display: flex;
  gap: 12px;
  align-items: center;
  border: 1px solid rgba(31, 41, 55, 0.08);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  color: var(--text-secondary);
  font-size: 14px;
}
.status-strip span:first-child {
  font-weight: 600;
  color: var(--text-primary);
}
.status-strip--inactive {
  opacity: 0.7;
}
.main-area {
  max-width: 720px;
  margin: 0 auto;
}
.help-fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--text-primary);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 20px 40px rgba(31, 41, 55, 0.25);
}
.help-card {
  position: fixed;
  right: 32px;
  bottom: 96px;
  width: 220px;
  background: var(--bg-card);
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: var(--shadow-card);
  border: 1px solid rgba(31, 41, 55, 0.08);
  font-size: 13px;
  color: var(--text-secondary);
}
.help-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
}
.help-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.help-card li {
  line-height: 1.4;
}
@media (max-width: 768px) {
  .top-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .top-actions {
    width: 100%;
  }
  .status-strip {
    flex-wrap: wrap;
  }
  .help-fab,
  .help-card {
    right: 16px;
  }
}
</style>
