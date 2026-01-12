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
          <tr v-for="item in words" :key="item.word">
            <td>
              <strong>{{ item.word }}</strong>
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
            </td>
          </tr>
          <tr v-if="!words.length">
            <td colspan="4" class="empty-row">暂无单词，请先导入或新增 🌱</td>
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

interface Props {
  words: WordItem[];
  mode: PracticeMode;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'update:words', value: WordItem[]): void; (e: 'close'): void }>();

const newWord = ref('');
const newMeaning = ref('');
const addError = ref('');
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
  border-radius: 28px;
  background: var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: var(--shadow-card);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.word-card h2 {
  margin: 4px 0;
  color: var(--text-primary);
}
.word-card .tagline {
  text-transform: uppercase;
  letter-spacing: 0.4em;
  font-size: 11px;
  color: var(--text-muted);
}
.word-card .count {
  color: var(--text-secondary);
  font-size: 12px;
}
.return-btn {
  border: none;
  border-radius: 999px;
  padding: 10px 18px;
  background: var(--bg-card-soft);
  color: var(--text-secondary);
  cursor: pointer;
}
.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.form-row input {
  flex: 1;
  min-width: 140px;
  border-radius: 18px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 12px 16px;
  background: var(--bg-card-soft);
}
.form-row button,
.form-row label {
  border-radius: 18px;
  border: none;
  padding: 12px 20px;
  font-size: 14px;
  cursor: pointer;
}
.form-row button {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: #fff;
  box-shadow: var(--shadow-soft);
}
.form-row label {
  background: var(--bg-card-soft);
  color: var(--text-primary);
  border: 1px dashed rgba(0, 0, 0, 0.08);
}
.error-text {
  font-size: 12px;
  color: var(--error);
}
.table-wrapper {
  border-radius: 22px;
  background: var(--bg-card-soft);
  border: 1px solid rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
thead {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-secondary);
}
th,
td {
  padding: 14px 16px;
  text-align: left;
}
tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.7);
}
tbody tr:nth-child(odd) {
  background: rgba(255, 255, 255, 0.4);
}
.empty-row {
  text-align: center;
  padding: 32px 0;
  color: var(--text-muted);
}
.count-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.1);
  color: var(--success);
  font-size: 12px;
}
.tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.tag-active {
  background: rgba(79, 70, 229, 0.1);
  color: #4f46e5;
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
  gap: 6px;
}
.mini-btn {
  border: none;
  border-radius: 14px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  background: var(--primary);
  color: #fff;
}
.mini-btn.ghost {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid rgba(31, 41, 55, 0.08);
}
</style>
