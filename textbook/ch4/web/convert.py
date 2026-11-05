"""把第 4 章的 LaTeX 源文件转换成 Quarto 网页（.qmd）。

LaTeX 仍是唯一的原稿：改内容只改 overleaf/ 里的 .tex，然后重新运行本脚本即可。
编号（节、图、表、式、例、文献）全部取自 PDF 编译生成的 main.aux，保证网页与 PDF 一致。

用法：python convert.py   （在 web/ 目录下运行；需要 pandoc 与 PyMuPDF）
"""
import pathlib, re, subprocess, json, sys

HERE = pathlib.Path(__file__).parent
SRC = HERE.parent / "overleaf"
FIGPDF = HERE.parent / "tools" / "nature" / "figs"     # 已裁好、已验收的单图 PDF
OUT = HERE
TEXTWIDTH_MM = 143.0

PAGES = [  # (源文件, 输出页, 节号)
    ("00-intro", "index", None),
    ("01-requirements", "s4-1", "4.1"),
    ("02-hardware", "s4-2", "4.2"),
    ("03-framework", "s4-3", "4.3"),
    ("04-inference", "s4-4", "4.4"),
    ("05-tools", "s4-5", "4.5"),
    ("06-case", "s4-6", "4.6"),
    ("07-summary", "s4-7", "4.7"),
    ("08-exercises", "exercises", None),
    ("09-references", "references", None),
]
# 插在某张图之后的交互组件
WIDGET_AFTER = {"fig:roofline": "roofline", "fig:zero": "train", "fig:kv": "infer"}

# ---------- 编号表 ----------
aux = (HERE / "main.aux").read_text(encoding="utf-8")
NUM = {m.group(1): m.group(2) for m in re.finditer(r"\\newlabel\{([^}]*)\}\{\{([^}]*)\}", aux)}
CITE = {m.group(1): m.group(2) for m in re.finditer(r"\\bibcite\{([^}]*)\}\{\{(\d+)\}", aux)}


def grab(s, i):
    """从 s[i]=='{' 开始取配对的花括号内容，返回 (内容, 结束位置后一位)。"""
    assert s[i] == "{", s[i:i + 30]
    d = 0
    for j in range(i, len(s)):
        if s[j] == "{": d += 1
        elif s[j] == "}":
            d -= 1
            if d == 0: return s[i + 1:j], j + 1
    raise ValueError("unbalanced")


def sub_cmd(s, name, nargs, fn, opt=False):
    """把 \\name[opt]{a}{b}... 替换为 fn(args)；花括号可嵌套。"""
    out, i, pat = [], 0, "\\" + name
    while True:
        k = s.find(pat, i)
        if k < 0: out.append(s[i:]); return "".join(out)
        e = k + len(pat)
        if e < len(s) and (s[e].isalpha()):  # 只匹配完整命令名
            out.append(s[i:e]); i = e; continue
        out.append(s[i:k]); j = e
        o = None
        while j < len(s) and s[j] == " " and nargs: j += 1
        if opt and j < len(s) and s[j] == "[":
            q = s.index("]", j); o = s[j + 1:q]; j = q + 1
        args = []
        for _ in range(nargs):
            while s[j] in " \n": j += 1
            a, j = grab(s, j); args.append(a)
        out.append(fn(*args, o) if opt else fn(*args)); i = j


def strip_comments(s):
    return "\n".join(re.sub(r"(?<!\\)%.*$", "", ln) for ln in s.split("\n"))


MATH = re.compile(r"(\$[^$]+\$|\\\[.*?\\\]|\\begin\{(equation|align\*?)\}.*?\\end\{\2\})", re.S)


def units(s):
    """\\SI / \\si / \\num：数学环境里用 \\text，正文里直接写成“数字 单位”。"""
    res, last = [], 0
    for m in MATH.finditer(s):
        res.append(("t", s[last:m.start()])); res.append(("m", m.group(0))); last = m.end()
    res.append(("t", s[last:]))
    out = []
    for kind, seg in res:
        if kind == "m":
            seg = sub_cmd(seg, "SI", 2, lambda a, b: f"{a}\\,\\text{{{b}}}")
            seg = sub_cmd(seg, "si", 1, lambda a: f"\\text{{{a}}}")
            seg = sub_cmd(seg, "num", 1, lambda a: a)
        else:
            seg = sub_cmd(seg, "SI", 2, lambda a, b: f"{a}\u2009{b}")
            seg = sub_cmd(seg, "si", 1, lambda a: a)
            seg = sub_cmd(seg, "num", 1, lambda a: a)
        out.append(seg)
    return "".join(out)


