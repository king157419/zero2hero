/* 第 4 章交互组件：Roofline、训练显存（ZeRO）、推理显存（权重 + KV 缓存）
   全部公式与正文一致：式 4-1、4-4、4-6、4-7，例 4-2、例 4-3。无外部依赖。
   动画做法：图中每个元素只创建一次，参数改变时按“临界阻尼弹簧”把它的坐标从当前位置移向新位置。
   连续拖动滑块时速度不会被清零，所以不会一顿一顿；插值在屏幕坐标里做，对数坐标轴上的条形也匀称地伸缩。
   系统设置“减少动态效果”时直接显示结果。 */
(function () {
  "use strict";
  const C = { ink: "#1A1A1A", rule: "#8C8C8C", grid: "#E2E2DF", fill: "#EDEDEA", line: "#4D4D4D",
              accent: "#2E7D78", pale: "#DCEDEB", warn: "#B23A2E", dark: "#4A4A4A", mid: "#BDBDBD" };
  const NS = "http://www.w3.org/2000/svg";
  const FS = 1.2; // SVG 字号整体放大系数
  const HALO = { stroke: "#fff", "stroke-width": 4, "paint-order": "stroke", "stroke-linejoin": "round" };
  const textW = (s, size = 12) => [...s].reduce((w, ch) => w + (/[⺀-￿]/.test(ch) ? 1 : 0.55), 0) * size * FS;
  const h = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; };
  const fmt = (v, d = 1) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US").replace(/,/g, " ") : v.toFixed(d));
  const GB = 1e9, GiB = 2 ** 30;
  const REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 场景描述：每个元素带一个固定的 key ----------
  const L = (k, a) => ({ k, tag: "line", a });
  const R = (k, a) => ({ k, tag: "rect", a });
  const T = (k, x, y, s, a = {}) => ({ k, tag: "text", t: s,
    a: Object.assign({ x, y, fill: C.ink }, a, { "font-size": ((a["font-size"] || 12) * FS).toFixed(1) }) });
  const NUM = new Set(["x", "y", "x1", "x2", "y1", "y2", "width", "height", "cx", "cy", "r", "points"]);

  // ---------- 动画器：临界阻尼弹簧，按真实时间步进（与帧率无关） ----------
  function animator(svg) {
    const OMEGA = 17;                 // 约 0.3 s 基本到位
    const items = new Map();
    let raf = 0, last = 0, first = true;
    const parse = (k, v) => (k === "points" ? String(v).trim().split(/[\s,]+/).map(Number) : [+v]);
    const write = (it) => {
      for (const k in it.x) {
        const v = it.x[k];
        it.el.setAttribute(k, k === "points" ? v.reduce((s, n, i) => s + (i % 2 ? "," : i ? " " : "") + n.toFixed(2), "") : v[0].toFixed(2));
      }
      it.el.setAttribute("opacity", Math.max(0, Math.min(1, it.op[0])).toFixed(3));
    };
    // 解析解：x 为相对目标的偏差，v 为速度
    const spring = (x, v, tg, dt) => {
      for (let i = 0; i < x.length; i++) {
        const d = x[i] - tg[i], c = v[i] + OMEGA * d, e = Math.exp(-OMEGA * dt);
        x[i] = tg[i] + (d + c * dt) * e;
        v[i] = (v[i] - OMEGA * c * dt) * e;
      }
    };
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let moving = false;
      items.forEach((it, key) => {
        for (const k in it.x) {
          spring(it.x[k], it.v[k], it.tg[k], dt);
          if (it.x[k].some((n, i) => Math.abs(n - it.tg[k][i]) > 0.05 || Math.abs(it.v[k][i]) > 0.5)) moving = true;
        }
        spring(it.op, it.ov, [it.alive ? 1 : 0], dt);
        if (Math.abs(it.op[0] - (it.alive ? 1 : 0)) > 0.01) moving = true;
        if (!it.alive && it.op[0] < 0.02) { it.el.remove(); items.delete(key); return; }
        write(it);
      });
      if (moving) raf = requestAnimationFrame(tick);
      else { items.forEach((it) => { for (const k in it.x) { it.x[k] = it.tg[k].slice(); it.v[k].fill(0); } write(it); }); raf = 0; }
    }
    return function set(scene) {
      const seen = new Set(), snap = first || REDUCE;
      scene.forEach((s) => {
        seen.add(s.k);
        let it = items.get(s.k);
        if (!it) {
          const e = document.createElementNS(NS, s.tag);
          it = { el: e, x: {}, v: {}, tg: {}, op: [snap ? 1 : 0], ov: [0], alive: true };
          items.set(s.k, it);
        }
        it.alive = true;
        for (const k in s.a) {
          if (!NUM.has(k)) { it.el.setAttribute(k, s.a[k]); continue; }
          const tg = parse(k, s.a[k]);
          if (!it.x[k] || it.x[k].length !== tg.length || snap) { it.x[k] = tg.slice(); it.v[k] = tg.map(() => 0); }
          it.tg[k] = tg;
        }
        if (s.t !== undefined && it.el.textContent !== s.t) it.el.textContent = s.t;
        svg.appendChild(it.el);       // 按场景顺序叠放
      });
      items.forEach((it, k) => { if (!seen.has(k)) it.alive = false; });
      if (snap) {
        items.forEach((it, k) => { if (!it.alive) { it.el.remove(); items.delete(k); } else { it.op[0] = 1; write(it); } });
        first = false; return;
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    };
  }

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
  const mkSvg = (root, W, H, label) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", `0 0 ${W} ${H}`); s.setAttribute("role", "img"); s.setAttribute("aria-label", label);
    root.appendChild(s); return s;
  };
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
    const svg = mkSvg(root, W, H, "Roofline 图"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const xs = logScale(0.3, 30000, m.l, W - m.r);

    function scene(Tn, b, peak, bw, pf) {
      const S = [], ymax = peak * 3, ys = logScale(1, ymax, H - m.b, m.t);
      for (let e = 0; e <= 4; e++) { const v = 10 ** e, x = xs(v);
        S.push(L("gx" + e, { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: C.grid }));
        S.push(T("gxt" + e, x, H - m.b + 16, v === 1000 ? "1 000" : v === 10000 ? "10 000" : String(v), { "text-anchor": "middle" })); }
      for (let e = 0; 10 ** e <= ymax; e++) { const v = 10 ** e, y = ys(v);
        S.push(L("gy" + e, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gyt" + e, m.l - 6, y + 4, v >= 1000 ? String(v).replace(/(\d)(\d{3})$/, "$1 $2") : String(v), { "text-anchor": "end" })); }
      S.push(R("frame", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", stroke: C.line }));
      S.push(T("xl", (m.l + W - m.r) / 2, H - 8, "算术强度 I / (FLOP/byte)", { "text-anchor": "middle", "font-size": 13 }));
      const cy = (m.t + H - m.b) / 2;
      S.push(T("yl", 16, cy, "可达性能 / (TFLOP/s)", { "text-anchor": "middle", "font-size": 13, transform: `rotate(-90 16 ${cy})` }));
      const knee = peak / bw;
      S.push({ k: "roof", tag: "polyline", a: { points: `${xs(0.3)},${ys(Math.max(1, 0.3 * bw))} ${xs(knee)},${ys(peak)} ${xs(30000)},${ys(peak)}`, fill: "none", stroke: C.ink, "stroke-width": 2.2 } });
      S.push(L("knee", { x1: xs(knee), x2: xs(knee), y1: ys(peak), y2: H - m.b, stroke: C.rule, "stroke-dasharray": "4 3" }));
      const xm = Math.sqrt(knee);
      S.push(T("zm", xs(xm) + 10, ys(xm * bw) + 26, "访存受限区", { fill: C.dark }));
      S.push(T("zc", W - m.r - 8, ys(peak) + 22, "计算受限区", { fill: C.dark, "text-anchor": "end" }));
      S.push(T("kl", xs(knee) + 6, H - m.b - 8, `拐点 I* ≈ ${fmt(knee, 0)}`, Object.assign({}, HALO)));
      const I = Tn * 2 / b, P = Math.min(peak, I * bw), col = I < knee ? C.warn : C.accent;
      const px = xs(I), py = ys(P);
      S.push({ k: "pt", tag: "circle", a: { cx: px, cy: py, r: 6, fill: col, stroke: "#fff", "stroke-width": 1.5 } });
      const lab = `${pf ? "预填充 T" : "解码 B"} = ${Tn}`;
      // 靠近右边时标签整体移到点的左侧：用 end 锚点但保持 x 连续变化
      const wl = textW(lab), right = px > W - m.r - wl - 24;
      S.push(T("pl", right ? px - 10 - wl : px + 10, py - 12, lab, Object.assign({ fill: col }, HALO)));
      return S;
    }
    function update() {
      const g = GPUS[gpu.get()], b = +prec.get(), Tn = 2 ** tok.get(), pf = mode.get() === "prefill";
      anim(scene(Tn, b, g.peak, g.bw, pf));
      const knee = g.peak / g.bw, I = Tn * 2 / b, P = Math.min(g.peak, I * g.bw), util = (P / g.peak) * 100;
      out.innerHTML = `算术强度 <b>I ≈ ${fmt(I, 1)}</b> FLOP/byte，拐点 I* ≈ ${fmt(knee, 0)}；可达性能约 <b>${fmt(P, 1)} TFLOP/s</b>，为峰值的 ${fmt(util, util < 10 ? 1 : 0)}%。` +
        (I < knee ? `<br><span class="warn">访存受限</span>：此时速度由显存带宽决定，算力大部分空闲。加大批量、降低权重精度都能提高算术强度。`
                  : `<br><span class="ok">计算受限</span>：此时速度由峰值算力决定，再加大批量也不会更快。`);
    }
    [gpu, prec, tok].forEach((c) => c.on(update));
    mode.on(() => { const d = mode.get() === "decode"; tok.node.querySelector("span").firstChild.nodeValue = d ? "批大小 B：" : "输入长度 T："; tok.set(d ? 0 : 11); update(); });
    update();
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
    const W = 640, H = 270, m = { l: 74, r: 60, t: 58, b: 40 };
    const svg = mkSvg(root, W, H, "ZeRO 显存条形图"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const parts = (N, K) => [
      ["数据并行", 2, 2, 12], ["ZeRO-1", 2, 2, 12 / K], ["ZeRO-2", 2, 2 / K, 12 / K], ["ZeRO-3", 2 / K, 2 / K, 12 / K],
    ].map(([name, p, g, o]) => ({ name, p: p * N / GB, g: g * N / GB, o: o * N / GB }));

    function scene(N, K, cap) {
      const S = [], rows = parts(N, K), tot = rows.map((r) => r.p + r.g + r.o);
      const xmax = Math.max(cap * 1.15, tot[0] * 1.05), xs = linScale(0, xmax, m.l, W - m.r);
      let lx = m.l;
      [["参数（BF16）", C.dark], ["梯度（BF16）", C.mid], ["优化器状态与主权重（FP32）", C.pale]].forEach(([t, c], i) => {
        S.push(R("lg" + i, { x: lx, y: 6, width: 12, height: 10, fill: c, stroke: C.line, "stroke-width": .6 }));
        S.push(T("lgt" + i, lx + 17, 15.5, t, { "font-size": 11.5 })); lx += 17 + textW(t, 11.5) + 22;
      });
      const cx = xs(cap), capLab = `单卡 ${cap} GB`, cw = textW(capLab, 11.5);
      const flip = cx + 6 + cw > W - 4;
      S.push(T("cap", flip ? cx - 6 - cw : cx + 6, m.t - 14, capLab, { fill: C.warn, "font-size": 11.5 }));
      const bh = 26, gap = (H - m.t - m.b - bh * 4) / 3, vals = [];
      rows.forEach((r, i) => {
        const y = m.t + i * (bh + gap);
        S.push(T("rn" + i, m.l - 8, y + bh / 2 + 5, r.name, { "text-anchor": "end", "font-size": 12.5 }));
        let x = m.l;
        [[r.p, C.dark], [r.g, C.mid], [r.o, C.pale]].forEach(([v, c], j) => {
          const w = Math.max(0, xs(v) - m.l);
          S.push(R(`b${i}${j}`, { x, y, width: w, height: bh, fill: c, stroke: C.line, "stroke-width": .6 })); x += w;
        });
        vals.push(T("v" + i, x + 6, y + bh / 2 + 5, fmt(tot[i], 1), Object.assign({ fill: tot[i] > cap ? C.warn : C.ink, "font-size": 12 }, HALO)));
      });
      S.push(L("capl", { x1: cx, x2: cx, y1: m.t - 8, y2: H - m.b, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.2 }));
      S.push(...vals);                  // 数值叠在虚线之上
      const step = Math.pow(10, Math.floor(Math.log10(xmax / 5)));
      const st = [1, 2, 5, 10].map((v) => v * step).find((v) => xmax / v <= 7);
      for (let v = 0; v <= xmax; v += st) { const x = xs(v), key = String(Math.round(v * 1000));
        S.push(L("tk" + key, { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 4, stroke: C.line }));
        S.push(T("tt" + key, x, H - m.b + 17, String(Math.round(v)), { "text-anchor": "middle", "font-size": 11.5 })); }
      S.push(L("ax", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: C.line }));
      S.push(T("axl", (m.l + W - m.r) / 2, H - 4, "每张 GPU 上的模型状态显存 / GB", { "text-anchor": "middle", "font-size": 12.5 }));
      return S;
    }
    function update() {
      const N = sizes[n.get()] * 1e9, K = ks[k.get()], cap = +gpu.get();
      anim(scene(N, K, cap));
      const rows = parts(N, K), fit = rows.filter((r) => r.p + r.g + r.o <= cap).map((r) => r.name);
      out.innerHTML = `${sizes[n.get()]}B 模型、${K} 张卡：` + (fit.length
        ? `<span class="ok">${fit.join("、")}</span> 的模型状态能放进单卡 ${cap} GB（还需给激活值留出余量）。`
        : `<span class="warn">四种方式都放不下</span>，需要更多的卡、张量/流水线并行，或改用 LoRA 等参数高效微调。`) +
        (K === 1 ? "<br>只有 1 张卡时，ZeRO 的分片没有可分的对象，四种方式相同。" : "");
    }
    [n, k, gpu].forEach((c) => c.on(update));
    update();
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
    const Ts = slider("每个请求的序列长度 T", 9, 17, 1, 12, (v) => `${(2 ** v).toLocaleString("en-US").replace(/,/g, " ")} token`);
    const ov = slider("运行时与其他开销", 0, 8, 1, 0, (v) => `${v} GB`);
    [model, gpu, wp, kp, Ts, ov].forEach((c) => grid.appendChild(c.node));
    const W = 440, H = 104, m = { l: 6, r: 6 };
    const svg = mkSvg(root, W, H, "显存构成"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const calc = (s) => {
      const wBytes = s.N * s.b, kv1 = 2 * s.L * s.H * 128 * s.T * s.bk;   // 式 4-1、式 4-7（B = 1）
      const free = s.mem * GB - wBytes - s.o * GB;
      return { wBytes, kv1, free, exact: free / kv1, maxB: Math.max(0, Math.floor(free / kv1)) };
    };
    function scene(s) {
      const r = calc(s), S = [];
      const xs = linScale(0, s.mem * GB, m.l, W - m.r), y = 30, bh = 34;
      S.push(R("box", { x: m.l, y, width: W - m.l - m.r, height: bh, fill: "#fff", stroke: C.line, "stroke-width": .8 }));
      let x = m.l; const labels = [];
      // 三段始终存在（宽度可为 0），这样增减时是平滑伸缩而不是突然出现
      [["w", r.wBytes, C.dark, `权重 ${fmt(r.wBytes / GB, 1)} GB`],
       ["o", s.o * GB, C.mid, `开销 ${s.o} GB`],
       ["k", r.maxB * r.kv1, C.pale, `KV 缓存 × ${r.maxB} 个请求`]].forEach(([key, v, c, label]) => {
        const w = Math.max(0, Math.min(xs(v) - m.l, W - m.r - x));
        S.push(R("s" + key, { x, y, width: w, height: bh, fill: c, stroke: w > 0.5 ? C.line : "none", "stroke-width": .6 }));
        if (w > textW(label) + 12) labels.push(T("l" + key, x + w / 2, y + bh / 2 + 5, label, { "text-anchor": "middle", fill: c === C.dark ? "#fff" : C.ink }));
        x += w;
      });
      S.push(...labels);
      S.push(T("cap", m.l, y - 10, `显存 ${s.mem} GB`));
      S.push(T("z", m.l, y + bh + 18, "0", { "font-size": 11.5 }));
      S.push(T("max", W - m.r, y + bh + 18, `${s.mem} GB`, { "text-anchor": "end", "font-size": 11.5 }));
      return S;
    }
    function update() {
      const M = MODELS[model.get()], g = GPUS[gpu.get()];
      const s = { N: M.N, L: M.L, H: M.H, b: +wp.get(), bk: +kp.get(), T: 2 ** Ts.get(), o: ov.get(), mem: g.mem };
      anim(scene(s));
      const r = calc(s), speed = (g.bw * 1e12) / r.wBytes;
      out.innerHTML = (r.free <= 0
        ? `<span class="warn">权重本身（${fmt(r.wBytes / GB, 1)} GB）加开销已超过显存</span>，需要量化、多卡切分或换更大的显卡。`
        : `权重约 <b>${fmt(r.wBytes / GB, 1)} GB</b>；每个请求的 KV 缓存约 <b>${fmt(r.kv1 / GiB, 2)} GiB</b>。` +
          `剩余 ${fmt(r.free / GB, 1)} GB 可容纳约 ${fmt(r.exact, 1)} 个请求，即最多 <b>${r.maxB}</b> 个并发请求。`) +
        `<br>单个请求的解码速度上限 ≈ 显存带宽 ÷ 权重字节数 ≈ ${fmt(g.bw, 2)} TB/s ÷ ${fmt(r.wBytes / GB, 1)} GB ≈ <b>${fmt(speed, 0)} token/s</b>（第 4.1.2 小节的估算方法）。` +
        (M.H === 32 ? `<br>这个模型没有使用 GQA，KV 头数等于查询头数，同样长度下 KV 缓存是 8 个 KV 头模型的 4 倍。` : "");
    }
    [model, gpu, wp, kp, Ts, ov].forEach((c) => c.on(update));
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      if (p === "ex") { model.set("m8"); gpu.set("h100"); wp.set("2"); kp.set("2"); Ts.set(12); ov.set(0); }
      else { model.set("m8"); gpu.set("r4090"); wp.set("0.625"); kp.set("2"); Ts.set(12); ov.set(2); }
      update();
    });
    update();
  }

  const REG = { roofline, train, infer };
  document.querySelectorAll(".widget[data-widget]").forEach((d) => { const f = REG[d.dataset.widget]; if (f) f(d); });
})();
