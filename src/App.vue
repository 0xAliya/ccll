<template>
  <div class="app-shell">
    <div class="masthead">
      <div class="brand">
        <span class="hero-badge">Spell & Spark · 听力拼写练习</span>
        <span class="brand-stats" v-if="activeWords.length">
          已掌握 {{ masteredCount }} / {{ activeWords.length }}
          <span class="brand-track"><span class="brand-fill" :style="{ width: `${masteredPercent}%` }"></span></span>
        </span>
      </div>
      <button type="button" class="theme-toggle" @click="theme = theme === 'dark' ? 'light' : 'dark'"
        :title="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'">
        {{ theme === 'dark' ? '🌙' : '☀️' }}
      </button>
    </div>
    <div class="control-panel">
      <div class="control-row control-row--modes">
        <div class="mode-toggle" role="group" aria-label="练习模式">
          <button class="mode-btn" :class="{ 'mode-btn--active': practiceMode === 'listening' }" type="button"
            :disabled="panelStatus.started" @click="practiceMode = 'listening'">
            听写
          </button>
          <button class="mode-btn" :class="{ 'mode-btn--active': practiceMode === 'dictation' }" type="button"
            :disabled="panelStatus.started" @click="practiceMode = 'dictation'">
            默写
          </button>
        </div>
      </div>

      <div class="control-row control-row--order">
        <div class="mode-toggle" role="group" aria-label="练习顺序">
          <button
            class="mode-btn"
            :class="{ 'mode-btn--active': practiceOrderMode === 'sequential' }"
            type="button"
            :disabled="panelStatus.started"
            @click="practiceOrderMode = 'sequential'"
          >
            顺
          </button>
          <button
            class="mode-btn"
            :class="{ 'mode-btn--active': practiceOrderMode === 'shuffle' }"
            type="button"
            :disabled="panelStatus.started"
            @click="practiceOrderMode = 'shuffle'"
          >
            乱
          </button>
        </div>
      </div>

      <div class="source-input">
        <div class="source-input__wrapper">
          <input v-model="newBankUrl" class="source-input__field" placeholder="输入词库链接并导入"
            @keyup.enter="importNewBank" />
          <div class="source-input__actions">
            <input
              v-model="newBankName"
              class="input-field input-field--name"
              placeholder="词库名称"
              maxlength="20"
            />
            <button type="button" class="input-btn input-btn--text" @click="importNewBank"
              :disabled="isLoadingWords[practiceMode]">
              {{ isLoadingWords[practiceMode] ? '导入中…' : '导入' }}
            </button>
            <button class="input-btn input-btn--badge" :class="{ 'input-btn--active': showList }"
              @click="showList = true">
              词库 {{ activeWords.length }} →
            </button>
          </div>
        </div>
        
      <div class="preset-row">
        <span class="preset-label">内置词库</span>
        <button
          v-for="preset in PRESET_BANKS"
          :key="preset.file"
          type="button"
          class="preset-chip"
          :class="{ 'preset-chip--added': hasPreset(preset) }"
          :title="preset.desc"
          :disabled="panelStatus.started || isLoadingWords[practiceMode]"
          @click="importPreset(preset)"
        >
          {{ hasPreset(preset) ? '✓ ' : '+ ' }}{{ preset.name }}
        </button>
      </div>

      <div class="wordbank-selector" v-if="wordBanks[practiceMode].length > 0">
        <div class="wordbank-list">
          <div
            v-for="bank in wordBanks[practiceMode]"
            :key="bank.id"
            role="button"
            tabindex="0"
            class="wordbank-item"
            :class="{ 'wordbank-item--active': selectedBankId[practiceMode] === bank.id, 'wordbank-item--disabled': panelStatus.started }"
            @click="!panelStatus.started && selectWordBank(bank.id)"
          >
            <span class="wordbank-name">{{ bank.name }}</span>
            <span class="wordbank-count">{{ bank.words.filter(w => w.tag !== 'skip').length }}</span>
            <button
              class="wordbank-delete"
              @click.stop="deleteWordBank(bank.id)"
              :disabled="panelStatus.started"
              title="删除词库"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      </div>

      <div class="control-row control-row--actions">
        <button class="action-btn action-btn--primary action-btn--hero" @click="handleStart" :disabled="!hasWords">
          {{ hasWords ? '开始练习' : activeWords.length ? '恢复可练单词' : '请先导入' }}
        </button>
      </div>
    </div>

    <p v-if="activeImportError" class="inline-error">{{ activeImportError }}</p>

    <main class="main-area">
      <PracticePanel v-if="!showList" :words="sessionWords" :start-signal="startSignal" :mode="statusMode" :order-mode="sessionOrderMode"
        @completed="handlePracticeComplete" @status-change="handleStatusChange" @word-progress="handleWordProgress" />
      <WordListPage v-else :words="activeWords" :mode="practiceMode" @update:words="handleActiveWordsUpdate"
        @close="showList = false" />
    </main>

    <button class="help-fab" type="button" @click="helpVisible = !helpVisible">?</button>
    <div class="help-card" v-if="helpVisible">
      <p class="help-title">快捷键</p>
      <ul>
        <li>Enter · 提交 / 下一题</li>
        <li>Space · 下一题</li>
        <li>Tab · 提示一个字母</li>
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
import type { WordItem, WordProgressPayload, PracticeMode, PracticeOrderMode, PresetBank } from './types/word';

