# 第 4 章 大模型计算系统（LaTeX 源文件）

《大语言模型原理与技术》第 4 章。成品见 [第4章_大模型计算系统.pdf](./第4章_大模型计算系统.pdf)。

## 编译

- 编译器：**XeLaTeX**（Overleaf 中选 XeLaTeX；本地可用 `latexmk -xelatex main.tex`）。
- 字体：正文用宋体 / 黑体 / 楷体，图中文字用微软雅黑，按文件名从 `\zhfontpath`（默认 `/usr/share/fonts/windows/`）加载。换环境时在 `bookstyle.sty` 中修改这个路径，并确保目录中有 `simsun.ttc`、`simhei.ttf`、`simkai.ttf`、`simfang.ttf`、`msyh.ttc`、`msyhbd.ttc`。
- 西文与数学字体为 TeX Gyre Termes / Heros / Termes Math，随 TeX Live 发行。

## 目录

| 路径 | 内容 |
|---|---|
| `main.tex` | 主文件 |
| `bookstyle.sty` | 版式、字体、配色、文本框与图形样式 |
| `sections/` | 各节正文（4.1–4.7、习题、术语与参考文献） |
| `figs/` | 12 幅 TikZ / pgfplots 图 |
| `figaudit.tex` | 把每幅图单独排成一页，供图形规范检查使用 |

## 图形规范

所有图按 nature-skills 中 `nature-figure` 的矢量示意图规范绘制并逐幅检查：一种字族（微软雅黑）、三级字号（8.5 / 7.5 / 6.5 pt）、只有层名加粗、文字统一深色、同一角色的框等宽对齐、连线不穿过文字、全图只用一种强调色（红色仅标瓶颈）。