# ---------- 标签 → 所在页 ----------
LABEL_PAGE = {}
for src, page, _ in PAGES:
    t = (SRC / "sections" / f"{src}.tex").read_text(encoding="utf-8")
    for m in re.finditer(r"\\input\{figs/([^}]+)\}", t):
        ft = (SRC / "figs" / f"{m.group(1)}.tex").read_text(encoding="utf-8")
        for l in re.findall(r"\\label\{([^}]+)\}", ft): LABEL_PAGE[l] = page
    for l in re.findall(r"\\label\{([^}]+)\}", t): LABEL_PAGE[l] = page
    for l in re.findall(r"\\begin\{example\}\[[^\]]*\]\{([^}]+)\}", t): LABEL_PAGE[l] = page


def anchor(lbl):
    a = re.sub(r"[^a-zA-Z0-9]+", "-", lbl)
    return "figure-" + a[4:] if a.startswith("fig-") else a   # 避开 Quarto 的 fig- 自动编号


def refmark(lbl, paren=False):
    return f"ZZREF{'P' if paren else ''}{anchor(lbl)}ZZ"


REFINFO = {anchor(l): (NUM.get(l, "?"), LABEL_PAGE.get(l, "index"), l) for l in set(NUM) | set(LABEL_PAGE)}


def figure_block(name):
    ft = strip_comments((SRC / "figs" / f"{name}.tex").read_text(encoding="utf-8"))
    cap, _ = grab(ft, ft.index("\\caption{") + len("\\caption"))
    lbl = re.search(r"\\label\{([^}]+)\}", ft).group(1)
    import fitz
    pdf = fitz.open(FIGPDF / f"{name}.pdf"); pg = pdf[0]
    svg = pg.get_svg_image(text_as_path=True)
    (OUT / "figs").mkdir(exist_ok=True)
    (OUT / "figs" / f"{name}.svg").write_text(svg, encoding="utf-8")
    pct = min(100, round(pg.rect.width / 72 * 25.4 / TEXTWIDTH_MM * 100, 1))
    FIGS[anchor(lbl)] = (name, pct)
    w = WIDGET_AFTER.get(lbl)
    tail = f"\n\nZZWIDGET{w}ZZ\n\n" if w else ""
    return f"\n\nZZFIGSTART{anchor(lbl)}ZZ\n\n图 {NUM[lbl]}ZZSP{cap}\n\nZZFIGENDZZ\n\n{tail}"


FIGS = {}
EQN = [0]