interface PanelStatus {
  current: number;
  total: number;
  accuracy: number;
  started: boolean;
}

interface WordBank {
  id: string;
  name: string;
  words: WordItem[];
  url: string;
}

type ThemeMode = 'dark' | 'light';

const MODES: PracticeMode[] = ['listening', 'dictation'];
const WORD_BANKS_KEY = 'ielts_word_banks_v2';
const SELECTED_BANK_KEY = 'ielts_selected_bank';
const THEME_KEY = 'ielts_theme_mode';
const ORDER_MODE_KEY = 'ielts_practice_order_mode';

// public/ 下自带的词库，听写默写都能用
const PRESET_BANKS: PresetBank[] = [
  { file: 'wordlist.txt', name: '场景词组', desc: '校园 / 职场高频场景词组' },
  { file: '固定搭配.txt', name: '固定搭配', desc: '常用动词短语与介词搭配' },
  { file: 'dictation.txt', name: '听写句子', desc: '日常问句整句听写' },
];
const DEFAULT_PRESET: Record<PracticeMode, string> = { listening: 'wordlist.txt', dictation: '固定搭配.txt' };

function presetUrl(preset: PresetBank): string {
  return `${import.meta.env.BASE_URL}${encodeURIComponent(preset.file)}`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function loadWordBanks(): Record<PracticeMode, WordBank[]> {
  try {
    const raw = localStorage.getItem(WORD_BANKS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        listening: Array.isArray(data.listening) ? data.listening : [],
        dictation: Array.isArray(data.dictation) ? data.dictation : [],
      };
    }
  } catch { }
  return { listening: [], dictation: [] };
}

function saveWordBanks(banks: Record<PracticeMode, WordBank[]>) {
  try {
    localStorage.setItem(WORD_BANKS_KEY, JSON.stringify(banks));
  } catch { }
}

