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
  border-radius: 32px;
  background: var(--word-card-bg);
  border: 1px solid rgba(255, 255, 255, 0.6);
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
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.12);
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
  border: 1px solid rgba(53, 42, 33, 0.14);
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.85);
}
.form-row button {
  border-radius: 18px;
  border: none;
  padding: 12px 24px;
  font-size: 14px;
  cursor: pointer;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: #fffdf9;
  box-shadow: var(--shadow-soft);
  font-weight: 600;
}
.error-text {
  font-size: 12px;
  color: var(--error);
}
.table-wrapper {
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.7);
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(10, 13, 25, 0.08);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
thead {
  background: rgba(255, 142, 98, 0.08);
  color: var(--text-secondary);
}
th,
td {
  padding: 16px 18px;
  text-align: left;
}
tbody tr + tr {
  border-top: 1px solid rgba(15, 23, 42, 0.05);
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
  background: rgba(79, 70, 229, 0.12);
  color: #3730a3;
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
  background: rgba(255, 123, 84, 0.15);
  color: var(--primary);
  font-weight: 600;
}
.mini-btn.ghost {
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-secondary);
  border: 1px solid rgba(15, 23, 42, 0.08);
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