def preprocess(t, secnum):
    t = strip_comments(t)
    # 浮动体、版面命令
    for c in ["Needspace", "markright", "vspace", "hspace"]:
        t = sub_cmd(t, c, 1, lambda a: "")
    t = sub_cmd(t, "addcontentsline", 3, lambda a, b, c: "")
    t = re.sub(r"\\(clearpage|newpage|noindent|small|centering|heiti|songti|bigskip|medskip|smallskip)\b", "", t)
    # 导读框里的位置小图
    t = re.sub(r"\\begin\{minipage\}(\[[^\]]*\])?\{[^}]*\}", "", t)
    t = t.replace("\\end{minipage}", "")
    t = re.sub(r"\\hfill", "", t)
    t = sub_cmd(t, "locator", 1, lambda a: "")
    # 图
    t = re.sub(r"\\input\{figs/([^}]+)\}", lambda m: figure_block(m.group(1)), t)
    # 表：标题写成“表 4-2　…”，去掉 float 外壳；tabularx → tabular
    def table(m):
        body = m.group(1)
        cap, _ = grab(body, body.index("\\caption{") + len("\\caption"))
        lbl = re.search(r"\\label\{([^}]+)\}", body).group(1)
        i = body.index("\\caption{"); _, j = grab(body, i + len("\\caption")); body = body[:i] + body[j:]
        body = re.sub(r"\\label\{[^}]+\}", "", body)
        return f"\n\nZZTABSTART{anchor(lbl)}ZZ\n\n表 {NUM[lbl]}ZZSP{cap}\n\n{body}\n\nZZTABENDZZ\n\n"
    t = re.sub(r"\\begin\{table\}(?:\[[^\]]*\])?(.*?)\\end\{table\}", table, t, flags=re.S)
    def tabx(m):
        spec = m.group(1)
        spec = re.sub(r"@\{\}", "", spec); spec = re.sub(r">\{[^{}]*(\{[^}]*\})?[^{}]*\}", "", spec)
        spec = re.sub(r"p\{[^}]*\}", "l", spec); spec = spec.replace("Y", "l").replace("X", "l").replace(" ", "")
        return "\\begin{tabular}{" + spec + "}"
    t = re.sub(r"\\begin\{tabularx\}\{\\linewidth\}\{((?:[^{}]|\{[^{}]*(?:\{[^{}]*\})*[^{}]*\})*)\}", tabx, t)
    t = t.replace("\\end{tabularx}", "\\end{tabular}")
    t = re.sub(r"\\begin\{longtable\}\{((?:[^{}]|\{[^}]*\})*)\}", lambda m: tabx(re.match(r"(.*)", m.group(1))), t)
    t = t.replace("\\end{longtable}", "\\end{tabular}").replace("\\endhead", "")
    # 框
    t = re.sub(r"\\begin\{guide\}", "\n\nZZBOXguideZZ\n\n", t)
    t = re.sub(r"\\begin\{keypoints\}", "\n\nZZBOXkeypointsZZ\n\n", t)
    t = re.sub(r"\\begin\{pitfall\}", "\n\nZZBOXpitfallZZ\n\n", t)
    t = re.sub(r"\\begin\{example\}\[([^\]]*)\]\{([^}]+)\}",
               lambda m: f"\n\nZZBOXexample{anchor(m.group(2))}ZZ\n\n例 {NUM[m.group(2)]}ZZSP{m.group(1)}\n\n", t)
    t = re.sub(r"\\end\{(guide|keypoints|pitfall|example)\}", "\n\nZZBOXENDZZ\n\n", t)
    t = sub_cmd(t, "guideitem", 2, lambda a, b: f"\\textbf{{{a}}}ZZSP{b}\n\n")
    t = sub_cmd(t, "paragraph", 1, lambda a: f"\\textbf{{{a}}}ZZSP")
    # 强调与术语 → 加粗；英文原名 → 原样
    t = sub_cmd(t, "term", 1, lambda a: f"\\textbf{{{a}}}")
    t = sub_cmd(t, "emph", 1, lambda a: f"\\textbf{{{a}}}")
    t = sub_cmd(t, "en", 1, lambda a: a)
    # 引用、交叉引用
    t = sub_cmd(t, "cite", 1, lambda a: "ZZCITE" + "-".join(CITE[k.strip()] for k in a.split(",")) + "ZZ")
    t = sub_cmd(t, "eqref", 1, lambda a: refmark(a, True))
    t = sub_cmd(t, "ref", 1, lambda a: refmark(a))
    # 公式编号：每个 equation 依次编号，用 \tag 写死，与 PDF 一致
    def eq(m):
        EQN[0] += 1
        body = re.sub(r"\\label\{[^}]+\}", "", m.group(1)).strip()
        return f"\\[\n{body}\n\\tag{{4-{EQN[0]}}}\n\\]"
    t = re.sub(r"\\begin\{equation\}(.*?)\\end\{equation\}", eq, t, flags=re.S)
    t = units(t)
    # 节标题：手工写入节号
    t = re.sub(r"(\\subsection\{.*\})\s*\\label\{([^}]+)\}", lambda m: m.group(1)[:-1] + "ZZID" + anchor(m.group(2)) + "ZZ}", t)
    sub = [0]
    def subsec(m):
        sub[0] += 1
        return f"\\subsection{{{secnum}.{sub[0]}ZZSP{m.group(1)}}}"
    if secnum:
        t = re.sub(r"\\subsection\{(.*)\}", subsec, t)
    t = re.sub(r"\\label\{[^}]+\}", "", t)
    # 列表选项
    t = re.sub(r"\\begin\{(itemize|enumerate)\}\[[^\]]*\]", r"\\begin{\1}", t)
    t = re.sub(r"\\item\[[^\]]*\]", r"\\item", t)
    return t


def pandoc(tex):
    r = subprocess.run(["pandoc", "-f", "latex", "-t", "markdown-raw_tex-raw_attribute-smart+pipe_tables",
                        "--wrap=none"], input=tex, capture_output=True, text=True, encoding="utf-8")
    if r.returncode: sys.exit(r.stderr)
    if r.stderr.strip(): print("  pandoc:", r.stderr.strip()[:300])
    return r.stdout


