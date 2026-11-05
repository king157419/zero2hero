/* 第 4 章交互组件：Roofline、训练显存（ZeRO）、推理显存（权重 + KV 缓存）
   全部公式与正文一致：式 4-1、4-4、4-6、4-7，例 4-2、例 4-3。无外部依赖。 */
(function () {
  "use strict";
  const C = { ink: "#1A1A1A", rule: "#8C8C8C", grid: "#E2E2DF", fill: "#EDEDEA", line: "#4D4D4D",
              accent: "#2E7D78", pale: "#DCEDEB", warn: "#B23A2E", dark: "#4A4A4A", mid: "#BDBDBD" };
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const txt = (p, x, y, s, a = {}) => { const t = el("text", Object.assign({ x, y, fill: C.ink, "font-size": 12 }, a), p); t.setAttribute("font-size", (+t.getAttribute("font-size") * 1.2).toFixed(1)); t.textContent = s; return t; };
  const h = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; };
  const fmt = (v, d = 1) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US").replace(/,/g, " ") : v.toFixed(d));
  const GB = 1e9, GiB = 2 ** 30;

  // 通用：滑块 / 下拉
  function slider(label, min, max, step, val, show) {
    const w = h(`<label><span>${label}：<span class="w-val"></span></span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"></label>`);
    const inp = w.querySelector("input"), out = w.querySelector(".w-val");
    const upd = () => (out.textContent = show(+inp.value));
    inp.addEventListener("input", upd); upd();
    return { node: w, get: () => +inp.value, on: (f) => inp.addEventListener("input", f), set: (v) => { inp.value = v; upd(); } };
  }
  function select(label, opts, val) {
    const w = h(`<label><span>${label}</span><select>${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`);
    const s = w.querySelector("select"); s.value = val;
    return { node: w, get: () => s.value, on: (f) => s.addEventListener("change", f), set: (v) => (s.value = v) };
  }
  function frame(root, title, hint) {
    root.appendChild(h(`<div class="w-title">${title}</div>`));
    root.appendChild(h(`<div class="w-hint">${hint}</div>`));
    const grid = h(`<div class="w-grid"></div>`); root.appendChild(grid);
    return grid;
  }

  // 对数坐标
  const logScale = (d0, d1, r0, r1) => (v) => r0 + (Math.log10(v) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0)) * (r1 - r0);
  const linScale = (d0, d1, r0, r1) => (v) => r0 + (v - d0) / (d1 - d0) * (r1 - r0);

  const GPUS = {
    h100: { name: "H100 SXM（80 GB）", peak: 989, bw: 3.35, mem: 80 },
    a100: { name: "A100 SXM（80 GB）", peak: 312, bw: 2.04, mem: 80 },
    h200: { name: "H200（141 GB）", peak: 989, bw: 4.8, mem: 141 },
    r4090: { name: "RTX 4090（24 GB）", peak: 165, bw: 1.01, mem: 24 },
  };
  const gpuOpts = Object.entries(GPUS).map(([k, g]) => [k, g.name]);

  // ---------------- 1. Roofline ----------------
  function roofline(root) {
    const grid = frame(root, "动手试一试：Roofline 模型",
      "选择硬件与权重精度，拖动批大小或输入长度，观察工作点在“访存受限区”与“计算受限区”之间移动。算术强度按正文的估算口径：每个参数每处理一个 token 做 2 次浮点运算，每次读入权重只读一遍（忽略 KV 缓存与激活值的读写）。");
    const gpu = select("硬件", gpuOpts, "h100");
    const prec = select("权重精度", [["2", "BF16（2 字节）"], ["1", "INT8（1 字节）"], ["0.5", "4 位（0.5 字节）"]], "2");
    const mode = select("阶段", [["decode", "解码（B 个请求各生成 1 个 token）"], ["prefill", "预填充（一次处理 T 个输入 token）"]], "decode");
    const tok = slider("批大小 B", 0, 13, 1, 0, (v) => `${2 ** v}`);
    [gpu, prec, mode, tok].forEach((c) => grid.appendChild(c.node));
    const W = 640, H = 330, m = { l: 62, r: 18, t: 18, b: 46 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Roofline 图" }); root.appendChild(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const xs = logScale(0.3, 30000, m.l, W - m.r);
    function draw() {
      const g = GPUS[gpu.get()], b = +prec.get(), T = 2 ** tok.get();
      const ymax = g.peak * 3;
      const ys = logScale(1, ymax, H - m.b, m.t);
      svg.innerHTML = "";
      // 网格与坐标
      for (let e = 0; e <= 4; e++) { const v = 10 ** e; const x = xs(v); el("line", { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: C.grid }, svg); txt(svg, x, H - m.b + 16, v >= 1000 ? (v === 1000 ? "1 000" : "10 000") : String(v), { "text-anchor": "middle" }); }
      for (let e = 0; 10 ** e <= ymax; e++) { const v = 10 ** e; const y = ys(v); el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid }, svg); txt(svg, m.l - 6, y + 4, v >= 1000 ? String(v).replace(/(\d)(\d{3})$/, "$1 $2") : String(v), { "text-anchor": "end" }); }
      el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", stroke: C.line }, svg);
      txt(svg, (m.l + W - m.r) / 2, H - 8, "算术强度 I / (FLOP/byte)", { "text-anchor": "middle", "font-size": 13 });
      txt(svg, 16, (m.t + H - m.b) / 2, "可达性能 / (TFLOP/s)", { "text-anchor": "middle", "font-size": 13, transform: `rotate(-90 16 ${(m.t + H - m.b) / 2})` });
      // 屋顶线：TFLOP/s = I × (TB/s)
      const knee = g.peak / g.bw;
      const x0 = 0.3, xk = Math.min(knee, 30000);
      el("polyline", { points: `${xs(x0)},${ys(Math.max(1, x0 * g.bw))} ${xs(xk)},${ys(g.peak)} ${xs(30000)},${ys(g.peak)}`, fill: "none", stroke: C.ink, "stroke-width": 2.2 }, svg);
      el("line", { x1: xs(knee), x2: xs(knee), y1: ys(g.peak), y2: H - m.b, stroke: C.rule, "stroke-dasharray": "4 3" }, svg);
      txt(svg, xs(knee) + 6, H - m.b - 8, `拐点 I* ≈ ${fmt(knee, 0)}`);
      const xm = Math.sqrt(0.3 * knee) / 3; txt(svg, xs(xm) - 8, ys(xm * g.bw) - 14, "访存受限区", { fill: C.dark, "text-anchor": "end" });
      txt(svg, xs(Math.min(knee * 8, 12000)), ys(g.peak) - 8, "计算受限区", { fill: C.dark });
      // 工作点
      const I = T * 2 / b;
      const P = Math.min(g.peak, I * g.bw);
      const memb = I < knee;
      el("circle", { cx: xs(I), cy: ys(P), r: 6, fill: memb ? C.warn : C.accent, stroke: "#fff", "stroke-width": 1.5 }, svg);
      const lab = `${mode.get() === "decode" ? "解码 B" : "预填充 T"} = ${T}`;
      txt(svg, xs(I) + (I > 3000 ? -10 : 10), ys(P) + (P > g.peak * 0.7 ? 20 : -10), lab, { "text-anchor": I > 3000 ? "end" : "start", fill: memb ? C.warn : C.accent });
      const util = (P / g.peak) * 100;
      out.innerHTML = `算术强度 <b>I ≈ ${fmt(I, 1)}</b> FLOP/byte，拐点 I* ≈ ${fmt(knee, 0)}；可达性能约 <b>${fmt(P, 1)} TFLOP/s</b>，为峰值的 ${fmt(util, util < 10 ? 1 : 0)}%。` +
        (memb ? `<br><span class="warn">访存受限</span>：此时速度由显存带宽决定，算力大部分空闲。加大批量、降低权重精度都能提高算术强度。`
              : `<br><span class="ok">计算受限</span>：此时速度由峰值算力决定，再加大批量也不会更快。`);
    }
    [gpu, prec, mode, tok].forEach((c) => c.on(draw));
    mode.on(() => { const d = mode.get() === "decode"; tok.node.querySelector("span").firstChild.nodeValue = d ? "批大小 B：" : "输入长度 T："; tok.set(d ? 0 : 11); draw(); });
    draw();
  }

  // ---------------- 2. 训练显存（ZeRO） ----------------
  function train(root) {
    const grid = frame(root, "动手试一试：训练显存与 ZeRO",
      "按正文例 4-2 的配置（BF16 混合精度 + Adam：权重 2、梯度 2、优化器状态与主权重 12 字节/参数）计算每张卡的模型状态显存。未计入激活值、临时缓冲区与通信缓冲区，实际占用会更高。");
    const sizes = [1, 3, 7, 8, 13, 34, 70, 175];
    const n = slider("模型参数量", 0, sizes.length - 1, 1, 2, (v) => `${sizes[v]}B`);
    const ks = [1, 2, 4, 8, 16, 32, 64, 128];
    const k = slider("GPU 数量 K", 0, ks.length - 1, 1, 3, (v) => `${ks[v]} 张`);
    const gpu = select("每张卡的显存", [["24", "24 GB"], ["40", "40 GB"], ["80", "80 GB"], ["141", "141 GB"]], "80");
    [n, k, gpu].forEach((c) => grid.appendChild(c.node));
    const W = 640, H = 250, m = { l: 74, r: 54, t: 30, b: 40 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "ZeRO 显存条形图" }); root.appendChild(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    function draw() {
      const N = sizes[n.get()] * 1e9, K = ks[k.get()], cap = +gpu.get();
      const rows = [
        ["数据并行", 2, 2, 12],
        ["ZeRO-1", 2, 2, 12 / K],
        ["ZeRO-2", 2, 2 / K, 12 / K],
        ["ZeRO-3", 2 / K, 2 / K, 12 / K],
      ].map(([name, p, g, o]) => ({ name, p: p * N / GB, g: g * N / GB, o: o * N / GB }));
      const tot = rows.map((r) => r.p + r.g + r.o);
      const xmax = Math.max(cap * 1.15, tot[0] * 1.05);
      const xs = linScale(0, xmax, m.l, W - m.r);
      svg.innerHTML = "";
      // 图例
      [["参数（BF16）", C.dark], ["梯度（BF16）", C.mid], ["优化器状态与主权重（FP32）", C.pale]].forEach(([t, c], i) => {
        const x = m.l + i * 150; el("rect", { x, y: 8, width: 12, height: 10, fill: c, stroke: C.line, "stroke-width": .6 }, svg); txt(svg, x + 17, 17, t, { "font-size": 11.5 });
      });
      const bh = 26, gap = (H - m.t - m.b - bh * 4) / 3;
      rows.forEach((r, i) => {
        const y = m.t + i * (bh + gap);
        txt(svg, m.l - 8, y + bh / 2 + 4, r.name, { "text-anchor": "end", "font-size": 12.5 });
        let x = m.l;
        [[r.p, C.dark], [r.g, C.mid], [r.o, C.pale]].forEach(([v, c]) => { const w = xs(v) - m.l; el("rect", { x, y, width: Math.max(0, w), height: bh, fill: c, stroke: C.line, "stroke-width": .6 }, svg); x += w; });
        const over = tot[i] > cap;
        txt(svg, x + 5, y + bh / 2 + 4, fmt(tot[i], 1), { fill: over ? C.warn : C.ink, "font-size": 12 });
      });
      // 坐标与显存线
      const ticks = 5, step = Math.pow(10, Math.floor(Math.log10(xmax / ticks)));
      const st = [1, 2, 5, 10].map((s) => s * step).find((s) => xmax / s <= 7);
      for (let v = 0; v <= xmax; v += st) { const x = xs(v); el("line", { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 4, stroke: C.line }, svg); txt(svg, x, H - m.b + 17, String(Math.round(v)), { "text-anchor": "middle", "font-size": 11.5 }); }
      el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: C.line }, svg);
      txt(svg, (m.l + W - m.r) / 2, H - 6, "每张 GPU 上的模型状态显存 / GB", { "text-anchor": "middle", "font-size": 12.5 });
      el("line", { x1: xs(cap), x2: xs(cap), y1: m.t - 6, y2: H - m.b, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.2 }, svg);
      txt(svg, xs(cap) + 4, H - m.b - 6, `单卡 ${cap} GB`, { fill: C.warn, "font-size": 11.5 });
      const fit = rows.filter((r, i) => tot[i] <= cap).map((r) => r.name);
      out.innerHTML = `${sizes[n.get()]}B 模型、${K} 张卡：` + (fit.length
        ? `<span class="ok">${fit.join("、")}</span> 的模型状态能放进单卡 ${cap} GB（还需给激活值留出余量）。`
        : `<span class="warn">四种方式都放不下</span>，需要更多的卡、张量/流水线并行，或改用 LoRA 等参数高效微调。`) +
        (K === 1 ? "<br>只有 1 张卡时，ZeRO 的分片没有可分的对象，四种方式相同。" : "");
    }
    [n, k, gpu].forEach((c) => c.on(draw));
    draw();
  }

  // ---------------- 3. 推理显存（权重 + KV 缓存） ----------------
  const MODELS = {
    m8: { name: "8B（GQA：32 层、8 个 KV 头）", N: 8e9, L: 32, H: 8, d: 128 },
    m7: { name: "7B（无 GQA：32 层、32 个 KV 头）", N: 7e9, L: 32, H: 32, d: 128 },
    m70: { name: "70B（GQA：80 层、8 个 KV 头）", N: 70e9, L: 80, H: 8, d: 128 },
  };
  function infer(root) {
    const grid = frame(root, "动手试一试：推理显存与并发上限",
      "按式（4-1）计算权重、按式（4-7）计算 KV 缓存（每头均为 128 维），看一张卡最多能同时容纳多少个请求。默认取例 4-3 的配置（8B 模型、H100 80 GB、BF16、序列长度 4096、不计其他开销）；切换到 4.6 节案例时，改为 RTX 4090、4 位权重，并预留 2 GB 运行时开销。");
    const preset = h(`<div class="w-tabs"><button class="on" data-p="ex">例 4-3 的配置</button><button data-p="case">4.6 节案例的配置</button></div>`);
    root.insertBefore(preset, grid);
    const model = select("模型", Object.entries(MODELS).map(([k, v]) => [k, v.name]), "m8");
    const gpu = select("显卡", gpuOpts, "h100");
    const wp = select("权重精度", [["2", "BF16（2 字节）"], ["1", "INT8（1 字节）"], ["0.625", "4 位（含元数据约 0.625 字节）"]], "2");
    const kp = select("KV 缓存精度", [["2", "BF16（2 字节）"], ["1", "FP8 / INT8（1 字节）"]], "2");
    const T = slider("每个请求的序列长度 T", 9, 17, 1, 12, (v) => `${(2 ** v).toLocaleString("en-US").replace(/,/g, " ")} token`);
    const ov = slider("运行时与其他开销", 0, 8, 1, 0, (v) => `${v} GB`);
    [model, gpu, wp, kp, T, ov].forEach((c) => grid.appendChild(c.node));
    const W = 440, H = 110, m = { l: 6, r: 6 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "显存构成" }); root.appendChild(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    function draw() {
      const M = MODELS[model.get()], g = GPUS[gpu.get()], b = +wp.get(), bk = +kp.get(), t = 2 ** T.get(), o = ov.get();
      const wBytes = M.N * b;                                   // 式 4-1：N·b/8（b 以位计）
      const kv1 = 2 * M.L * M.H * M.d * t * 1 * bk;              // 式 4-7，单个请求 B = 1
      const free = g.mem * GB - wBytes - o * GB;
      const exact = free / kv1, maxB = Math.max(0, Math.floor(exact));
      svg.innerHTML = "";
      const xs = linScale(0, g.mem * GB, m.l, W - m.r), y = 34, bh = 34;
      el("rect", { x: m.l, y, width: W - m.l - m.r, height: bh, fill: "#fff", stroke: C.line, "stroke-width": .8 }, svg);
      let x = m.l;
      const seg = (v, c, label) => { const w = Math.max(0, Math.min(xs(v) - m.l, W - m.r - x)); el("rect", { x, y, width: w, height: bh, fill: c, stroke: C.line, "stroke-width": .6 }, svg); if (w > 60) txt(svg, x + w / 2, y + bh / 2 + 4, label, { "text-anchor": "middle", fill: c === C.dark ? "#fff" : C.ink, "font-size": 12 }); x += w; };
      seg(wBytes, C.dark, `权重 ${fmt(wBytes / GB, 1)} GB`);
      if (o) seg(o * GB, C.mid, `开销 ${o} GB`);
      if (maxB > 0) seg(maxB * kv1, C.pale, `KV 缓存 × ${maxB} 个请求`);
      txt(svg, m.l, y - 10, `${g.name}`, { "font-size": 12 });
      txt(svg, W - m.r, y + bh + 18, `${g.mem} GB`, { "text-anchor": "end", "font-size": 11.5 });
      txt(svg, m.l, y + bh + 18, "0", { "font-size": 11.5 });
      const speed = (g.bw * 1e12) / wBytes;
      out.innerHTML = (free <= 0
        ? `<span class="warn">权重本身（${fmt(wBytes / GB, 1)} GB）加开销已超过显存</span>，需要量化、多卡切分或换更大的显卡。`
        : `权重约 <b>${fmt(wBytes / GB, 1)} GB</b>；每个请求的 KV 缓存约 <b>${fmt(kv1 / GiB, 2)} GiB</b>。` +
          `剩余 ${fmt(free / GB, 1)} GB 可容纳约 ${fmt(exact, 1)} 个请求，即最多 <b>${maxB}</b> 个并发请求。`) +
        `<br>单个请求的解码速度上限 ≈ 显存带宽 ÷ 权重字节数 ≈ ${fmt(g.bw, 2)} TB/s ÷ ${fmt(wBytes / GB, 1)} GB ≈ <b>${fmt(speed, 0)} token/s</b>（第 4.1.2 小节的估算方法）。` +
        (M.H === 32 ? `<br>这个模型没有使用 GQA，KV 头数等于查询头数，同样长度下 KV 缓存是 8 个 KV 头模型的 4 倍。` : "");
    }
    [model, gpu, wp, kp, T, ov].forEach((c) => c.on(draw));
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      if (p === "ex") { model.set("m8"); gpu.set("h100"); wp.set("2"); kp.set("2"); T.set(12); ov.set(0); }
      else { model.set("m8"); gpu.set("r4090"); wp.set("0.625"); kp.set("2"); T.set(12); ov.set(2); }
      draw();
    });
    draw();
  }

  const REG = { roofline, train, infer };
  document.querySelectorAll(".widget[data-widget]").forEach((d) => { const f = REG[d.dataset.widget]; if (f) f(d); });
})();