function loadSelectedBankId(): Record<PracticeMode, string | null> {
  try {
    const raw = localStorage.getItem(SELECTED_BANK_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch { }
  return { listening: null, dictation: null };
}

function saveSelectedBankId(ids: Record<PracticeMode, string | null>) {
  try {
    localStorage.setItem(SELECTED_BANK_KEY, JSON.stringify(ids));
  } catch { }
}

function withDefaults(word: WordItem): WordItem {
  return {
    word: normalizeWord(word.word),
    meaning: word.meaning,
    tag: word.tag,
    correctCount: typeof word.correctCount === 'number' ? word.correctCount : 0,
  };
}

const wordBanks = reactive<Record<PracticeMode, WordBank[]>>(loadWordBanks());
const selectedBankId = reactive<Record<PracticeMode, string | null>>(loadSelectedBankId());
const importErrors = reactive<Record<PracticeMode, string>>({ listening: '', dictation: '' });
const isLoadingWords = reactive<Record<PracticeMode, boolean>>({ listening: false, dictation: false });

const newBankUrl = ref('');
const newBankName = ref('');
const startSignal = ref(0);
const panelStatus = ref<PanelStatus>({ current: 0, total: 0, accuracy: 0, started: false });
const helpVisible = ref(false);
const showList = ref(false);
const practiceMode = ref<PracticeMode>('listening');
const sessionMode = ref<PracticeMode>('listening');
const practiceOrderMode = ref<PracticeOrderMode>('shuffle');
const sessionOrderMode = ref<PracticeOrderMode>('shuffle');
const theme = ref<ThemeMode>('dark');

function applyThemeClass(value: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light');
  root.classList.add(`theme-${value}`);
}

if (typeof window !== 'undefined') {
  try {
    const storedTheme = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (storedTheme === 'dark' || storedTheme === 'light') {
      theme.value = storedTheme;
    }
  } catch { }
}

if (typeof window !== 'undefined') {
  try {
    const storedOrder = localStorage.getItem(ORDER_MODE_KEY) as PracticeOrderMode | null;
    if (storedOrder === 'shuffle' || storedOrder === 'sequential') {
      practiceOrderMode.value = storedOrder;
    }
  } catch { }
}

watch(
  theme,
  value => {
    applyThemeClass(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch { }
  },
  { immediate: true }
);

watch(
  practiceOrderMode,
  value => {
    if (!panelStatus.value.started) {
      sessionOrderMode.value = value;
    }
    try {
      localStorage.setItem(ORDER_MODE_KEY, value);
    } catch { }
  },
  { immediate: true }
);

// 自动选择第一个词库
for (const mode of MODES) {
  if (!selectedBankId[mode] && wordBanks[mode].length > 0) {
    selectedBankId[mode] = wordBanks[mode][0].id;
  }
}

const activeWords = computed(() => {
  const mode = practiceMode.value;
  const bankId = selectedBankId[mode];
  if (!bankId) return [];
  const bank = wordBanks[mode].find(b => b.id === bankId);
  return bank ? bank.words : [];
});

const sessionWords = computed(() => {
  const mode = sessionMode.value;
  const bankId = selectedBankId[mode];
  if (!bankId) return [];
  const bank = wordBanks[mode].find(b => b.id === bankId);
  return bank ? bank.words : [];
});

const masteredCount = computed(() => activeWords.value.filter(w => w.tag === 'easy').length);
const masteredPercent = computed(() =>
  activeWords.value.length ? Math.round((masteredCount.value / activeWords.value.length) * 100) : 0
);

const activeImportError = computed(() => importErrors[practiceMode.value]);
const hasWords = computed(() => activeWords.value.some(w => w.tag !== 'skip'));
const statusMode = computed<PracticeMode>(() => (panelStatus.value.started ? sessionMode.value : practiceMode.value));

watch(practiceMode, newMode => {
  if (!panelStatus.value.started) {
    sessionMode.value = newMode;
  }
});

watch(wordBanks, () => {
  saveWordBanks(wordBanks);
}, { deep: true });

watch(selectedBankId, () => {
  saveSelectedBankId(selectedBankId);
}, { deep: true });

function selectWordBank(bankId: string) {
  selectedBankId[practiceMode.value] = bankId;
}

function deleteWordBank(bankId: string) {
  const mode = practiceMode.value;
  const index = wordBanks[mode].findIndex(b => b.id === bankId);
  if (index !== -1) {
    wordBanks[mode].splice(index, 1);
    if (selectedBankId[mode] === bankId) {
      selectedBankId[mode] = wordBanks[mode].length > 0 ? wordBanks[mode][0].id : null;
    }
  }
}

function hasPreset(preset: PresetBank): boolean {
  const url = presetUrl(preset);
  return wordBanks[practiceMode.value].some(b => b.url === url);
}

async function importPreset(preset: PresetBank, mode: PracticeMode = practiceMode.value) {
  const url = presetUrl(preset);
  const existing = wordBanks[mode].find(b => b.url === url);
  if (existing) {
    selectedBankId[mode] = existing.id;
    return;
  }
  await loadBank(mode, url, preset.name);
}

async function importNewBank() {
  const mode = practiceMode.value;
  importErrors[mode] = '';
  const url = newBankUrl.value.trim();
  if (!url) {
    importErrors[mode] = '请填写词库链接';
    return;
  }
  const name = newBankName.value.trim() || `词库 ${wordBanks[mode].length + 1}`;
  if (await loadBank(mode, url, name)) {
    newBankUrl.value = '';
    newBankName.value = '';
  }
}

async function loadBank(mode: PracticeMode, url: string, name: string): Promise<boolean> {
  importErrors[mode] = '';
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
      importErrors[mode] = '词库为空或格式错误';
    } else {
      const newBank: WordBank = {
        id: generateId(),
        name,
        words: sanitized,
        url,
      };
      wordBanks[mode].push(newBank);
      selectedBankId[mode] = newBank.id;
      return true;
    }
  } catch (err) {
    importErrors[mode] = '读取词库失败，请检查链接或网络';
  } finally {
    isLoadingWords[mode] = false;
  }
  return false;
}

// 首次打开没有任何词库时，自动装上内置词库，打开即可练
onMounted(() => {
  for (const mode of MODES) {
    if (wordBanks[mode].length === 0) {
      const preset = PRESET_BANKS.find(p => p.file === DEFAULT_PRESET[mode]);
      if (preset) importPreset(preset, mode);
    }
  }
});

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
  sessionOrderMode.value = practiceOrderMode.value;
  startSignal.value++;
}