BOXTITLE = {"keypoints": "本节要点", "pitfall": "辨析"}


def postprocess(md):
    def ref(m):
        paren, a = m.group(1), m.group(2)
        num, page, lbl = REFINFO[a]
        txt = f"（{num}）" if paren else num
        tgt = "" if lbl.startswith(("sec:",)) else f"#{a}"
        if lbl.startswith("subsec:"): tgt = f"#{a}"
        return f"[{txt}]({page}.qmd{tgt})"
    md = md.replace("ZZSP", "　")
    md = re.sub(r"\s*ZZID([A-Za-z0-9-]+)ZZ", r" {#\1}", md)
    md = re.sub(r"ZZREF(P?)([A-Za-z0-9-]+?)ZZ", ref, md)
    md = re.sub(r"ZZCITE([0-9-]+)ZZ",
                lambda m: "^" + ",".join(f"[\\[{n}\\]](references.qmd#ref-{n})" for n in m.group(1).split("-")) + "^", md)
    def figstart(m):
        name, pct = FIGS[m.group(1)]
        return (f'::: {{#{m.group(1)} .bookfig}}\n\n![](figs/{name}.svg){{width="{pct}%" fig-align="center"}}\n\n'
                '::: {.figcap}')
    md = re.sub(r"ZZFIGSTART([A-Za-z0-9-]+)ZZ", figstart, md)
    md = md.replace("ZZFIGENDZZ", ":::\n:::")
    md = re.sub(r"ZZTABSTART([A-Za-z0-9-]+)ZZ\n\n(.*?)\n", r"::: {#\1 .booktab}\n\n::: {.tabcap}\n\2\n:::\n", md)
    md = md.replace("ZZTABENDZZ", ":::")
    md = re.sub(r"ZZWIDGET(\w+)ZZ", r'```{=html}\n<div class="widget" data-widget="\1"></div>\n```', md)
    def box(m):
        kind = m.group(1)
        if kind.startswith("example"):
            return f"::: {{#{kind[7:]} .bookbox .example}}\n::: {{.boxtitle}}"
        title = BOXTITLE.get(kind)
        head = f"::: {{.bookbox .{kind}}}"
        return head + (f"\n\n[{title}]{{.boxtitle}}" if title else "")
    md = re.sub(r"ZZBOX(example[A-Za-z0-9-]+)ZZ\n\n(.*?)\n", lambda m: box(m) + "\n" + m.group(2) + "\n:::\n", md)
    md = re.sub(r"ZZBOX([a-z]+)ZZ", box, md)
    md = md.replace("ZZBOXENDZZ", ":::")
    return md


def main():
    toc = []
    for src, page, secnum in PAGES:
        t = (SRC / "sections" / f"{src}.tex").read_text(encoding="utf-8")
        if src == "09-references":
            md = references(t)
            title = "术语与参考文献"
        else:
            title = None
            m = re.search(r"\\(chapter|section)\*?\{(.*)\}", t)
            raw_title = m.group(2)
            t = t[:m.start()] + t[m.end():]
            t = preprocess(t, secnum)
            md = postprocess(pandoc(t))
            title = (f"{secnum}\u3000{raw_title}" if secnum else
                     ("第 4 章\u3000大模型计算系统" if src == "00-intro" else raw_title))
        front = f'---\ntitle: "{title}"\n---\n\n'
        (OUT / f"{page}.qmd").write_text(front + md, encoding="utf-8")
        toc.append((page, title))
        print("wrote", page, title)
    json.dump(toc, open(OUT / "_toc.json", "w", encoding="utf-8"), ensure_ascii=False)


def references(t):
    t = strip_comments(t)
    parts = t.split("\\begin{thebibliography}")
    terms = parts[0]
    terms = re.sub(r"\\section\*\{[^}]*\}", "", terms)
    md = "## 本章术语\n\n" + postprocess(pandoc(preprocess(terms, None))) + "\n\n## 参考文献\n\n"
    items = re.findall(r"\\bibitem\{([^}]+)\}(.*?)(?=\\bibitem|\\end\{thebibliography\})", parts[1], re.S)
    for key, body in items:
        n = CITE[key]
        body = re.sub(r"\\url\{([^}]+)\}", r"<\1>", body.strip()).replace("--", "–")
        body = re.sub(r"\s+", " ", body)
        md += f'[\\[{n}\\]]{{#ref-{n} .refnum}} {body}\n\n'
    return md


if __name__ == "__main__":
    main()
