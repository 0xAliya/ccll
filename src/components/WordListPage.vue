<template>
  <div class="word-card">
    <div class="header-row">
      <div>
        <p class="tagline">Word Garden · {{ modeLabel }}</p>
        <h2>词库管理</h2>
        <p class="count">当前 {{ modeLabel }} 词库共 {{ words.length }} 条</p>
      </div>
      <button @click="emit('close')" class="return-btn">返回练习</button>
    </div>

    <form @submit.prevent="addWord" class="form-row">
      <input v-model="newWord" placeholder="英文单词" />
      <input v-model="newMeaning" placeholder="中文释义" />
      <button type="submit">新增</button>
      <span v-if="addError" class="error-text">{{ addError }}</span>
    </form>

    <div class="filter-row">
      <input v-model="keyword" class="search-input" placeholder="🔍 搜索英文或中文" />
      <div class="filter-chips">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="filter-chip"
          :class="{ 'filter-chip--active': filter === f.key }"
          @click="filter = f.key"
        >
          {{ f.label }} {{ countBy(f.key) }}
        </button>
      </div>
      <button type="button" class="mini-btn ghost" @click="exportWords">导出 txt</button>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>英文单词</th>
            <th>中文释义</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in visibleWords" :key="item.word">
            <td>
              <strong class="word-play" @click="speak(item.word)" title="点击发音">{{ item.word }}</strong>
              <span class="count-pill" v-if="item.correctCount">✔ {{ item.correctCount }}</span>
            </td>
            <td>{{ item.meaning }}</td>
            <td>
              <span
                class="tag"
                :class="{
                  'tag-skip': item.tag === 'skip',
                  'tag-easy': item.tag === 'easy',
                  'tag-active': !item.tag,
                }"
              >
                {{ item.tag === 'skip' ? '跳过' : item.tag === 'easy' ? '简单词' : '练习中' }}
              </span>
            </td>
            <td class="action-cells">
              <button type="button" class="mini-btn" @click="toggleSkip(item)">
                {{ item.tag === 'skip' ? '恢复练习' : '设为跳过' }}
              </button>
              <button
                v-if="item.tag"
                type="button"
                class="mini-btn ghost"
                @click="clearTag(item)"
              >
                清除标记
              </button>
              <button type="button" class="mini-btn danger" @click="removeWord(item)">删除</button>
            </td>
          </tr>
          <tr v-if="!visibleWords.length">
            <td colspan="4" class="empty-row">{{ words.length ? '没有符合条件的单词' : '暂无单词，请先导入或新增 🌱' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { WordItem, PracticeMode } from '../types/word';
import { normalizeWord } from '../utils/wordParser';
import { speak } from '../utils/speech';

type FilterKey = 'all' | 'active' | 'easy' | 'skip';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '练习中' },
  { key: 'easy', label: '已掌握' },
  { key: 'skip', label: '跳过' },
];
// 一次最多渲染这么多行，词库上千条时保持流畅
const PAGE_LIMIT = 300;

interface Props {
  words: WordItem[];
  mode: PracticeMode;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'update:words', value: WordItem[]): void; (e: 'close'): void }>();

const newWord = ref('');
const newMeaning = ref('');
const addError = ref('');
const keyword = ref('');
const filter = ref<FilterKey>('all');

function matchFilter(item: WordItem, key: FilterKey): boolean {
  if (key === 'all') return true;
  if (key === 'active') return !item.tag;
  return item.tag === key;
}

function countBy(key: FilterKey): number {
  return props.words.filter(w => matchFilter(w, key)).length;
}

const visibleWords = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return props.words
    .filter(w => matchFilter(w, filter.value))
    .filter(w => !kw || w.word.toLowerCase().includes(kw) || w.meaning.includes(kw))
    .slice(0, PAGE_LIMIT);
});

function removeWord(item: WordItem) {
  const key = canonical(item.word);
  emit('update:words', props.words.filter(w => canonical(w.word) !== key));
}