function handlePracticeComplete() {
  // 保留面板，方便再次开始
}

function handleActiveWordsUpdate(newWords: WordItem[]) {
  const mode = practiceMode.value;
  const bankId = selectedBankId[mode];
  if (!bankId) return;
  
  const bank = wordBanks[mode].find(b => b.id === bankId);
  if (bank) {
    bank.words = newWords.map(withDefaults);
  }
}

function handleStatusChange(payload: PanelStatus) {
  panelStatus.value = payload;
}

function handleWordProgress(payload: WordProgressPayload) {
  const currentMode = sessionMode.value;
  const bankId = selectedBankId[currentMode];
  if (!bankId) return;
  
  const bank = wordBanks[currentMode].find(b => b.id === bankId);
  if (!bank) return;
  
  let changed = false;
  const updated = bank.words.map(item => {
    if (normalizeWord(item.word).toLowerCase() === normalizeWord(payload.word).toLowerCase()) {
      changed = true;
      const isMastered = payload.correctCount >= 5;
      const nextTag = item.tag === 'skip' ? 'skip' : isMastered ? 'easy' : item.tag;
      return { ...item, correctCount: payload.correctCount, tag: nextTag };
    }
    return item;
  });
  if (changed) {
    bank.words = updated;
  }
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: 56px 32px 140px;
  background: var(--bg-page);
  background-image: radial-gradient(circle at 20% 20%, rgba(255, 138, 63, 0.12), transparent 45%),
    radial-gradient(circle at 80% 0%, rgba(124, 168, 255, 0.12), transparent 50%),
    var(--page-gradient);
}

.masthead {
  max-width: 1080px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.brand-stats {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-subtle);
}

.brand-track {
  width: 90px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-strong);
  overflow: hidden;
}

.brand-fill {
  display: block;
  height: 100%;
  background: var(--success);
  transition: width 0.3s ease;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.preset-label {
  font-size: 12px;
  color: var(--text-subtle);
  margin-right: 4px;
}

.preset-chip {
  border: 1px dashed var(--border-strong);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 12px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.preset-chip:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--text-primary);
}

.preset-chip--added {
  border-style: solid;
  color: var(--success);
}

.preset-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hero-badge {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.control-panel {
  margin: 12px auto;
  display: flex;
  align-items: center;
  gap: 20px;
  max-width: 1060px;
}

.control-row {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 12px;
}

.control-row--modes {
  flex-direction: row;
  align-items: center;
  gap: 20px;
  justify-content: flex-start;
}

.control-row--order {
  align-items: flex-start;
  gap: 8px;
}

.control-row--actions {
  flex-direction: row;
  align-items: center;
  gap: 20px;
  justify-content: flex-start;
}

.control-label {
  font-size: 12px;
  color: var(--text-subtle);
  letter-spacing: 0.08em;
}

.source-input {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-input__meta {
  font-size: 12px;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
}

.source-input__wrapper {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 20px;
  background: var(--input-surface);
  min-width: 550px;

}

.source-input__wrapper:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 12px rgba(255, 123, 156, 0.35);
}

.source-input__field {
  flex: 1;
  border: none;
  background: transparent;
  padding: 16px 20px;
  font-size: 15px;
  color: var(--text-primary);
  outline: none;
}

.source-input__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
  flex-shrink: 0;
}

