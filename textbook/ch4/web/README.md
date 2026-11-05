# 第 4 章网页版（含交互组件）

LaTeX（`../sections`、`../figs`）是唯一原稿，本目录的网页由它自动生成：

1. 先编译 PDF，取得 `main.aux`（全部编号都从这里读，网页与 PDF 编号一致）；
2. `python convert.py`：把各节 LaTeX 转成 `.qmd`，把验收过的图转成 SVG；
3. `quarto render`：生成网站到 `_site/`（把 PDF 复制到本目录即可在侧栏提供下载）。

交互组件在 `widgets.js`：Roofline（4.1 节）、训练显存与 ZeRO（4.3 节）、推理显存与并发上限（4.4 节），公式与正文一致。