function exportWords() {
  const text = props.words.map(w => `${w.word}=${w.meaning}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `词库-${modeLabel.value}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const modeLabel = computed(() => (props.mode === 'listening' ? '听力拼写' : '中文默写'));

const canonical = (text: string) => normalizeWord(text).toLowerCase();

function addWord() {
  addError.value = '';
  const word = newWord.value.trim();
  const meaning = newMeaning.value.trim();
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord || !meaning) {
    addError.value = '请输入完整信息';
    return;
  }
  if (props.words.some(w => canonical(w.word) === normalizedWord.toLowerCase())) {
    addError.value = '单词已存在';
    return;
  }
  emit('update:words', [...props.words, { word: normalizedWord, meaning }]);
  newWord.value = '';
  newMeaning.value = '';
}

function updateWord(item: WordItem, patch: Partial<WordItem>) {
  const key = canonical(item.word);
  emit(
    'update:words',
    props.words.map(word => (canonical(word.word) === key ? { ...word, ...patch } : word))
  );
}

function toggleSkip(item: WordItem) {
  if (item.tag === 'skip') {
    const mastered = (item.correctCount ?? 0) >= 5;
    updateWord(item, { tag: mastered ? 'easy' : undefined });
  } else {
    updateWord(item, { tag: 'skip' });
  }
}

function clearTag(item: WordItem) {
  updateWord(item, { tag: undefined });
}
</script>

<style scoped>
.word-card {
  border-radius: 32px;
  background: var(--word-card-bg);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-card);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  align-items: center;
}
.word-card h2 {
  margin: 6px 0;
  color: var(--text-primary);
  font-size: 28px;
}
.word-card .tagline {
  text-transform: uppercase;
  letter-spacing: 0.4em;
  font-size: 11px;
  color: var(--text-subtle);
}
.word-card .count {
  color: var(--text-secondary);
  font-size: 13px;
}
.return-btn {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  background: var(--chip-surface);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.2);
}
.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.form-row input {
  flex: 1;
  min-width: 160px;
  border-radius: 18px;
  border: 1px solid var(--border-soft);
  padding: 12px 16px;
  background: var(--input-surface);
  color: var(--text-primary);
}
.form-row button {
  border-radius: 18px;
  border: none;
  padding: 12px 24px;
  font-size: 14px;
  cursor: pointer;
  background: var(--primary);
  color: #fffefd;
  box-shadow: var(--shadow-soft);
  font-weight: 600;
}
.error-text {
  font-size: 12px;
  color: var(--error);
}
.table-wrapper {
  border-radius: 26px;
  background: var(--content-surface);
  border: 1px solid var(--border-soft);
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.18);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
thead {
  background: rgba(255, 142, 98, 0.12);
  color: var(--text-secondary);
}
th,
td {
  padding: 16px 18px;
  text-align: left;
}
tbody tr + tr {
  border-top: 1px solid var(--border-soft);
}
.empty-row {
  text-align: center;
  padding: 36px 0;
  color: var(--text-muted);
}
.count-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
  font-size: 12px;
}
.tag {
  display: inline-flex;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.tag-active {
  background: rgba(124, 168, 255, 0.14);
  color: var(--secondary);
}
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.search-input {
  flex: 1;
  min-width: 200px;
  border-radius: 18px;
  border: 1px solid var(--border-soft);
  padding: 10px 16px;
  background: var(--input-surface);
  color: var(--text-primary);
}
.filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.filter-chip {
  border: 1px solid var(--border-soft);
  background: var(--chip-surface);
  color: var(--text-secondary);
  border-radius: 12px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
.filter-chip--active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fffefd;
}
.word-play {
  cursor: pointer;
}
.word-play:hover {
  color: var(--primary);
}
.mini-btn.danger {
  background: rgba(239, 68, 68, 0.12);
  color: var(--error);
}
.tag-skip {
  background: rgba(239, 68, 68, 0.12);
  color: var(--error);
}
.tag-easy {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
}
.action-cells {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mini-btn {
  border: none;
  border-radius: 16px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  background: rgba(255, 123, 84, 0.2);
  color: var(--primary);
  font-weight: 600;
}
.mini-btn.ghost {
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-secondary);
  border: 1px solid var(--border-soft);
}
@media (max-width: 720px) {
  .table-wrapper {
    overflow-x: auto;
  }
  table {
    min-width: 640px;
  }
}
</style>