.input-field {
  border: none;
  background: var(--chip-surface);
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-primary);
  border-radius: 10px;
  outline: none;
  transition: background 0.2s ease;
}

.input-field:focus {
  background: var(--input-surface);
}

.input-field--name {
  width: 100px;
}

.wordbank-selector {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.wordbank-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wordbank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-soft);
  background: var(--chip-surface);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wordbank-item:hover:not(.wordbank-item--disabled) {
  background: var(--input-surface);
  border-color: var(--primary);
}

.wordbank-item--active {
  background: var(--primary);
  color: #fffefd;
  border-color: var(--primary);
}

.wordbank-item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wordbank-name {
  font-weight: 600;
}

.wordbank-count {
  font-size: 11px;
  opacity: 0.8;
}

.wordbank-delete {
  border: none;
  background: transparent;
  color: currentColor;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.wordbank-delete:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.wordbank-delete:disabled {
  cursor: not-allowed;
}

.input-btn {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 12px;
  transition: background 0.2s ease, color 0.2s ease;
}

.input-btn:hover:not(:disabled) {
  background: var(--chip-surface);
  color: var(--text-primary);
}

.input-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-btn--text {
  color: var(--text-subtle);
}

.input-btn--badge {
  color: var(--text-secondary);
}

.input-btn--active {
  background: var(--primary);
  color: #fffefd;
}

.input-btn--active:hover {
  background: var(--primary);
  color: #fffefd;
}

.chip-group {
  display: inline-flex;
  gap: 12px;
}

.action-btn {
  border-radius: 20px;
  border: 1px solid var(--border-soft);
  background: var(--chip-surface);
  color: var(--text-primary);
  padding: 12px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 35px rgba(255, 123, 156, 0.35);
}

.action-btn--ghost {
  border-style: dashed;
  background: transparent;
  color: var(--text-secondary);
}

.action-btn--primary {
  border: none;
  background: var(--primary);
  color: #fffefd;
  box-shadow: 0 25px 60px rgba(255, 123, 156, 0.45);
}

.action-btn--hero {
  padding: 14px 24px;
  font-weight: 700;
  border-radius: 24px;
}

.action-btn--active {
  background: var(--primary);
  color: #fffefd;
  border-color: transparent;
  box-shadow: 0 18px 45px rgba(255, 123, 156, 0.4);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.mode-toggle {
  display: inline-flex;
  border-radius: 16px;
  border: 1px solid var(--border-soft);
  overflow: hidden;
  background: var(--chip-surface);
}

.mode-btn {
  border: none;
  background: transparent;
  padding: 10px 24px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s ease, color 0.2s ease;
}

.mode-btn--active {
  background: var(--primary);
  color: #fffefd;
}

.theme-toggle {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  padding: 6px;
  line-height: 1;
  opacity: 0.8;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.theme-toggle:hover {
  opacity: 1;
  transform: scale(1.1);
}

.inline-error {
  max-width: 1080px;
  margin: 6px auto 0;
  font-size: 13px;
  color: var(--error);
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
  background: var(--primary);
  color: #fffefd;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 25px 60px rgba(255, 123, 156, 0.45);
}

.help-card {
  position: fixed;
  right: 32px;
  bottom: 104px;
  width: 230px;
  background: var(--content-surface);
  border-radius: 20px;
  padding: 18px 20px;
  box-shadow: 0 35px 80px rgba(0, 0, 0, 0.55);
  border: 1px solid var(--border-strong);
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

@media (max-width: 1024px) {

  .masthead,
  .control-panel {
    max-width: 100%;
  }

  .masthead {
    gap: 10px;
  }

  .control-row,
  .control-row--modes,
  .control-row--actions {
    flex-direction: column;
    align-items: stretch;
  }

  .chip-group,
  .mode-toggle,
  .action-btn,
  .action-btn--hero {
    width: 100%;
    justify-content: center;
    text-align: center;
  }

  .input-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .input-actions .action-btn {
    flex: 1;
    min-width: 120px;
  }
}

@media (max-width: 768px) {
  .app-shell {
    padding: 32px 16px 120px;
  }

  .control-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .source-input__wrapper {
    min-width: 0;
    flex-wrap: wrap;
  }

  .source-input__actions {
    width: 100%;
    padding: 0 12px 12px;
    flex-wrap: wrap;
  }
}
</style>
