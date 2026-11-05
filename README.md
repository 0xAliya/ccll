# ccll

英语词库与背单词 / 听写练习网页（Vue3 + Vite + Tailwind）。

在线地址：https://0xAliya.github.io/ccll/

## 词库

词库放在 `public/` 下，每行一条，格式为 `英文=中文`：

| 文件 | 内容 | 条数 |
| --- | --- | --- |
| `wordlist.txt` | 校园 / 职场场景词组（下划线连接，显示时转为空格） | 1291 |
| `固定搭配.txt` | 常用固定搭配 | 88 |
| `dictation.txt` | 听写句子 | 98 |

也支持 `.csv`（`word,meaning`）。

## 本地运行

```bash
pnpm install
pnpm dev
```

## 部署

```bash
pnpm run deploy
```

构建后通过 gh-pages 发布到 GitHub Pages。
