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

  window.BookW = { C, NS, FS, HALO, textW, h, fmt, GB, GiB, REDUCE, L, R, T, animator, slider, select, frame,
    mkSvg, logScale, linScale, REG: { roofline, train, infer } };
})();


/* ===== ch1.js ===== */
/* 第 1 章交互组件：下一个词元抽签机、句子概率计算器、训练规模估算器
   公式与正文一致：1.2.2 小节的温度 / Top-K / Top-P 定义，式（1-1）与例 1-1、习题 1.3，例 1-4 与习题 1.6。 */
// AFTER: c1:fig:autoreg -> c1sampling
// AFTER: c1:ex:chain -> c1chain
// AFTER: c1:ex:gpt3 -> c1scale
(function () {
  "use strict";
  const { C, HALO, textW, h, fmt, GB, L, R, T, animator, slider, select, frame, mkSvg, logScale, linScale, REG } = window.BookW;

  // ---------- 通用：科学计数法 ----------
  const SUP = "⁻⁰¹²³⁴⁵⁶⁷⁸⁹";
  const sup = (n) => String(n).replace(/[-0-9]/g, (c) => SUP["-0123456789".indexOf(c)]);
  // 由以 10 为底的对数给出“m × 10ⁿ”，可表示远小于浮点数下限的数
  function sciLog(l10, sig = 3) {
    let e = Math.floor(l10 + 1e-12), m = +Math.pow(10, l10 - e).toPrecision(sig);
    if (m >= 10) { m = +(m / 10).toPrecision(sig); e++; }
    return e === 0 ? String(m) : `${m} × 10${sup(e)}`;
  }
  const sci = (v, sig = 3) => sciLog(Math.log10(v), sig);
  const sp = (s) => s.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1 ");   // 千位空格

  // =====================================================================
  // 1. 下一个词元抽签机：温度 → Top-K 与 Top-P 取交集 → 重新归一化
  // =====================================================================
  // “今天天气”的概率取图 1-5（很 0.46、不错 0.18、晴朗 0.12、怎么 0.07，其余合计 0.17），其余两个上下文为示意。
  // 为了画得下，每个上下文只保留 9 个候选词元，把它们当作整个词表；分数取概率的自然对数（τ = 1 时还原原概率）。
  const CTX = {
    w: { name: "今天天气", tok: ["很", "不错", "晴朗", "怎么", "真", "预报", "还", "好", "如何"],
         p: [0.46, 0.18, 0.12, 0.07, 0.06, 0.04, 0.03, 0.02, 0.02] },
    f: { name: "法国的首都是", tok: ["巴黎", "哪里", "一座", "什么", "位于", "里昂", "美丽", "马赛", "浪漫"],
         p: [0.81, 0.05, 0.04, 0.03, 0.02, 0.015, 0.015, 0.01, 0.01] },
    s: { name: "从前有一只", tok: ["小猫", "狐狸", "兔子", "小狗", "老虎", "乌龟", "小鸟", "猴子", "熊"],
         p: [0.16, 0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07] },
  };
  const logits = (key) => CTX[key].p.map(Math.log);
  // 候选已按分数从高到低排好；温度不改变排序，所以保留下来的总是前若干个
  function sampleDist(z, tau, k, p) {
    const n = z.length;
    let pt;
    if (tau <= 0) {                                   // τ → 0：贪心解码，只剩最高分的词元
      const im = z.indexOf(Math.max(...z));
      pt = z.map((_, i) => (i === im ? 1 : 0));
    } else {
      const zm = Math.max(...z), e = z.map((v) => Math.exp((v - zm) / tau)), s = e.reduce((a, b) => a + b, 0);
      pt = e.map((v) => v / s);
    }
    const kk = Math.max(1, Math.min(n, Math.round(k)));
    let cum = 0, nP = 0;                                         // Top-P：在温度后的分布上取累计概率首次 ≥ p 的最小集合
    while (nP < n) { cum += pt[nP]; nP++; if (cum >= p - 1e-9) break; }
    const m = Math.min(kk, nP);                                  // 两者同时用时取交集（第 3 章 3.9 节）
    const sm = pt.slice(0, m).reduce((a, b) => a + b, 0);
    const fin = pt.map((v, i) => (i < m ? v / sm : 0));         // 保留的候选重新归一化
    return { pt, fin, kept: m };
  }
  function draw(fin, rnd = Math.random) {
    let u = rnd(), i = 0;
    for (; i < fin.length - 1; i++) { u -= fin[i]; if (u < 0) break; }
    while (fin[i] === 0 && i > 0) i--;                // 浮点舍入落到被剔除的词元上时退回
    return i;
  }

  REG.c1sampling = function (root) {
    const grid = frame(root, "动手试一试：下一个词元抽签机",
      "选一个上下文，调温度 τ、Top-K 的 k、Top-P 的 p，看模型从哪些词元里抽、各有多大机会。“今天天气”的概率取自图 1-5，另两个上下文为示意；为了画得下，每个上下文只列 9 个候选词元，把它们当作整个词表。处理顺序：分数除以 τ 后做 softmax；Top-K 留前 k 个，Top-P 留累计概率首次 ≥ p 的最小集合，两者同时用时取交集；保留下来的词元重新归一化后再抽。");
    const ctx = select("上下文", Object.entries(CTX).map(([k, v]) => [k, `“${v.name}……”`]), "w");
    const tau = slider("温度 τ", 0, 2, 0.05, 1, (v) => (v === 0 ? "0（贪心解码）" : v.toFixed(2)));
    const kS = slider("Top-K 的 k", 1, 9, 1, 9, (v) => (v === 9 ? "9（不限制）" : String(v)));
    const pS = slider("Top-P 的 p", 0.1, 1, 0.05, 1, (v) => (v >= 1 ? "1.00（不限制）" : v.toFixed(2)));
    [ctx, tau, kS, pS].forEach((c) => grid.appendChild(c.node));
    const btns = h(`<div class="w-tabs"><button data-n="1">抽一次</button><button data-n="100">连抽 100 次</button></div>`);
    root.appendChild(btns);
    const nar = root.clientWidth > 0 && root.clientWidth < 520;     // 手机：画布变窄，字相对变大
    const W = nar ? 400 : 640, H = nar ? 320 : 300, m = { l: 40, r: 6, t: nar ? 76 : 58, b: 40 };
    const svg = mkSvg(root, W, H, "下一个词元的概率分布"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const ys = linScale(0, 1, H - m.b, m.t), slot = (W - m.l - m.r) / 9, bw = nar ? 22 : 30;
    let counts = null, picked = -1, history = [];

    function scene(d, toks) {
      const S = [];
      // 图例
      let lx = m.l, ly = 0;
      const wrap = (w) => { if (lx > m.l && lx + w > W - 4) { lx = m.l; ly += 18; } };
      [["保留，重新归一化后的概率", C.dark], ["被剔除（温度调整后的原概率）", C.grid]].forEach(([t, c], i) => {
        wrap(17 + textW(t, 11.5));
        S.push(R("lg" + i, { x: lx, y: 6 + ly, width: 12, height: 10, fill: c, stroke: C.line, "stroke-width": .6 }));
        S.push(T("lgt" + i, lx + 17, 15.5 + ly, t, { "font-size": 11.5 })); lx += 17 + textW(t, 11.5) + 18;
      });
      if (counts) {
        wrap(14 + textW("100 次中的频率", 11.5));
        S.push({ k: "lgd", tag: "circle", a: { cx: lx + 5, cy: 11 + ly, r: 4.5, fill: C.accent, stroke: "#fff", "stroke-width": 1 } });
        S.push(T("lgdt", lx + 14, 15.5 + ly, "100 次中的频率", { "font-size": 11.5 }));
      }
      for (let i = 0; i <= 4; i++) { const v = i / 4, y = ys(v);
        S.push(L("gy" + i, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: i ? C.grid : C.line }));
        S.push(T("gyt" + i, m.l - 6, y + 4, v.toFixed(2), { "text-anchor": "end", "font-size": 11 })); }
      // 候选集合的框
      S.push(R("set", { x: m.l + 2, y: m.t - 24, width: d.kept * slot - 4, height: H - m.b + 32 - (m.t - 24),
        fill: "none", stroke: C.accent, "stroke-width": 1.4, rx: 3 }));
      const labs = [];
      toks.forEach((tk, i) => {
        const cx = m.l + slot * (i + 0.5), on = i < d.kept, v = on ? d.fin[i] : d.pt[i];
        const y = ys(v);
        S.push(R("b" + i, { x: cx - bw / 2, y, width: bw, height: Math.max(0, H - m.b - y),
          fill: on ? C.dark : C.grid, stroke: on ? C.line : C.mid, "stroke-width": .6 }));
        // 截断前（只做了温度）的高度：虚线短横
        const yt = ys(d.pt[i]);
        S.push(L("t" + i, { x1: cx - bw / 2 - 3, x2: cx + bw / 2 + 3, y1: yt, y2: yt,
          stroke: C.rule, "stroke-dasharray": "3 2", opacity: on && Math.abs(d.fin[i] - d.pt[i]) > 0.004 ? 1 : 0 }));
        const vs = v < 0.005 ? (v === 0 ? "0" : "<.01") : v >= 0.995 ? "1.00" : v.toFixed(2).replace(/^0/, "");
        labs.push(T("v" + i, cx, Math.min(y, yt) - 5, vs, Object.assign({ "text-anchor": "middle", "font-size": 11, fill: on ? C.ink : C.rule }, HALO)));
        S.push(T("n" + i, cx, H - m.b + 18, tk, { "text-anchor": "middle", "font-size": 13,
          fill: i === picked ? C.accent : on ? C.ink : C.rule, "font-weight": i === picked ? "bold" : "normal" }));
        if (counts) S.push({ k: "c" + i, tag: "circle", a: { cx, cy: ys(counts[i] / 100), r: 4.5, fill: C.accent, stroke: "#fff", "stroke-width": 1 } });
      });
      S.push(...labs);
      return S;
    }
    function state() {
      const key = ctx.get(), d = sampleDist(logits(key), tau.get(), kS.get(), pS.get());
      return { key, d, toks: CTX[key].tok };
    }
    function update() {
      const { key, d, toks } = state();
      anim(scene(d, toks));
      const keptToks = toks.slice(0, d.kept);
      let s = `候选集合：<b>${d.kept}</b> 个词元（${keptToks.join("、")}）。`;
      if (d.kept === 1) s += tau.get() === 0 ? "τ = 0 就是贪心解码：每次都选概率最高的词元，输出完全确定。" : "只剩 1 个候选，相当于贪心解码，输出完全确定。";
      else s += `其中概率最高的“${toks[0]}”被抽中的机会是 <b>${fmt(d.fin[0] * 100, 1)}%</b>。`;
      if (picked >= 0 && !counts) s += `<br>这次抽到“<b>${toks[picked]}</b>”，句子变成“${CTX[key].name}${toks[picked]}”。最近几次：${history.join("、")}。`;
      if (counts) {
        s += "<br>连抽 100 次：" + keptToks.map((t, i) => `${t} ${counts[i]} 次（理论 ${fmt(d.fin[i] * 100, d.fin[i] < 0.1 ? 1 : 0)}%）`).join("，") +
          "。次数在理论值附近波动，抽得越多越接近。";
      }
      out.innerHTML = s;
    }
    const reset = () => { counts = null; picked = -1; history = []; update(); };
    [ctx, tau, kS, pS].forEach((c) => c.on(reset));
    btns.addEventListener("click", (e) => {
      const n = +(e.target.dataset && e.target.dataset.n); if (!n) return;
      const { d, toks } = state();
      if (n === 1) {
        counts = null; picked = draw(d.fin);
        history.unshift(toks[picked]); history = history.slice(0, 8);
      } else {
        counts = new Array(9).fill(0); picked = -1; history = [];
        for (let i = 0; i < 100; i++) counts[draw(d.fin)]++;
      }
      update();
    });
    update();
  };

  // =====================================================================
  // 2. 句子概率计算器：式（1-1）连乘 与 对数概率之和
  // =====================================================================
  const LOG10_MIN = Math.log10(2.2250738585072014e-308);   // 双精度浮点数最小的正规数，约 10⁻³⁰⁸
  function chainCalc(ps) {
    const lns = ps.map(Math.log), lnP = lns.reduce((a, b) => a + b, 0);
    let naive = 1; for (const p of ps) naive *= p;              // 直接连乘（会下溢）
    const cum = [0]; lns.forEach((v) => cum.push(cum[cum.length - 1] + v));
    return { lns, lnP, P: Math.exp(lnP), log10P: lnP / Math.LN10, loss: -lnP / ps.length, naive,
             underflow: lnP / Math.LN10 < LOG10_MIN, cum };
  }
  const CHAIN_PRESETS = {
    ex: { tok: ["我", "爱", "北京", "〈结束〉"], p: [0.05, 0.10, 0.20, 0.50] },
    q3: { tok: ["今天", "天气", "很好", "〈结束〉"], p: [0.04, 0.25, 0.30, 0.60] },
  };
  const fp = (p) => (p >= 0.01 && Math.abs(p * 100 - Math.round(p * 100)) < 1e-9 ? p.toFixed(2) : String(+p.toPrecision(3)));
  const neg = (v, d = 3) => (v < 0 ? "−" + (-v).toFixed(d) : v.toFixed(d));

  REG.c1chain = function (root) {
    const preset = h(`<div class="w-tabs"><button class="on" data-p="ex">例 1-1 的句子</button><button data-p="q3">习题 1.3 的句子</button></div>`);
    const grid = frame(root, "动手试一试：句子越长，概率有多小",
      "每一行是一个词元和模型给它的条件概率 P(xₜ | x₍&lt;ₜ₎)，可以修改、增删。下面两个滑块在句子后面再接 n 个词元，模拟几百个词元的文章。左图是按式（1-1）直接连乘的整句概率（对数纵轴），右图是对数概率之和：两条曲线形状相同，但右图的数始终是普通大小。");
    root.insertBefore(preset, grid);                                     // 提示语之后：预置例句、词元行、增删按钮、滑块
    const rows = h(`<div style="display:flex;flex-direction:column;gap:.3rem;margin-bottom:.5rem"></div>`);
    root.insertBefore(rows, grid);
    const edit = h(`<div class="w-tabs"><button data-a="add">添加一个词元</button><button data-a="del">删除最后一个</button></div>`);
    root.insertBefore(edit, grid);
    const nS = slider("后面再接 n 个词元", 0, 1500, 10, 0, (v) => `${v} 个`);
    const qS = slider("这 n 个词元的条件概率均为", 0.05, 0.95, 0.05, 0.1, (v) => v.toFixed(2));
    [nS, qS].forEach((c) => grid.appendChild(c.node));
    // 宽屏左右并排，手机上下叠放（挂载时按容器宽度决定）
    const nar = root.clientWidth > 0 && root.clientWidth < 520;
    const W = nar ? 400 : 640, H = nar ? 470 : 270;
    const PL = nar ? { l: 62, r: 390, t: 32, b: 192 } : { l: 62, r: 300, t: 36, b: 220 };
    const PR = nar ? { l: 62, r: 390, t: 270, b: 420 } : { l: 382, r: 632, t: 36, b: 220 };
    const svg = mkSvg(root, W, H, "累计概率曲线"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);

    function rowHtml(tok, p, i) {
      return `<div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;font-size:.86rem">` +
        `<span style="min-width:3.2em">第 ${i + 1} 步</span>` +
        `<input type="text" value="${tok}" aria-label="词元" style="width:5.5em;font:inherit;padding:.1rem .3rem;border:.6px solid var(--rule)">` +
        `<span>P =</span><input type="number" min="0" max="1" step="0.01" value="${p}" aria-label="条件概率" style="width:5.5em;font:inherit;padding:.1rem .3rem;border:.6px solid var(--rule)"></div>`;
    }
    function load(key) {
      const P = CHAIN_PRESETS[key];
      rows.innerHTML = P.tok.map((t, i) => rowHtml(t, P.p[i].toFixed(2), i)).join("");
      nS.set(0);
    }
    const nice = (r, list) => list.find((v) => r / v <= 5) || list[list.length - 1];
    function read() {
      const toks = [], ps = []; let bad = false;
      rows.querySelectorAll(":scope > div").forEach((d) => {
        const [ti, pi] = d.querySelectorAll("input"), p = +pi.value;
        const ok = pi.value !== "" && p > 0 && p <= 1;
        pi.style.borderColor = ok ? "" : C.warn;
        if (!ok) bad = true;
        toks.push(ti.value || "？"); ps.push(p);
      });
      return { toks, ps, bad };
    }
    function scene(r, Tn) {
      const S = [], lnLo = Math.min(r.lnP, -Math.LN10), R10 = -lnLo / Math.LN10;
      const st = nice(R10, [1, 2, 5, 10, 20, 50, 100, 200, 500]), lo = -Math.ceil(R10 / st - 1e-9) * st;   // log10 下限
      // 两图纵向比例相同：ln P = log10 P × ln10，所以曲线形状一样
      const ysOf = (P) => linScale(0, lo, P.t, P.b), xsOf = (P) => linScale(0, Tn, P.l, P.r);
      const xst = nice(Tn, [1, 2, 5, 10, 20, 50, 100, 200, 500]);
      [["L", PL], ["R", PR]].forEach(([s, P]) => {
        const xs = xsOf(P);
        for (let v = 0; v <= Tn + 1e-9; v += xst) { const x = xs(v);
          S.push(L(`x${s}${v}`, { x1: x, x2: x, y1: P.t, y2: P.b, stroke: C.grid }));
          S.push(T(`xt${s}${v}`, x, P.b + 16, String(v), { "text-anchor": x > W - 16 ? "end" : "middle", "font-size": 11 })); }
        S.push(R("fr" + s, { x: P.l, y: P.t, width: P.r - P.l, height: P.b - P.t, fill: "none", stroke: C.line }));
        S.push(T("xl" + s, (P.l + P.r) / 2, P.b + 34, "词元个数 t", { "text-anchor": "middle", "font-size": 12 }));
      });
      const ysL = ysOf(PL), ysR = ysOf(PR);
      for (let v = 0; v >= lo - 1e-9; v -= st) { const y = ysL(v);
        S.push(L("gyL" + v, { x1: PL.l, x2: PL.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gytL" + v, PL.l - 5, y + 4, v === 0 ? "1" : "10" + sup(v), { "text-anchor": "end", "font-size": 11 })); }
      const lnLoAx = lo * Math.LN10, st2 = nice(-lnLoAx, [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
      for (let v = 0; v >= lnLoAx - 1e-9; v -= st2) { const y = ysR(v / Math.LN10);
        S.push(L("gyR" + v, { x1: PR.l, x2: PR.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gytR" + v, PR.l - 5, y + 4, v === 0 ? "0" : "−" + -v, { "text-anchor": "end", "font-size": 11 })); }
      S.push(T("tL", PL.l, PL.t - 12, "连乘概率 P（对数纵轴）", { "font-size": 12.5 }));
      S.push(T("tR", PR.l, PR.t - 12, "对数概率之和 ln P", { "font-size": 12.5 }));
      // 曲线：固定 121 个采样点，词元数变化时也能平滑过渡
      const K = 121, pts = { L: [], R: [] }, xL = xsOf(PL), xR = xsOf(PR);
      for (let i = 0; i < K; i++) {
        const t = (Tn * i) / (K - 1), k = Math.min(Tn - 1, Math.floor(t)), f = t - k;
        const v = (r.cum[k] + (r.cum[k + 1] - r.cum[k]) * f) / Math.LN10;
        pts.L.push(`${xL(t)},${ysL(v)}`); pts.R.push(`${xR(t)},${ysR(v)}`);
      }
      ["L", "R"].forEach((s) => S.push({ k: "cv" + s, tag: "polyline", a: { points: pts[s].join(" "), fill: "none", stroke: C.ink, "stroke-width": 2 } }));
      if (Tn <= 12) for (let t = 1; t <= Tn; t++) {
        const v = r.cum[t] / Math.LN10;
        [["L", PL], ["R", PR]].forEach(([s, P]) => S.push({ k: `d${s}${t}`, tag: "circle",
          a: { cx: xsOf(P)(t), cy: ysOf(P)(v), r: 3.5, fill: C.accent, stroke: "#fff", "stroke-width": 1 } }));
      }
      if (lo <= LOG10_MIN) {
        const y = ysL(LOG10_MIN);
        S.push(L("floor", { x1: PL.l, x2: PL.r, y1: y, y2: y, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.2 }));
        S.push(T("floorT", PL.r - 4, y - 5, "双精度下限 ≈ 10⁻³⁰⁸", Object.assign({ "text-anchor": "end", fill: C.warn, "font-size": 11 }, HALO)));
      }
      return S;
    }
    function update() {
      const { toks, ps, bad } = read();
      const n = nS.get(), q = qS.get();
      if (bad || !ps.length) {
        out.innerHTML = `<span class="warn">条件概率必须大于 0、不超过 1</span>（概率为 0 时对数是负无穷，整句概率直接为 0）。`;
        return;
      }
      const all = ps.concat(new Array(n).fill(q)), r = chainCalc(all), Tn = all.length;
      anim(scene(r, Tn));
      const tail = n ? ` × ${fp(q)}<sup>${n}</sup>` : "";
      const tailLn = n ? ` + ${n} × (${neg(Math.log(q))})` : "";
      let s = `P = ${ps.map(fp).join(" × ")}${tail} = <b>${sciLog(r.log10P)}</b>` +
        `<br>ln P = ${r.lns.slice(0, ps.length).map((v) => `(${neg(v)})`).join(" + ")}${tailLn} = <b>${neg(r.lnP)}</b>` +
        `；平均负对数概率（即训练损失）= ${(-r.lnP).toFixed(3)} ÷ ${Tn} = <b>${r.loss.toFixed(3)}</b>`;
      if (r.underflow) {
        s += `<br><span class="warn">下溢</span>：整句概率约 ${sciLog(r.log10P)}，已低于双精度浮点数能正常表示的下限（约 10⁻³⁰⁸）。` +
          (r.naive === 0 ? "直接连乘在计算机里得到的是 <b>0</b>，" : `直接连乘得到 ${sci(r.naive, 2)}，有效数字已大量丢失，`) +
          "而对数概率之和仍是普通大小的数，这就是训练和评测都用对数的原因。";
      } else if (r.log10P < -100) s += `<br>整句概率已小到 ${sciLog(r.log10P)}，再长一些就会低于浮点数下限（约 10⁻³⁰⁸）而下溢。`;
      out.innerHTML = s;
    }
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset && e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      load(p); update();
    });
    edit.addEventListener("click", (e) => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      const list = rows.querySelectorAll(":scope > div");
      if (a === "add" && list.length < 10) rows.appendChild(h(rowHtml("新词元", "0.30", list.length)));
      if (a === "del" && list.length > 1) list[list.length - 1].remove();
      update();
    });
    rows.addEventListener("input", update);
    [nS, qS].forEach((c) => c.on(update));
    load("ex"); update();
  };

  // =====================================================================
  // 3. 训练规模估算器：M = Nb/8，C ≈ 6ND，时间 = C ÷（有效算力 × 卡数），Chinchilla D ≈ 20N
  // =====================================================================
  const YEAR = 3.15e7, DAY = 86400;            // 例 1-4 用 3.15 × 10⁷ s/年
  function scaleCalc(N, D, bits, flops, cards) {
    const mem = (N * bits) / 8, Ct = 6 * N * D, t1 = Ct / flops, tK = t1 / cards;
    return { mem, memGB: mem / GB, C: Ct, t1, tK, years1: t1 / YEAR, daysK: tK / DAY, ratio: D / N, Dopt: 20 * N };
  }
  const dur = (s) => (s >= 2 * YEAR ? `约 ${fmt(s / YEAR, s / YEAR < 10 ? 1 : 0)} 年` : s >= 2 * DAY ? `约 ${fmt(s / DAY, 1)} 天`
    : s >= 7200 ? `约 ${fmt(s / 3600, 1)} 小时` : `约 ${fmt(s / 60, 1)} 分钟`);

  REG.c1scale = function (root) {
    const NS_ = [1e9, 1.5e9, 3e9, 7e9, 13e9, 30e9, 70e9, 175e9, 280e9, 540e9, 1e12];
    const DS = [1e10, 2e10, 5e10, 1e11, 3e11, 5e11, 1e12, 1.4e12, 2e12, 3.5e12, 5e12, 1e13, 1.5e13, 3e13, 1e14];
    const FL = [1e14, 2e14, 4e14, 6e14, 1e15, 2e15];
    const nB = (v) => (v >= 1e12 ? `${v / 1e12}T` : `${v / 1e9}B`);
    const preset = h(`<div class="w-tabs"><button class="on" data-p="g">例 1-4：GPT-3</button><button data-p="c">习题 1.6：Chinchilla（70B）</button></div>`);
    const grid = frame(root, "动手试一试：训练规模估算",
      "按例 1-4 的方法估算：权重存储 = 参数量 × 每参数字节数（GB 按 10⁹ 字节计），训练计算量 C ≈ 6ND（第 4 章），训练时间 = C ÷（单卡有效算力 × 卡数），多卡按理想并行（效率 100%）计算。图中斜线是 Chinchilla 的经验比例：每个参数约配 20 个训练词元。");
    root.insertBefore(preset, grid);
    const nS = slider("参数量 N", 0, NS_.length - 1, 1, 7, (i) => `${nB(NS_[i])}（${sci(NS_[i])}）`);
    const dS = slider("训练词元数 D", 0, DS.length - 1, 1, 4, (i) => sci(DS[i]));
    const bS = select("每参数位数 b", [["16", "16 位（2 字节）"], ["8", "8 位（1 字节）"], ["4", "4 位（0.5 字节）"]], "16");
    const fS = slider("单卡有效算力", 0, FL.length - 1, 1, 2, (i) => `${sci(FL[i])} FLOP/s`);
    const kS = slider("GPU 卡数", 0, 14, 1, 10, (v) => `${sp(String(2 ** v))} 张`);
    [nS, dS, bS, fS, kS].forEach((c) => grid.appendChild(c.node));
    const nar = root.clientWidth > 0 && root.clientWidth < 520;
    const W = nar ? 420 : 640, H = nar ? 340 : 320, m = { l: 62, r: 14, t: 14, b: 46 };
    const svg = mkSvg(root, W, H, "参数量与训练词元数"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const xs = logScale(1e9, 1e12, m.l, W - m.r), ys = logScale(1e10, 1e14, H - m.b, m.t);
    const REFS = [["GPT-3", 175e9, 3e11], ["Chinchilla", 70e9, 1.4e12]];

    function scene(N, D, Ct) {
      const S = [];
      [[1e9, "1B"], [1e10, "10B"], [1e11, "100B"], [1e12, "1T"]].forEach(([v, t], i) => { const x = xs(v);
        S.push(L("gx" + i, { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: C.grid }));
        S.push(T("gxt" + i, x, H - m.b + 16, t, { "text-anchor": i === 0 ? "start" : i === 3 ? "end" : "middle", "font-size": 11.5 })); });
      for (let e = 10; e <= 14; e++) { const y = ys(10 ** e);
        S.push(L("gy" + e, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gyt" + e, m.l - 6, y + 4, "10" + sup(e), { "text-anchor": "end", "font-size": 11.5 })); }
      S.push(R("frame", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", stroke: C.line }));
      S.push(T("xl", (m.l + W - m.r) / 2, H - 8, "参数量 N", { "text-anchor": "middle", "font-size": 12.5 }));
      const cy = (m.t + H - m.b) / 2;
      S.push(T("yl", 16, cy, "训练词元数 D", { "text-anchor": "middle", "font-size": 12.5, transform: `rotate(-90 16 ${cy})` }));
      S.push(T("za", m.l + 10, m.t + 22, "数据多、参数少", Object.assign({ fill: C.dark, "font-size": 12 }, HALO)));
      S.push(T("zb", W - m.r - 10, H - m.b - 12, "参数多、数据少", Object.assign({ fill: C.dark, "font-size": 12, "text-anchor": "end" }, HALO)));
      // D = 20N
      const x0 = xs(1e9), y0 = ys(2e10), x1 = xs(1e12), y1 = ys(2e13);
      S.push(L("chin", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: C.ink, "stroke-width": 1.6 }));
      const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, lx = xs(2.2e9), ly = ys(20 * 2.2e9) - 7;
      S.push(T("chinT", lx, ly, "D = 20N", Object.assign({ transform: `rotate(${ang.toFixed(2)} ${lx.toFixed(1)} ${ly.toFixed(1)})`, "font-size": 12 }, HALO)));
      // 同一计算量的等值线：D = C / (6N)，在对数坐标里是斜率 −1 的直线
      const k = Math.log10(Ct / 6), a = Math.max(9, k - 14), b = Math.min(12, k - 10);
      if (b > a) {
        const p0 = [xs(10 ** a), ys(10 ** (k - a))], p1 = [xs(10 ** b), ys(10 ** (k - b))];
        S.push(L("iso", { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: C.rule, "stroke-dasharray": "5 3", "stroke-width": 1.2 }));
        const t = "计算量相同";
        const tx = Math.min(p1[0] - 4, W - m.r - 4), ty = p1[1] - 6;
        S.push(T("isoT", tx, ty > H - m.b - 30 ? ty : ty, t, Object.assign({ "text-anchor": "end", fill: C.dark, "font-size": 11 }, HALO)));
      }
      REFS.forEach(([name, n, d], i) => {
        S.push({ k: "rp" + i, tag: "circle", a: { cx: xs(n), cy: ys(d), r: 5, fill: "#fff", stroke: C.line, "stroke-width": 1.4 } });
        S.push(T("rt" + i, xs(n) - 9, ys(d) + 4, name, Object.assign({ "text-anchor": "end", fill: C.dark, "font-size": 11.5 }, HALO)));
      });
      const px = xs(N), py = ys(D), lab = "当前配置", right = px > W - m.r - textW(lab, 12) - 20;
      S.push({ k: "pt", tag: "circle", a: { cx: px, cy: py, r: 6, fill: C.accent, stroke: "#fff", "stroke-width": 1.5 } });
      S.push(T("ptT", right ? px - 10 - textW(lab, 12) : px + 10, py - 9, lab, Object.assign({ fill: C.accent, "font-size": 12 }, HALO)));
      return S;
    }
    function update() {
      const N = NS_[nS.get()], D = DS[dS.get()], bits = +bS.get(), F = FL[fS.get()], K = 2 ** kS.get();
      const r = scaleCalc(N, D, bits, F, K);
      anim(scene(N, D, r.C));
      const byte = bits / 8;
      let s = `权重存储 = ${sci(N)} × ${byte} 字节 = ${sci(r.mem)} 字节 = <b>${fmt(r.memGB, r.memGB < 10 ? 1 : 0)} GB</b>`;
      s += r.memGB > 288 ? "，放不进任何一张单卡（目前单卡显存约 80～288 GB）" : r.memGB > 80 ? "，超过 80 GB 的单卡" : "";
      s += `<br>训练计算量 C ≈ 6 × ${sci(N)} × ${sci(D)} = <b>${sci(r.C)} FLOPs</b>`;
      s += `<br>单卡耗时 = (${sci(r.C)}) ÷ (${sci(F)}) = ${sci(r.t1, 3)} s，<b>${dur(r.t1)}</b>`;
      s += K > 1 ? `；${sp(String(K))} 张卡 = ${sci(r.t1, 3)} ÷ ${sp(String(K))} = ${sci(r.tK, 3)} s，<b>${dur(r.tK)}</b>` : "";
      const ratio = r.ratio;
      s += `<br>词元数 ÷ 参数量 = ${fmt(ratio, ratio < 10 ? 1 : 0)}；Chinchilla 经验比例建议约 20N = ${sci(r.Dopt)} 个词元。`;
      if (ratio < 15) s += `当前数据只有建议值的 ${fmt((ratio / 20) * 100, 0)}%，<span class="warn">参数多、数据少</span>：同样的计算量换成更小的模型、更多的数据，效果通常更好。`;
      else if (ratio <= 27) s += `<span class="ok">基本符合</span>每参数约 20 个词元的比例。`;
      else s += `数据是建议值的 ${fmt(ratio / 20, 1)} 倍，偏向“参数少、数据多”：训练算力不是最省，但模型小、推理便宜，许多新模型有意这样做。`;
      out.innerHTML = s;
    }
    [nS, dS, bS, fS, kS].forEach((c) => c.on(update));
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset && e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      if (p === "g") { nS.set(7); dS.set(4); bS.set("16"); fS.set(2); kS.set(10); }
      else { nS.set(6); dS.set(7); bS.set("16"); fS.set(2); kS.set(11); }
      update();
    });
    update();
  };

  // =====================================================================
  // 数值自检
  // =====================================================================
  const BookW = window.BookW;
  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => {
    const d1 = sampleDist(logits("w"), 1, 9, 1);
    const dg = sampleDist(logits("w"), 0, 9, 1), dk = sampleDist(logits("w"), 1, 1, 1), dp = sampleDist(logits("w"), 1, 9, 0.6);
    const dlow = sampleDist(logits("w"), 0.1, 9, 1), dhi = sampleDist(logits("s"), 2, 9, 1);
    const ex = chainCalc([0.05, 0.10, 0.20, 0.50]), q3 = chainCalc([0.04, 0.25, 0.30, 0.60]);
    const long300 = chainCalc(new Array(300).fill(0.1)), long400 = chainCalc(new Array(400).fill(0.1));
    const g = scaleCalc(175e9, 3e11, 16, 4e14, 1024), c = scaleCalc(70e9, 1.4e12, 16, 4e14, 2048);
    return [
      ["图 1-5 τ=1 时“很”的概率", d1.fin[0], 0.46, 1e-9],
      ["图 1-5 τ=1 时“不错”的概率", d1.fin[1], 0.18, 1e-9],
      ["图 1-5 τ=1 时“晴朗”的概率", d1.fin[2], 0.12, 1e-9],
      ["图 1-5 τ=1 时“怎么”的概率", d1.fin[3], 0.07, 1e-9],
      ["图 1-5 其余词元合计", d1.fin.slice(4).reduce((a, b) => a + b, 0), 0.17, 1e-9],
      ["τ=0（贪心）只剩 1 个候选", dg.kept, 1],
      ["τ=0.1 时最高者概率接近 1", dlow.fin[0], 1, 1e-3],
      ["τ=2 时分布更平（最高者 < 原 0.16）", dhi.fin[0] < 0.16 ? 1 : 0, 1],
      ["Top-K k=1 时“很”的概率", dk.fin[0], 1, 1e-12],
      ["Top-P p=0.6：累计 0.46+0.18 首次 ≥0.6，留 2 个", dp.kept, 2],
      ["Top-P p=0.6：“很”重新归一化为 0.46/0.64", dp.fin[0], 0.46 / 0.64, 1e-9],
      ["例 1-1 整句概率", ex.P, 5e-4, 1e-12],
      ["例 1-1 对数概率", ex.lnP, -7.601, 0.0005],
      ["例 1-1 ln(5×10⁻⁴) 与对数之和一致", Math.log(5e-4), ex.lnP, 1e-9],
      ["例 1-1 平均负对数概率 = 7.601 ÷ 4", ex.loss, 7.601 / 4, 0.0002],
      ["习题 1.3 整句概率", q3.P, 1.8e-3, 1e-12],
      ["习题 1.3 对数概率", q3.lnP, -6.320, 0.0005],
      ["300 个 0.1 相乘 = 10⁻³⁰⁰，未下溢", long300.underflow ? 1 : 0, 0],
      ["400 个 0.1 相乘：判为下溢", long400.underflow ? 1 : 0, 1],
      ["400 个 0.1 直接连乘得到 0", long400.naive, 0],
      ["400 个 0.1 对数之和仍正常（−921.0）", long400.lnP, -400 * Math.log(10), 1e-6],
      ["科学计数法显示 5 × 10⁻⁴", sciLog(ex.log10P), "5 × 10⁻⁴"],
      ["例 1-4 权重存储 / GB", g.memGB, 350, 1e-9],
      ["例 1-4 训练计算量 / FLOPs", g.C / 1e23, 3.15, 1e-9],
      ["例 1-4 单卡耗时 / s（7.9×10⁸）", g.t1 / 1e8, 7.9, 0.05],
      ["例 1-4 单卡约 25 年", g.years1, 25, 0.05],
      ["例 1-4 1024 卡耗时 / s（7.7×10⁵）", g.tK / 1e5, 7.7, 0.05],
      ["例 1-4 1024 卡约 9 天", g.daysK, 9, 0.5],
      ["例 1-4 Chinchilla 建议词元数", g.Dopt / 1e12, 3.5, 1e-9],
      ["习题 1.6 权重存储 / GB", c.memGB, 140, 1e-9],
      ["习题 1.6 训练计算量 / FLOPs", c.C / 1e23, 5.88, 1e-9],
      ["习题 1.6 单卡耗时 / s（1.47×10⁹）", c.t1 / 1e9, 1.47, 1e-9],
      ["习题 1.6 2048 卡耗时 / s（7.18×10⁵）", c.tK / 1e5, 7.18, 0.005],
      ["习题 1.6 2048 卡约 8.3 天", c.daysK, 8.3, 0.05],
      ["习题 1.6 词元数 ÷ 参数量", c.ratio, 20, 1e-9],
      ["4 位存储 175B 权重 / GB", scaleCalc(175e9, 3e11, 4, 4e14, 1).memGB, 87.5, 1e-9],
    ];
  });
})();


/* ===== ch2.js ===== */
// AFTER: c2:ex:attn -> c2attn
// AFTER: c2:ex:temp -> c2sampling
// AFTER: c2:fig:plan -> c2plan
/* 第 2 章交互组件：注意力逐步计算（例 2-4）、温度与截断采样（例 2-6）、Chinchilla 训练规划（例 2-7）。
   纯计算函数在前，界面在后；数值自检登记在 BookW.TESTS。 */
(function () {
  "use strict";
  const { C, FS, HALO, textW, h, L, R, T, animator, slider, select, frame, mkSvg, logScale, linScale, REG, REDUCE } = window.BookW;
  const BookW = window.BookW;

  // ======================= 纯计算 =======================
  const WORDS = ["好", "热", "冷", "差", "蓝"];
  const LOGITS = [3.0, 2.2, 1.8, 1.0, -1.0];

  // 式（2-17）：带温度的 softmax
  function softmaxT(z, tau) {
    const m = Math.max(...z.map((v) => v / tau));
    const e = z.map((v) => Math.exp(v / tau - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  }
  // 截断与重新归一化。mode: none / topk / topp
  function truncate(p, mode, k, pp) {
    const order = p.map((_, i) => i).sort((a, b) => p[b] - p[a] || a - b);
    const keep = new Set();
    if (mode === "topk") order.slice(0, k).forEach((i) => keep.add(i));
    else if (mode === "topp") { let c = 0; for (const i of order) { keep.add(i); c += p[i]; if (c >= pp - 1e-9) break; } }
    else order.forEach((i) => keep.add(i));
    let mass = 0; keep.forEach((i) => (mass += p[i]));
    const q = p.map((v, i) => (keep.has(i) ? v / mass : 0));
    const cum = []; let c = 0; order.forEach((i) => { c += p[i]; cum.push(c); });
    return { order, keep, q, cum, mass };
  }
  function sampleCounts(q, n, rnd = Math.random) {
    const cnt = q.map(() => 0);
    for (let t = 0; t < n; t++) {
      let u = rnd(), i = 0;
      while (i < q.length - 1 && (u -= q[i]) >= 0) i++;
      while (q[i] === 0 && i > 0) i--;            // 浮点余量落到被截掉的词上时退回
      cnt[i]++;
    }
    return cnt;
  }

  // 式（2-11）：softmax(QKᵀ/√d_head + M) V，d_head = 2
  function attention(Q, K, V, scale, causal) {
    const sq = scale ? Math.sqrt(2) : 1;
    const dot = Q.map((q) => K.map((k) => q[0] * k[0] + q[1] * k[1]));
    const S = dot.map((r) => r.map((v) => v / sq));
    const mask = S.map((r, i) => r.map((_, j) => causal && j > i));
    const E = S.map((r, i) => r.map((v, j) => (mask[i][j] ? 0 : Math.exp(v))));
    const sum = E.map((r) => r.reduce((a, b) => a + b, 0));
    const A = E.map((r, i) => r.map((v) => v / sum[i]));
    const O = A.map((r) => [0, 1].map((c) => r.reduce((a, w, j) => a + w * V[j][c], 0)));
    return { sq, dot, S, mask, E, sum, A, O };
  }
  const Q0 = [[1, 0], [0, 1], [1, 1]], V0 = [[1, 0], [0, 2], [3, 1]];

  // 例 2-7：C = 卡数 × 峰值 × MFU × 秒数；式（2-19）C ≈ 6ND；式（2-20）D ≈ 20N；式（2-21）
  const chinLoss = (N, D) => 1.69 + 406.4 / N ** 0.34 + 410.7 / D ** 0.28;
  function plan(s) {
    const sec = s.days * 86400, Cc = s.n * s.peak * s.mfu * sec;
    const Nopt = Math.sqrt(Cc / 120);
    const N = s.fixN ? s.fixN : Nopt, D = Cc / (6 * N);
    // 同算力下损失最低的参数量（数值搜索，用于说明曲线底部很平）
    let best = [Infinity, 0];
    for (let e = 7; e <= 14; e += 0.002) { const n = 10 ** e, l = chinLoss(n, Cc / (6 * n)); if (l < best[0]) best = [l, n]; }
    return { sec, C: Cc, Nopt, Dopt: 20 * Nopt, N, D, ratio: D / N, L: chinLoss(N, D),
             L2: chinLoss(2 * N, Cc / (12 * N)), Lh: chinLoss(N / 2, Cc / (3 * N)), Lmin: best[0], Nmin: best[1] };
  }

  // ---------- 数值自检（标准答案取自书中例题与图） ----------
  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => {
    const p1 = softmaxT(LOGITS, 1), tk = truncate(p1, "topk", 2), tp = truncate(p1, "topp", 0, 0.9);
    const p05 = softmaxT(LOGITS, 0.5), p2 = softmaxT(LOGITS, 2), tp75 = truncate(p1, "topp", 0, 0.75);
    const a = attention(Q0, Q0, V0, true, false), m = attention(Q0, Q0, V0, true, true);
    const ex = plan({ n: 100, peak: 312e12, mfu: 0.4, days: 30 });
    return [
      ["例 2-6 第 2 步 τ=1“好”", p1[0], 0.525, 0.0005], ["例 2-6 第 2 步“热”", p1[1], 0.236, 0.0005],
      ["例 2-6 第 2 步“冷”", p1[2], 0.158, 0.0005], ["例 2-6 第 2 步“差”", p1[3], 0.071, 0.0005],
      ["例 2-6 第 2 步“蓝”", p1[4], 0.010, 0.0005],
      ["例 2-6 第 3 步 Top-K k=2“好”", tk.q[0], 0.690, 0.0005], ["例 2-6 第 3 步“热”", tk.q[1], 0.310, 0.0005],
      ["例 2-6 第 4 步累计（前 2 个）", tp.cum[1], 0.761, 0.0005], ["例 2-6 第 4 步累计（前 3 个）", tp.cum[2], 0.919, 0.0005],
      ["例 2-6 第 5 步 Top-P p=0.9 保留个数", tp.keep.size, 3],
      ["例 2-6 第 5 步“好”", tp.q[0], 0.571, 0.0005], ["例 2-6 第 5 步“热”", tp.q[1], 0.257, 0.0005],
      ["例 2-6 第 5 步“冷”", tp.q[2], 0.172, 0.0005],
      ["例 2-6 第 6 步 τ=0.5“好”", p05[0], 0.763, 0.0005], ["例 2-6 第 6 步 τ=0.5“蓝”", p05[4], 0.000, 0.0005],
      ["例 2-6 第 7 步 τ=2“好”", p2[0], 0.367, 0.0005], ["例 2-6 第 7 步 τ=2“蓝”", p2[4], 0.050, 0.0005],
      ["图 2-6 τ=0.5“热”", p05[1], 0.154, 0.0005], ["图 2-6 τ=2“差”", p2[3], 0.135, 0.0005],
      ["习题 7 τ=1、p=0.75 保留个数", tp75.keep.size, 2],
      ["抽样 1000 次总数不变", sampleCounts(tp.q, 1000).reduce((x, y) => x + y, 0), 1000],
      ["抽样不会抽到被截掉的词", sampleCounts(tp.q, 2000)[3] + sampleCounts(tp.q, 2000)[4], 0],
      ["例 2-4 第 2 步 S₃₁", a.S[2][0], 0.707, 0.0005], ["例 2-4 第 2 步 S₃₃", a.S[2][2], 1.414, 0.0005],
      ["例 2-4 第 3 步 e^1.414", a.E[2][2], 4.113, 0.0005], ["例 2-4 第 4 步分母", a.sum[2], 8.169, 0.001],
      ["例 2-4 第 4 步 A₃₁", a.A[2][0], 0.248, 0.0005], ["例 2-4 第 4 步 A₃₃", a.A[2][2], 0.503, 0.0005],
      ["例 2-4 第 5 步 O₃ 第 1 维", a.O[2][0], 1.759, 0.0005], ["例 2-4 第 5 步 O₃ 第 2 维", a.O[2][1], 1.000, 0.0005],
      ["例 2-4 A₁₁", a.A[0][0], 0.401, 0.0005], ["例 2-4 A₁₂", a.A[0][1], 0.198, 0.0005],
      ["例 2-4 O₁", a.O[0][0], 1.604, 0.0005], ["例 2-4 O₁ 第 2 维", a.O[0][1], 0.797, 0.0005],
      ["例 2-4 O₂", a.O[1][0], 1.401, 0.0005], ["例 2-4 O₂ 第 2 维", a.O[1][1], 1.203, 0.0005],
      ["例 2-4 第 6 步 掩码后 A₂₁", m.A[1][0], 0.330, 0.0005], ["例 2-4 第 6 步 A₂₂", m.A[1][1], 0.670, 0.0005],
      ["例 2-4 第 6 步 A₂₃", m.A[1][2], 0, 1e-12],
      ["例 2-4 第 7 步 掩码后 O₂", m.O[1][0], 0.330, 0.0005], ["例 2-4 第 7 步 O₂ 第 2 维", m.O[1][1], 1.340, 0.0005],
      ["例 2-4 掩码后第 1 行 = (1, 0, 0)", m.A[0][0], 1, 1e-12], ["例 2-4 掩码后第 3 行不变", m.A[2][2], 0.503, 0.0005],
      ["例 2-7 问 3 总算力 C（×10²²）", ex.C / 1e22, 3.2, 0.05],
      ["例 2-7 问 3 N（×10¹⁰，书中先把 C 取整为 3.2 再开方得 1.63）", ex.N / 1e10, 1.63, 0.015],
      ["例 2-7 问 3 D（×10¹¹）", ex.D / 1e11, 3.3, 0.05],
      ["例 2-7 问 1 C = 6 × 10¹⁰ × 2×10¹¹（×10²²）", 6 * 1e10 * 20 * 1e10 / 1e22, 1.2, 1e-9],
      ["例 2-7 问 4 10B 损失", chinLoss(1e10, 2e11), 2.13, 0.005],
      ["例 2-7 问 4 100B 损失", chinLoss(1e11, 2e12), 1.91, 0.005],
      ["例 2-7 问 4 只加模型损失", chinLoss(1e11, 2e11), 2.05, 0.005],
    ];
  });

  // ======================= 界面工具 =======================
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const SUB = ["₁", "₂", "₃"];
  function sci(v, sig = 2) {
    let e = Math.floor(Math.log10(v)), m = v / 10 ** e;
    if (+m.toFixed(sig - 1) >= 10) { e++; m /= 10; }
    return `${m.toFixed(sig - 1)}×10${String(e).split("").map((c) => SUP[c]).join("")}`;
  }
  // 以“亿”为单位的中文读法，两位有效数字
  function cn(v) {
    const r = (x) => { const d = Math.floor(Math.log10(x)); const k = 10 ** (d - 1); return Math.round(x / k) * k; };
    if (v >= 1e12) { const x = r(v / 1e12); return `${x >= 100 ? Math.round(x) : x.toFixed(x < 10 ? 1 : 0).replace(/\.0$/, "")} 万亿`; }
    const x = r(v / 1e8); return `${x < 10 ? x.toFixed(1).replace(/\.0$/, "") : Math.round(x)} 亿`;
  }
  const f3 = (v) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
  const sn = (v) => (v < 0 ? "−" + (-v).toFixed(1) : v.toFixed(1));   // 正文用的负号
  const tabs = (labels) => h(`<div class="w-tabs">${labels.map((t, i) => `<button data-i="${i}"${i ? "" : ' class="on"'}>${t}</button>`).join("")}</div>`);
  const setOn = (bar, i) => bar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
  // 手机上换用较窄的画布，让 SVG 里的字不至于缩得太小（挂载时按容器宽度决定）
  const narrow = (root) => root.clientWidth > 0 && root.clientWidth < 480;
  const show = (c, yes) => (c.node.style.display = yes ? "" : "none");

  // ======================= 1. 温度与截断采样 =======================
  REG.c2sampling = function (root) {
    const grid = frame(root, "动手试一试：温度与截断采样",
      "按式（2-17）对五个候选词元的 logits 做带温度的 softmax，再按 Top-K 或 Top-P 截断并重新归一化。虚线框是截断前的概率，实心柱是最终用来抽样的概率。上面的按钮对应例 2-6 的各步。");
    const preset = tabs(["第 1～2 步：τ = 1", "第 3 步：Top-K", "第 5 步：Top-P", "第 6 步：τ = 0.5", "第 7 步：τ = 2"]);
    root.insertBefore(preset, grid);
    const tau = slider("温度 τ", 0.1, 3, 0.05, 1, (v) => v.toFixed(2));
    const mode = select("截断方式", [["none", "不截断"], ["topk", "Top-K（保留概率最高的 k 个）"], ["topp", "Top-P（核采样）"]], "none");
    const kk = slider("k", 1, 5, 1, 2, (v) => `${v} 个`);
    const pp = slider("p", 0.5, 1, 0.01, 0.9, (v) => v.toFixed(2));
    [tau, mode, kk, pp].forEach((c) => grid.appendChild(c.node));
    root.appendChild(h(`<div class="w-hint" style="margin-bottom:.3rem">五个候选词元的 logits（“今天天气很___”，拖动可改分数）</div>`));
    const lg = h(`<div class="w-grid" style="grid-template-columns:repeat(auto-fit,minmax(118px,1fr))"></div>`); root.appendChild(lg);
    const zs = WORDS.map((w, i) => slider(`“${w}”`, -3, 5, 0.1, LOGITS[i], sn));
    zs.forEach((c) => lg.appendChild(c.node));
    const W = narrow(root) ? 380 : 520, H = 318, m = { l: 50, r: 12 }, yt = 26, yb = 184;
    const svg = mkSvg(root, W, H, "候选词元的概率柱状图"), anim = animator(svg);
    const act = h(`<div class="w-tabs" style="margin-top:.5rem"><button>抽样 100 次</button></div>`); root.appendChild(act);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const ys = linScale(0, 1, yb, yt), col = (W - m.l - m.r) / 5, cx = (i) => m.l + (i + 0.5) * col, bw = 30;
    const sx = linScale(0, 1, m.l, W - m.r);
    let counts = null;

    function state() {
      const z = zs.map((c) => c.get()), t = tau.get(), md = mode.get();
      const p = softmaxT(z, t), r = truncate(p, md, kk.get(), pp.get());
      return { z, t, md, p, r };
    }
    function scene(s) {
      const S = [], { p, r, md } = s;
      for (let v = 0; v <= 1.0001; v += 0.2) { const y = ys(v), k = Math.round(v * 10);
        S.push(L("gy" + k, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gyt" + k, m.l - 6, y + 4, v.toFixed(1), { "text-anchor": "end", "font-size": 11 })); }
      S.push(T("yl", m.l - 6, yt - 12, "概率", { "text-anchor": "end", "font-size": 11 }));
      S.push(L("ax", { x1: m.l, x2: W - m.r, y1: yb, y2: yb, stroke: C.line }));
      const labs = [];
      WORDS.forEach((w, i) => {
        const x = cx(i) - bw / 2, kept = r.keep.has(i);
        S.push(R("bar" + i, { x, y: ys(r.q[i]), width: bw, height: yb - ys(r.q[i]), fill: C.pale, stroke: C.accent, "stroke-width": 1 }));
        S.push(R("gh" + i, { x, y: ys(p[i]), width: bw, height: yb - ys(p[i]), fill: kept ? "none" : C.fill,
          stroke: kept ? C.line : C.rule, "stroke-width": 1, "stroke-dasharray": "3 2" }));
        const top = ys(Math.max(p[i], r.q[i]));
        labs.push(T("v" + i, cx(i), top - 6, kept ? f3(r.q[i]) : "截掉", Object.assign({ "text-anchor": "middle", "font-size": 11.5, fill: kept ? C.ink : C.rule }, HALO)));
        S.push(T("w" + i, cx(i), yb + 20, w, { "text-anchor": "middle", "font-size": 13, fill: kept ? C.ink : C.rule }));
        S.push(T("z" + i, cx(i), yb + 37, `z = ${sn(s.z[i])}`, { "text-anchor": "middle", "font-size": 10.5, fill: C.dark }));
        if (counts) S.push(T("n" + i, cx(i), yb + 54, `${counts[i]} 次`, { "text-anchor": "middle", "font-size": 10.5, fill: counts[i] ? C.accent : C.rule }));
      });
      S.push(...labs);
      // 累计概率条：按概率从高到低排列
      const sy = 272, sh = 20;
      S.push(T("cl", m.l - 6, sy + sh / 2 + 4, "累计", { "text-anchor": "end", "font-size": 11 }));
      let acc = 0, lastShown = -1e9; const ticks = [];
      r.order.forEach((i, j) => {
        const x0 = sx(acc), x1 = sx(acc + p[i]), kept = r.keep.has(i);
        S.push(R("sg" + i, { x: x0, y: sy, width: Math.max(0, x1 - x0), height: sh, fill: kept ? C.pale : C.fill, stroke: C.line, "stroke-width": 0.6 }));
        S.push(T("sw" + i, (x0 + x1) / 2, sy + sh / 2 + 4.5, x1 - x0 > 18 ? WORDS[i] : "", { "text-anchor": "middle", "font-size": 11, fill: kept ? C.ink : C.rule }));
        acc += p[i];
        const last = j === r.keep.size - 1;
        if (j < 4 && (x1 - lastShown > 40 || last) && x1 < W - m.r - 16) { ticks.push([i, x1, r.cum[j]]); lastShown = x1; }
      });
      ticks.forEach(([i, x, c]) => S.push(T("ct" + i, x, sy + sh + 15, f3(c), { "text-anchor": "middle", "font-size": 10.5, fill: C.dark })));
      if (md !== "none") {
        const xc = md === "topp" ? sx(pp.get()) : sx(r.mass);
        S.push(L("cut", { x1: xc, x2: xc, y1: sy - 10, y2: sy + sh + 3, stroke: C.accent, "stroke-width": 1.4 }));
        const lab = md === "topp" ? `p = ${pp.get().toFixed(2)}` : `k = ${kk.get()}`, lw = textW(lab, 11);
        const lx = Math.min(W - m.r - lw / 2, Math.max(m.l + lw / 2, xc));
        S.push(T("cutl", lx, sy - 13, lab, Object.assign({ "text-anchor": "middle", "font-size": 11, fill: C.accent }, HALO)));
      }
      return S;
    }
    function update() {
      const s = state(), { p, r, md, t } = s;
      show(kk, md === "topk"); show(pp, md === "topp");
      anim(scene(s));
      const ez = s.z.map((v) => Math.exp(v / t)), sum = ez.reduce((a, b) => a + b, 0);
      const e = (v) => (v >= 1e4 ? sci(v, 3) : v.toFixed(2));
      const top = r.order[0];
      let html = `p(${WORDS[top]}) = e<sup>${sn(s.z[top])}/${t.toFixed(2)}</sup> ÷ Σ<sub>j</sub> e<sup>z<sub>j</sub>/τ</sup> = ${e(ez[top])} ÷ ${e(sum)} = <b>${f3(p[top])}</b>（式 2-17）`;
      const kept = r.order.filter((i) => r.keep.has(i));
      if (md === "topk") html += `<br>Top-K（k = ${kk.get()}）：保留 ${kept.map((i) => WORDS[i]).join("、")}，重新归一化 ${f3(p[top])} ÷ ${f3(r.mass)} = <b>${f3(r.q[top])}</b>`;
      if (md === "topp") {
        html += `<br>Top-P（p = ${pp.get().toFixed(2)}）：累计 ${r.cum.slice(0, kept.length).map(f3).join(" → ")}，第 ${kept.length} 个时首次 ≥ ${pp.get().toFixed(2)}，` +
          `保留 ${kept.map((i) => WORDS[i]).join("、")}；重新归一化 ${f3(p[top])} ÷ ${f3(r.mass)} = <b>${f3(r.q[top])}</b>`;
      }
      const qb = r.q[4];
      html += `<br>“蓝”` + (!r.keep.has(4) ? `被截掉，不会被抽到。` : qb >= 0.001 ? `最终概率 <b>${f3(qb)}</b>，约每 ${Math.round(1 / qb)} 次抽出一次“今天天气很蓝”。` : `最终概率不到 0.001，几乎抽不到。`);
      if (counts) html += `<br>抽样 100 次：${WORDS.map((w, i) => `${w} ${counts[i]}`).join("，")}。`;
      out.innerHTML = html;
    }
    const manual = () => { setOn(preset, -1); counts = null; update(); };
    [tau, mode, kk, pp, ...zs].forEach((c) => c.on(manual));
    act.querySelector("button").addEventListener("click", () => { counts = sampleCounts(state().r.q, 100); update(); });
    preset.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return; const i = +b.dataset.i;
      setOn(preset, i); counts = null;
      zs.forEach((c, j) => c.set(LOGITS[j]));
      tau.set([1, 1, 1, 0.5, 2][i]); mode.set(["none", "topk", "topp", "none", "none"][i]); kk.set(2); pp.set(0.9);
      update();
    });
    update();
  };

  // ======================= 2. 注意力矩阵逐步计算 =======================
  REG.c2attn = function (root) {
    const grid = frame(root, "动手试一试：缩放点积注意力逐步计算",
      "按式（2-11）把注意力拆成 ① 打分、② 加掩码、③ softmax、④ 乘 V 四步。行是发出查询的位置，列是被查询的位置。默认取例 2-4 的 Q = K 与 V。把鼠标移到（手机上点按）格子上可以看到这一格的算式。");
    const preset = tabs(["例 2-4：不加掩码", "例 2-4：因果掩码", "习题 6：不缩放"]);
    root.insertBefore(preset, grid);
    const toks = ["今天", "天气", "很"];
    const scl = select("缩放", [["1", "除以 √d_head（d_head = 2）"], ["0", "不缩放"]], "1");
    const msk = select("掩码", [["0", "不加掩码（编码器的双向注意力）"], ["1", "因果掩码（解码器）"]], "0");
    const row = select("查看哪一行", toks.map((t, i) => [String(i), `第 ${i + 1} 行：“${t}”`]), "2");
    const tie = select("Q 与 K", [["1", "Q = K（例 2-4 的设定，一起改）"], ["0", "Q、K 分开调"]], "1");
    const which = select("要调的向量", [], "q2");
    const vx = slider("第 1 个分量", -3, 3, 0.1, 1, (v) => sn(v));
    const vy = slider("第 2 个分量", -3, 3, 0.1, 1, (v) => sn(v));
    [scl, msk, row, tie, which, vx, vy].forEach((c) => grid.appendChild(c.node));
    const wsel = which.node.querySelector("select");
    const Q = Q0.map((r) => r.slice()), K = Q0.map((r) => r.slice()), V = V0.map((r) => r.slice());
    function fillWhich() {
      const cur = wsel.value || "q2", t = tie.get() === "1", names = { q: "查询", k: "键", v: "值" };
      const opts = [];
      ["q", "k", "v"].forEach((m) => { if (t && m === "k") return;
        toks.forEach((tk, i) => opts.push([m + i, t && m === "q" ? `q${SUB[i]} = k${SUB[i]}（“${tk}”的查询与键）` : `${m}${SUB[i]}（“${tk}”的${names[m]}）`])); });
      wsel.innerHTML = opts.map(([v, s]) => `<option value="${v}">${s}</option>`).join("");
      wsel.value = t && cur[0] === "k" ? "q" + cur[1] : cur;
    }
    fillWhich();
    const vec = () => { const w = wsel.value; return ({ q: Q, k: K, v: V })[w[0]][+w[1]]; };
    const syncSliders = () => { const v = vec(); vx.set(v[0]); vy.set(v[1]); };
    syncSliders();

    const wrap = h(`<div style="display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:flex-start"></div>`); root.appendChild(wrap);
    const boxA = h(`<div style="flex:1 1 330px;min-width:0"></div>`), boxB = h(`<div style="flex:1 1 220px;min-width:0;max-width:340px;margin:0 auto"></div>`);
    wrap.appendChild(boxA); wrap.appendChild(boxB);
    const W = 372, H = 262, cw = 46, ch = 26;
    const svg = mkSvg(boxA, W, H, "注意力的四步矩阵"), anim = animator(svg);
    const PW = 250, PH = 262;
    const svg2 = mkSvg(boxB, PW, PH, "值向量与输出向量"), anim2 = animator(svg2);
    const info = h(`<div class="w-out" style="color:${C.dark}"></div>`); root.appendChild(info);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const MAT = [{ x: 40, y: 34, c: 3 }, { x: 222, y: 34, c: 3 }, { x: 40, y: 168, c: 3 }, { x: 222, y: 168, c: 2 }];
    let hover = null;

    function scene(a, ri, scaled, causal) {
      const S = [], titles = [scaled ? "① 打分 S = QKᵀ ÷ √2" : "① 打分 S = QKᵀ", causal ? "② 加因果掩码 M" : "② 不加掩码（M = 0）", "③ 注意力权重 A（行和为 1）", "④ 输出 O = AV"];
      MAT.forEach((M, mi) => {
        S.push(T("t" + mi, M.x, M.y - 10, titles[mi], { "font-size": 11 }));
        for (let i = 0; i < 3; i++) for (let j = 0; j < M.c; j++) {
          const x = M.x + j * cw, y = M.y + i * ch, k = `${mi}${i}${j}`, masked = mi === 1 || mi === 2 ? a.mask[i][j] : false;
          S.push(R("c" + k, { x, y, width: cw, height: ch, fill: masked ? C.fill : "#fff", stroke: C.grid }));
          if (mi === 2) S.push(R("w" + k, { x: x + 1, y: y + ch - (ch - 2) * a.A[i][j] - 1, width: cw - 2, height: (ch - 2) * a.A[i][j], fill: C.pale }));
          const v = mi === 0 ? a.S[i][j] : mi === 1 ? (masked ? null : a.S[i][j]) : mi === 2 ? a.A[i][j] : a.O[i][j];
          S.push(T("n" + k, x + cw / 2, y + ch / 2 + 4.5, v === null ? "−∞" : f3(v).replace("-", "−"),
            { "text-anchor": "middle", "font-size": 11, fill: masked ? C.rule : C.ink }));
        }
        S.push(R("fr" + mi, { x: M.x, y: M.y, width: M.c * cw, height: 3 * ch, fill: "none", stroke: C.line, "stroke-width": 0.8 }));
        S.push(R("hl" + mi, { x: M.x - 1, y: M.y + ri * ch - 1, width: M.c * cw + 2, height: ch + 2, fill: "none", stroke: C.accent, "stroke-width": 1.6 }));
        if (mi % 2 === 0) toks.forEach((t, i) => S.push(T(`rl${mi}${i}`, M.x - 5, M.y + i * ch + ch / 2 + 4.5, t, { "text-anchor": "end", "font-size": 11, fill: i === ri ? C.accent : C.ink })));
      });
      return S;
    }
    function scene2(a, ri) {
      const S = [], m = 26, xs = linScale(-3.2, 3.2, m, PW - 8), ys = linScale(-3.2, 3.2, PH - m, 26);
      S.push(T("pt", PW / 2, 14, "值向量 v 与输出 o（二维平面）", { "text-anchor": "middle", "font-size": 11 }));
      for (let v = -3; v <= 3; v++) {
        S.push(L("gx" + v, { x1: xs(v), x2: xs(v), y1: ys(-3.2), y2: ys(3.2), stroke: v === 0 ? C.rule : C.grid }));
        S.push(L("gy" + v, { x1: xs(-3.2), x2: xs(3.2), y1: ys(v), y2: ys(v), stroke: v === 0 ? C.rule : C.grid }));
      }
      [-3, 3].forEach((v) => { S.push(T("tx" + v, xs(v), ys(0) + 13, String(v).replace("-", "−"), { "text-anchor": "middle", "font-size": 9.5, fill: C.dark }));
        S.push(T("ty" + v, xs(0) - 4, ys(v) + 3.5, String(v).replace("-", "−"), { "text-anchor": "end", "font-size": 9.5, fill: C.dark })); });
      S.push({ k: "tri", tag: "polygon", a: { points: V.map((p) => `${xs(p[0])},${ys(p[1])}`).join(" "), fill: C.fill, stroke: C.mid, "stroke-width": 1 } });
      const o = a.O[ri];
      V.forEach((p, j) => {
        const w = a.A[ri][j];
        S.push(L("ln" + j, { x1: xs(o[0]), y1: ys(o[1]), x2: xs(p[0]), y2: ys(p[1]), stroke: w > 0 ? C.accent : C.mid,
          "stroke-width": (0.6 + 4 * w).toFixed(2), "stroke-dasharray": w > 0 ? "none" : "3 3", "stroke-opacity": 0.7 }));
      });
      a.O.forEach((p, i) => { if (i !== ri) S.push({ k: "og" + i, tag: "circle", a: { cx: xs(p[0]), cy: ys(p[1]), r: 3, fill: C.mid } }); });
      const lab = [];
      const gx = (V[0][0] + V[1][0] + V[2][0]) / 3, gy = (V[0][1] + V[1][1] + V[2][1]) / 3;
      V.forEach((p, j) => {
        S.push({ k: "vp" + j, tag: "circle", a: { cx: xs(p[0]), cy: ys(p[1]), r: 4.5, fill: "#fff", stroke: C.ink, "stroke-width": 1.4 } });
        // 标签放在“远离三角形重心”的一侧，避免压住内部的输出点
        let dx = xs(p[0]) - xs(gx), dy = ys(p[1]) - ys(gy); const d = Math.hypot(dx, dy);
        if (d < 1) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
        const txt = `v${SUB[j]} ${toks[j]}`, tw = textW(txt, 10.5);
        let x = xs(p[0]) + 11 * dx, y = ys(p[1]) + 11 * dy + (dy > 0 ? 9 : dy > -0.4 ? 4 : 0);
        let anc = dx > 0.35 ? "start" : dx < -0.35 ? "end" : "middle";
        if (anc === "start" && x + tw > PW - 2) { anc = "end"; x = xs(p[0]) - 2; y = ys(p[1]) - 11; }
        if (anc === "end" && x - tw < 2) { anc = "start"; x = xs(p[0]) + 2; y = ys(p[1]) - 11; }
        if (anc === "middle") x = Math.min(PW - 2 - tw / 2, Math.max(2 + tw / 2, x));
        y = Math.min(PH - 4, Math.max(24, y));
        lab.push(T("vl" + j, x, y, txt, Object.assign({ "font-size": 10.5, "text-anchor": anc }, HALO)));
      });
      S.push({ k: "op", tag: "circle", a: { cx: xs(o[0]), cy: ys(o[1]), r: 5, fill: C.accent, stroke: "#fff", "stroke-width": 1.2 } });
      const oy = ys(o[1]) > PH - 30 ? ys(o[1]) - 9 : ys(o[1]) + 18;
      lab.push(T("ol", Math.min(PW - 10, Math.max(10, xs(o[0]))), oy, `o${SUB[ri]}`, Object.assign({ "font-size": 11, fill: C.accent, "text-anchor": "middle" }, HALO)));
      S.push(...lab);
      return S;
    }
    const vs = (v) => `(${v.map((x) => (+x.toFixed(2)).toString().replace("-", "−")).join(", ")})`;
    function explain(a, mi, i, j, scaled) {
      const I = SUB[i], J = SUB[j];
      if (mi === 0 || (mi === 1 && !a.mask[i][j])) {
        const dot = `q${I}·k${J} = ${vs(Q[i])}·${vs(K[j])} = ${(+a.dot[i][j].toFixed(3))}`.replace(/-/g, "−");
        return `S${I}${J} = ${dot}` + (scaled ? ` ÷ √2 = ${f3(a.S[i][j])}` : "") + (mi === 1 ? `；M${I}${J} = 0，分数不变` : "");
      }
      if (mi === 1 || (mi === 2 && a.mask[i][j])) return `M${I}${J} = −∞：位置 ${i + 1} 看不到后文的位置 ${j + 1}，softmax 后权重为 0`;
      if (mi === 2) {
        const terms = a.E[i].map((v, t) => (a.mask[i][t] ? null : v.toFixed(3))).filter((x) => x !== null);
        return `A${I}${J} = e<sup>${f3(a.S[i][j])}</sup> ÷ (${terms.join(" + ")}) = ${a.E[i][j].toFixed(3)} ÷ ${a.sum[i].toFixed(3)} = ${f3(a.A[i][j])}`.replace(/-/g, "−");
      }
      return `O${I} 第 ${j + 1} 维 = ${a.A[i].map((w, t) => `${f3(w)}×${(+V[t][j].toFixed(2))}`).join(" + ")} = ${f3(a.O[i][j])}`.replace(/-(?=\d)/g, "−");
    }
    function current() { return attention(Q, K, V, scl.get() === "1", msk.get() === "1"); }
    function update() {
      const a = current(), ri = +row.get(), scaled = scl.get() === "1", causal = msk.get() === "1";
      anim(scene(a, ri, scaled, causal)); anim2(scene2(a, ri));
      info.innerHTML = hover ? "算式：" + explain(a, ...hover, scaled) : `算式：A${SUB[ri]}${SUB[ri]} 的来历见下；把鼠标移到格子上查看其他格。<br>` + explain(a, 2, ri, ri, scaled);
      const w = a.A[ri], o = a.O[ri];
      let html = `第 ${ri + 1} 行（“${toks[ri]}”）的注意力权重 <b>(${w.map(f3).join(", ")})</b>，输出 o${SUB[ri]} = ${w.map((x, j) => `${f3(x)}×v${SUB[j]}`).join(" + ")} = <b>(${o.map(f3).join(", ")})</b>`.replace(/-(?=\d)/g, "−");
      html += `，落在三个值向量围成的三角形内（权重都非负、和为 1）。`;
      if (causal && ri === 2) html += `<br>最后一个位置本来就能看到全部前文，加不加因果掩码结果都一样。`;
      if (causal && ri === 0) html += `<br>第 1 行只能看见自己，权重为 (1, 0, 0)，输出就是 v₁。`;
      if (!scaled) html += `<br>不除以 √d_head 时分数差距被放大，权重更集中在分数最高的位置；维度越高，这种饱和越严重。`;
      out.innerHTML = html;
    }
    const manual = () => { setOn(preset, -1); update(); };
    [scl, msk].forEach((c) => c.on(manual));
    row.on(() => { hover = null; update(); });
    tie.on(() => { if (tie.get() === "1") K.forEach((r, i) => { r[0] = Q[i][0]; r[1] = Q[i][1]; }); fillWhich(); syncSliders(); manual(); });
    which.on(syncSliders);
    const edit = () => {
      const v = vec(); v[0] = vx.get(); v[1] = vy.get();
      const w = wsel.value; if (tie.get() === "1" && w[0] === "q") { K[+w[1]][0] = v[0]; K[+w[1]][1] = v[1]; }
      manual();
    };
    vx.on(edit); vy.on(edit);
    preset.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return; const i = +b.dataset.i;
      setOn(preset, i);
      [Q, K].forEach((M) => M.forEach((r, j) => { r[0] = Q0[j][0]; r[1] = Q0[j][1]; })); V.forEach((r, j) => { r[0] = V0[j][0]; r[1] = V0[j][1]; });
      tie.set("1"); fillWhich(); syncSliders();
      scl.set(i === 2 ? "0" : "1"); msk.set(i === 1 ? "1" : "0"); row.set(i === 1 ? "1" : "2"); hover = null;
      update();
    });
    // 悬停 / 点按格子：显示算式
    const pick = (ev) => {
      const ctm = svg.getScreenCTM(); if (!ctm) return;
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(ctm.inverse());
      let hit = null;
      MAT.forEach((M, mi) => { const j = Math.floor((p.x - M.x) / cw), i = Math.floor((p.y - M.y) / ch);
        if (i >= 0 && i < 3 && j >= 0 && j < M.c) hit = [mi, i, j]; });
      if (String(hit) !== String(hover)) { hover = hit; const a = current();
        info.innerHTML = hover ? "算式：" + explain(a, ...hover, scl.get() === "1") : info.innerHTML; if (!hover) update(); }
    };
    svg.addEventListener("pointermove", pick); svg.addEventListener("click", pick);
    svg.addEventListener("pointerleave", () => { if (hover) { hover = null; update(); } });
    update();
  };

  // ======================= 3. Chinchilla 训练规划 =======================
  REG.c2plan = function (root) {
    const grid = frame(root, "动手试一试：按缩放定律规划一次训练",
      "按图 2-8 的流程：总算力 C = 卡数 × 单卡峰值 × MFU（模型算力利用率）× 秒数，再联立式（2-19）C ≈ 6ND 与式（2-20）D ≈ 20N 求参数量 N 和训练词元数 D，用式（2-21）估算损失。峰值取稠密 BF16 算力。默认是例 2-7 第三问的配置。");
    const preset = tabs(["例 2-7 问 3：100 张 A100、30 天", "习题 8：1000 张 A100、60 天", "只想训练 7B 模型"]);
    root.insertBefore(preset, grid);
    const PEAK = { a100: 312e12, h100: 989e12 };
    const gpu = select("GPU", [["a100", "A100（312 TFLOP/s）"], ["h100", "H100 SXM（约 989 TFLOP/s）"]], "a100");
    const ns = [8, 16, 32, 64, 100, 128, 256, 512, 1000, 2048, 4096, 8192, 16384];
    const n = slider("卡数", 0, ns.length - 1, 1, 4, (v) => `${ns[v]} 张`);
    const days = slider("训练天数", 1, 180, 1, 30, (v) => `${v} 天`);
    const mfu = slider("MFU", 20, 60, 1, 40, (v) => `${v}%`);
    const mode = select("参数量怎么定", [["opt", "按 Chinchilla 配比（D ≈ 20N）"], ["fix", "固定参数量 N"]], "opt");
    const Ns = [1, 3, 7, 8, 13, 34, 70, 175, 405];
    const fixN = slider("参数量 N", 0, Ns.length - 1, 1, 2, (v) => `${Ns[v]}B（${Ns[v]}×10⁹）`);
    [gpu, n, days, mfu, mode, fixN].forEach((c) => grid.appendChild(c.node));
    const W = narrow(root) ? 400 : 520, H = narrow(root) ? 290 : 300, m = { l: 50, r: 14, t: 16, b: 44 };
    const svg = mkSvg(root, W, H, "同算力下损失随参数量的变化"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const xs = logScale(1e8, 1e13, m.l, W - m.r), YMIN = 1.6, YMAX = 3.6, ys = linScale(YMIN, YMAX, H - m.b, m.t);
    // 曲线裁剪到绘图区（clipPath 只建一次）
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<clipPath id="c2plan-clip"><rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></clipPath>`;
    svg.appendChild(defs);
    const K = 90, grid_N = Array.from({ length: K }, (_, i) => 10 ** (8 + 5 * i / (K - 1)));
    const yc = (l) => ys(Math.min(YMAX + 0.3, l));

    function state() {
      const s = { n: ns[n.get()], peak: PEAK[gpu.get()], mfu: mfu.get() / 100, days: days.get(), fixN: mode.get() === "fix" ? Ns[fixN.get()] * 1e9 : 0 };
      return Object.assign(s, { r: plan(s) });
    }
    function scene(s) {
      const S = [], r = s.r;
      [1e8, 1e9, 1e10, 1e11, 1e12, 1e13].forEach((v, i) => { const x = xs(v);
        S.push(L("gx" + i, { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: C.grid }));
        S.push(T("gxt" + i, x, H - m.b + 16, ["100M", "1B", "10B", "100B", "1T", "10T"][i], { "text-anchor": "middle", "font-size": 11 })); });
      for (let v = YMIN; v <= YMAX + 1e-9; v += 0.4) { const y = ys(v), k = Math.round(v * 10);
        S.push(L("gy" + k, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gyt" + k, m.l - 6, y + 4, v.toFixed(1), { "text-anchor": "end", "font-size": 11 })); }
      S.push(R("frame", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", stroke: C.line }));
      S.push(T("xl", (m.l + W - m.r) / 2, H - 8, "参数量 N（对数刻度）", { "text-anchor": "middle", "font-size": 12 }));
      const cy = (m.t + H - m.b) / 2;
      S.push(T("yl", 14, cy, "损失（式 2-21）", { "text-anchor": "middle", "font-size": 12, transform: `rotate(-90 14 ${cy})` }));
      S.push(L("E", { x1: m.l, x2: W - m.r, y1: ys(1.69), y2: ys(1.69), stroke: C.rule, "stroke-dasharray": "1.5 2.5" }));
      S.push(T("El", m.l + 6, ys(1.69) - 5, "不可约损失 E = 1.69", { "text-anchor": "start", "font-size": 10.5, fill: C.rule }));
      const pts = (f) => grid_N.map((N) => `${xs(N).toFixed(1)},${yc(f(N)).toFixed(1)}`).join(" ");
      S.push({ k: "front", tag: "polyline", a: { points: pts((N) => chinLoss(N, 20 * N)), fill: "none", stroke: C.accent, "stroke-width": 1.8, "clip-path": "url(#c2plan-clip)" } });
      S.push({ k: "iso", tag: "polyline", a: { points: pts((N) => chinLoss(N, r.C / (6 * N))), fill: "none", stroke: C.line, "stroke-width": 1.3, "stroke-dasharray": "5 3", "clip-path": "url(#c2plan-clip)" } });
      // 图例
      S.push(L("lg1", { x1: W - m.r - 214, x2: W - m.r - 190, y1: m.t + 14, y2: m.t + 14, stroke: C.accent, "stroke-width": 1.8 }));
      S.push(T("lg1t", W - m.r - 184, m.t + 18, "D = 20N（图 2-7 的实线）", { "font-size": 10.5, fill: C.accent }));
      S.push(L("lg2", { x1: W - m.r - 214, x2: W - m.r - 190, y1: m.t + 32, y2: m.t + 32, stroke: C.line, "stroke-width": 1.3, "stroke-dasharray": "5 3" }));
      S.push(T("lg2t", W - m.r - 184, m.t + 36, `总算力固定为 ${sci(r.C)}`, { "font-size": 10.5 }));
      const lab = [];
      const P = (k, N, l, fill, text, anchor, dx, dy) => {
        const cyP = ys(Math.min(YMAX, l));
        S.push({ k, tag: "circle", a: { cx: xs(N), cy: cyP, r: 4.5, fill, stroke: fill === "#fff" ? C.line : "#fff", "stroke-width": 1.3 } });
        lab.push(T(k + "t", xs(N) + dx, Math.max(m.t + 12, cyP + dy), text, Object.assign({ "text-anchor": anchor, "font-size": 10.5, fill: fill === "#fff" ? C.ink : C.accent }, HALO)));
      };
      P("ph", r.N / 2, r.Lh, "#fff", `×½：${r.Lh.toFixed(3)}`, "end", -7, 18);
      P("p2", r.N * 2, r.L2, "#fff", `×2：${r.L2.toFixed(3)}`, "start", 7, 18);
      if (s.fixN) S.push({ k: "popt", tag: "circle", a: { cx: xs(r.Nopt), cy: yc(chinLoss(r.Nopt, r.Dopt)), r: 3.5, fill: C.accent } });
      P("pp", r.N, r.L, C.accent, `${s.fixN ? "固定 N" : "本方案"}：${r.L.toFixed(3)}`, "middle", 0, -11);
      S.push(...lab);
      return S;
    }
    function update() {
      const s = state(), r = s.r, fix = !!s.fixN;
      show(fixN, fix);
      anim(scene(s));
      const pk = s.peak / 1e12;
      let html = `总算力 C = ${s.n} × (${pk}×10¹²) × ${mfu.get()}% × (${s.days} × 86 400 s) ≈ <b>${sci(r.C)}</b> 次浮点运算`;
      if (!fix) {
        html += `<br>联立 C ≈ 6N × 20N = 120N²：N = √(C ÷ 120) ≈ <b>${sci(r.N)}</b>（约 ${cn(r.N)}参数），D = 20N ≈ <b>${sci(r.D)}</b>（约 ${cn(r.D)}词元）`;
      } else {
        const ratio = r.ratio;
        html += `<br>固定 N = ${sci(r.N)}：D = C ÷ (6N) ≈ <b>${sci(r.D)}</b>（约 ${cn(r.D)}词元），每参数词元数 D/N ≈ <b>${ratio >= 100 ? Math.round(ratio) : ratio.toFixed(1)}</b>`;
        const Lo = chinLoss(r.Nopt, r.Dopt), cmp = `损失 ${r.L.toFixed(3)}，按 20N 配比的 ${sci(r.Nopt)} 参数方案为 ${Lo.toFixed(3)}`;
        html += ratio > 20
          ? `<br><span class="ok">超过 20，属于“超量训练”</span>（第 2.4.4 小节）：${cmp}${r.L > Lo ? "，损失略高，换来一个更小、推理更便宜的模型。" : "；按式（2-21）这组常数，同算力下多给数据损失反而略低，模型也更小、推理更便宜。"}`
          : `<br><span class="warn">不到 20，数据不足</span>：${cmp}${r.L > Lo ? "，同样的算力换成更小的模型、更多的数据更划算。" : "。"}`;
      }
      html += `<br>损失 L ≈ <b>${r.L.toFixed(3)}</b>；同算力下参数量 ×2（数据 ÷2）为 ${r.L2.toFixed(3)}，×½（数据 ×2）为 ${r.Lh.toFixed(3)}。`;
      if (!fix && r.Lh < r.L) html += `<br>按式（2-21）这组拟合常数，同算力下损失最低点在 N ≈ ${sci(r.Nmin)}（D/N ≈ ${Math.round(r.C / 6 / r.Nmin / r.Nmin)}），比 20N 更偏向多给数据；但曲线底部很平，与本方案只差 ${(r.L - r.Lmin).toFixed(3)}，D ≈ 20N 仍是通用的规划基准。`;
      if (!fix && s.n === 100 && s.days === 30 && mfu.get() === 40 && gpu.get() === "a100") html += `<br>与例 2-7 第 5～7 步一致；实际再留 10%～20% 余量，即约 150 亿参数、3000 亿词元。`;
      out.innerHTML = html;
    }
    const manual = () => { setOn(preset, -1); update(); };
    [gpu, n, days, mfu, mode, fixN].forEach((c) => c.on(manual));
    preset.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return; const i = +b.dataset.i;
      setOn(preset, i);
      gpu.set("a100"); mfu.set(40);
      if (i === 0) { n.set(4); days.set(30); mode.set("opt"); }
      if (i === 1) { n.set(8); days.set(60); mode.set("opt"); }
      if (i === 2) { n.set(4); days.set(30); mode.set("fix"); fixN.set(2); }
      update();
    });
    update();
  };
})();


/* ===== ch3.js ===== */
// 第 3 章交互组件：微调显存（全量 / LoRA / QLoRA）、推理显存与并发、解码策略（温度 + Top-K + Top-P）
// AFTER: c3:fig:peftmem -> c3train
// AFTER: c3:ex:infermem -> c3infer
// AFTER: c3:fig:temp -> c3decode
(function () {
  "use strict";
  const { C, FS, HALO, textW, h, GB, GiB, L, R, T, animator, slider, select, frame, mkSvg, linScale, REG } = window.BookW;
  const BookW = window.BookW;

  // ---------- 小工具 ----------
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const grp = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
  const f = (v, d = 1) => (Math.abs(v) >= 1000 ? grp(v) : v.toFixed(d));
  const sci = (n) => {                       // 7e9 → 7×10⁹，3.998e7 → 4.0×10⁷
    if (n === 0) return "0";
    const e = Math.floor(Math.log10(Math.abs(n)) + 1e-9), m = n / 10 ** e;
    const ms = Math.abs(m - Math.round(m)) < 1e-9 ? String(Math.round(m)) : m.toFixed(m * 10 % 1 < 1e-6 ? 1 : 2).replace(/0$/, "");
    return e === 0 ? ms : `${ms}×10${String(e).split("").map((c) => SUP[c]).join("")}`;
  };
  const niceStep = (xmax) => {
    const step = Math.pow(10, Math.floor(Math.log10(xmax / 5)));
    return [1, 2, 5, 10].map((v) => v * step).find((v) => xmax / v <= 7);
  };
  const hint = (c, txt) => { c.node.querySelector("span").firstChild.nodeValue = txt; };
  // 按挂载时的容器宽度定 SVG 的 viewBox 宽度：手机上不把 600 宽的图整体缩小，字号保持可读
  const fitW = (root, max) => Math.round(Math.max(340, Math.min(max, (root.clientWidth || max) - 4)));
  const show = (c, on) => { c.node.style.display = on ? "" : "none"; };
  // 横轴刻度（键按数值，刻度变化时旧刻度淡出、新刻度淡入）
  function ticks(S, xs, xmax, y, unit) {
    const st = niceStep(xmax);
    for (let v = 0; v <= xmax + 1e-9; v += st) {
      const x = xs(v), key = String(Math.round(v * 1000));
      S.push(L("tk" + key, { x1: x, x2: x, y1: y, y2: y + 4, stroke: C.line }));
      S.push(T("tt" + key, x, y + 17, st < 1 ? v.toFixed(1) : grp(v), { "text-anchor": "middle", "font-size": 11 }));
    }
    S.push(L("ax", { x1: xs(0), x2: xs(xmax), y1: y, y2: y, stroke: C.line }));
    if (unit) S.push(T("axu", xs(xmax), y + 34, unit, { "text-anchor": "end", "font-size": 11, fill: C.dark }));
  }
  // 图例：位置固定，按宽度自动换行；返回最后一行的 y
  function legend(S, items, x0, y0, W) {
    let x = x0, y = y0;
    items.forEach(([t, a], i) => {
      const w = 17 + textW(t, 11) + 16;
      if (x + w > W && x > x0) { x = x0; y += 18; }
      S.push(R("lg" + i, Object.assign({ x, y: y - 9, width: 12, height: 10, stroke: C.line, "stroke-width": 0.6 }, a)));
      S.push(T("lgt" + i, x + 17, y, t, { "font-size": 11 }));
      x += w;
    });
    return y;
  }

  // =====================================================================
  // 1. 微调显存：全量 / LoRA / QLoRA（表 3-7、式 3-18、式 3-20、式 3-24）
  // =====================================================================
  // 模型形状：L 层、隐藏维度 d、前馈中间维度 ff、查询头数 H、KV 头数 kv。参数量按名义值计（7B 即 7×10⁹，与例 3-4 一致）
  const TMODELS = [
    { key: "1B", name: "1B（Llama 3.2-1B 的形状）", N: 1e9, L: 16, d: 2048, ff: 8192, H: 32, kv: 8 },
    { key: "3B", name: "3B（OpenLLaMA-3B 的形状）", N: 3e9, L: 26, d: 3200, ff: 8640, H: 32, kv: 32 },
    { key: "7B", name: "7B（LLaMA-7B 的形状）", N: 7e9, L: 32, d: 4096, ff: 11008, H: 32, kv: 32 },
    { key: "13B", name: "13B（LLaMA-13B 的形状）", N: 13e9, L: 40, d: 5120, ff: 13824, H: 40, kv: 40 },
    { key: "33B", name: "33B（LLaMA-33B 的形状）", N: 33e9, L: 60, d: 6656, ff: 17920, H: 52, kv: 52 },
    { key: "65B", name: "65B（LLaMA-65B 的形状）", N: 65e9, L: 80, d: 8192, ff: 22016, H: 64, kv: 64 },
    { key: "70B", name: "70B（LLaMA 2-70B 的形状）", N: 70e9, L: 80, d: 8192, ff: 28672, H: 64, kv: 8 },
  ];
  // 表 3-7：每参数字节数（权重、梯度、优化器状态）
  const TCFG = {
    sgd0: { name: "FP32 + SGD（无动量）", w: 4, g: 4, o: 0, note: "纯 SGD 不保存状态" },
    sgd1: { name: "FP32 + SGD（带动量）", w: 4, g: 4, o: 4, note: "每参数一个 FP32 动量，与模型同样大" },
    adamw32: { name: "FP32 + AdamW", w: 4, g: 4, o: 8, note: "m、v 两份 FP32，是 FP32 模型大小的 2 倍" },
    mixed: { name: "BF16 混合精度 + AdamW", w: 2, g: 2, o: 12, note: "FP32 主权重、m、v 三份，是 FP32 模型大小的 3 倍" },
  };
  const NF4_BITS = 4.127;                       // NF4 + 双重量化，每参数约 4.127 位
  const TSEQ = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
  const TBAT = [1, 2, 4, 8, 16, 32];
  const KS = [1, 2, 4, 8, 16, 32, 64];
  const RANKS = [1, 2, 4, 8, 16, 32, 64, 128];

  // LoRA 可训练参数：每个被适配的 d×k 矩阵 r(d+k) 个（式 3-24）
  function loraCount(M, r, scope) {
    const kvdim = M.kv * (M.d / M.H);
    const q = r * (M.d + M.d), kv = r * (M.d + kvdim), o = q, ff = r * (M.d + M.ff);
    const perLayer = scope === "qv" ? q + kv : q + 2 * kv + o + 3 * ff;
    return { perLayer, total: perLayer * M.L, kvdim };
  }
  // 激活值（式 3-20，16 位、不做并行切分）；激活重计算时每层只存约 2TBd 字节
  function actBytes(M, Tn, B, mode) {
    if (mode === "full") return M.L * Tn * B * M.d * (34 + 5 * M.H * Tn / M.d);
    if (mode === "recomp") return M.L * 2 * Tn * B * M.d;
    return 0;
  }
  // 三种训练方式的显存（字节，每张卡）
  function trainCalc(s) {
    const M = s.M, c = TCFG[s.cfg], K = s.K, z = s.zero;
    const sw = z >= 3 ? K : 1, sg = z >= 2 ? K : 1, so = z >= 1 ? K : 1;
    const nL = loraCount(M, s.r, s.scope).total;
    const lora = nL * (c.w / sw + c.g / sg + c.o / so);
    const act = actBytes(M, s.T, s.B, s.act);
    const rows = {
      full: { w: M.N * c.w / sw, g: M.N * c.g / sg, o: M.N * c.o / so, l: 0, a: act },
      lora: { w: M.N * c.w / sw, g: 0, o: 0, l: lora, a: act },
      qlora: { w: M.N * NF4_BITS / 8 / sw, g: 0, o: 0, l: lora, a: act },
    };
    for (const k in rows) { const r = rows[k]; r.tot = r.w + r.g + r.o + r.l + r.a; }
    return { rows, nL };
  }
  const base7 = (o) => Object.assign({ M: TMODELS[2], cfg: "mixed", r: 16, scope: "all", act: "none", T: 2048, B: 1, zero: 0, K: 1 }, o);
  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => [
    ["表 3-7 / 例 3-4 7B 混合精度 + AdamW 全量（GB）", trainCalc(base7()).rows.full.tot / GB, 112, 1e-6],
    ["例 3-4 FP32 + SGD 带动量（GB）", trainCalc(base7({ cfg: "sgd1" })).rows.full.tot / GB, 84, 1e-6],
    ["例 3-4 FP32 + SGD 无动量（GB）", trainCalc(base7({ cfg: "sgd0" })).rows.full.tot / GB, 56, 1e-6],
    ["表 3-7 FP32 + AdamW（GB）", trainCalc(base7({ cfg: "adamw32" })).rows.full.tot / GB, 112, 1e-6],
    ["例 3-6 r=8 只作用于 W_Q、W_V 的参数量", loraCount(TMODELS[2], 8, "qv").total, 4.2e6, 0.01e6],
    ["例 3-6 r=8 全部 7 个线性层每层参数量", loraCount(TMODELS[2], 8, "all").perLayer, 624640, 0],
    ["例 3-6 r=8 全部 7 个线性层参数量", loraCount(TMODELS[2], 8, "all").total, 2.0e7, 0.01e7],
    ["例 3-6 r=16 全部线性层约 4000 万", loraCount(TMODELS[2], 16, "all").total, 4.0e7, 0.01e7],
    ["图 3-16 LoRA BF16 底座（GB）", trainCalc(base7()).rows.lora.tot / GB, 14.6, 0.05],
    ["图 3-16 QLoRA NF4 底座（GB）", trainCalc(base7()).rows.qlora.tot / GB, 4.3, 0.06],
    ["例 3-5 括号内的值", 34 + 5 * 32 * 2048 / 4096, 114, 1e-9],
    ["例 3-5 激活值 T=2048、B=1（GB）", actBytes(TMODELS[2], 2048, 1, "full") / GB, 30.6, 0.05],
    ["例 3-5 总显存（GB）", trainCalc(base7({ act: "full" })).rows.full.tot / GB, 143, 0.5],
    ["例 3-5 批大小 8 时激活值（GB）", actBytes(TMODELS[2], 2048, 8, "full") / GB, 245, 0.5],
    ["激活重计算 32 层合计（GB）", actBytes(TMODELS[2], 2048, 1, "recomp") / GB, 0.54, 0.005],
  ]);

  REG.c3train = function (root) {
    const grid = frame(root, "动手试一试：微调要多少显存（全量微调、LoRA、QLoRA）",
      "三行分别是全量微调、LoRA（底座冻结）和 QLoRA（底座量化为 NF4），按表 3-7 的每参数字节数、式（3-24）的 LoRA 参数量和式（3-20）的激活值计算每张卡的显存。参数量按名义值计（7B 即 7×10⁹），LoRA 参数量按所选模型的真实矩阵形状换算。默认是图 3-16 的配置；未计入框架开销与临时缓冲区。");
    const preset = h(`<div class="w-tabs"><button class="on" data-p="f16">图 3-16 的三种配置</button><button data-p="e3">例 3-4：FP32 + SGD</button><button data-p="e4">例 3-5：计入激活值</button><button data-p="e5">例 3-6：LoRA 原论文设置</button></div>`);
    root.insertBefore(preset, grid);
    const model = slider("模型", 0, TMODELS.length - 1, 1, 2, (v) => TMODELS[v].name);
    const cfg = select("精度与优化器（表 3-7）", Object.entries(TCFG).map(([k, v]) => [k, v.name]), "mixed");
    const sel = select("下方逐行列出哪一种的算式", [["full", "全量微调"], ["lora", "LoRA"], ["qlora", "QLoRA"]], "lora");
    const rk = slider("LoRA 秩 r", 0, RANKS.length - 1, 1, 4, (v) => String(RANKS[v]));
    const scope = select("LoRA 作用的矩阵", [["all", "全部 7 个线性层"], ["qv", "只有 W_Q、W_V（原论文）"]], "all");
    const act = select("激活值", [["none", "不计（只看模型状态）"], ["full", "计入（式 3-20）"], ["recomp", "计入，开启激活重计算"]], "none");
    const ts = slider("序列长度 T", 0, TSEQ.length - 1, 1, 3, (v) => grp(TSEQ[v]));
    const bs = slider("每张卡的批大小 B", 0, TBAT.length - 1, 1, 0, (v) => String(TBAT[v]));
    const zero = select("ZeRO 阶段（第 4 章）", [["0", "不用（普通数据并行）"], ["1", "ZeRO-1：切分优化器状态"], ["2", "ZeRO-2：再切分梯度"], ["3", "ZeRO-3：再切分参数"]], "0");
    const ks = slider("GPU 数量 K", 0, KS.length - 1, 1, 0, (v) => `${KS[v]} 张`);
    const cap = select("每张卡的显存", [["24", "24 GB（消费级）"], ["40", "40 GB"], ["48", "48 GB"], ["80", "80 GB"]], "24");
    const ctrls = [model, cfg, sel, rk, scope, act, ts, bs, zero, ks, cap];
    ctrls.forEach((c) => grid.appendChild(c.node));

    const W = fitW(root, 600), m = { l: 80, r: 74 };
    const LEG = [["底座权重", { fill: C.dark }], ["梯度", { fill: C.mid }], ["优化器状态", { fill: C.pale }],
      ["LoRA 参数及其梯度、优化器状态", { fill: "#fff", stroke: C.accent, "stroke-width": 1.2 }], ["激活值", { fill: C.fill, "stroke-dasharray": "3 2" }]];
    const legS = []; const legY = legend(legS, LEG, 4, 14, W);
    const top = legY + 40, bh = 28, gap = 22, H = top + 3 * bh + 2 * gap + 46;
    const svg = mkSvg(root, W, H, "微调显存条形图"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const NAMES = { full: ["全量微调", ""], lora: ["LoRA", "底座冻结"], qlora: ["QLoRA", "NF4 底座"] };
    let prev = {};

    const state = () => ({ M: TMODELS[model.get()], cfg: cfg.get(), r: RANKS[rk.get()], scope: scope.get(), act: act.get(),
      T: TSEQ[ts.get()], B: TBAT[bs.get()], zero: +zero.get(), K: KS[ks.get()] });

    function scene(s, res, capGB, which) {
      const S = legS.slice(), keys = ["full", "lora", "qlora"], tots = keys.map((k) => res.rows[k].tot / GB);
      const xmax = Math.max(capGB * 1.12, Math.max(...tots) * 1.1), xs = linScale(0, xmax, m.l, W - m.r);
      const cx = xs(capGB), capLab = `${s.K > 1 ? "每张卡" : "单卡"} ${capGB} GB`, cw = textW(capLab, 11.5);
      S.push(T("cap", cx + 6 + cw > W - 4 ? cx - 6 - cw : cx + 6, top - 14, capLab, { fill: C.warn, "font-size": 11.5 }));
      const vals = [];
      keys.forEach((k, i) => {
        const r = res.rows[k], y = top + i * (bh + gap), on = k === which;
        const [nm, sub] = NAMES[k];
        S.push(T("rn" + i, m.l - 8, sub ? y + 12 : y + bh / 2 + 5, nm, { "text-anchor": "end", "font-size": 12.5, fill: on ? C.accent : C.ink }));
        S.push(T("rs" + i, m.l - 8, y + 26, sub, { "text-anchor": "end", "font-size": 10, fill: C.dark }));
        let x = m.l;
        [[r.w, C.dark, {}], [r.g, C.mid, {}], [r.o, C.pale, {}], [r.l, "#fff", { stroke: C.accent, "stroke-width": 1.2 }],
         [r.a, C.fill, { "stroke-dasharray": "3 2" }]].forEach(([v, col, extra], j) => {
          const w = Math.max(0, xs(v / GB) - m.l);
          S.push(R(`b${i}${j}`, Object.assign({ x, y, width: w, height: bh, fill: col, stroke: w > 0.3 ? C.line : "none", "stroke-width": 0.6, "stroke-dasharray": "none" }, w > 0.3 ? extra : {})));
          x += w;
        });
        if (on) S.push(R("sel", { x: m.l - 3, y: y - 3, width: Math.max(6, x - m.l + 6), height: bh + 6, fill: "none", stroke: C.accent, "stroke-width": 1 }));
        vals.push(T("v" + i, x + (on ? 9 : 6), y + bh / 2 + 5, `${f(r.tot / GB, r.tot / GB < 10 ? 2 : 1)} GB`, Object.assign({ fill: r.tot / GB > capGB ? C.warn : C.ink, "font-size": 12 }, HALO)));
      });
      if (!keys.includes(which)) S.push(R("sel", { x: 0, y: 0, width: 0, height: 0, fill: "none" }));
      S.push(L("capl", { x1: cx, x2: cx, y1: top - 8, y2: top + 3 * bh + 2 * gap + 4, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.2 }));
      S.push(...vals);
      ticks(S, xs, xmax, top + 3 * bh + 2 * gap + 8, "GB");
      return S;
    }

    function lines(s, res, which) {
      const M = s.M, c = TCFG[s.cfg], K = s.K, z = s.zero, r = res.rows[which];
      const dv = (st) => (z >= st && K > 1 ? ` ÷ ${K}` : "");
      const L0 = [];
      if (which === "full") {
        L0.push(["w", "权重", `${sci(M.N)} × ${c.w} B${dv(3)}`, r.w]);
        L0.push(["g", "梯度", `${sci(M.N)} × ${c.g} B${dv(2)}`, r.g]);
        L0.push(["o", "优化器状态", `${sci(M.N)} × ${c.o} B${dv(1)}（${c.note}）`, r.o]);
      } else {
        L0.push(["w", "底座权重（冻结）", which === "qlora" ? `${sci(M.N)} × ${NF4_BITS} 位 ÷ 8${dv(3)}` : `${sci(M.N)} × ${c.w} B${dv(3)}`, r.w]);
        const lc = loraCount(M, s.r, s.scope), rr = s.r, kvd = lc.kvdim, mha = kvd === M.d;
        const per = s.scope === "qv"
          ? (mha ? `2×${rr}×(${M.d}+${M.d})` : `${rr}×(${M.d}+${M.d}) + ${rr}×(${M.d}+${kvd})`)
          : (mha ? `4×${rr}×(${M.d}+${M.d}) + 3×${rr}×(${M.d}+${grp(M.ff)})` : `2×${rr}×(${M.d}+${M.d}) + 2×${rr}×(${M.d}+${kvd}) + 3×${rr}×(${M.d}+${grp(M.ff)})`);
        L0.push(["n", "LoRA 参数量", `每层 ${per} = ${grp(lc.perLayer)}，× ${M.L} 层`, lc.total, "个"]);
        L0.push(["l", "LoRA 参数及其梯度、优化器状态", `${sci(lc.total)} × (${c.w}+${c.g}+${c.o}) B${z >= 1 && K > 1 ? "（按 ZeRO 阶段分片）" : ""}`, r.l]);
      }
      const a = s.act === "full" ? `${M.L} 层 × ${grp(s.T)}×${s.B}×${M.d}×(34 + 5×${M.H}×${grp(s.T)}÷${M.d})`
        : s.act === "recomp" ? `${M.L} 层 × 2×${grp(s.T)}×${s.B}×${M.d}（激活重计算，只存每层输入）` : "未计入";
      L0.push(["a", "激活值", a, r.a]);
      return L0;
    }

    function update() {
      const s = state(), res = trainCalc(s), capGB = +cap.get(), which = sel.get();
      const actOn = s.act !== "none";
      [ts, bs].forEach((c) => (c.node.style.opacity = actOn ? 1 : 0.45));
      ks.node.style.opacity = s.zero ? 1 : 0.45;
      anim(scene(s, res, capGB, which));
      const now = {};
      const rowsHtml = lines(s, res, which).map(([k, lab, expr, v, unit]) => {
        const key = which + k; now[key] = v;
        const changed = prev[key] !== undefined && Math.abs(prev[key] - v) > 1e-6;
        const val = unit ? `${sci(v)} ${unit}` : (v === 0 && k === "a" ? "0" : `${f(v / GB, v / GB < 10 ? 2 : 1)} GB`);
        const body = `${lab} = ${expr} = <b>${val}</b>`;
        return changed ? `<span class="ok">${body}</span>` : body;
      });
      prev = now;
      const tot = res.rows[which].tot / GB;
      const fits = ["full", "lora", "qlora"].filter((k) => res.rows[k].tot / GB <= capGB).map((k) => NAMES[k][0]);
      const nofit = ["full", "lora", "qlora"].filter((k) => res.rows[k].tot / GB > capGB).map((k) => NAMES[k][0]);
      out.innerHTML = rowsHtml.join("<br>") + `<br>合计 <b>${f(tot, tot < 10 ? 2 : 1)} GB</b>（每张卡）。` +
        (fits.length ? `<span class="ok">${fits.join("、")}</span>${/[A-Za-z]$/.test(fits.join("")) ? " " : ""}能放进 ${capGB} GB` : "") +
        (nofit.length ? `${fits.length ? "；" : ""}<span class="warn">${nofit.join("、")}</span>${/[A-Za-z]$/.test(nofit.join("")) ? " " : ""}放不下` : "") + "。" +
        (actOn ? `<br>三行的激活值一样大：参数高效微调（PEFT）冻结了底座，但梯度仍要穿过整个网络，激活值照常保存。` : "") +
        (s.zero && s.K === 1 ? `<br>只有 1 张卡时，ZeRO 没有可分的对象，结果与不用相同。` : "") +
        (s.cfg === "adamw32" || s.cfg === "mixed" ? `<br>优化器状态是 FP32 模型大小的 ${s.cfg === "mixed" ? "3" : "2"} 倍（${s.cfg === "mixed" ? "含 FP32 主权重" : "只有 m、v"}），两种口径的模型状态都是 16 字节/参数。` : "");
    }
    ctrls.forEach((c) => c.on(update));
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      model.set(2); zero.set("0"); ks.set(0); ts.set(3); bs.set(0); rk.set(4); scope.set("all");
      if (p === "f16") { cfg.set("mixed"); act.set("none"); cap.set("24"); sel.set("lora"); }
      if (p === "e3") { cfg.set("sgd1"); act.set("none"); cap.set("80"); sel.set("full"); }
      if (p === "e4") { cfg.set("mixed"); act.set("full"); cap.set("80"); sel.set("full"); }
      if (p === "e5") { cfg.set("mixed"); act.set("none"); cap.set("24"); sel.set("lora"); rk.set(3); scope.set("qv"); }
      update();
    });
    update();
  };

  // =====================================================================
  // 2. 推理显存与并发（式 3-37、第 4 章式 4-7；例 3-9、例 3-12、3.12.7 小节）
  // =====================================================================
  const INS = [1, 1.5, 3, 7, 7.6, 8, 13, 14, 27, 32, 70, 72];
  const HEADS = [1, 2, 4, 8, 12, 16, 24, 28, 32, 40, 48, 64, 96, 128];
  const TKS = [1, 2, 4, 8, 16, 32, 64, 128];
  const Q4KM = 4.7 / 7.6;                       // 例 3-12：Q4_K_M 文件 4.7 GB ÷ 7.6×10⁹ 参数 ≈ 0.62 字节/参数
  const WPREC = [["2", "FP16 / BF16（2 字节）"], ["1", "INT8（1 字节）"], ["0.5", "4 位（0.5 字节）"], ["q4km", "GGUF Q4_K_M（约 0.62 字节，按例 3-12 的文件大小）"]];
  const bwOf = (v) => (v === "q4km" ? Q4KM : +v);
  // s：N 参数量，bw 每权重字节，Lyr 层数，Hkv KV 头数，dh 每头维度，bkv KV 每数值字节，T 序列长度，B 用户数，
  //    mode "ratio"（式 3-37）或 "vllm"（3.12.7 小节），ratio 开销比例，fixed 固定开销（GB），cap 总显存（字节），unit "GB"|"GiB"|"mix"
  function inferCalc(s) {
    const wB = s.N * s.bw, kvTok = 2 * s.Lyr * s.Hkv * s.dh * s.bkv, kv1 = kvTok * s.T, kvTrue = kv1 * s.B;
    const kv = s.unit === "mix" ? kvTrue / GiB * GB : kvTrue;   // 错误口径：KV 按 GiB 算出的数直接当 GB 用
    let over, avail, exact;
    if (s.mode === "vllm") { over = s.fixed * GB; avail = s.cap * 0.9; exact = (avail - wB - over) / kv1; }
    else { over = (wB + kv) * s.ratio; avail = s.cap; exact = (s.cap / (1 + s.ratio) - wB) / kv1; }
    const total = wB + kv + over;
    return { wB, kvTok, kv1, kv, kvTrue, over, total, avail, exact, maxB: Math.max(0, Math.floor(exact + 1e-9)), fit: total <= avail };
  }
  const ex37 = (o) => Object.assign({ N: 70e9, bw: 2, Lyr: 80, Hkv: 8, dh: 128, bkv: 2, T: 32768, B: 10, mode: "ratio", ratio: 0.1, fixed: 0, cap: 320e9, unit: "GB" }, o);
  const ex310 = { N: 7.6e9, bw: Q4KM, Lyr: 28, Hkv: 4, dh: 128, bkv: 2, T: 8192, B: 1, mode: "ratio", ratio: 0.15, fixed: 0, cap: 16e9, unit: "GB" };
  const case7 = { N: 7.6e9, bw: 2, Lyr: 28, Hkv: 4, dh: 128, bkv: 2, T: 4096, B: 1, mode: "vllm", ratio: 0, fixed: 1, cap: 24e9, unit: "GB" };
  BookW.TESTS.push(() => [
    ["3.9.3 小节 27B 级模型 2000 token 的 KV（GB）", inferCalc({ N: 0, bw: 0, Lyr: 64, Hkv: 8, dh: 128, bkv: 2, T: 2000, B: 1, mode: "ratio", ratio: 0, cap: 1, unit: "GB" }).kvTrue / GB, 0.52, 0.005],
    ["例 3-9 权重（GB）", inferCalc(ex37()).wB / GB, 140, 1e-9],
    ["例 3-9 每 token KV（不用 GQA，字节）", inferCalc(ex37({ Hkv: 64 })).kvTok, 2621440, 0],
    ["例 3-9 KV 总量（不用 GQA，GB）", inferCalc(ex37({ Hkv: 64 })).kv / GB, 859, 0.5],
    ["例 3-9 合计（不用 GQA，GB）", inferCalc(ex37({ Hkv: 64 })).total / GB, 1099, 0.5],
    ["例 3-9 每 token KV（GQA，字节）", inferCalc(ex37()).kvTok, 327680, 0],
    ["例 3-9 KV 总量（GQA，GB）", inferCalc(ex37()).kv / GB, 107, 0.5],
    ["例 3-9 合计（GQA，GB）", inferCalc(ex37()).total / GB, 272, 0.5],
    ["例 3-9 GQA 需要的 80 GB 显卡数", Math.ceil(inferCalc(ex37()).total / 80e9), 4, 0],
    ["例 3-9 (a) 32K 取 32 000 的合计（GB）", inferCalc(ex37({ Hkv: 64, T: 32000 })).total / GB, 1077, 0.5],
    ["例 3-9 (c) KV 恰为 800 GiB", inferCalc(ex37({ Hkv: 64 })).kvTrue / GiB, 800, 1e-9],
    ["例 3-9 (c) 单位混用的合计", inferCalc(ex37({ Hkv: 64, unit: "mix" })).total / GB, 1034, 0.5],
    ["例 3-12 每 token KV（字节）", inferCalc(ex310).kvTok, 57344, 0],
    ["例 3-12 KV 总量（GB）", inferCalc(ex310).kv / GB, 0.47, 0.005],
    ["例 3-12 开销（GB）", inferCalc(ex310).over / GB, 0.78, 0.005],
    ["例 3-12 合计（GB）", inferCalc(ex310).total / GB, 6, 0.06],
    ["3.12.7 小节 5.4 GB 可容纳的 token 数", (24e9 * 0.9 - 15.2e9 - 1e9) / 57344, 9.4e4, 0.05e4],
    ["3.12.7 小节 4096 token 对话数（≈22.99）", inferCalc(case7).exact, 22.99, 0.005],
    ["3.12.7 小节 BF16 最多同时容纳的完整对话", inferCalc(case7).maxB, 22, 0],
    ["3.12.7 小节 4 位量化权重 7.6×10⁹×0.62（GB）", inferCalc(Object.assign({}, case7, { bw: Q4KM })).wB / GB, 4.7, 0.01],
    ["3.12.7 小节 4 位量化可用 KV 21.6−4.7−1（GB）", (24e9 * 0.9 - 7.6e9 * Q4KM - 1e9) / GB, 15.9, 0.01],
    ["3.12.7 小节 4 位量化可容纳 token 数（2.77×10⁵）", (24e9 * 0.9 - 7.6e9 * Q4KM - 1e9) / 57344, 2.77e5, 0.005e5],
    ["3.12.7 小节 4 位量化对话数（≈67.7）", inferCalc(Object.assign({}, case7, { bw: Q4KM })).exact, 67.7, 0.05],
    ["3.12.7 小节 4 位量化最多同时容纳的对话", inferCalc(Object.assign({}, case7, { bw: Q4KM })).maxB, 67, 0],
    ["例 3-10 每请求 KV（7B MHA、2048 token，GB）", inferCalc({ N: 0, bw: 0, Lyr: 32, Hkv: 32, dh: 128, bkv: 2, T: 2048, B: 1, mode: "ratio", ratio: 0, cap: 1, unit: "GB" }).kvTrue / GB, 1.07, 0.005],
  ]);

  REG.c3infer = function (root) {
    const grid = frame(root, "动手试一试：推理显存与并发上限",
      "按式（3-37）估算：权重 N × b<sub>w</sub>，KV 缓存按第 4 章式（4-7）为 2 × 层数 × KV 头数 × 每头维度 × 序列长度 × 用户数 × 每数值字节数，再加前两项之和的 10%～20% 作为激活值与框架开销。默认是例 3-9（LLaMA 2-70B、GQA、10 个用户各 32K 上下文）。");
    const preset = h(`<div class="w-tabs"><button class="on" data-p="e7">例 3-9：70B、10 人 × 32K</button><button data-p="e10">例 3-12：笔记本跑 7B</button><button data-p="c7">3.12.7 小节：24 GB 显卡</button></div>`);
    root.insertBefore(preset, grid);
    const nn = slider("参数量 N", 0, INS.length - 1, 1, 10, (v) => `${INS[v]}B`);
    const wp = select("权重精度 b<sub>w</sub>", WPREC, "2");
    const ly = slider("层数 L", 8, 128, 1, 80, (v) => String(v));
    const qh = slider("查询头数（注意力头数）", 0, HEADS.length - 1, 1, 11, (v) => String(HEADS[v]));
    const kh = slider("KV 头数 H_KV", 0, HEADS.length - 1, 1, 3, (v) => String(HEADS[v]));
    const dh = select("每头维度 d_head", [["64", "64"], ["80", "80"], ["128", "128"], ["256", "256"]], "128");
    const kp = select("KV 缓存精度 b_KV", [["2", "FP16 / BF16（2 字节）"], ["1", "FP8 / INT8（1 字节）"]], "2");
    const tk = slider("每人的上下文长度 T", 0, TKS.length - 1, 1, 5, (v) => `${TKS[v]}K`);
    const kd = select("“K”怎么换算", [["1024", "1K = 1024（32K = 32 768）"], ["1000", "1K = 1000（32K = 32 000）"]], "1024");
    const bu = slider("同时服务的用户数 B", 1, 64, 1, 10, (v) => `${v} 人`);
    const md = select("开销的算法", [["ratio", "式（3-37）：前两项之和 × 比例"], ["vllm", "3.12.7 小节：显存只用 90%，另留固定开销"]], "ratio");
    const ra = slider("开销比例", 0, 30, 1, 10, (v) => `${v}%`);
    const fx = slider("固定开销", 0, 4, 0.5, 1, (v) => `${v} GB`);
    const gp = select("每张卡的显存", [["16", "16 GB 统一内存（笔记本）"], ["24", "24 GB（RTX 4090 一类）"], ["48", "48 GB"], ["80", "80 GB（A100 / H100）"], ["141", "141 GB（H200）"]], "80");
    const nc = slider("显卡张数", 1, 8, 1, 4, (v) => `${v} 张`);
    const un = select("单位", [["GB", "GB（10⁹ 字节，本书口径）"], ["GiB", "GiB（2³⁰ 字节）"], ["mix", "混用：KV 按 GiB、权重按 GB 直接相加（错误）"]], "GB");
    const ctrls = [nn, wp, ly, qh, kh, dh, kp, tk, kd, bu, md, ra, fx, gp, nc, un];
    ctrls.forEach((c) => grid.appendChild(c.node));
    const W = fitW(root, 600), H = W < 500 ? 172 : 154, m = { l: 8, r: 12 }, y0 = 40, bh = 34;
    const svg = mkSvg(root, W, H, "推理显存构成"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);

    const state = () => ({ N: INS[nn.get()] * 1e9, bw: bwOf(wp.get()), Lyr: ly.get(), Hq: HEADS[qh.get()], Hkv: HEADS[kh.get()], dh: +dh.get(),
      bkv: +kp.get(), T: TKS[tk.get()] * +kd.get(), B: bu.get(), mode: md.get(), ratio: ra.get() / 100, fixed: fx.get(),
      capOne: +gp.get(), n: nc.get(), cap: +gp.get() * nc.get() * GB, unit: un.get() });

    function scene(s, r) {
      const S = [], U = s.unit === "GiB" ? GiB : GB, uName = s.unit === "GiB" ? "GiB" : "GB";
      const xmaxB = Math.max(r.total, s.cap) * 1.06, xs = linScale(0, xmaxB / U, m.l, W - m.r);
      let x = m.l;
      [["w", r.wB, C.dark], ["k", r.kv, C.pale], ["o", r.over, C.mid]].forEach(([k, v, col]) => {
        const w = Math.max(0, xs(v / U) - m.l);
        S.push(R("s" + k, { x, y: y0, width: w, height: bh, fill: col, stroke: w > 0.3 ? C.line : "none", "stroke-width": 0.6 }));
        x += w;
      });
      // 每张卡的分界（细线）与总显存（红色虚线）
      for (let i = 1; i <= 8; i++) {
        const on = i < s.n, xi = xs(s.capOne * i * GB / U);
        S.push(L("cd" + i, { x1: on ? xi : xs(s.cap / U), x2: on ? xi : xs(s.cap / U), y1: y0 - 4, y2: y0 + bh + 4, stroke: C.rule, "stroke-width": on ? 0.8 : 0, "stroke-dasharray": "2 2" }));
      }
      if (s.mode === "vllm") S.push(L("use", { x1: xs(r.avail / U), x2: xs(r.avail / U), y1: y0 - 4, y2: y0 + bh + 4, stroke: C.dark, "stroke-dasharray": "5 2", "stroke-width": 1 }));
      else S.push(L("use", { x1: xs(s.cap / U), x2: xs(s.cap / U), y1: y0 + bh / 2, y2: y0 + bh / 2, stroke: "none" }));
      const cx = xs(s.cap / U);
      S.push(L("cap", { x1: cx, x2: cx, y1: y0 - 12, y2: y0 + bh + 6, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.3 }));
      const capLab = `${s.n > 1 ? `${s.n} × ${s.capOne} GB = ` : ""}${f(s.cap / U, 1).replace(/\.0$/, "")} ${uName}${s.mode === "vllm" ? "（可用 90%）" : ""}`;
      const cw = textW(capLab, 11.5);
      S.push(T("capt", Math.max(m.l, cx + 6 + cw > W - 4 ? cx - 6 - cw : cx + 6), y0 - 16, capLab, { fill: C.warn, "font-size": 11.5 }));
      const tot = `合计 ${f(r.total / U, 1)} ${uName}`, tw = textW(tot, 11.5), tx = xs(r.total / U);
      // 合计标在条形末端下方；离右边太近时改为右对齐
      S.push(T("tot", Math.min(Math.max(m.l, tx - tw / 2), W - m.r - tw), y0 + bh + 18, tot, Object.assign({ fill: r.fit ? C.ink : C.warn, "font-size": 11.5 }, HALO)));
      const kvName = s.unit === "mix" ? "KV（GiB 数当 GB）" : "KV 缓存";
      legend(S, [[`权重 ${f(r.wB / U, 1)} ${uName}`, { fill: C.dark }], [`${kvName} ${f(r.kv / U, 1)} ${uName}`, { fill: C.pale }], [`开销 ${f(r.over / U, 1)} ${uName}`, { fill: C.mid }]], m.l, y0 + bh + 48, W);
      return S;
    }

    function update() {
      const s = state(), r = inferCalc(s), U = s.unit === "GiB" ? GiB : GB, uName = s.unit === "GiB" ? "GiB" : "GB";
      hint(kh, `KV 头数 H_KV（查询头数为 ${s.Hq}）：`);
      show(ra, s.mode === "ratio"); show(fx, s.mode === "vllm");
      anim(scene(s, r));
      const g = (v) => `${f(v / U, v / U < 10 ? 2 : 1)} ${uName}`;
      const Tstr = grp(s.T), Bs = s.B;
      const att = s.Hkv > s.Hq ? `<span class="warn">KV 头数（${s.Hkv}）多于查询头数（${s.Hq}），这不可能：多半是把两者填反了。</span>`
        : s.Hkv === s.Hq ? `KV 头数等于查询头数，是标准多头注意力（MHA）。`
        : s.Hkv === 1 ? `只有 1 个 KV 头，是多查询注意力（MQA），KV 缓存是 MHA 的 1/${s.Hq}。`
        : `分组查询注意力（GQA）：每 ${s.Hq / s.Hkv % 1 ? f(s.Hq / s.Hkv, 1) : s.Hq / s.Hkv} 个查询头共享一组 K、V，KV 缓存是标准多头注意力（MHA，KV 头数 = ${s.Hq}）的 ${s.Hkv}/${s.Hq}。`;
      const wExpr = wp.get() === "q4km" ? `${sci(s.N)} × 0.62 B（文件大小）` : `${sci(s.N)} × ${s.bw} B`;
      let L0 = [
        `权重 = ${wExpr} = <b>${g(r.wB)}</b>`,
        `每 token 的 KV = 2 × ${s.Lyr} 层 × ${s.Hkv} 个 KV 头 × ${s.dh} 维 × ${s.bkv} B = <b>${grp(r.kvTok)} B</b>`,
        s.unit === "mix"
          ? `KV 总量 = ${grp(r.kvTok)} × ${Tstr} × ${Bs} = ${f(r.kvTrue / GB, 1)} GB，<span class="warn">除以 1024³ 得 ${f(r.kvTrue / GiB, 1)} GiB，却当作 GB 与权重相加</span>`
          : `KV 总量 = ${grp(r.kvTok)} × ${Tstr} × ${Bs} = <b>${g(r.kv)}</b>`,
        s.mode === "ratio" ? `开销 = (${f(r.wB / U, 1)} + ${f(r.kv / U, 1)}) × ${Math.round(s.ratio * 100)}% = <b>${g(r.over)}</b>` : `框架与临时张量的固定开销 = <b>${g(r.over)}</b>`,
        `合计 = <b>${g(r.total)}</b>，` + (s.mode === "vllm"
          ? `可用显存 ${f(s.cap / U, 1)} × 90% = ${g(r.avail)}：`
          : `显存 ${s.n > 1 ? `${s.n} × ${s.capOne} = ` : ""}${g(s.cap)}：`) +
          (r.fit ? `<span class="ok">放得下</span>` : `<span class="warn">放不下</span>，按每张 ${s.capOne} GB 至少要 ${Math.ceil(r.total / (s.mode === "vllm" ? 0.9 : 1) / (s.capOne * GB))} 张`) + "。",
      ];
      const room = s.mode === "vllm" ? `(${g(r.avail)} − ${f(r.wB / U, 1)} − ${f(r.over / U, 1)})` : `(${f(s.cap / U, 1)} ÷ ${f(1 + s.ratio, 2)} − ${f(r.wB / U, 1)})`;
      L0.push(r.exact <= 0
        ? `<span class="warn">权重${s.mode === "vllm" ? "加固定开销" : "（连同开销）"}已经超过显存</span>，一个这样长的对话也放不下：需要量化、多卡切分或缩短上下文。`
        : `每段 ${Tstr} token 的对话占 KV ${g(r.kv1)}，最多能同时服务 ${room} ÷ ${f(r.kv1 / U, 3)} ≈ ${f(r.exact, 2)} → <b>${r.maxB}</b> 个这样长的对话。`);
      L0.push(att);
      if (s.unit === "mix") L0.push(`这就是例 3-9 答案 (c)“约 1034 GB”的来历：单位混用，结果偏小。本书 GB 一律按 10⁹ 字节计。`);
      if (s.unit === "GiB") L0.push(`GiB 只是换了显示单位：数值约为 GB 数的 0.93 倍，各项之间的比例不变。`);
      if (+kd.get() === 1000 && s.unit !== "mix") L0.push(`“32K”取 32 000 时 KV 略小，例 3-9 的答案 (a) 约 1077 GB 就是这样来的。`);
      out.innerHTML = L0.join("<br>");
    }
    ctrls.forEach((c) => c.on(update));
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      const idx = (arr, v) => arr.indexOf(v);
      kp.set("2"); dh.set("128"); kd.set("1024"); un.set("GB");
      if (p === "e7") { nn.set(idx(INS, 70)); wp.set("2"); ly.set(80); qh.set(idx(HEADS, 64)); kh.set(idx(HEADS, 8)); tk.set(idx(TKS, 32)); bu.set(10); md.set("ratio"); ra.set(10); gp.set("80"); nc.set(4); }
      if (p === "e10") { nn.set(idx(INS, 7.6)); wp.set("q4km"); ly.set(28); qh.set(idx(HEADS, 28)); kh.set(idx(HEADS, 4)); tk.set(idx(TKS, 8)); bu.set(1); md.set("ratio"); ra.set(15); gp.set("16"); nc.set(1); }
      if (p === "c7") { nn.set(idx(INS, 7.6)); wp.set("2"); ly.set(28); qh.set(idx(HEADS, 28)); kh.set(idx(HEADS, 4)); tk.set(idx(TKS, 4)); bu.set(20); md.set("vllm"); fx.set(1); gp.set("24"); nc.set(1); }
      update();
    });
    update();
  };

  // =====================================================================
  // 3. 解码策略：温度、Top-K、Top-P（式 3-38、式 3-39、图 3-22）
  // =====================================================================
  const TOKS = ["好", "棒", "晴", "热", "冷", "差", "怪"];
  const P_FIG = [0.505, 0.222, 0.121, 0.071, 0.051, 0.02, 0.01];   // 图 3-22 中 τ = 1 的原始分布
  const Z_FIG = P_FIG.map((p) => Math.log(p / 0.01));             // 对应的 logits（把“怪”定为 0）
  function softmaxT(z, tau) {
    const a = z.map((v) => v / tau), mx = Math.max(...a), e = a.map((v) => Math.exp(v - mx)), s = e.reduce((x, y) => x + y, 0);
    return e.map((v) => v / s);
  }
  // mode："none" | "topk" | "topp" | "both"（同时启用取交集）
  function decode(z, tau, mode, k, p) {
    const prob = softmaxT(z, tau);
    const order = prob.map((v, i) => i).sort((a, b) => prob[b] - prob[a] || a - b);
    const cum = []; order.reduce((s, i, r) => (cum[r] = s + prob[i]), 0);
    let nP = cum.findIndex((c) => c >= p - 1e-9) + 1; if (nP <= 0) nP = z.length;
    const nK = Math.min(k, z.length);
    const n = mode === "topk" ? nK : mode === "topp" ? nP : mode === "both" ? Math.min(nK, nP) : z.length;
    const kept = new Set(order.slice(0, n)), mass = order.slice(0, n).reduce((s, i) => s + prob[i], 0);
    const q = prob.map((v, i) => (kept.has(i) ? v / mass : 0));
    return { prob, order, cum, nP, nK, n, kept, mass, q };
  }
  BookW.TESTS.push(() => [
    ["图 3-22 τ=0.5 时“好”的概率", decode(Z_FIG, 0.5, "topp", 7, 0.9).prob[0], 0.78, 0.005],
    ["图 3-22 τ=0.5 时“棒”的概率", decode(Z_FIG, 0.5, "topp", 7, 0.9).prob[1], 0.15, 0.005],
    ["式 3-39 下方 τ=0.5 前两个累计 0.78+0.15", decode(Z_FIG, 0.5, "topp", 7, 0.9).cum[1], 0.93, 0.005],
    ["图 3-22 τ=0.5、p=0.9 保留个数", decode(Z_FIG, 0.5, "topp", 7, 0.9).n, 2, 0],
    ["图 3-22 τ=1.0 时“好”的概率", decode(Z_FIG, 1, "topp", 7, 0.9).prob[0], 0.505, 1e-9],
    ["图 3-22 τ=1.0、p=0.9 保留个数", decode(Z_FIG, 1, "topp", 7, 0.9).n, 4, 0],
    ["图 3-22 τ=2.0 时“好”的概率", decode(Z_FIG, 2, "topp", 7, 0.9).prob[0], 0.314, 0.002],
    ["图 3-22 τ=2.0 时“棒”的概率", decode(Z_FIG, 2, "topp", 7, 0.9).prob[1], 0.208, 0.002],
    ["图 3-22 τ=2.0、p=0.9 保留个数", decode(Z_FIG, 2, "topp", 7, 0.9).n, 6, 0],
    ["Top-K=3 与 Top-P=0.9 同时启用（τ=1）取交集", decode(Z_FIG, 1, "both", 3, 0.9).n, 3, 0],
    ["重新归一化后保留候选的概率之和", decode(Z_FIG, 1, "topp", 7, 0.9).q.reduce((a, b) => a + b, 0), 1, 1e-9],
    ["p=1 时全部保留", decode(Z_FIG, 1, "topp", 7, 1).n, 7, 0],
  ]);
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  REG.c3decode = function (root) {
    const grid = frame(root, "动手试一试：温度、Top-K 与 Top-P",
      "候选和初始 logits 取自图 3-22（“今天天气很___”）。上下拖动左图的柱子可以改某个候选的 logit z；温度按式（3-38）改变分布形状，Top-K 按个数、Top-P 按累积概率（式 3-39）截断，被截掉的候选变灰，保留的候选重新归一化。");
    const preset = h(`<div class="w-tabs"><button data-p="t05">图 3-22：τ = 0.5</button><button class="on" data-p="t1">τ = 1.0</button><button data-p="t2">τ = 2.0</button><button data-p="sharp">换成很确定的分布</button><button data-p="flat">换成很分散的分布</button></div>`);
    root.insertBefore(preset, grid);
    const tau = slider("温度 τ", 0.05, 3, 0.05, 1, (v) => v.toFixed(2));
    const mode = select("截断方式", [["topp", "只用 Top-P"], ["topk", "只用 Top-K"], ["both", "Top-K 与 Top-P 同时启用（取交集）"], ["none", "不截断（纯温度采样）"]], "topp");
    const kk = slider("k", 1, 7, 1, 3, (v) => String(v));
    const pp = slider("p", 0.05, 1, 0.01, 0.9, (v) => v.toFixed(2));
    [tau, mode, kk, pp].forEach((c) => grid.appendChild(c.node));
    const wrap = h(`<div style="display:flex;flex-wrap:wrap;gap:10px 18px"></div>`); root.appendChild(wrap);
    const W = (root.clientWidth || 800) < 560 ? 350 : 420, H = 310, mA = { l: 36, r: 6, t: 60, b: 58 }, mB = { l: 36, r: 10, t: 60, b: 58 };
    const box = () => { const d = h(`<div style="flex:1 1 300px;min-width:0"></div>`); wrap.appendChild(d); return d; };
    const svgA = mkSvg(box(), W, H, "下一个 token 的概率分布"), animA = animator(svgA);
    const svgB = mkSvg(box(), W, H, "累积概率曲线"), animB = animator(svgB);
    svgA.style.touchAction = "none"; svgA.style.cursor = "ns-resize";
    const btn = h(`<div class="w-tabs" style="margin-top:.6rem"><button data-s="1">重新随机采样 100 次</button></div>`); root.appendChild(btn);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    let z = Z_FIG.slice(), seed = 20261116, U = [];
    const reseed = () => { const r = rng(seed); U = Array.from({ length: 100 }, () => r()); };
    reseed();
    const colW = (W - mA.l - mA.r) / 7, py0 = H - mA.b;

    function sample(q) {            // 固定 100 个均匀随机数做逆变换：参数连续变化时直方图也连续变化
      const cnt = q.map(() => 0), top = q.indexOf(Math.max(...q));
      U.forEach((u) => {
        let s = 0, j = -1;
        for (let i = 0; i < q.length; i++) { s += q[i]; if (q[i] > 0 && u < s) { j = i; break; } }
        cnt[j < 0 ? top : j]++;       // 浮点误差使 u 越过累计和时，记到概率最大的候选
      });
      return cnt;
    }

    function sceneA(r, cnt) {
      const S = [], ymax = Math.max(0.2, Math.ceil(Math.max(...r.prob, ...r.q, ...cnt.map((c) => c / 100)) * 5 - 1e-9) / 5);
      const ys = linScale(0, ymax, py0, mA.t);
      for (let v = 0; v <= 1.0001; v += 0.2) {
        const on = v <= ymax + 1e-9, y = on ? ys(v) : mA.t, key = Math.round(v * 10);
        S.push(L("gy" + key, { x1: mA.l, x2: W - mA.r, y1: y, y2: y, stroke: on ? C.grid : "none" }));
        S.push(T("gyt" + key, mA.l - 5, y + 4, on ? v.toFixed(1) : "", { "text-anchor": "end", "font-size": 10.5 }));
      }
      legend(S, [["温度作用后的概率", { fill: "#fff", stroke: C.rule }], ["截断后重新归一化", { fill: "none", stroke: C.accent, "stroke-dasharray": "3 2" }], ["采样 100 次的频率", { fill: C.dark }]], 4, 13, W);
      TOKS.forEach((t, i) => {
        const x0 = mA.l + i * colW, kept = r.kept.has(i), bw = colW * 0.5, bx = x0 + colW * 0.14;
        const yp = ys(r.prob[i]), yq = ys(r.q[i]), yc = ys(cnt[i] / 100);
        S.push(R("p" + i, { x: bx, y: yp, width: bw, height: py0 - yp, fill: kept ? C.pale : "#fff", stroke: kept ? C.accent : C.mid, "stroke-width": 0.9 }));
        S.push(R("q" + i, { x: bx, y: kept ? yq : py0, width: bw, height: kept ? py0 - yq : 0, fill: "none", stroke: kept ? C.accent : "none", "stroke-width": 1.1, "stroke-dasharray": "3 2" }));
        S.push(R("c" + i, { x: bx + bw + 3, y: yc, width: colW * 0.14, height: py0 - yc, fill: C.dark, stroke: "none" }));
        const top = Math.min(yp, kept ? yq : py0, yc);
        S.push(T("pv" + i, bx + bw / 2, top - 5, r.prob[i].toFixed(r.prob[i] < 0.995 ? 2 : 1).replace(/^0\./, "."), Object.assign({ "text-anchor": "middle", "font-size": 10.5, fill: kept ? C.ink : C.rule }, HALO)));
        S.push(T("tk" + i, x0 + colW / 2, py0 + 17, t, { "text-anchor": "middle", "font-size": 12.5, fill: kept ? C.ink : C.rule }));
        S.push(T("zv" + i, x0 + colW / 2, py0 + 33, `z=${z[i].toFixed(1)}`, { "text-anchor": "middle", "font-size": 10, fill: C.dark }));
      });
      S.push(L("base", { x1: mA.l, x2: W - mA.r, y1: py0, y2: py0, stroke: C.line }));
      S.push(T("xa", (mA.l + W - mA.r) / 2, H - 6, "候选 token（上下拖动柱子改 logit）", { "text-anchor": "middle", "font-size": 11, fill: C.dark }));
      return S;
    }

    function sceneB(r, md, k, p) {
      const S = [], n = TOKS.length, xs = linScale(0.5, n + 0.5, mB.l, W - mB.r), ys = linScale(0, 1, H - mB.b, mB.t), yb = H - mB.b;
      for (let v = 0; v <= 1.0001; v += 0.2) { const key = Math.round(v * 10);
        S.push(L("gy" + key, { x1: mB.l, x2: W - mB.r, y1: ys(v), y2: ys(v), stroke: C.grid }));
        S.push(T("gyt" + key, mB.l - 5, ys(v) + 4, v.toFixed(1), { "text-anchor": "end", "font-size": 10.5 })); }
      S.push(T("title", 4, 13, "按概率从高到低累加（累积概率）", { "font-size": 11 }));
      S.push(R("keep", { x: xs(0.5), y: mB.t, width: xs(r.n + 0.5) - xs(0.5), height: yb - mB.t, fill: C.pale, "fill-opacity": 0.6, stroke: "none" }));
      const pts = [[xs(0.5), ys(0)]].concat(r.cum.map((c, j) => [xs(j + 1), ys(c)]));
      S.push({ k: "curve", tag: "polyline", a: { points: pts.map((q) => q.join(",")).join(" "), fill: "none", stroke: C.ink, "stroke-width": 1.6 } });
      const useP = md === "topp" || md === "both", useK = md === "topk" || md === "both";
      // 阈值 p 的水平线（不用 Top-P 时收到 0 高度并隐藏）
      S.push(L("pl", { x1: mB.l, x2: W - mB.r, y1: ys(p), y2: ys(p), stroke: useP ? C.accent : "none", "stroke-dasharray": "5 3", "stroke-width": 1.2 }));
      const pLab = `p = ${p.toFixed(2)}`;
      // 交点落在右半边时，p 的标注放到左端，避免与交点标注重叠
      const pLeft = r.nP > n / 2;
      S.push(T("plt", pLeft ? mB.l + 4 : W - mB.r - 4 - textW(pLab, 11), ys(p) + (p > 0.85 ? 15 : -5), useP ? pLab : "", Object.assign({ fill: C.accent, "font-size": 11 }, HALO)));
      // Top-K 的竖线
      const kx = xs(Math.min(k, n) + 0.5);
      S.push(L("kl", { x1: kx, x2: kx, y1: mB.t, y2: yb, stroke: useK ? C.dark : "none", "stroke-dasharray": "2 3", "stroke-width": 1.2 }));
      const kLab = `k = ${k}`, kw = textW(kLab, 11);
      S.push(T("klt", kx + 4 + kw > W - mB.r ? kx - 4 - kw : kx + 4, mB.t + 12, useK ? kLab : "", Object.assign({ fill: C.dark, "font-size": 11 }, HALO)));
      r.cum.forEach((c, j) => {
        const i = r.order[j], kept = j < r.n, hit = useP && j === r.nP - 1;
        S.push({ k: "pt" + j, tag: "circle", a: { cx: xs(j + 1), cy: ys(c), r: hit ? 5.5 : 3.5, fill: kept ? C.accent : "#fff", stroke: kept ? C.accent : C.rule, "stroke-width": 1.4 } });
        S.push(T("ct" + j, xs(j + 1), yb + 17, TOKS[i], { "text-anchor": "middle", "font-size": 12.5, fill: kept ? C.ink : C.rule }));
      });
      const j = r.nP - 1, cl = `${r.cum[j].toFixed(3)} ≥ ${p.toFixed(2)}`, cw = textW(cl, 11), hx = xs(j + 1), hy = ys(r.cum[j]);
      S.push(T("hit", Math.max(mB.l + 2, Math.min(hx + 8, W - mB.r - cw)), hy + (r.cum[j] > 0.5 ? 22 : -10), useP ? cl : "", Object.assign({ fill: C.accent, "font-size": 11 }, HALO)));
      S.push(L("base", { x1: mB.l, x2: W - mB.r, y1: yb, y2: yb, stroke: C.line }));
      S.push(T("xa", (mB.l + W - mB.r) / 2, H - 6, `保留 ${r.n} 个（阴影部分）`, { "text-anchor": "middle", "font-size": 11, fill: C.dark }));
      return S;
    }

    function update() {
      const t = tau.get(), md = mode.get(), k = kk.get(), p = pp.get();
      kk.node.style.opacity = md === "topk" || md === "both" ? 1 : 0.45;
      pp.node.style.opacity = md === "topp" || md === "both" ? 1 : 0.45;
      const r = decode(z, t, md, k, p), cnt = sample(r.q);
      animA(sceneA(r, cnt)); animB(sceneB(r, md, k, p));
      const chain = r.order.slice(0, r.nP).map((i, j) => `${TOKS[i]} ${r.cum[j].toFixed(3)}`).join(" → ");
      const isFig = z.every((v, i) => Math.abs(v - Z_FIG[i]) < 1e-9);
      const figN = { 0.5: 2, 1: 4, 2: 6 }[t.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")];
      const L0 = [`τ = ${t.toFixed(2)}：p<sub>i</sub> = exp(z<sub>i</sub>/τ) ÷ Σ exp(z<sub>j</sub>/τ)（式 3-38），最大的是“${TOKS[r.order[0]]}” <b>${r.prob[r.order[0]].toFixed(3)}</b>。`];
      if (md === "topp" || md === "both")
        L0.push(`Top-P：从高到低累加 ${chain}${r.cum[r.nP - 1] >= p - 1e-9 ? ` ≥ ${p.toFixed(2)}` : ""}，最小集合有 <b>${r.nP}</b> 个（式 3-39）` +
          (isFig && Math.abs(p - 0.9) < 1e-9 && figN ? `，与图 3-22 中 τ = ${t.toFixed(1)} 保留 ${figN} 个一致` : "") + "。");
      if (md === "topk" || md === "both") L0.push(`Top-K：按个数保留前 <b>${r.nK}</b> 个。`);
      if (md === "both") L0.push(`同时启用取交集：min(${r.nK}, ${r.nP}) = <b>${r.n}</b> 个，由${r.nK < r.nP ? " Top-K " : r.nK > r.nP ? " Top-P " : "两者同时"}决定。`);
      if (md === "none") L0.push(`不截断：7 个候选都可能被抽到，其中“${TOKS[r.order[6]]}”的概率是 ${r.prob[r.order[6]].toFixed(3)}。`);
      if (r.n < 7) L0.push(`保留候选的概率和为 ${r.mass.toFixed(3)}，各自除以它重新归一化，例如“${TOKS[r.order[0]]}” ${r.prob[r.order[0]].toFixed(3)} ÷ ${r.mass.toFixed(3)} = <b>${r.q[r.order[0]].toFixed(3)}</b>。`);
      L0.push(`采样 100 次：` + r.order.filter((i) => r.kept.has(i)).map((i) => `${TOKS[i]} ${cnt[i]} 次`).join("、") + (r.n < 7 ? `；被截掉的候选一次也不会出现。` : "。"));
      out.innerHTML = L0.join("<br>");
    }

    // 拖动柱子改 logit：每上移 50 个单位，z 增加 1
    let drag = null;
    const toSvg = (e) => { const pt = svgA.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svgA.getScreenCTM().inverse()); };
    svgA.addEventListener("pointerdown", (e) => {
      const q = toSvg(e), i = Math.floor((q.x - mA.l) / colW);
      if (i < 0 || i >= 7 || q.y < mA.t - 10 || q.y > H - 10) return;
      drag = { i, y: q.y, z: z[i] }; svgA.setPointerCapture(e.pointerId); e.preventDefault();
    });
    svgA.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const q = toSvg(e);
      z[drag.i] = Math.max(-3, Math.min(8, drag.z + (drag.y - q.y) / 50));
      preset.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      update();
    });
    const end = () => (drag = null);
    svgA.addEventListener("pointerup", end); svgA.addEventListener("pointercancel", end);
    [tau, mode, kk, pp].forEach((c) => c.on(() => { preset.querySelectorAll("button").forEach((x) => x.classList.remove("on")); update(); }));
    btn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) | 0; reseed(); update(); });
    preset.addEventListener("click", (e) => {
      const p = e.target.dataset.p; if (!p) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      if (p[0] === "t") { z = Z_FIG.slice(); tau.set({ t05: 0.5, t1: 1, t2: 2 }[p]); pp.set(0.9); mode.set("topp"); }
      if (p === "sharp") z = [6, 2.6, 1.6, 1.0, 0.6, 0.2, 0];
      if (p === "flat") z = [2.0, 1.85, 1.7, 1.6, 1.5, 1.35, 1.2];
      update();
    });
    update();
  };
})();


/* ===== ch5.js ===== */
/* 第 5 章交互组件：切块与上下文预算、RRF 融合沙盘、长上下文与 RAG 的成本/显存
   数值与正文一致：式（5-1）、式（5-4），例 5-1、5-2、5-3、5-4、5-6；KV 缓存用第 4 章式（4-7）。
   插入位置：
   // AFTER: c5:ex:budget -> c5chunk
   // AFTER: c5:ex:rrf -> c5rrf
   // AFTER: c5:ex:cost -> c5cost
*/
(function () {
  "use strict";
  const { C, HALO, textW, h, fmt, GB, REDUCE, L, R, T, animator, slider, select, frame, mkSvg, linScale, REG } = window.BookW;
  const sp = (v) => Math.round(v).toLocaleString("en-US").replace(/,/g, " ");   // 42 000 这样的千分位空格
  const ticks = (xmax) => {                                                     // 线性轴刻度间隔
    const step = Math.pow(10, Math.floor(Math.log10(xmax / 5)));
    return [1, 2, 5, 10].map((v) => v * step).find((v) => xmax / v <= 7);
  };
  const tickLab = (v) => (v >= 1000 ? sp(v) : String(+v.toPrecision(6)));
  const grid2 = (root, title) => {                                              // 第二组控件
    root.appendChild(h(`<div class="w-title" style="font-size:.9rem;margin-top:1rem">${title}</div>`));
    const g = h(`<div class="w-grid"></div>`); root.appendChild(g); return g;
  };

  /* ======================= 纯计算 ======================= */
  // 式（5-1）：一份文档的块数
  const nChunk = (Ldoc, s, o) => (Ldoc <= s ? 1 : Math.ceil((Ldoc - s) / (s - o) - 1e-9) + 1);
  function chunkCalc(p) {
    const per = nChunk(p.Ldoc, p.s, p.o), total = p.files * per;
    const per0 = Math.ceil(p.Ldoc / p.s - 1e-9), total0 = p.files * per0;     // 不重叠
    const vecB = p.d * p.bpd, store = total * vecB, raw = total * p.s * 3;     // UTF-8 汉字 3 字节
    return { per, total, per0, total0, inc: total / total0 - 1, vecB, store, raw };
  }
  // 例 5-3：每块 token = 正文按十位向上取整 + 元数据；块数上限向下取整
  function budgetCalc(p) {
    const fixed = p.sys + p.q + p.hist + p.out, budget = p.win - fixed;
    const body = p.s / p.ratio, bodyR = Math.ceil(body / 10 - 1e-9) * 10, per = bodyR + p.meta;
    return { fixed, budget, body, bodyR, per, max: budget > 0 ? Math.floor(budget / per) : 0 };
  }
  // 式（5-4）：RRF。lists：{名字: [文档…]}，名次从 1 起，未出现记 0
  function rrf(lists, c) {
    const sc = {};
    Object.values(lists).forEach((ls) => ls.forEach((d, i) => { sc[d] = (sc[d] || 0) + 1 / (c + i + 1); }));
    return sc;
  }
  const rank = (sc, docs) => docs.slice().sort((a, b) => (sc[b] || 0) - (sc[a] || 0) || (a < b ? -1 : 1));
  // 例 5-6：成本与 KV 缓存
  function costCalc(p) {
    const rag = p.ragT / 1e6 * p.price, lc = p.corpT / 1e6 * p.price;
    const lcc = lc * (p.hit * p.mult + (1 - p.hit));
    return { rag, lc, lcc, dRag: rag * p.Q, dLc: lc * p.Q, dLcc: lcc * p.Q };
  }
  function kvCalc(p) {
    const perTok = 2 * p.L * p.H * p.dh * p.bk;                                // 式（4-7），B = 1
    const w = p.N * p.bw, kvRag = perTok * p.ragT, kvLc = perTok * p.corpT, free = p.mem * GB - w;
    const conc = (kv) => (free > 0 ? Math.floor(free / kv) : 0);
    return { perTok, w, kvRag, kvLc, free, cRag: conc(kvRag), cLc: conc(kvLc) };
  }

  /* ======================= 数值自检 ======================= */
  const BookW = window.BookW;
  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => {
    const c1 = chunkCalc({ files: 2000, Ldoc: 15 * 600, s: 500, o: 75, d: 1024, bpd: 4 });
    const big = chunkCalc({ files: 1e8, Ldoc: 500, s: 500, o: 75, d: 1024, bpd: 4 });
    const bin = chunkCalc({ files: 1e8, Ldoc: 500, s: 500, o: 75, d: 1024, bpd: 1 / 8 });
    const b8 = budgetCalc({ win: 8192, sys: 400, q: 100, hist: 1200, out: 1500, s: 500, ratio: 1.4, meta: 30 });
    const b32 = budgetCalc({ win: 32768, sys: 400, q: 100, hist: 1200, out: 1500, s: 500, ratio: 1.4, meta: 30 });
    const sc = rrf({ v: ["D1", "D2", "D3", "D4"], b: ["D3", "D1", "D5", "D2"] }, 60);
    const docs = ["D1", "D2", "D3", "D4", "D5"];
    const cs = costCalc({ price: 2, mult: 0.05, hit: 1, ragT: 5000, corpT: 2e5, Q: 1e4 });
    const kv = kvCalc({ L: 32, H: 8, dh: 128, bk: 2, N: 8e9, bw: 2, ragT: 5000, corpT: 2e5, mem: 80 });
    // 例 5-4 表中的和是“各项先四舍五入到 5 位再相加”，与精确和的末位可差 1，故容差取 1e-5
    return [
      ["例 5-1 每份块数", c1.per, 21], ["例 5-1 总块数", c1.total, 42000],
      ["例 5-1 不重叠时总块数", c1.total0, 36000], ["例 5-1 重叠带来的增量", c1.inc, 0.167, 0.0005],
      ["例 5-2 每个向量字节数", c1.vecB, 4096], ["例 5-2 4.2 万块向量总量 / GB", c1.store / GB, 0.17, 0.005],
      ["例 5-2 原文总量 / GB", c1.raw / GB, 0.06, 0.005],
      ["例 5-2 10^8 块向量总量 / GB", big.store / GB, 410, 0.5], ["例 5-2 二值化后总量 / GB", bin.store / GB, 12.8, 0.001],
      ["例 5-3 固定开销", b8.fixed, 3200], ["例 5-3 材料预算", b8.budget, 4992],
      ["例 5-3 每块 token 数", b8.per, 390], ["例 5-3 最多块数", b8.max, 12], ["例 5-3 窗口 32K 时块数上限", b32.max, 75],
      ["例 5-4 D1 的 RRF 分数", sc.D1, 0.03252, 0.00001], ["例 5-4 D3 的 RRF 分数", sc.D3, 0.03226, 0.00001],
      ["例 5-4 D2 的 RRF 分数", sc.D2, 0.03176, 0.00001], ["例 5-4 D5 的 RRF 分数", sc.D5, 0.01587, 0.00001],
      ["例 5-4 D4 的 RRF 分数", sc.D4, 0.01563, 0.00001], ["例 5-4 融合后排序", rank(sc, docs).join("、"), "D1、D3、D2、D5、D4"],
      ["例 5-6 RAG 单次成本 / 美元", cs.rag, 0.01, 1e-9], ["例 5-6 长上下文单次成本 / 美元", cs.lc, 0.40, 1e-9],
      ["例 5-6 缓存命中时单次成本 / 美元", cs.lcc, 0.02, 1e-9],
      ["例 5-6 每天 RAG / 美元", cs.dRag, 100, 1e-6], ["例 5-6 每天长上下文 / 美元", cs.dLc, 4000, 1e-6],
      ["例 5-6 每天长上下文 + 缓存 / 美元", cs.dLcc, 200, 1e-6],
      ["例 5-6 每 token 的 KV 缓存 / B", kv.perTok, 131072], ["例 5-6 RAG 请求的 KV 缓存 / GB", kv.kvRag / GB, 0.66, 0.005],
      ["例 5-6 长上下文请求的 KV 缓存 / GB", kv.kvLc / GB, 26, 0.5], ["例 5-6 8B 模型 BF16 权重 / GB", kv.w / GB, 16, 1e-9],
      ["例 5-6 长上下文单请求总显存 / GB", (kv.w + kv.kvLc) / GB, 42, 0.5],
    ];
  });

  /* ======================= 1. 切块与上下文预算 ======================= */
  REG.c5chunk = function (root) {
    const g1 = frame(root, "动手试一试：切块、向量库与上下文预算",
      "按式（5-1）算块数，按“块数 × 维度 × 每维字节”算向量库大小（GB 按 10<sup>9</sup> 字节），再按例 5-3 的口径算上下文里最多能放几个块：每块 token 数 = 块长 ÷ 字/token（按十位向上取整留余量）+ 元数据。默认值即例 5-1～5-3。");
    const FILES = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    const files = slider("文件数", 0, FILES.length - 1, 1, 4, (v) => `${sp(FILES[v])} 份`);
    const Ld = slider("每份文件字数", 1000, 60000, 500, 9000, (v) => `${sp(v)} 字`);
    const s = slider("块长 s", 100, 1500, 50, 500, (v) => `${v} 字`);
    const op = slider("重叠 o", 0, 50, 1, 15, () => "");
    const d = select("嵌入维度 d", [384, 768, 1024, 1536, 3072].map((v) => [v, String(v)]), "1024");
    const bpd = select("每维存储", [["4", "FP32（4 字节）"], ["2", "FP16（2 字节）"], ["1", "INT8（1 字节）"], ["0.125", "二值（1 位）"]], "4");
    [files, Ld, s, op, d, bpd].forEach((c) => g1.appendChild(c.node));
    const g2 = grid2(root, "上下文预算（单位：token）");
    const win = select("上下文窗口", [["4096", "4K（4 096）"], ["8192", "8K（8 192）"], ["16384", "16K（16 384）"], ["32768", "32K（32 768）"], ["131072", "128K（131 072）"]], "8192");
    const sys = slider("系统指令", 0, 3000, 50, 400, (v) => `${v}`);
    const q = slider("问题及改写", 0, 600, 50, 100, (v) => `${v}`);
    const hist = slider("多轮对话历史", 0, 8000, 100, 1200, (v) => `${v}`);
    const out = slider("为回答预留", 0, 8000, 100, 1500, (v) => `${v}`);
    const ratio = slider("字/token（取决于分词器）", 0.6, 2.0, 0.1, 1.4, (v) => v.toFixed(1));
    const meta = slider("每块元数据（编号、来源、日期）", 0, 100, 10, 30, (v) => `${v}`);
    [win, sys, q, hist, out, ratio, meta].forEach((c) => g2.appendChild(c.node));
    const narrow = root.clientWidth < 520;                 // 手机：用更窄的画布，字不至于缩得太小
    const W = narrow ? 360 : 600, H = narrow ? 186 : 162, m = { l: 8, r: 8 };
    const svg = mkSvg(root, W, H, "上下文窗口的分配"), anim = animator(svg);
    const res = h(`<div class="w-out"></div>`); root.appendChild(res);
    const oVal = () => Math.round(s.get() * op.get() / 100);
    const showO = () => (op.node.querySelector(".w-val").textContent = `${oVal()} 字（${op.get()}%）`);

    function scene(p, b) {
      const S = [], cap = Math.max(p.win, b.fixed), xs = linScale(0, cap, m.l, W - m.r), y = narrow ? 94 : 74, bh = 34;
      const used = Math.max(0, b.max) * b.per;
      const segs = [["sys", p.sys, C.dark, "指令"], ["q", p.q, C.rule, "问题"], ["hist", p.hist, C.mid, "历史"],
        ["mat", used, C.pale, "材料"], ["free", Math.max(0, b.budget - used), "#fff", "空余"], ["out", p.out, C.fill, "预留输出"]];
      // 图例：材料单独占一行，其余按列对齐
      segs.forEach(([k, , c, t], i) => {
        const j = k === "mat" ? -1 : i > 3 ? i - 1 : i, cols = narrow ? 2 : 3, cwid = narrow ? 172 : 196;
        const lx = k === "mat" ? m.l : m.l + (j % cols) * cwid, ly = k === "mat" ? 6 : 26 + Math.floor(j / cols) * 20;
        S.push(R("lg" + k, { x: lx, y: ly, width: 12, height: 11, fill: c, stroke: C.line, "stroke-width": .6 }));
        const v = k === "mat" ? `${b.max} 块 × 每块 ${b.per} = ${sp(used)}` : sp(segs[i][1]);
        S.push(T("lgt" + k, lx + 17, ly + 10.5, `${t} ${v}`, { "font-size": 11.5 }));
      });
      let x = m.l;
      segs.forEach(([k, v, c]) => {
        const w = Math.max(0, xs(v) - m.l);
        S.push(R("s" + k, { x, y, width: w, height: bh, fill: c, stroke: w > 0.5 ? C.line : "none", "stroke-width": .6 }));
        if (k === "mat") {                // 材料段里按块画分隔线（块多时省略）
          const n = b.max <= 60 ? b.max : 0, cw = n ? w / n : 0;
          for (let i = 1; i < 60; i++)
            S.push(L("cd" + i, { x1: x + cw * Math.min(i, n), x2: x + cw * Math.min(i, n), y1: y + 4, y2: y + bh - 4,
              stroke: i < n ? C.accent : "none", "stroke-width": .8 }));
        }
        x += w;
      });
      const wx = xs(p.win), over = b.fixed > p.win;
      S.push(L("wl", { x1: wx, x2: wx, y1: y - 8, y2: y + bh + 8, stroke: over ? C.warn : C.ink, "stroke-width": 1.4 }));
      const wl = `窗口 ${sp(p.win)}`, wlw = textW(wl, 11.5);
      S.push(T("wt", Math.min(wx, W - m.r) - wlw, y + bh + 24, wl, Object.assign({ fill: over ? C.warn : C.ink, "font-size": 11.5 }, HALO)));
      S.push(T("z", m.l, y + bh + 24, "0", { "font-size": 11.5 }));
      const bl = `材料预算 ${sp(Math.max(0, b.budget))}`;
      const bx = xs(p.sys + p.q + p.hist);
      S.push(T("bt", Math.min(Math.max(bx, m.l + 20), W - m.r - textW(bl, 11.5)), y + bh + 44, bl, { "font-size": 11.5, fill: C.accent }));
      return S;
    }
    function update() {
      showO();
      const pc = { files: FILES[files.get()], Ldoc: Ld.get(), s: s.get(), o: oVal(), d: +d.get(), bpd: +bpd.get() };
      const pb = { win: +win.get(), sys: sys.get(), q: q.get(), hist: hist.get(), out: out.get(), s: s.get(), ratio: ratio.get(), meta: meta.get() };
      const c = chunkCalc(pc), b = budgetCalc(pb);
      anim(scene(pb, b));
      const step = pc.s - pc.o;
      const perF = pc.Ldoc <= pc.s ? `文件不长于块长，每份 1 块`
        : `每份块数 = ⌈(${sp(pc.Ldoc)} − ${pc.s}) ÷ ${step}⌉ + 1 = <b>${c.per}</b>`;
      const bpdT = pc.bpd < 1 ? `${pc.d} ÷ 8` : `${pc.d} × ${pc.bpd}`;
      const st = c.store / GB;
      res.innerHTML =
        `${perF}，总块数 = ${sp(pc.files)} × ${c.per} = <b>${sp(c.total)}</b>` +
        (pc.o > 0 ? `；不重叠时为 ${sp(c.total0)}，重叠多出 ${fmt(c.inc * 100, 1)}%（例 5-1）。` : `（不重叠）。`) +
        `<br>向量库 = ${sp(c.total)} × ${bpdT} B = <b>${st >= 100 ? fmt(st, 0) : fmt(st, st < 1 ? 2 : 1)} GB</b>，原文约 ${fmt(c.raw / GB, c.raw / GB < 1 ? 2 : 1)} GB（例 5-2，按一个汉字 3 字节；未计 HNSW 等索引的近邻图）。` +
        `<br>固定开销 = ${pb.sys} + ${pb.q} + ${pb.hist} + ${pb.out} = ${sp(b.fixed)}；` +
        (b.budget <= 0
          ? `<span class="warn">已超过 ${sp(pb.win)} 的窗口，一个块也放不下</span>，需要缩短历史、指令或换更大的窗口。`
          : `材料预算 = ${sp(pb.win)} − ${sp(b.fixed)} = ${sp(b.budget)}；每块 = ${pb.s} ÷ ${pb.ratio.toFixed(1)} + ${pb.meta} ≈ ${b.bodyR} + ${pb.meta} = ${b.per}；` +
            `最多 ⌊${sp(b.budget)} ÷ ${b.per}⌋ = <b>${b.max} 块</b>（例 5-3）。`) +
        (b.max > 20 ? `<br><span class="warn">块数上限超过 20</span>：放得下不等于用得好，关键证据排在中间时模型可能“没看见”（5.3.2 小节“中间迷失”）。` : "");
    }
    [files, Ld, s, op, d, bpd, win, sys, q, hist, out, ratio, meta].forEach((c) => c.on(update));
    update();
  };

  /* ======================= 2. RRF 融合沙盘 ======================= */
  REG.c5rrf = function (root) {
    const g = frame(root, "动手试一试：倒数排名融合（RRF）沙盘",
      "左边两列是两路检索的结果，<b>上下拖动</b>文档卡片可以改变它在该路中的名次；拖到虚线以下表示这一路没有召回它（该项记 0）。右边按式（5-4）RRF(d) = Σ 1/(c + 名次) 实时重排。默认值即例 5-4。");
    const modes = h(`<div class="w-tabs"><button data-m="rrf" class="on">RRF 融合</button><button data-m="v">只用向量</button><button data-m="b">只用 BM25</button></div>`);
    root.insertBefore(modes, g);
    const c = slider("平滑常数 c", 1, 200, 1, 60, (v) => `${v}`);
    g.appendChild(c.node);
    const reset = h(`<label><span>&nbsp;</span><span><button type="button" style="font:inherit;font-size:.86rem;border:.6px solid var(--rule);background:#fff;padding:.15rem .7rem;cursor:pointer">恢复例 5-4 的名次</button></span></label>`);
    g.appendChild(reset);
    const DOCS = ["D1", "D2", "D3", "D4", "D5"], K = 4;           // 每路取前 4 名
    const EX = { v: ["D1", "D2", "D3", "D4", "D5"], b: ["D3", "D1", "D5", "D2", "D4"] };
    const lists = { v: EX.v.slice(), b: EX.b.slice() };
    let mode = "rrf", drag = null;
    const narrow = root.clientWidth < 520;
    const W = narrow ? 360 : 600, top = 46, rh = 40, ch = 30, cw = narrow ? 52 : 84, gap = 18;
    const COL = { v: 28, b: 28 + cw + (narrow ? 12 : 24) };
    const H = top + rh * 5 + gap + 26;
    const svg = mkSvg(root, W, H, "RRF 融合沙盘"), anim = animator(svg);
    svg.style.touchAction = "none"; svg.style.userSelect = "none";
    const res = h(`<div class="w-out"></div>`); root.appendChild(res);
    const slotY = (i) => top + i * rh + (i >= K ? gap : 0);
    const active = () => (mode === "rrf" ? ["v", "b"] : [mode]);
    const used = () => { const o = {}; active().forEach((k) => (o[k] = lists[k].slice(0, K))); return o; };
    const FX = COL.b + cw + (narrow ? 18 : 40), BX = FX + (narrow ? 28 : 36), BW = W - BX - (narrow ? 50 : 70);

    function scene() {
      const S = [], cv = c.get(), sc = rrf(used(), cv), order = rank(sc, DOCS);
      const smax = Math.max(...DOCS.map((x) => sc[x] || 0)) || 1, xs = linScale(0, smax, BX, BX + BW);
      // 两路列表
      [["v", "向量检索"], ["b", "BM25"]].forEach(([k, t]) => {
        const on = active().includes(k), x0 = COL[k];
        S.push(T("h" + k, x0 + cw / 2, top - 16, t, { "text-anchor": "middle", "font-size": 12.5, fill: on ? C.ink : C.rule }));
        S.push(L("cut" + k, { x1: x0 - 4, x2: x0 + cw + 4, y1: slotY(K) - gap / 2 - 5, y2: slotY(K) - gap / 2 - 5, stroke: C.rule, "stroke-dasharray": "4 3" }));
        S.push(T("nr" + k, x0 + cw / 2, slotY(K) + ch + 18, "未召回", { "text-anchor": "middle", "font-size": 11, fill: C.rule }));
        lists[k].forEach((doc, i) => {
          const dragging = drag && drag.k === k && drag.doc === doc;
          const y = dragging ? drag.y : slotY(i);
          const inTop = i < K;
          S.push(R(`c${k}${doc}`, { x: x0, y, width: cw, height: ch, rx: 3, fill: dragging ? C.pale : (inTop && on ? "#fff" : C.fill),
            stroke: dragging ? C.accent : C.line, "stroke-width": dragging ? 1.4 : .7, "data-k": k, "data-doc": doc, style: "cursor:grab" }));
          S.push(T(`t${k}${doc}`, x0 + cw / 2, y + ch / 2 + 5, doc, { "text-anchor": "middle", "font-size": 12.5, fill: on ? C.ink : C.rule, "pointer-events": "none" }));
        });
      });
      for (let i = 0; i < 5; i++)          // 名次标在最左边
        S.push(T("rk" + i, 8, slotY(i) + ch / 2 + 5, i < K ? String(i + 1) : "–", { "font-size": 11.5, fill: C.rule }));
      // 融合结果
      S.push(T("hf", FX, top - 16, mode === "rrf" ? `融合排序（c = ${cv}）` : `排序（c = ${cv}，只用一路）`, { "font-size": 12.5 }));
      order.forEach((doc, i) => {
        const y = slotY(i), v = sc[doc] || 0, hit = v > 0, inK = i < K && hit;
        S.push(T("fr" + doc, FX, y + ch / 2 + 5, doc, { "font-size": 12.5, fill: hit ? C.ink : C.rule }));
        S.push(R("fb" + doc, { x: BX, y: y + 6, width: Math.max(0, xs(v) - BX), height: ch - 12, fill: inK ? C.accent : C.mid }));
        S.push(T("fv" + doc, xs(v) + 6, y + ch / 2 + 5, hit ? v.toFixed(5) : "0（未召回）", { "font-size": 11.5, fill: hit ? C.ink : C.rule }));
      });
      S.push(L("fcut", { x1: FX - 4, x2: W - 6, y1: slotY(K) - gap / 2 - 5, y2: slotY(K) - gap / 2 - 5, stroke: C.rule, "stroke-dasharray": "4 3" }));
      S.push(T("fk", W - 6, slotY(K) + ch + 18, "虚线以上为前 4 名", { "text-anchor": "end", "font-size": 11, fill: C.rule }));
      return { S, sc, order };
    }
    function update() {
      const { S, sc, order } = scene();
      anim(S);
      const cv = c.get(), lk = used();
      const term = (doc) => Object.keys(lk).map((k) => lk[k].indexOf(doc)).filter((i) => i >= 0);
      const lines = order.slice(0, K).filter((doc) => sc[doc] > 0).map((doc) => {
        const rs = term(doc);
        return `${doc} = ${rs.map((i) => `1/(${cv} + ${i + 1})`).join(" + ")}` +
          (rs.length > 1 ? ` = ${rs.map((i) => (1 / (cv + i + 1)).toFixed(5)).join(" + ")}` : "") + ` = <b>${sc[doc].toFixed(5)}</b>`;
      });
      const top4 = order.slice(0, K).filter((doc) => sc[doc] > 0);
      const isEx = mode === "rrf" && cv === 60 && lists.v.join() === EX.v.join() && lists.b.join() === EX.b.join();
      const r1 = 1 / (cv + 1), r4 = 1 / (cv + 4);
      res.innerHTML = `前 4 名：<b>${top4.join("、")}</b>${isEx ? "（与例 5-4 一致）" : ""}<br>` + lines.join("<br>") +
        `<br>同一路里第 1 名与第 4 名的得分比 = (${cv} + 4) ÷ (${cv} + 1) = ${(r1 / r4).toFixed(2)}：c 越小，头部名次的优势越大；c 越大，各名次越接近，单独一路的第 1 名越难主导结果。`;
    }
    // 拖动：在 svg 上捕获指针，避免卡片节点被重新插入时丢失捕获
    const pt = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const idxAt = (y) => { const yc = y + ch / 2; let best = 0, bd = 1e9; for (let i = 0; i < 5; i++) { const dd = Math.abs(slotY(i) + ch / 2 - yc); if (dd < bd) { bd = dd; best = i; } } return best; };
    svg.addEventListener("pointerdown", (e) => {
      const el = e.target, k = el.getAttribute && el.getAttribute("data-k"); if (!k) return;
      const doc = el.getAttribute("data-doc"), p = pt(e), i = lists[k].indexOf(doc);
      drag = { k, doc, dy: p.y - slotY(i), y: slotY(i) };
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有真实指针 */ }
      e.preventDefault(); update();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = pt(e); drag.y = Math.max(top - 10, Math.min(slotY(4) + 10, p.y - drag.dy));
      const ls = lists[drag.k], from = ls.indexOf(drag.doc), to = idxAt(drag.y);
      if (to !== from) { ls.splice(from, 1); ls.splice(to, 0, drag.doc); }
      update();
    });
    const end = () => { if (!drag) return; drag = null; update(); };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    c.on(update);
    modes.addEventListener("click", (e) => {
      const m = e.target.dataset && e.target.dataset.m; if (!m) return;
      mode = m; modes.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target)); update();
    });
    reset.querySelector("button").addEventListener("click", () => { lists.v = EX.v.slice(); lists.b = EX.b.slice(); c.set(60); update(); });
    update();
  };

  /* ======================= 3. 长上下文与 RAG 的成本/显存 ======================= */
  REG.c5cost = function (root) {
    const g1 = frame(root, "动手试一试：长上下文与 RAG 的成本和显存",
      "成本 = token 数 ÷ 10<sup>6</sup> × 单价，缓存命中的那部分再乘读取倍率（只算输入，不含检索、输出 token 与首次写入缓存的费用）。KV 缓存按第 4 章式（4-7）：2 × 层数 × KV 头数 × 每头维度 × 每元素字节 × token 数。默认值即例 5-6（缓存命中率取 100%，显卡取 80 GB 是这里补充的假设）。");
    const TOK = [5e4, 1e5, 2e5, 5e5, 1e6], QS = [1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6];
    const price = slider("输入单价（美元 / 百万 token）", 0.1, 15, 0.1, 2, (v) => v.toFixed(1));
    const mult = slider("缓存读取倍率", 0.05, 1, 0.05, 0.05, (v) => `${v.toFixed(2)} 倍`);
    const hit = slider("缓存命中率", 0, 100, 5, 100, (v) => `${v}%`);
    const ragT = slider("RAG 每次送入", 1000, 20000, 500, 5000, (v) => `${sp(v)} token`);
    const corp = slider("长上下文每次送入（整个语料）", 0, TOK.length - 1, 1, 2, (v) => `${sp(TOK[v])} token`);
    const Q = slider("每日查询数", 0, QS.length - 1, 1, 2, (v) => `${sp(QS[v])} 次`);
    [price, mult, hit, ragT, corp, Q].forEach((c) => g1.appendChild(c.node));
    const W = root.clientWidth < 520 ? 360 : 600, H1 = 186, m1 = { l: 8, r: 10, t: 4, b: 44 };
    const svg1 = mkSvg(root, W, H1, "每日输入成本"), a1 = animator(svg1);
    const g2 = grid2(root, "自建服务器：单个请求的显存");
    const LS = [16, 24, 32, 40, 48, 64, 80, 96, 126], HS = [1, 2, 4, 8, 16, 32, 64], DS = [64, 96, 128, 256], NS_ = [1, 3, 7, 8, 13, 34, 70];
    const Ln = slider("层数 L", 0, LS.length - 1, 1, 2, (v) => `${LS[v]}`);
    const Hk = slider("KV 头数 H_KV", 0, HS.length - 1, 1, 3, (v) => `${HS[v]}`);
    const dh = select("每头维度 d_head", DS.map((v) => [v, String(v)]), "128");
    const bk = select("KV 缓存精度", [["2", "BF16（2 字节）"], ["1", "FP8 / INT8（1 字节）"]], "2");
    const N = slider("模型参数量", 0, NS_.length - 1, 1, 3, (v) => `${NS_[v]}B`);
    const bw = select("权重精度", [["2", "BF16（2 字节）"], ["1", "INT8（1 字节）"], ["0.5", "4 位（0.5 字节）"]], "2");
    const mem = select("显卡显存", [["24", "24 GB"], ["40", "40 GB"], ["80", "80 GB"], ["141", "141 GB"]], "80");
    [Ln, Hk, dh, bk, N, bw, mem].forEach((c) => g2.appendChild(c.node));
    const H2 = 192, m2 = { l: 8, r: 10, t: 44, b: 44 };
    const svg2 = mkSvg(root, W, H2, "单请求显存"), a2 = animator(svg2);
    const res = h(`<div class="w-out"></div>`); root.appendChild(res);
    const money = (v) => (v >= 100 ? sp(v) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
    const usd = (v) => (v >= 1 ? money(v) : v >= 0.01 ? v.toFixed(2) : v.toPrecision(2));

    function axis(S, xs, xmax, x0, x1, y, lab, pre) {
      const st = ticks(xmax);
      for (let v = 0; v <= xmax + 1e-9; v += st) {
        const x = xs(v), key = pre + Math.round(v * 1e6);
        if (x + textW(tickLab(v), 11) / 2 > W - 1) continue;
        S.push(L("tk" + key, { x1: x, x2: x, y1: y, y2: y + 4, stroke: C.line }));
        S.push(T("tt" + key, x, y + 16, tickLab(v), { "text-anchor": "middle", "font-size": 11 }));
      }
      S.push(L("ax" + pre, { x1: x0, x2: x1, y1: y, y2: y, stroke: C.line }));
      S.push(T("axl" + pre, (x0 + x1) / 2, y + 32, lab, { "text-anchor": "middle", "font-size": 11.5 }));
    }
    function scene1(cs) {
      const S = [], rows = [["RAG", cs.dRag], ["长上下文", cs.dLc], ["长上下文 + 缓存", cs.dLcc]];
      const vmax = Math.max(...rows.map((r) => r[1])) || 1, x0 = m1.l, x1 = W - m1.r, xe = x1 - textW(`${money(vmax)} 美元`, 11.5) - 10;
      const xs = linScale(0, vmax, x0, xe), bh = 20, rh = 46;
      rows.forEach(([t, v], i) => {
        const y = m1.t + i * rh;
        S.push(T("n" + i, x0, y + 13, t, { "font-size": 12 }));
        S.push(R("b" + i, { x: x0, y: y + 18, width: Math.max(0, xs(v) - x0), height: bh, fill: i === 0 ? C.accent : i === 1 ? C.dark : C.mid }));
        S.push(T("v" + i, xs(v) + 6, y + 18 + bh / 2 + 5, `${money(v)} 美元`, Object.assign({ "font-size": 11.5 }, HALO)));
      });
      axis(S, xs, vmax * (x1 - x0) / (xe - x0), x0, x1, H1 - m1.b + 2, "每日输入成本 / 美元", "a");
      return S;
    }
    function scene2(k, p) {
      const S = [], cap = p.mem;
      const rows = [[`RAG（每次 ${sp(p.ragT)} token）`, k.kvRag], [`长上下文（每次 ${sp(p.corpT)} token）`, k.kvLc]];
      const tot = rows.map((r) => (k.w + r[1]) / GB);
      const x0 = m2.l, x1 = W - m2.r, xe = x1 - 64, vmax = Math.max(cap, ...tot);
      const xs = linScale(0, vmax, x0, xe);
      [["权重", C.dark], ["单个请求的 KV 缓存", C.pale]].forEach(([t, c], i) => {
        const lx = x0 + i * 72;
        S.push(R("lg" + i, { x: lx, y: 4, width: 12, height: 11, fill: c, stroke: C.line, "stroke-width": .6 }));
        S.push(T("lgt" + i, lx + 17, 14.5, t, { "font-size": 11.5 }));
      });
      const bh = 24, rh = 52, vals = [];
      rows.forEach(([t, kv], i) => {
        const y = m2.t + i * rh, ww = Math.max(0, xs(k.w / GB) - x0), wk = Math.max(0, xs(kv / GB) - x0);
        S.push(T("n" + i, x0, y + 13, t, Object.assign({ "font-size": 11.5 }, HALO)));
        S.push(R("w" + i, { x: x0, y: y + 18, width: ww, height: bh, fill: C.dark, stroke: C.line, "stroke-width": .6 }));
        S.push(R("k" + i, { x: x0 + ww, y: y + 18, width: wk, height: bh, fill: C.pale, stroke: C.line, "stroke-width": .6 }));
        vals.push(T("v" + i, x0 + ww + wk + 6, y + 18 + bh / 2 + 5, `${fmt(tot[i], 1)} GB`,
          Object.assign({ "font-size": 11.5, fill: tot[i] > cap ? C.warn : C.ink }, HALO)));
      });
      const cx = xs(cap), cl = `显存 ${cap} GB`, cw = textW(cl, 11);
      S.push(L("cap", { x1: cx, x2: cx, y1: m2.t - 14, y2: H2 - m2.b + 2, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.2 }));
      S.push(T("capt", cx + 5 + cw > W - 2 ? cx - 5 - cw : cx + 5, m2.t - 4, cl, Object.assign({ fill: C.warn, "font-size": 11 }, HALO)));
      S.push(...vals);
      axis(S, xs, vmax * (x1 - x0) / (xe - x0), x0, x1, H2 - m2.b + 2, "单个请求的总显存（权重 + KV 缓存）/ GB", "m");
      return S;
    }
    function update() {
      const pc = { price: price.get(), mult: mult.get(), hit: hit.get() / 100, ragT: ragT.get(), corpT: TOK[corp.get()], Q: QS[Q.get()] };
      const pk = { L: LS[Ln.get()], H: HS[Hk.get()], dh: +dh.get(), bk: +bk.get(), N: NS_[N.get()] * 1e9, bw: +bw.get(), ragT: pc.ragT, corpT: pc.corpT, mem: +mem.get() };
      const cs = costCalc(pc), k = kvCalc(pk);
      a1(scene1(cs)); a2(scene2(k, pk));
      const hitT = pc.hit === 1 ? `${usd(cs.lc)} × ${pc.mult.toFixed(2)}` : `${usd(cs.lc)} × (${pc.hit.toFixed(2)} × ${pc.mult.toFixed(2)} + ${(1 - pc.hit).toFixed(2)})`;
      const gbs = (b) => fmt(b / GB, b / GB < 10 ? 2 : 1);
      res.innerHTML =
        `单次输入成本：RAG ${sp(pc.ragT)} ÷ 10<sup>6</sup> × ${pc.price.toFixed(1)} = <b>${usd(cs.rag)}</b> 美元；长上下文 = <b>${usd(cs.lc)}</b> 美元（RAG 的 ${fmt(cs.lc / cs.rag, 1)} 倍）；` +
        `加缓存 = ${hitT} = <b>${usd(cs.lcc)}</b> 美元（RAG 的 ${fmt(cs.lcc / cs.rag, 1)} 倍）。` +
        `每天 ${sp(pc.Q)} 次：<b>${money(cs.dRag)} / ${money(cs.dLc)} / ${money(cs.dLcc)}</b> 美元（例 5-6 步骤 4）。` +
        (pc.hit < 1 ? `缓存只在语料不变、前缀被反复复用时命中，语料一更新就要重新写入。` : "") +
        `<br>每 token 的 KV 缓存 = 2 × ${pk.L} × ${pk.H} × ${pk.dh} × ${pk.bk} = ${sp(k.perTok)} B；` +
        `RAG 请求 ${gbs(k.kvRag)} GB，长上下文请求 <b>${gbs(k.kvLc)} GB</b>；权重 ${fmt(k.w / GB, 1)} GB。` +
        (k.free <= 0
          ? `<br><span class="warn">权重（${fmt(k.w / GB, 1)} GB）已超过 ${pk.mem} GB 显存</span>，需要量化或多卡切分。`
          : `<br>可并发请求数 = ⌊(${pk.mem} − ${fmt(k.w / GB, 1)}) GB ÷ 单请求 KV 缓存⌋：RAG <b>${k.cRag}</b> 个，长上下文 ` +
            (k.cLc < 1 ? `<span class="warn">0 个，一个请求都放不下</span>` : `<b>${k.cLc}</b> 个`) + `（未计激活值与运行时开销）。`);
    }
    [price, mult, hit, ragT, corp, Q, Ln, Hk, dh, bk, N, bw, mem].forEach((c) => c.on(update));
    update();
  };
})();


/* ===== ch6.js ===== */
/* 第 6 章交互组件：ReAct 轨迹的 token 与费用、多步任务可靠性、记忆检索排序
   公式与正文一致：式 6-3（累计输入）、式 6-4（连乘）、式 6-5（记忆评分）；默认值复现例 6-1、例 6-2、例 6-3。 */
// AFTER: c6:fig:tokens -> c6tokens
// AFTER: c6:ex:reliability -> c6rel
// AFTER: c6:ex:memscore -> c6mem
(function () {
  "use strict";
  const { C, NS, HALO, textW, h, fmt, L, R, T, animator, slider, select, frame, mkSvg, linScale, REG } = window.BookW;
  const BookW = window.BookW;

  // ================= 纯计算 =================
  // 例 6-1 / 式 6-3：第 k 次调用的输入 P0 + (k−1)Δ，Δ = 每轮输出 + 每轮观察；最后一次写最终回复
  function tokCalc(p) {
    const { P0, out, obs, fin, K, pin, pout, disc } = p;
    const D = out + obs;
    const Tin = K * P0 + (K * (K - 1) / 2) * D;
    const Tout = (K - 1) * out + fin;
    // 第 k 次（k ≥ 2）调用的输入以第 k−1 次的全部输入 P0 + (k−2)Δ 为前缀，这一段可命中前缀缓存
    const cached = K > 1 ? (K - 1) * P0 + ((K - 1) * (K - 2) / 2) * D : 0;
    const costIn = ((Tin - disc * cached) * pin) / 1e6;
    const costOut = (Tout * pout) / 1e6;
    const cost = costIn + costOut;
    const base = (P0 * pin + fin * pout) / 1e6; // 对照组：不用工具，一次调用直接回答
    return { D, Tin, Tout, cached, costIn, costOut, cost, base, ratio: cost / base, inShare: costIn / cost };
  }
  // 例 6-2 / 式 6-4：每步成功率 q；失败被校验发现的概率 h（每次校验独立）；发现失败就重试，最多 r 次
  // 第 j+1 次尝试发生的概率 = 前 j 次都失败且都被发现 = f^j，f = (1−q)h
  function relCalc(n, q, r, hh) {
    const f = (1 - q) * hh;
    let calls = 0;
    for (let j = 0; j <= r; j++) calls += f ** j;
    const s = q * calls;
    return { f, s, calls, none: q ** n, task: s ** n };
  }
  // 例 6-3 / 式 6-5：score = α·sim + β·e^(−λΔt) + γ·imp
  const rec = (m, lam) => Math.exp(-lam * m.dt);
  const memScore = (m, p) => p.a * m.sim + p.b * rec(m, p.lam) + p.g * m.imp;
  const memRank = (mems, p) => mems.map((m, i) => ({ m, i, s: memScore(m, p) }))
    .sort((x, y) => y.s - x.s || x.i - y.i).map((o) => o.m);
  const MEM_POOL = [
    { id: "m1", name: "不住无窗房", sim: 0.82, dt: 30, imp: 0.9 },
    { id: "m2", name: "上周在杭州住过某连锁酒店", sim: 0.75, dt: 7, imp: 0.3 },
    { id: "m3", name: "下周三去上海开会", sim: 0.60, dt: 1, imp: 0.6 },
    // 以下三条为演示自设，书中没有
    { id: "m4", name: "差旅标准：上海每晚不超过 600 元", sim: 0.70, dt: 90, imp: 0.8 },
    { id: "m5", name: "去年在上海住过外滩附近", sim: 0.68, dt: 150, imp: 0.2 },
    { id: "m6", name: "坐高铁喜欢靠窗座位", sim: 0.25, dt: 20, imp: 0.5 },
  ];

  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => {
    const ex = tokCalc({ P0: 2100, out: 100, obs: 400, fin: 300, K: 7, pin: 2, pout: 8, disc: 0 });
    const e5 = tokCalc({ P0: 3000, out: 100, obs: 500, fin: 300, K: 5, pin: 2, pout: 8, disc: 0 });
    const e10 = tokCalc({ P0: 3000, out: 100, obs: 500, fin: 300, K: 10, pin: 2, pout: 8, disc: 0 });
    const r0 = relCalc(10, 0.95, 1, 1), r99 = relCalc(10, 0.99, 0, 1);
    const M = Object.fromEntries(MEM_POOL.slice(0, 3).map((m) => [m.id, m]));
    const p1 = { a: 1, b: 1, g: 1, lam: 0.05 }, p2 = { a: 1, b: 1, g: 1, lam: 0.01 };
    const ord = (p) => memRank(MEM_POOL.slice(0, 3), p).map((m) => m.id).join(">");
    return [
      ["例 6-1 每轮追加量 Δ", ex.D, 500],
      ["例 6-1 累计输入 T_in", ex.Tin, 25200],
      ["例 6-1 累计输出", ex.Tout, 900],
      ["例 6-1 费用（元）", ex.cost, 0.0576, 1e-9],
      ["例 6-1 对照组费用（元）", ex.base, 0.0066, 1e-9],
      ["例 6-1 费用倍数（约 8.7）", ex.ratio, 8.7, 0.05],
      ["例 6-1 输入费用占比", ex.inShare, 0.875, 1e-9],
      ["习题 6.5 K=5 累计输入", e5.Tin, 21000],
      ["习题 6.5 K=10 累计输入", e10.Tin, 57000],
      ["习题 6.5 倍数（约 2.7）", e10.Tin / e5.Tin, 2.7, 0.02],
      ["例 6-2 原样执行 0.95^10", r0.none, 0.599, 0.0005],
      ["例 6-2 单步提高到 0.99：0.99^10", r99.none, 0.904, 0.0005],
      ["例 6-2 校验加一次重试的单步成功率", r0.s, 0.9975, 1e-9],
      ["例 6-2 校验加重试的任务成功率", r0.task, 0.975, 0.0005],
      ["例 6-2 每步平均调用次数", r0.calls, 1.05, 1e-9],
      ["例 6-3 m1 得分", memScore(M.m1, p1), 1.943, 0.0005],
      ["例 6-3 m2 得分", memScore(M.m2, p1), 1.755, 0.0005],
      ["例 6-3 m3 得分", memScore(M.m3, p1), 2.151, 0.0005],
      ["例 6-3 排序", ord(p1), "m3>m1>m2"],
      ["习题 6.7 m1 得分（λ=0.01）", memScore(M.m1, p2), 2.461, 0.0005],
      ["习题 6.7 m2 得分（λ=0.01）", memScore(M.m2, p2), 1.982, 0.0005],
      ["习题 6.7 m3 得分（λ=0.01）", memScore(M.m3, p2), 2.190, 0.0005],
      ["习题 6.7 排序（λ=0.01）", ord(p2), "m1>m3>m2"],
    ];
  });

  // ================= 界面工具 =================
  const narrowOf = (root) => (root.clientWidth || 640) < 560;
  const niceStep = (max, n) => {
    const raw = max / n, p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((v) => v * p).find((v) => raw <= v + 1e-12);
  };
  const strip = (v, d) => String(+v.toFixed(d));
  const fit = (s, size, maxW) => {
    if (textW(s, size) <= maxW) return s;
    let t = [...s];
    while (t.length > 1 && textW(t.join("") + "…", size) > maxW) t.pop();
    return t.join("") + "…";
  };
  let uid = 0;

  // ================= 1. ReAct 轨迹的 token 与费用 =================
  function c6tokens(root) {
    const grid = frame(root, "动手试一试：ReAct 轨迹的 token 与费用",
      "每次调用模型都要把此前的全部轨迹再输入一遍：第 k 次调用的输入为 P<sub>0</sub> + (k−1)Δ，每轮追加量 Δ = 每轮输出 + 每轮观察，最后一次调用写最终回复。默认值取例 6-1 的差旅轨迹，单价是书中假设的价格。" +
      "“命中缓存的输入减价”指：每次调用与上一次调用相同的那段前缀若命中前缀缓存，按原价减去这一比例计费；取 0 表示不使用前缀缓存。");
    const P0 = slider("首次输入 P<sub>0</sub>", 500, 10000, 100, 2100, (v) => `${fmt(v, 0)} token`);
    const out = slider("每轮输出（思考与行动）", 50, 500, 10, 100, (v) => `${v} token`);
    const obs = slider("每轮观察（工具返回）", 0, 3000, 50, 400, (v) => `${fmt(v, 0)} token`);
    const fin = slider("最终回复", 50, 1000, 50, 300, (v) => `${v} token`);
    const K = slider("调用次数 K", 1, 30, 1, 7, (v) => `${v} 次`);
    const pin = slider("输入单价", 0.5, 20, 0.5, 2, (v) => `${v} 元 / 百万 token`);
    const pout = slider("输出单价", 1, 60, 1, 8, (v) => `${v} 元 / 百万 token`);
    const disc = slider("命中缓存的输入减价", 0, 100, 5, 0, (v) => (v === 0 ? "0（不使用前缀缓存）" : `${v}%`));
    const ctl = [P0, out, obs, fin, K, pin, pout, disc];
    ctl.forEach((c) => grid.appendChild(c.node));

    const nw = narrowOf(root);
    const W = nw ? 360 : 640, H = nw ? 290 : 300;
    const m = nw ? { l: 34, r: 8, t: 50, b: 46 } : { l: 46, r: 14, t: 50, b: 46 };
    const svg = mkSvg(root, W, H, "每次模型调用的输入 token 数");
    const hid = "c6hatch" + uid++;
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = `<pattern id="${hid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="${C.mid}" stroke-width="2"/></pattern>`;
    svg.appendChild(defs);
    const anim = animator(svg);
    const outEl = h(`<div class="w-out"></div>`); root.appendChild(outEl);

    function scene(p) {
      const S = [], D = p.out + p.obs, top = (k) => p.P0 + (k - 1) * D, cache = p.disc > 0;
      const maxV = top(p.K) * 1.08, st = niceStep(maxV, nw ? 4 : 5), ymax = Math.ceil(maxV / st) * st;
      const ys = linScale(0, ymax, H - m.b, m.t), y0 = H - m.b;
      // 图例
      const lg = [["固定前缀 P₀", C.fill, C.line], ["已有轨迹", C.pale, C.accent]];
      if (cache) lg.push(["命中缓存（减价计费）", `url(#${hid})`, C.line]);
      let lx = m.l;
      ["a", "b", "c"].forEach((k, i) => {
        if (!lg[i]) return;
        const [t, f, s] = lg[i];
        S.push(R("lg" + k, { x: lx, y: 7, width: 12, height: 10, fill: f, stroke: s, "stroke-width": 0.7 }));
        S.push(T("lgt" + k, lx + 16, 16.5, t, { "font-size": 11 }));
        lx += 16 + textW(t, 11) + (nw ? 10 : 20);
      });
      S.push(T("yl", m.l - 4, m.t - 12, "每次调用的输入 / 千 token", { "font-size": 11, fill: C.dark }));
      // 纵轴刻度（以千 token 为单位）
      for (let v = 0; v <= ymax + st / 1e6; v += st) {
        const y = ys(v), key = String(Math.round(v));
        S.push(L("gy" + key, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: v === 0 ? C.line : C.grid }));
        S.push(T("gt" + key, m.l - 5, y + 4, strip(v / 1000, 3), { "text-anchor": "end", "font-size": 10.5 }));
      }
      // 柱：P0 段、旧轨迹段（与上一次调用相同，可命中缓存）、新增段 Δ
      const slot = (W - m.l - m.r) / p.K, bw = Math.min(slot * 0.68, 46);
      const labW = textW(fmt(top(p.K), 0), 10);
      const xStep = [1, 2, 5, 10].find((s) => slot * s >= textW("30", 10.5) + 6);
      for (let k = 1; k <= 30; k++) {
        if (k > p.K) continue;
        const cx = m.l + (k - 0.5) * slot, x = cx - bw / 2;
        const yP = ys(p.P0), yOld = ys(p.P0 + Math.max(0, k - 2) * D), yTop = ys(top(k));
        const hit = cache && k >= 2;
        S.push(R("p" + k, { x, y: yP, width: bw, height: y0 - yP, fill: hit ? `url(#${hid})` : C.fill }));
        S.push(R("o" + k, { x, y: yOld, width: bw, height: yP - yOld, fill: hit ? `url(#${hid})` : C.pale }));
        S.push(R("n" + k, { x, y: yTop, width: bw, height: yOld - yTop, fill: C.pale }));
        S.push(R("pb" + k, { x, y: yP, width: bw, height: y0 - yP, fill: "none", stroke: C.line, "stroke-width": 0.7 }));
        S.push(R("tb" + k, { x, y: yTop, width: bw, height: yP - yTop, fill: "none", stroke: k > 1 ? C.accent : "none", "stroke-width": 0.8 }));
        if (slot >= labW + 3 || k === p.K || (k === 1 && slot * 2 >= labW + 3))
          S.push(T("v" + k, Math.min(cx, W - 2 - labW / 2), yTop - 4, fmt(top(k), 0), Object.assign({ "text-anchor": "middle", "font-size": 10 }, HALO)));
        if (k === 1 || k % xStep === 0 || k === p.K)
          S.push(T("xk" + k, cx, y0 + 15, String(k), { "text-anchor": "middle", "font-size": 10.5 }));
      }
      S.push(T("xl", (m.l + W - m.r) / 2, H - 10, nw ? "第 k 次调用（最后一次写最终回复）" : "第 k 次模型调用（按时间先后；最后一次写最终回复）",
        { "text-anchor": "middle", "font-size": 11.5 }));
      return S;
    }
    const money = (v) => (v >= 1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(4) : v.toPrecision(2));
    const f0 = (v) => fmt(v, 0);
    function update() {
      const p = { P0: P0.get(), out: out.get(), obs: obs.get(), fin: fin.get(), K: K.get(), pin: pin.get(), pout: pout.get(), disc: disc.get() / 100 };
      anim(scene(p));
      const r = tokCalc(p);
      const inPart = p.disc > 0
        ? `(${f0(r.Tin)} − ${strip(p.disc, 2)}×${f0(r.cached)})×${p.pin}÷10<sup>6</sup>`
        : `${f0(r.Tin)}×${p.pin}÷10<sup>6</sup>`;
      outEl.innerHTML =
        `每轮追加 Δ = ${p.out} + ${p.obs} = ${f0(r.D)}；累计输入 T<sub>in</sub> = ${p.K}×${f0(p.P0)} + (${p.K}×${p.K - 1}÷2)×${f0(r.D)} = <b>${f0(r.Tin)}</b> token（式 6-3）；` +
        `累计输出 = ${p.K - 1}×${p.out} + ${p.fin} = ${f0(r.Tout)} token。` +
        (p.disc > 0 ? `<br>其中 ${f0(r.cached)} token 与上一次调用的输入相同，命中前缀缓存，按原价的 ${Math.round(100 - p.disc * 100)}% 计费。` : "") +
        `<br>费用 = ${inPart} + ${f0(r.Tout)}×${p.pout}÷10<sup>6</sup> = <b>${money(r.cost)} 元</b>；` +
        `只调用一次（对照组）= ${f0(p.P0)}×${p.pin}÷10<sup>6</sup> + ${p.fin}×${p.pout}÷10<sup>6</sup> = ${money(r.base)} 元。` +
        `<br>ReAct 的费用约为一次调用的 <b>${r.ratio.toFixed(1)} 倍</b>，其中输入费用占 ${(r.inShare * 100).toFixed(1)}%。` +
        (p.K >= 2 && r.Tin > 0 ? `累计输入里，反复读入的已有轨迹（K(K−1)/2·Δ）占 ${(((p.K * (p.K - 1)) / 2 * r.D) / r.Tin * 100).toFixed(0)}%。` : "");
    }
    ctl.forEach((c) => c.on(update));
    update();
  }

  // ================= 2. 多步任务的可靠性 =================
  function c6rel(root) {
    const grid = frame(root, "动手试一试：多步任务的可靠性",
      "各步是否成功相互独立时，任务成功率是各步成功率的连乘（式 6-4）。打开校验后，失败以检出率 h 被发现，发现了就重试（最多 r 次，每次重试与首次相互独立）；没被发现的失败会被当成成功放过去，任务因此失败。默认值取例 6-2（10 步、每步 0.95、重试 1 次、失败都能被发现）。");
    const n = slider("步数 n", 1, 50, 1, 10, (v) => `${v} 步`);
    const q = slider("单步成功率 q", 0.8, 0.999, 0.001, 0.95, (v) => v.toFixed(3));
    const r = slider("每步最多重试次数 r", 0, 3, 1, 1, (v) => (v === 0 ? "0（不重试）" : `${v} 次`));
    const hh = slider("校验的检出率 h", 0, 100, 5, 100, (v) => `${v}%`);
    const ctl = [n, q, r, hh];
    ctl.forEach((c) => grid.appendChild(c.node));

    const nw = narrowOf(root);
    const W = nw ? 360 : 640, H = nw ? 270 : 290;
    const m = nw ? { l: 46, r: 10, t: 36, b: 42 } : { l: 56, r: 16, t: 40, b: 42 };
    const svg = mkSvg(root, W, H, "任务成功率随步数的变化"), anim = animator(svg);
    const outEl = h(`<div class="w-out"></div>`); root.appendChild(outEl);
    const xs = linScale(1, 50, m.l, W - m.r), ys = linScale(0, 1, H - m.b, m.t);
    const curve = (s) => { let pts = ""; for (let k = 1; k <= 50; k++) pts += `${xs(k).toFixed(2)},${ys(s ** k).toFixed(2)} `; return pts.trim(); };

    function scene(p) {
      const S = [], c = relCalc(p.n, p.q, p.r, p.h), full = relCalc(p.n, p.q, p.r, 1);
      const lg = [["不校验", C.ink, ""], [p.r ? `校验 + 最多重试 ${p.r} 次` : "校验（不重试）", C.accent, ""]];
      if (p.h < 1 && p.r > 0) lg.push([nw ? "失败都被发现时" : "若失败都能被发现", C.accent, "4 3"]);
      let lx = nw ? 4 : m.l;
      ["a", "b", "c"].forEach((k, i) => {
        if (!lg[i]) return;
        const [t, col, da] = lg[i];
        S.push(L("lg" + k, { x1: lx, x2: lx + 18, y1: 12, y2: 12, stroke: col, "stroke-width": 2, "stroke-dasharray": da || "none" }));
        S.push(T("lgt" + k, lx + 22, 16, t, { "font-size": 11 }));
        lx += 22 + textW(t, 11) + (nw ? 10 : 20);
      });
      const cy = (m.t + H - m.b) / 2;
      S.push(T("yl", 12, cy, "任务成功率", { "text-anchor": "middle", "font-size": 11, fill: C.dark, transform: `rotate(-90 12 ${cy})` }));
      for (let i = 0; i <= 5; i++) {
        const v = i / 5, y = ys(v);
        S.push(L("gy" + i, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: i === 0 ? C.line : C.grid }));
        S.push(T("gt" + i, m.l - 5, y + 4, v.toFixed(1), { "text-anchor": "end", "font-size": 10.5 }));
      }
      [1, 10, 20, 30, 40, 50].forEach((k) => {
        S.push(L("xt" + k, { x1: xs(k), x2: xs(k), y1: H - m.b, y2: H - m.b + 4, stroke: C.line }));
        S.push(T("xtt" + k, xs(k), H - m.b + 16, String(k), { "text-anchor": "middle", "font-size": 10.5 }));
      });
      S.push(T("xl", (m.l + W - m.r) / 2, H - 6, "步数 n", { "text-anchor": "middle", "font-size": 11.5 }));
      const X = xs(p.n);
      S.push(L("cur", { x1: X, x2: X, y1: m.t, y2: H - m.b, stroke: C.rule, "stroke-dasharray": "3 3" }));
      S.push({ k: "cf", tag: "polyline", a: { points: curve(full.s), fill: "none", stroke: C.accent, "stroke-width": 1.4, "stroke-dasharray": "4 3", "stroke-opacity": p.h < 1 && p.r > 0 ? 1 : 0 } });
      S.push({ k: "c0", tag: "polyline", a: { points: curve(p.q), fill: "none", stroke: C.ink, "stroke-width": 2 } });
      S.push({ k: "c1", tag: "polyline", a: { points: curve(c.s), fill: "none", stroke: C.accent, "stroke-width": 2.2 } });
      const y0 = ys(c.none), y1 = ys(c.task);
      S.push({ k: "d0", tag: "circle", a: { cx: X, cy: y0, r: 4.5, fill: C.ink, stroke: "#fff", "stroke-width": 1.2 } });
      S.push({ k: "d1", tag: "circle", a: { cx: X, cy: y1, r: 4.5, fill: C.accent, stroke: "#fff", "stroke-width": 1.2 } });
      // 两条曲线都单调下降：校验曲线的标签放在点的右上方，不校验曲线的标签放在点的左下方，都避开曲线本身
      const t0 = c.none.toFixed(3), t1 = c.task.toFixed(3), w0 = textW(t0, 11.5), w1 = textW(t1, 11.5);
      const x1 = X + 8 + w1 > W - m.r ? X - 8 - w1 : X + 7;
      let x0 = X - 8 - w0, ly0 = y0 + 17;
      if (x0 < m.l + 2) { x0 = X + 8; ly0 = y0 + 17; }
      let ly1 = Math.max(m.t - 2, y1 - 9);
      if (ly0 - ly1 < 15) ly0 = ly1 + 15;
      ly0 = Math.min(H - m.b - 4, ly0);
      ly1 = Math.min(ly1, ly0 - 15);
      S.push(T("l1", x1, ly1, t1, Object.assign({ fill: C.accent, "font-size": 11.5 }, HALO)));
      S.push(T("l0", x0, ly0, t0, Object.assign({ fill: C.ink, "font-size": 11.5 }, HALO)));
      return S;
    }
    function update() {
      const p = { n: n.get(), q: +q.get().toFixed(3), r: r.get(), h: hh.get() / 100 };
      anim(scene(p));
      const c = relCalc(p.n, p.q, p.r, p.h), sup = (s) => `<sup>${s}</sup>`;
      let txt = `不校验：${p.q}${sup(p.n)} = <b>${c.none.toFixed(3)}</b>（式 6-4）。`;
      if (p.r === 0) txt += `<br>不重试时，校验只能发现失败、不能挽回，成功率不变。`;
      else if (p.h === 0) txt += `<br><span class="warn">检出率为 0</span>：失败一次也发现不了，重试从不发生，成功率与不校验相同。`;
      else {
        txt += p.h === 1
          ? `<br>校验 + 最多重试 ${p.r} 次：单步成功率 = 1 − (1 − ${p.q})${sup(p.r + 1)} = ${strip(c.s, 4)}`
          : `<br>校验 + 最多重试 ${p.r} 次：失败且被发现的概率 f = (1 − ${p.q})×${p.h} = ${strip(c.f, 4)}，单步成功率 = q×(1 + f${p.r > 1 ? " + … + f" + sup(p.r) : ""}) = ${strip(c.s, 4)}`;
        txt += `；任务成功率 = ${strip(c.s, 4)}${sup(p.n)} = <b>${c.task.toFixed(3)}</b>。` +
          `<br>每步平均调用 ${p.r === 1 ? `1 + ${strip(c.f, 4)} = ` : ""}<b>${strip(c.calls, 4)}</b> 次（只有失败且被发现时才重试）。`;
        if (p.h < 1) txt += `<br><span class="warn">有 ${Math.round((1 - p.h) * 100)}% 的失败没被校验发现</span>，这些失败无法重试；若失败都能被发现，任务成功率可达 ${relCalc(p.n, p.q, p.r, 1).task.toFixed(3)}。`;
      }
      outEl.innerHTML = txt;
    }
    ctl.forEach((c) => c.on(update));
    update();
  }

  // ================= 3. 记忆检索排序 =================
  function c6mem(root) {
    const grid = frame(root, "动手试一试：记忆检索排序",
      "按式 6-5 给每条记忆打分：score = α·sim + β·e<sup>−λΔt</sup> + γ·imp，sim 为相似度，Δt 为距今天数，imp 为重要性，按得分取前 k 条写进上下文。默认值取例 6-3（查询“订上海的酒店”）；把 λ 调到 0.010 可以对照习题 6.7 的答案。也可以选中一条记忆修改它的三项分数，或添加、删除记忆（m4–m6 为演示自设）。");
    const a = slider("相似度权重 α", 0, 2, 0.05, 1, (v) => v.toFixed(2));
    const b = slider("新近性权重 β", 0, 2, 0.05, 1, (v) => v.toFixed(2));
    const g = slider("重要性权重 γ", 0, 2, 0.05, 1, (v) => v.toFixed(2));
    const lam = slider("衰减速率 λ", 0, 0.3, 0.005, 0.05, (v) => `${v.toFixed(3)} / 天`);
    const kk = slider("写进上下文的条数 k", 1, 3, 1, 2, (v) => `${v} 条`);
    const ctl = [a, b, g, lam, kk];
    ctl.forEach((c) => grid.appendChild(c.node));

    let mems = MEM_POOL.slice(0, 3).map((x) => Object.assign({}, x));
    const tabs = h(`<div class="w-tabs"><button data-act="add">添加一条记忆</button><button data-act="del">删除选中的记忆</button><button data-act="reset">恢复例 6-3</button></div>`);
    const ed = h(`<div class="w-grid"></div>`);
    const pick = select("选中的记忆", [], "m1");
    const sim = slider("相似度 sim", 0, 1, 0.01, 0.82, (v) => v.toFixed(2));
    const dt = slider("距今 Δt", 0, 180, 1, 30, (v) => `${v} 天`);
    const imp = slider("重要性 imp", 0, 1, 0.05, 0.9, (v) => v.toFixed(2));
    [pick, sim, dt, imp].forEach((c) => ed.appendChild(c.node));
    root.appendChild(tabs); root.appendChild(ed);
    const btn = (act) => tabs.querySelector(`[data-act="${act}"]`);
    const kIn = kk.node.querySelector("input");

    const nw = narrowOf(root);
    const W = nw ? 360 : 640;
    const rowH = nw ? 50 : 36, top = 28, bot = 26;
    const nameX = 24, bx0 = nw ? 24 : 250, bx1 = W - (nw ? 44 : 52);
    const svg = mkSvg(root, W, top + 3 * rowH + bot, "记忆按得分排序"), anim = animator(svg);
    const outEl = h(`<div class="w-out"></div>`); root.appendChild(outEl);
    const label = (x) => `${x.id}：${x.name}`;

    function syncEditor(id) {
      const sel = pick.node.querySelector("select");
      sel.innerHTML = mems.map((x) => `<option value="${x.id}">${label(x)}</option>`).join("");
      const cur = mems.find((x) => x.id === id) || mems[0];
      sel.value = cur.id; sim.set(cur.sim); dt.set(cur.dt); imp.set(cur.imp);
      kIn.max = String(mems.length);
      if (kk.get() > mems.length) kk.set(mems.length);
      btn("add").disabled = mems.length >= MEM_POOL.length;
      btn("del").disabled = mems.length <= 1;
    }

    function scene(p, k) {
      const S = [], order = memRank(mems, p), N = mems.length, H = top + N * rowH + bot;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const smax = Math.max(p.a + p.b + p.g, 0.3), xs = linScale(0, smax, bx0, bx1);
      // 图例
      let lx = nameX;
      [["α·sim", C.dark], ["β·rec", C.mid], ["γ·imp", C.pale]].forEach(([t, c], i) => {
        S.push(R("lg" + i, { x: lx, y: 7, width: 12, height: 10, fill: c, stroke: C.line, "stroke-width": 0.6 }));
        S.push(T("lgt" + i, lx + 16, 16.5, t, { "font-size": 11 }));
        lx += 16 + textW(t, 11) + 16;
      });
      if (!nw) S.push(T("lgr", W - 4, 16.5, "按得分从高到低", { "font-size": 11, "text-anchor": "end", fill: C.dark }));
      // 竖向网格（得分刻度）
      const st = niceStep(smax, nw ? 3 : 6), yB = top + N * rowH;
      for (let v = 0; v <= smax + 1e-9; v += st) {
        const key = String(Math.round(v * 100)), x = xs(v);
        S.push(L("gx" + key, { x1: x, x2: x, y1: top - 4, y2: yB, stroke: C.grid }));
        S.push(T("gxt" + key, x, yB + 15, strip(v, 2), { "text-anchor": "middle", "font-size": 10.5 }));
      }
      if (!nw) S.push(T("gxl", bx0 - 8, yB + 15, "得分", { "text-anchor": "end", "font-size": 10.5, fill: C.dark }));
      order.forEach((x, i) => {
        const y = top + i * rowH, inK = i < k;
        const bh = nw ? 16 : 20, by = nw ? y + 24 : y + (rowH - bh) / 2;
        const ty = nw ? y + 16 : y + rowH / 2 + 5;
        S.push(R("hl" + x.id, { x: 2, y: y + 2, width: W - 4, height: rowH - 4, fill: "none", stroke: inK ? C.accent : "none", "stroke-width": 1 }));
        S.push(T("rk" + x.id, 12, ty, String(i + 1), { "text-anchor": "middle", fill: inK ? C.accent : C.dark, "font-size": 11.5 }));
        const nmMax = nw ? W - nameX - 8 : bx0 - nameX - 10;
        S.push(T("nm" + x.id, nameX, ty, fit(label(x), 12, nmMax), { fill: inK ? C.accent : C.ink, "font-size": 12 }));
        const parts = [p.a * x.sim, p.b * rec(x, p.lam), p.g * x.imp];
        let bx = bx0;
        [C.dark, C.mid, C.pale].forEach((c, j) => {
          const w = Math.max(0, xs(parts[j]) - bx0);
          S.push(R(`b${j}${x.id}`, { x: bx, y: by, width: w, height: bh, fill: c, stroke: w > 0.5 ? C.line : "none", "stroke-width": 0.6 }));
          bx += w;
        });
        S.push(T("sc" + x.id, bx + 5, by + bh / 2 + 4.5, memScore(x, p).toFixed(3), Object.assign({ "font-size": 11.5 }, HALO)));
      });
      const yd = top + k * rowH;
      S.push(L("div", { x1: 2, x2: W - 2, y1: yd, y2: yd, stroke: C.accent, "stroke-dasharray": "4 3", "stroke-opacity": k < N ? 1 : 0 }));
      return S;
    }
    function update() {
      const p = { a: a.get(), b: b.get(), g: g.get(), lam: +lam.get().toFixed(3) }, k = Math.min(kk.get(), mems.length);
      anim(scene(p, k));
      const order = memRank(mems, p), n3 = (v) => v.toFixed(3);
      const lines = order.map((x) =>
        `${x.id}：rec = e<sup>−${p.lam}×${x.dt}</sup> = ${n3(rec(x, p.lam))}，得分 = ${strip(p.a, 2)}×${x.sim.toFixed(2)} + ${strip(p.b, 2)}×${n3(rec(x, p.lam))} + ${strip(p.g, 2)}×${x.imp.toFixed(2)} = <b>${n3(memScore(x, p))}</b>`);
      const bySim = mems.map((x, i) => ({ x, i })).sort((u, v) => v.x.sim - u.x.sim || u.i - v.i).slice(0, k).map((o) => o.x.id);
      const topK = order.slice(0, k).map((x) => x.id);
      const same = bySim.slice().sort().join() === topK.slice().sort().join();
      outEl.innerHTML = lines.join("<br>") +
        `<br>排序：${order.map((x) => `${x.id} ${n3(memScore(x, p))}`).join(" &gt; ")}；取前 ${k} 条（<span class="ok">${topK.join("、")}</span>）写进上下文。` +
        `<br>只按相似度取前 ${k} 条会得到 ${bySim.join("、")}${same ? "，与按得分取的相同。" : "，与按得分取的不同。"}`;
    }
    ctl.forEach((c) => c.on(update));
    const cur = () => mems.find((x) => x.id === pick.get());
    pick.on(() => { const x = cur(); sim.set(x.sim); dt.set(x.dt); imp.set(x.imp); });
    sim.on(() => { cur().sim = sim.get(); update(); });
    dt.on(() => { cur().dt = dt.get(); update(); });
    imp.on(() => { cur().imp = +imp.get().toFixed(2); update(); });
    tabs.addEventListener("click", (e) => {
      const act = e.target.dataset && e.target.dataset.act; if (!act) return;
      let id = pick.get();
      if (act === "add") {
        const nx = MEM_POOL.find((x) => !mems.some((y) => y.id === x.id));
        if (!nx) return;
        mems.push(Object.assign({}, nx)); id = nx.id;
      } else if (act === "del") {
        if (mems.length <= 1) return;
        mems = mems.filter((x) => x.id !== id); id = mems[0].id;
      } else {
        mems = MEM_POOL.slice(0, 3).map((x) => Object.assign({}, x)); id = "m1";
        a.set(1); b.set(1); g.set(1); lam.set(0.05); kk.set(2);
      }
      syncEditor(id); update();
    });
    syncEditor("m1");
    update();
  }

  Object.assign(REG, { c6tokens, c6rel, c6mem });
})();


/* ===== ch7.js ===== */
// 第 7 章交互组件：上下文预算、重试与链路可靠性、端 / 边执行时间
// AFTER: c7:ex:budget -> c7budget
// AFTER: c7:ex:retry -> c7retry
// AFTER: c7:ex:edge -> c7edge
(function () {
  "use strict";
  const BookW = window.BookW;
  const { C, HALO, textW, h, fmt, L, R, T, animator, slider, select, frame, mkSvg, linScale, REG } = BookW;

  // ---------- 小工具 ----------
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const sci = (v, d = 2) => {
    if (v === 0) return "0";
    const e = Math.floor(Math.log10(Math.abs(v))), m = v / 10 ** e;
    return `${m.toFixed(d).replace(/\.?0+$/, "")}×10${String(e).replace(/./g, (c) => SUP[c])}`;
  };
  const trim = (v, d) => v.toFixed(d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const pct = (v) => trim(v * 100, v * 100 < 10 ? 2 : 1);
  const legend = (items) => h(`<div style="display:flex;flex-wrap:wrap;gap:.2rem .9rem;font-size:.8rem;margin:.2rem 0 .3rem">${
    items.map(([t, c]) => `<span style="display:inline-flex;align-items:center;gap:.3rem"><span style="display:inline-block;width:.8rem;height:.6rem;background:${c};border:.6px solid ${C.line}"></span>${t}</span>`).join("")}</div>`);
  const checkbox = (label, val) => {
    const w = h(`<label style="flex-direction:row;align-items:center;gap:.45rem;cursor:pointer"><input type="checkbox"${val ? " checked" : ""}><span>${label}</span></label>`);
    const c = w.querySelector("input");
    return { node: w, get: () => c.checked, on: (f) => c.addEventListener("change", f), set: (v) => (c.checked = !!v) };
  };
  // SVG 视框宽度跟随实际显示宽度（300～640），手机上字号不被等比缩小；宽度变化时重画
  const fitW = (svg, Hf, redraw) => {
    const measure = () => Math.round(Math.max(300, Math.min(640, svg.getBoundingClientRect().width || 640)));
    let W = measure();
    const apply = () => svg.setAttribute("viewBox", `0 0 ${W} ${Hf(W)}`);
    apply();
    if (window.ResizeObserver) new ResizeObserver(() => { const w = measure(); if (Math.abs(w - W) > 8) { W = w; apply(); redraw(); } }).observe(svg);
    return () => W;
  };
  // 一行放不下时缩小字号
  const fitFs = (s, base, avail) => Math.min(base, +(base * avail / Math.max(1, textW(s, base))).toFixed(2));
  const sub = (t) => h(`<div style="grid-column:1/-1;font-size:.84rem;color:${C.dark};border-bottom:.6px solid ${C.grid};margin-top:.3rem">${t}</div>`);

  // =====================================================================
  // 1. 上下文预算（例 7-1）
  // =====================================================================
  const BUDGET0 = { W: 200000, mails: 120, mailTok: 800, days: 30, evPerDay: 10, evTok: 60, todos: 200, todoTok: 50,
    turns: 10, turnTok: 2000, rules: 15000,
    contract: 800, rulesMin: 2000, adapters: 3, adapterTok: 500, meet: 6, sum: 3, sumTok: 150, overdue: 5,
    snip: 4, snipTok: 1000, fail: 600, rounds: 30 };
  // 颜色按类别对应：邮件、日历、待办、旧对话、规则与工具、代码、失败输出
  const CAT = { mail: C.dark, cal: C.rule, todo: C.mid, old: C.fill, rule: C.pale, code: "#fff", fail: C.grid };
  function budgetCalc(p) {
    const full = [["mail", "邮件", p.mails * p.mailTok], ["cal", "日历", p.days * p.evPerDay * p.evTok],
      ["todo", "待办", p.todos * p.todoTok], ["old", "旧对话", p.turns * p.turnTok], ["rule", "规则与工具", p.rules]];
    const mini = [["rule", "合同、规则与工具", p.contract + p.rulesMin + p.adapters * p.adapterTok],
      ["mail", "邮件摘要", p.sum * p.sumTok], ["cal", "今日会议", p.meet * p.evTok], ["todo", "逾期待办", p.overdue * p.todoTok],
      ["code", "代码片段", p.snip * p.snipTok], ["fail", "失败输出", p.fail]];
    const fullSum = full.reduce((s, x) => s + x[2], 0), miniSum = mini.reduce((s, x) => s + x[2], 0);
    return { full, mini, fullSum, miniSum, fullPct: fullSum / p.W, miniPct: miniSum / p.W,
      left: p.W - fullSum, leftMini: p.W - miniSum,
      fullCum: fullSum * p.rounds, miniCum: miniSum * p.rounds, ratio: fullSum / Math.max(1, miniSum) };
  }

  REG.c7budget = function (root) {
    const grid = frame(root, "动手试一试：上下文预算",
      "按例 7-1 的口径计算：全部加载 = 各类数据的“条数 × 每条 token”相加；累计输入 = 每轮 token × 轮数（每轮都重新发送全部上下文，不计前缀缓存）。默认值复现例 7-1。每条待办 50、每轮旧对话 2 000、每封邮件摘要 150、每个代码片段 1 000、合同 800、规则 2 000、每个 Adapter 的工具描述 500、失败输出 600 token，固定不变；今日会议与逾期待办分别沿用日历事件与待办的每条 token 数。");
    const p = Object.assign({}, BUDGET0);
    const Ws = [32000, 128000, 200000, 1000000];
    const wSel = select("上下文窗口 W", Ws.map((v) => [String(v), `${fmt(v, 0)} token`]), "200000");
    const S = (key, label, min, max, step, unit = "") => {
      const s = slider(label, min, max, step, p[key], (v) => `${fmt(v, 0)}${unit}`);
      s.key = key; return s;
    };
    const ctl = [
      S("mails", "邮件封数", 0, 500, 10, " 封"), S("mailTok", "每封邮件", 100, 3000, 50, " token"),
      S("days", "日历天数", 1, 90, 1, " 天"), S("evPerDay", "每天事件数", 0, 30, 1, " 个"),
      S("evTok", "每个事件", 20, 200, 10, " token"), S("todos", "待办条数", 0, 1000, 10, " 条"),
      S("turns", "旧对话轮数", 0, 50, 1, " 轮"), S("rules", "规则与工具描述", 2000, 50000, 1000, " token"),
    ];
    const ctlMini = [S("meet", "今日会议", 0, 20, 1, " 场"), S("sum", "邮件摘要", 0, 30, 1, " 封"),
      S("overdue", "逾期待办", 0, 30, 1, " 条"), S("snip", "相关代码片段", 0, 20, 1, " 个")];
    const rounds = S("rounds", "循环轮数", 1, 100, 1, " 轮");
    const price = slider("输入单价（假设，0 表示不换算）", 0, 15, 0.5, 0, (v) => (v ? `${v} 美元 / 百万 token` : "不换算"));
    grid.appendChild(sub("全部加载"));
    [wSel, ...ctl].forEach((c) => grid.appendChild(c.node));
    grid.appendChild(sub("最小工作集"));
    ctlMini.forEach((c) => grid.appendChild(c.node));
    grid.appendChild(sub("循环与费用"));
    [rounds, price].forEach((c) => grid.appendChild(c.node));

    root.appendChild(legend([["邮件 / 邮件摘要", CAT.mail], ["日历 / 今日会议", CAT.cal], ["待办", CAT.todo], ["旧对话", CAT.old],
      ["规则与工具", CAT.rule], ["代码片段", CAT.code], ["失败输出", CAT.fail], ["剩余空间", "transparent"]]));
    const H = 176, m = { l: 6, r: 6 };
    const svg = mkSvg(root, 520, H, "全部加载与最小工作集的窗口占用"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const getW = fitW(svg, () => H, () => update());

    function scene(r) {
      const W = getW(), Sc = [],xmax = Math.max(p.W, r.fullSum, r.miniSum) * 1.04, xs = linScale(0, xmax, m.l, W - m.r);
      const wx = xs(p.W), wl = `窗口 W = ${fmt(p.W, 0)}`, ww = textW(wl, 12.5);
      Sc.push(T("wl", wx + 6 + ww > W - 2 ? wx - 6 - ww : wx + 6, 16, wl, { "font-size": 12.5 }));
      const bh = 32;
      [["f", "全部加载", r.full, r.fullSum, r.fullPct, 52], ["m", "最小工作集", r.mini, r.miniSum, r.miniPct, 124]].forEach(([k, name, segs, sum, fr, y]) => {
        const over = sum > p.W;
        const tl = `${name}：${fmt(sum, 0)} token，占窗口 ${pct(fr)}%${over ? "（超出）" : ""}`;
        Sc.push(T(k + "n", m.l, y - 8, tl, { "font-size": fitFs(tl, 13, W - m.l - m.r), fill: over ? C.warn : C.ink }));
        let x = m.l; const labs = [];
        segs.forEach(([cat, lab, v], j) => {
          const w = Math.max(0, xs(v) - m.l);
          Sc.push(R(`${k}s${j}`, { x, y, width: w, height: bh, fill: CAT[cat], stroke: w > 0.5 ? C.line : "none", "stroke-width": .6 }));
          if (w > textW(lab, 11.5) + 8) labs.push(T(`${k}t${j}`, x + w / 2, y + bh / 2 + 5, lab,
            { "text-anchor": "middle", "font-size": 11.5, fill: cat === "mail" || cat === "cal" ? "#fff" : C.ink }));
          else labs.push(T(`${k}t${j}`, x + w / 2, y + bh / 2 + 5, "", {}));
          x += w;
        });
        // 剩余空间：从条形末端到窗口线
        const rw = Math.max(0, wx - x), rl = `剩余 ${fmt(Math.max(0, p.W - sum), 0)}`;
        Sc.push(R(k + "rest", { x: Math.min(x, wx), y: y + 1, width: rw, height: bh - 2, fill: "none", stroke: rw > 1 ? C.rule : "none", "stroke-dasharray": "3 3", "stroke-width": .8 }));
        Sc.push(T(k + "restt", Math.min(x, wx) + rw / 2, y + bh / 2 + 5, rw > textW(rl, 11.5) + 10 ? rl : "", { "text-anchor": "middle", "font-size": 11.5, fill: C.dark }));
        Sc.push(R(k + "box", { x: m.l, y, width: Math.max(0, x - m.l), height: bh, fill: "none", stroke: over ? C.warn : "none", "stroke-width": 2 }));
        Sc.push(...labs);
      });
      Sc.push(L("wline", { x1: wx, x2: wx, y1: 22, y2: H - 10, stroke: C.ink, "stroke-dasharray": "5 3", "stroke-width": 1.2 }));
      return Sc;
    }
    function update() {
      p.W = +wSel.get();
      [...ctl, ...ctlMini, rounds].forEach((c) => (p[c.key] = c.get()));
      const r = budgetCalc(p);
      anim(scene(r));
      const fullExpr = `${p.mails}×${p.mailTok} + ${p.days}×${p.evPerDay}×${p.evTok} + ${p.todos}×50 + ${p.turns}×2 000 + ${fmt(p.rules, 0)}`;
      const miniExpr = `800 + 2 000 + 3×500 + ${p.meet}×${p.evTok} + ${p.sum}×150 + ${p.overdue}×50 + ${p.snip}×1 000 + 600`;
      const pr = price.get();
      out.innerHTML =
        `全部加载 = ${fullExpr} = <b>${fmt(r.fullSum, 0)}</b> token，占窗口 ${fmt(r.fullSum, 0)} ÷ ${fmt(p.W, 0)} ≈ <b>${pct(r.fullPct)}%</b>；` +
        (r.left >= 0 ? `留给代码与测试输出的空间约 <b>${fmt(r.left, 0)}</b> token。`
                     : `<span class="warn">超出窗口 ${fmt(-r.left, 0)} token，放不下，只能截断或筛选。</span>`) +
        `<br>最小工作集 = ${miniExpr} = <b>${fmt(r.miniSum, 0)}</b> token，占窗口 ≈ <b>${pct(r.miniPct)}%</b>` +
        (r.leftMini >= 0 ? `。` : `，<span class="warn">也超出了窗口</span>。`) +
        `<br>${p.rounds} 轮累计输入：${fmt(r.fullSum, 0)} × ${p.rounds} = <b>${sci(r.fullCum)}</b> 与 ${fmt(r.miniSum, 0)} × ${p.rounds} ≈ <b>${sci(r.miniCum)}</b>，相差约 <b>${fmt(r.ratio, 1)}</b> 倍（未计缓存）。` +
        (pr ? `<br>按每百万输入 token ${pr} 美元换算：全部加载约 ${fmt(r.fullCum / 1e6 * pr, 2)} 美元，最小工作集约 ${fmt(r.miniCum / 1e6 * pr, 2)} 美元。` : "") +
        (p.W === 200000 && r.fullSum === 159000 && r.miniSum === 9960 ? `<br>与例 7-1 步骤 6～9 一致。` : "");
    }
    [wSel, ...ctl, ...ctlMini, rounds, price].forEach((c) => c.on(update));
    update();
  };

  // =====================================================================
  // 2. 重试与链路可靠性（例 7-3）
  // =====================================================================
  function retryCalc(q, m, Ln, det) {
    const step = det ? 0 : 1 - q ** m;
    let att = 0; for (let i = 0; i < m; i++) att += det ? 1 : q ** i;
    return { step, chain: step ** Ln, noRetry: det ? 0 : (1 - q) ** Ln, att };
  }

  REG.c7retry = function (root) {
    const grid = frame(root, "动手试一试：重试与链路可靠性",
      "单步最多尝试 m 次（即重试 m − 1 次），单次失败概率为 q，链路共 L 步、全部成功才算成功。暂时故障假设各次失败相互独立；确定性错误在代码和输入不变时每次都必然失败。默认取例 7-3 步骤 3～6 的数据：q = 0.05、m = 3、L = 10。");
    const q = slider("单次失败概率 q", 0.01, 0.5, 0.01, 0.05, (v) => v.toFixed(2));
    const mm = slider("每步最多尝试次数 m", 1, 6, 1, 3, (v) => `${v} 次（重试上限 ${v - 1} 次）`);
    const Ln = slider("链路步数 L", 1, 100, 1, 10, (v) => `${v} 步`);
    const kind = select("失败类型", [["tr", "暂时故障（各次独立）"], ["det", "确定性错误（每次必然失败）"]], "tr");
    [q, mm, Ln, kind].forEach((c) => grid.appendChild(c.node));
    root.appendChild(legend([["可重试：(1 − q<sup>m</sup>)<sup>L</sup>", C.accent], ["不重试：(1 − q)<sup>L</sup>", C.rule]]));
    const mg = { l: 50, r: 14, t: 14, b: 42 }, LMAX = 100, NP = 60, Hf = (w) => Math.round(Math.max(250, w * 0.5));
    const svg = mkSvg(root, 520, 260, "链路成功率随步数的变化"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const getW = fitW(svg, Hf, () => update());

    function scene(qv, m, Lv, det) {
      const S = [], W = getW(), H = Hf(W);
      const xs = linScale(1, LMAX, mg.l, W - mg.r), ys = linScale(0, 1, H - mg.b, mg.t);
      for (let i = 0; i <= 4; i++) { const v = i / 4, y = ys(v);
        S.push(L("gy" + i, { x1: mg.l, x2: W - mg.r, y1: y, y2: y, stroke: C.grid }));
        S.push(T("gyt" + i, mg.l - 6, y + 4, `${v * 100}%`, { "text-anchor": "end", "font-size": 11 })); }
      [1, 20, 40, 60, 80, 100].forEach((v) => { const x = xs(v);
        S.push(L("gx" + v, { x1: x, x2: x, y1: mg.t, y2: H - mg.b, stroke: C.grid }));
        S.push(T("gxt" + v, x, H - mg.b + 16, String(v), { "text-anchor": "middle", "font-size": 11 })); });
      S.push(R("frame", { x: mg.l, y: mg.t, width: W - mg.l - mg.r, height: H - mg.t - mg.b, fill: "none", stroke: C.line }));
      S.push(T("xl", (mg.l + W - mg.r) / 2, H - 6, "链路步数 L", { "text-anchor": "middle", "font-size": 12.5 }));
      const cy = (mg.t + H - mg.b) / 2;
      S.push(T("yl", 13, cy, "链路成功率", { "text-anchor": "middle", "font-size": 12.5, transform: `rotate(-90 13 ${cy})` }));
      const pts = (f) => { let s = ""; for (let i = 0; i < NP; i++) { const l = 1 + (LMAX - 1) * i / (NP - 1); s += `${xs(l).toFixed(2)},${ys(f(l)).toFixed(2)} `; } return s.trim(); };
      const r = retryCalc(qv, m, 1, det);
      S.push({ k: "cn", tag: "polyline", a: { points: pts((l) => (det ? 0 : (1 - qv) ** l)), fill: "none", stroke: C.rule, "stroke-width": 2, "stroke-dasharray": "6 3" } });
      S.push({ k: "cr", tag: "polyline", a: { points: pts((l) => r.step ** l), fill: "none", stroke: C.accent, "stroke-width": 2.4 } });
      // 当前 L 的标记与两个数值
      const R0 = retryCalc(qv, m, Lv, det), x = xs(Lv);
      S.push(L("mk", { x1: x, x2: x, y1: mg.t, y2: H - mg.b, stroke: C.ink, "stroke-dasharray": "3 3" }));
      let ya = ys(R0.chain), yb = ys(R0.noRetry);
      S.push({ k: "pa", tag: "circle", a: { cx: x, cy: ya, r: 5, fill: C.accent, stroke: "#fff", "stroke-width": 1.5 } });
      S.push({ k: "pb", tag: "circle", a: { cx: x, cy: yb, r: 5, fill: C.rule, stroke: "#fff", "stroke-width": 1.5 } });
      const la = `${(R0.chain * 100).toFixed(R0.chain > 0.99 ? 2 : 1)}%`, lb = `${(R0.noRetry * 100).toFixed(1)}%`;
      // 两个标签的纵向避让：保持至少 17 个单位的间距，可重试的在上
      let ta = ya - 8, tb = yb - 8;
      if (tb - ta < 17) { const mid = (ta + tb) / 2; ta = mid - 8.5; tb = mid + 8.5; }
      ta = Math.max(mg.t + 13, Math.min(ta, H - mg.b - 21)); tb = Math.max(ta + 17, Math.min(tb, H - mg.b - 4));
      const wa = Math.max(textW(la, 12.5), textW(lb, 12.5)), right = x + 10 + wa > W - mg.r - 4;
      const tx = right ? x - 10 - wa : x + 10;
      S.push(T("la", tx, ta, la, Object.assign({ fill: C.accent, "font-size": 12.5 }, HALO)));
      S.push(T("lb", tx, tb, lb, Object.assign({ fill: C.dark, "font-size": 12.5 }, HALO)));
      return S;
    }
    function update() {
      const qv = q.get(), m = mm.get(), Lv = Ln.get(), det = kind.get() === "det";
      q.node.style.opacity = det ? 0.45 : 1;
      anim(scene(qv, m, Lv, det));
      const r = retryCalc(qv, m, Lv, det);
      const attTerms = Array.from({ length: m }, (_, i) => (i === 0 ? "1" : i === 1 ? `${qv}` : `${qv}<sup>${i}</sup>`)).join(" + ");
      if (det) {
        out.innerHTML = `<span class="warn">确定性错误：重试不会改变结果</span>。单步成功率 1 − 1<sup>${m}</sup> = <b>0</b>，链路成功率恒为 <b>0</b>；` +
          `每步都把 ${m} 次尝试用完，成本变成不重试的 <b>${m}</b> 倍。应改代码或换假设，而不是原样重跑（例 7-3 步骤 2）。`;
        return;
      }
      out.innerHTML =
        `单步成功率 1 − q<sup>m</sup> = 1 − ${qv}<sup>${m}</sup> = <b>${trim(r.step, 6)}</b>；` +
        `${Lv} 步链路：可重试 (1 − q<sup>m</sup>)<sup>L</sup> = ${trim(r.step, 6)}<sup>${Lv}</sup> ≈ <b>${trim(r.chain, r.chain > 0.99 ? 5 : 3)}</b>，` +
        `不重试 (1 − q)<sup>L</sup> = ${trim(1 - qv, 2)}<sup>${Lv}</sup> ≈ <b>${trim(r.noRetry, 3)}</b>。` +
        `<br>每步平均尝试次数 1 + q + … + q<sup>m−1</sup> = ${attTerms} = <b>${trim(r.att, 4)}</b> 次，即调用量只多 ${pct(r.att - 1)}%。` +
        (m === 1 ? `<br>m = 1 表示不重试，两条曲线重合。` : "") +
        (qv === 0.05 && m === 3 && Lv === 10 ? `<br>与例 7-3 步骤 3～6 一致（0.599、0.999875、≈0.99875、1.0525）。` : "");
    }
    [q, mm, Ln, kind].forEach((c) => c.on(update));
    update();
  };

  // =====================================================================
  // 3. 端 / 边执行时间（例 7-5）
  // =====================================================================
  const EDGE0 = { N: 8e9, bits: 4, tin: 4000, tout: 300, pBw: 60e9, pF: 5e12, eBw: 1e12, eF: 1e14, net: 20e6, rtt: 0.1, att: 0, bpt: 4 };
  function edgeCalc(s) {
    const wB = s.N * s.bits / 8;                       // 式 4-1
    const flops = 2 * s.N * s.tin;
    const phone = { pre: flops / s.pF, dec: s.tout / (s.pBw / wB) };
    phone.total = phone.pre + phone.dec;
    const edge = { up: (s.tin * s.bpt + s.att * 1e6) * 8 / s.net, rtt: s.rtt, pre: flops / s.eF, dec: s.tout / (s.eBw / wB) };
    edge.total = edge.up + edge.rtt + edge.pre + edge.dec;
    return { wB, flops, phone, edge, pSpeed: s.pBw / wB, eSpeed: s.eBw / wB };
  }
  const sec = (v) => (v < 0.1 ? trim(v, 3) : v < 10 ? trim(v, 2) : trim(v, 1));

  REG.c7edge = function (root) {
    const grid = frame(root, "动手试一试：同一步骤放在端侧还是边缘",
      "按例 7-5 的口径估算：权重字节 = N × b ÷ 8（式 4-1）；预填充 = 2 × N × 输入 token ÷ 有效算力（下面的“算力”均指有效算力）；解码 = 输出 token ÷（带宽 ÷ 权重字节）；上传 = 字节 × 8 ÷ 网速，文本每 token 约 4 字节。GB 按 10⁹ 字节、TB 按 10¹² 字节计。未计模型装载、排队与回传结果的时间。");
    const preset = h(`<div class="w-tabs"><button class="on" data-p="text">例 7-5：纯文本</button><button data-p="att">例 7-5：带 20 MB 附件</button></div>`);
    root.insertBefore(preset, grid);
    const sizes = [0.5, 1, 1.5, 3, 7, 8, 13, 14, 32];
    const nets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const N = slider("参数量 N", 0, sizes.length - 1, 1, 5, (v) => `${sizes[v]}B（${sizes[v]}×10⁹）`);
    const bits = select("量化位数 b", [["4", "4 位"], ["8", "8 位"], ["16", "16 位（BF16）"]], "4");
    const tin = slider("输入 token 数", 500, 32000, 500, 4000, (v) => fmt(v, 0));
    const tout = slider("输出 token 数", 50, 2000, 50, 300, (v) => fmt(v, 0));
    const pBw = slider("手机内存带宽", 20, 200, 5, 60, (v) => `${v} GB/s`);
    const pF = slider("手机 NPU 算力", 1, 30, 0.5, 5, (v) => `${v}×10¹² FLOP/s`);
    const eBw = slider("边缘显存带宽", 0.5, 5, 0.1, 1, (v) => `${trim(v, 1)} TB/s`);
    const eF = slider("边缘 GPU 算力", 10, 500, 10, 100, (v) => `${v}×10¹² FLOP/s`);
    const net = slider("上行网速", 0, nets.length - 1, 1, 4, (v) => `${nets[v]} Mbit/s`);
    const rtt = slider("往返时延", 0, 500, 10, 100, (v) => `${trim(v / 1000, 2)} s`);
    const att = slider("附件大小", 0, 100, 1, 0, (v) => (v ? `${v} MB` : "无"));
    const priv = checkbox("含不允许离开设备的数据（如邮件正文）", false);
    grid.appendChild(sub("模型与任务"));
    [N, bits, tin, tout].forEach((c) => grid.appendChild(c.node));
    grid.appendChild(sub("硬件（假设）"));
    [pBw, pF, eBw, eF].forEach((c) => grid.appendChild(c.node));
    grid.appendChild(sub("网络与数据"));
    [net, rtt, att, priv].forEach((c) => grid.appendChild(c.node));

    const COL = { pre: C.dark, dec: C.mid, up: C.pale, rtt: C.grid };
    root.appendChild(legend([["预填充（受算力限制）", COL.pre], ["解码（受带宽限制）", COL.dec], ["上传", COL.up], ["往返时延", COL.rtt]]));
    const H = 200, m = { l: 6, r: 10, b: 34 };
    const svg = mkSvg(root, 520, H, "端侧与边缘的执行时间"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    const getW = fitW(svg, () => H, () => update());

    const NAME = { pre: "预填充", dec: "解码", up: "上传", rtt: "往返时延" };
    const why = { pre: "算力", dec: "带宽", up: "网速", rtt: "时延" };
    const bottleneck = (o, keys) => keys.reduce((a, k) => (o[k] > o[a] ? k : a), keys[0]);

    function scene(r, isPriv) {
      const W = getW(), S = [], xmax = Math.max(r.phone.total, r.edge.total) * 1.04, xs = linScale(0, xmax, m.l, W - m.r), bh = 34;
      const rows = [["p", "手机（端侧）", r.phone, ["pre", "dec"], 34, false], ["e", "边缘服务器", r.edge, ["up", "rtt", "pre", "dec"], 106, isPriv]];
      rows.forEach(([k, name, o, keys, y, off]) => {
        const bn = bottleneck(o, keys);
        const title = off ? `${name}：不可用（数据不能离开设备）` : `${name}：合计 ${sec(o.total)} s，瓶颈是${NAME[bn]}（${why[bn]}）`;
        S.push(T(k + "n", m.l, y - 8, title, { "font-size": fitFs(title, 13, W - m.l - m.r), fill: off ? C.warn : C.ink }));
        let x = m.l; const labs = [];
        keys.forEach((key) => {
          const w = Math.max(0, xs(o[key]) - m.l), lab = `${sec(o[key])} s`;
          S.push(R(k + key, { x, y, width: w, height: bh, fill: COL[key], stroke: w > 0.5 ? C.line : "none", "stroke-width": .6, "fill-opacity": off ? 0.25 : 1, "stroke-opacity": off ? 0.3 : 1 }));
          labs.push(T(k + key + "t", x + w / 2, y + bh / 2 + 5, w > textW(lab, 11.5) + 8 ? lab : "",
            { "text-anchor": "middle", "font-size": 11.5, fill: key === "pre" ? "#fff" : C.ink, "fill-opacity": off ? 0.35 : 1 }));
          x += w;
        });
        S.push(...labs);
      });
      // 横轴（秒）
      const step = Math.pow(10, Math.floor(Math.log10(xmax / 5)));
      const st = [1, 2, 5, 10].map((v) => v * step).find((v) => xmax / v <= 6);
      const ya = H - m.b;
      S.push(L("ax", { x1: m.l, x2: W - m.r, y1: ya, y2: ya, stroke: C.line }));
      for (let v = 0; v <= xmax + 1e-9; v += st) { const x = xs(v), key = String(Math.round(v * 1000));
        S.push(L("tk" + key, { x1: x, x2: x, y1: ya, y2: ya + 4, stroke: C.line }));
        S.push(T("tt" + key, x, ya + 17, trim(v, Math.max(0, -Math.floor(Math.log10(st) + 1e-9))), { "text-anchor": v === 0 ? "start" : "middle", "font-size": 11 })); }
      S.push(T("axl", W - m.r, H - 2, "时间 / s", { "text-anchor": "end", "font-size": 11.5 }));
      return S;
    }
    function params() {
      return { N: sizes[N.get()] * 1e9, bits: +bits.get(), tin: tin.get(), tout: tout.get(), pBw: pBw.get() * 1e9, pF: pF.get() * 1e12,
        eBw: eBw.get() * 1e12, eF: eF.get() * 1e12, net: nets[net.get()] * 1e6, rtt: rtt.get() / 1000, att: att.get(), bpt: 4 };
    }
    function update() {
      const s = params(), r = edgeCalc(s), isPriv = priv.get();
      anim(scene(r, isPriv));
      const nB = sizes[N.get()], P = r.phone, E = r.edge;
      out.innerHTML =
        `权重字节 = ${nB}×10⁹ × ${s.bits} ÷ 8 = <b>${sci(r.wB)}</b> B；预填充计算量 = 2 × ${nB}×10⁹ × ${fmt(s.tin, 0)} = ${sci(r.flops)} FLOP。` +
        `<br>手机：预填充 ${sci(r.flops)} ÷ (${sci(s.pF)}) = ${sec(P.pre)} s；解码 ${s.tout} ÷ [${sci(s.pBw)} ÷ (${sci(r.wB)})] = ${s.tout} ÷ ${fmt(r.pSpeed, 1)} token/s = ${sec(P.dec)} s；合计 <b>${sec(P.total)} s</b>。` +
        `<br>边缘：上传 ${sec(E.up)} s${s.att ? `（含 ${s.att} MB 附件）` : ""} + 往返 ${sec(E.rtt)} s + 预填充 ${sec(E.pre)} s + 解码 ${sec(E.dec)} s（速度上限 ${fmt(r.eSpeed, 0)} token/s）≈ <b>${sec(E.total)} s</b>。` +
        (isPriv ? `<br><span class="warn">含不可外传数据：无论快慢都只能在端侧处理，或先在端侧脱敏、只上传摘要。</span>时延估算决定“快不快”，数据驻留和授权决定“能不能”。`
          : `<br>${E.total < P.total ? `边缘快约 <b>${fmt(P.total / E.total, 1)}</b> 倍` : `<span class="ok">端侧更快</span>，约 ${fmt(E.total / P.total, 1)} 倍`}` +
            (E.up > E.pre + E.dec ? `；传输时间已成为边缘方案的主导项。` : `。`));
    }
    [N, bits, tin, tout, pBw, pF, eBw, eF, net, rtt, att, priv].forEach((c) => c.on(update));
    preset.addEventListener("click", (e) => {
      const pp = e.target.dataset.p; if (!pp) return;
      preset.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target));
      N.set(5); bits.set("4"); tin.set(4000); tout.set(300); pBw.set(60); pF.set(5); eBw.set(1); eF.set(100); net.set(4); rtt.set(100);
      att.set(pp === "att" ? 20 : 0); priv.set(false);
      update();
    });
    update();
  };

  // =====================================================================
  // 数值自检
  // =====================================================================
  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => {
    const b = budgetCalc(BUDGET0);
    const r1 = retryCalc(0.2, 3, 1, false), r2 = retryCalc(0.2, 3, 1, true), r3 = retryCalc(0.05, 3, 10, false), rd = retryCalc(0.05, 3, 10, true);
    const e = edgeCalc(EDGE0), ea = edgeCalc(Object.assign({}, EDGE0, { att: 20 }));
    return [
      ["例 7-1 步骤 1 全部邮件", b.full[0][2], 96000, 0],
      ["例 7-1 步骤 2 30 天日历", b.full[1][2], 18000, 0],
      ["例 7-1 步骤 3 全部待办", b.full[2][2], 10000, 0],
      ["例 7-1 步骤 4 旧对话", b.full[3][2], 20000, 0],
      ["例 7-1 步骤 6 全部加载合计", b.fullSum, 159000, 0],
      ["例 7-1 步骤 6 占窗口", b.fullPct, 0.795, 1e-9],
      ["例 7-1 结论 剩余空间约 4.1×10⁴", b.left, 41000, 0],
      ["例 7-1 步骤 7 最小工作集", b.miniSum, 9960, 0],
      ["例 7-1 步骤 8 最小工作集占比 ≈5%", b.miniPct, 0.05, 0.001],
      ["例 7-1 步骤 9 全部加载 30 轮累计", b.fullCum, 4.77e6, 1],
      ["例 7-1 步骤 9 最小工作集 30 轮累计 ≈3.0×10⁵", b.miniCum, 3.0e5, 2000],
      ["例 7-1 结论 相差约 16 倍", b.ratio, 16, 0.1],
      ["例 7-3 步骤 1 q=0.2、m=3 单步成功率", r1.step, 0.992, 1e-9],
      ["例 7-3 步骤 2 确定性错误成功率", r2.step, 0, 0],
      ["例 7-3 步骤 3 10 步链路不重试", r3.noRetry, 0.599, 0.0005],
      ["例 7-3 步骤 4 每步成功率（可重试）", r3.step, 0.999875, 1e-9],
      ["例 7-3 步骤 5 10 步链路可重试 ≈0.99875", r3.chain, 0.99875, 0.00001],
      ["例 7-3 步骤 6 每步平均尝试次数", r3.att, 1.0525, 1e-9],
      ["例 7-3 结论 确定性错误成本 3 倍", rd.att, 3, 0],
      ["例 7-3 结论 确定性错误链路成功率", rd.chain, 0, 0],
      ["例 7-5 步骤 1 权重字节数", e.wB, 4e9, 0],
      ["例 7-5 步骤 2 预填充计算量", e.flops, 6.4e13, 1],
      ["例 7-5 步骤 3 手机预填充 / s", e.phone.pre, 12.8, 1e-9],
      ["例 7-5 步骤 4 手机解码速度 / (token/s)", e.pSpeed, 15, 1e-9],
      ["例 7-5 步骤 5 手机解码 / s", e.phone.dec, 20, 1e-9],
      ["例 7-5 步骤 6 手机合计 / s", e.phone.total, 32.8, 1e-9],
      ["例 7-5 步骤 7 边缘预填充 / s", e.edge.pre, 0.64, 1e-9],
      ["例 7-5 步骤 8 边缘解码 / s", e.edge.dec, 1.2, 1e-9],
      ["例 7-5 步骤 8 边缘速度上限 / (token/s)", e.eSpeed, 250, 1e-9],
      ["例 7-5 步骤 9 上传文本 ≈0.006 s", e.edge.up, 0.006, 0.0005],
      ["例 7-5 步骤 10 边缘合计 ≈1.95 s", e.edge.total, 1.95, 0.005],
      ["例 7-5 步骤 11 带 20 MB 附件 ≈9.95 s", ea.edge.total, 9.95, 0.005],
      ["例 7-5 结论 优势缩小到约 3.3 倍", e.phone.total / ea.edge.total, 3.3, 0.05],
    ];
  });
})();


/* ===== ch8.js ===== */
/* 第 8 章交互组件：全量历史 vs 记忆检索的成本、三信号检索打分（Generative Agents）、遗忘曲线（MemoryBank）
   公式与正文一致：式（4-x）eq:kv、预填充 2NT、式 c8:eq:ga、式 c8:eq:forget；默认值复现例 8-1、例 8-3、例 8-4，预设含习题 8.7、8.8。 */
// AFTER: c8:ex:fullhist -> c8cost
// AFTER: c8:ex:ga -> c8ga
// AFTER: c8:fig:forget -> c8forget
(function () {
  "use strict";
  const { C, HALO, textW, h, GB, L, R, T, animator, slider, select, frame, mkSvg, linScale, REG } = window.BookW;
  const BookW = window.BookW;

  // ---------- 通用小工具 ----------
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", SUB = "₀₁₂₃₄₅₆₇₈₉";
  const sup = (n) => String(n).replace(/\d/g, (d) => SUP[d]).replace("-", "⁻");
  const sub = (n) => String(n).replace(/\d/g, (d) => SUB[d]);
  const sp = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");   // 131 072
  const sci = (v) => {                                                           // 4 × 10¹⁴
    const e = Math.floor(Math.log10(v) + 1e-9), m = v / 10 ** e;
    return (Math.abs(m - 1) < 1e-9 ? "" : `${+m.toFixed(2)} × `) + `10${sup(e)}`;
  };
  const f2 = (v) => (v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));   // 15.7、0.54
  const sig3 = (v) => (v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toPrecision(3));
  const sec = (v) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : v.toFixed(3));
  const niceCeil = (v) => { if (!(v > 0)) return 1; const e = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].map((f) => f * e).find((x) => x >= v - 1e-12); };
  const tabs = (items) => h(`<div class="w-tabs">${items.map(([k, t], i) => `<button data-p="${k}"${i ? "" : ' class="on"'}>${t}</button>`).join("")}</div>`);
  // 视图宽度：桌面按固定宽度整体缩放（与第 4 章一致）；窄屏改用实际像素宽度重新排版，字不会被缩得太小
  const fitW = (svg, max, min = 300) => Math.round(Math.max(min, Math.min(max, svg.getBoundingClientRect().width || max)));
  const onResize = (svg, f) => { let w0 = 0; window.addEventListener("resize", () => { const w = svg.getBoundingClientRect().width; if (Math.abs(w - w0) > 2) { w0 = w; f(); } }); };
  const markTab = (box, btn) => box.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn));

  // =====================================================================
  // 1. 全量历史 vs 记忆检索：成本（例 8-1）
  // =====================================================================
  const M8 = {
    m8: { name: "8B（例 8-1）", N: 8e9, L: 32, H: 8, d: 128 },
    m70: { name: "70B", N: 70e9, L: 80, H: 8, d: 128 },
  };
  const HS = [1, 2, 4, 8, 16, 32, 64], DS = [64, 128, 256], TBS = [512, 1024, 2048, 4096, 8192, 16384, 32768];
  // 纯计算。s: N 参数量, L 层数, H KV 头数, d 每头维度, bk KV 每元素字节, chars 历史汉字数, ratio token/字,
  //           tokB 乙每次请求的 token 数, mem 显存 GB, flops 有效算力 FLOP/s；权重按 BF16（2 字节/参数）
  function costCalc(s) {
    const perTok = 2 * s.L * s.H * s.d * s.bk;            // 式 eq:kv，T = 1、B = 1
    const tA = s.chars * s.ratio, tB = s.tokB;
    const kvA = tA * perTok, kvB = tB * perTok;
    const wBytes = 2 * s.N, free = s.mem * GB - wBytes;
    const nA = free > 0 ? Math.floor(free / kvA) : 0, nB = free > 0 ? Math.floor(free / kvB) : 0;
    const pA = 2 * s.N * tA / s.flops, pB = 2 * s.N * tB / s.flops;
    return { perTok, tA, tB, kvA, kvB, wBytes, free, nA, nB, pA, pB, ratioKV: kvA / kvB };
  }
  const EX81 = { N: 8e9, L: 32, H: 8, d: 128, bk: 2, chars: 2e5, ratio: 0.6, tokB: 4096, mem: 80, flops: 4e14 };

  function c8cost(root) {
    const grid = frame(root, "动手试一试：全量历史与记忆检索的代价",
      "按例 8-1 比较两种做法：（甲）每次请求带上全部聊天记录；（乙）只带记忆系统检索出的条目，连同系统指令和当前对话。KV 缓存按第 4 章式（4-7）计算，预填充时间按“每 token 2N 次浮点运算 ÷ 有效算力”估算（未计注意力随长度平方增长的部分）；权重按 BF16 计，可用显存 = 显存 − 权重，未计运行时开销。");
    const model = select("模型（决定参数量 N 与默认结构）", Object.entries(M8).map(([k, v]) => [k, v.name]), "m8");
    const Ls = slider("层数 L", 8, 128, 8, 32, (v) => `${v}`);
    const Hs = slider("KV 头数 H<sub>KV</sub>", 0, HS.length - 1, 1, 3, (v) => `${HS[v]}`);
    const Ds = slider("每头维度 d<sub>head</sub>", 0, DS.length - 1, 1, 1, (v) => `${DS[v]}`);
    const kp = select("KV 缓存精度", [["2", "BF16（2 字节）"], ["1", "FP8（1 字节）"], ["0.5", "INT4（0.5 字节）"]], "2");
    const ch = slider("甲：历史汉字数", 1, 100, 1, 20, (v) => `${v} 万字`);
    const ra = slider("汉字→token 系数", 0.6, 1.0, 0.05, 0.6, (v) => `${v.toFixed(2)} token/字`);
    const tb = slider("乙：每次请求的 token 数", 0, TBS.length - 1, 1, 3, (v) => `${sp(TBS[v])}`);
    const mem = select("显存", [["24", "24 GB"], ["48", "48 GB"], ["80", "80 GB（例 8-1）"], ["141", "141 GB"], ["160", "2 × 80 GB"], ["640", "8 × 80 GB"]], "80");
    const fl = slider("有效算力", 1, 20, 0.5, 4, (v) => `${+v.toFixed(1)} × 10¹⁴ FLOP/s`);
    const ctrls = [model, Ls, Hs, Ds, kp, ch, ra, tb, mem, fl];
    ctrls.forEach((c) => grid.appendChild(c.node));
    const m = { l: 96, r: 14, t: 6 };
    let W = 560, PH = 82;
    const svg = mkSvg(root, W, m.t + 3 * PH, "两种做法的 KV 缓存、并发数与预填充时间"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);

    function scene(s, r) {
      const S = [];
      W = fitW(svg, 560);
      const narrow = W < 480;
      PH = narrow ? 98 : 82;
      svg.setAttribute("viewBox", `0 0 ${W} ${m.t + 3 * PH}`);
      const panels = [
        ["kv", "单个请求的 KV 缓存 / GB", r.kvA / GB, r.kvB / GB, (v) => `${f2(v)} GB`],
        ["n", "可同时容纳的请求数（向下取整）", r.nA, r.nB, (v) => `${sp(v)} 个`],
        ["p", "每次提问的预填充时间 / s", r.pA, r.pB, (v) => `${sec(v)} s`],
      ];
      panels.forEach(([key, title, a, b, lab], pi) => {
        const y0 = m.t + pi * PH, max = niceCeil(Math.max(a, b) * 1.3), xs = linScale(0, max, m.l, W - m.r);
        S.push(T(key + "t", 2, y0 + 14, title, { "font-size": 12.5 }));
        if (key === "kv") {
          const ft = r.free > 0 ? `虚线：可用显存 ${sp(r.free / GB)} GB` : "权重已超过显存";
          S.push(narrow ? T("kvf", m.l, y0 + 88, ft, { "font-size": 11.5, fill: C.warn })
                        : T("kvf", W - m.r, y0 + 14, ft, { "text-anchor": "end", "font-size": 11.5, fill: C.warn }));
        }
        const vals = [];
        [["a", "甲 全部历史", a, C.dark], ["b", "乙 检索记忆", b, C.pale]].forEach(([rk, name, v, col], j) => {
          const y = y0 + 24 + j * 25, bh = 19, w = Math.max(0, xs(v) - m.l);
          S.push(T(key + rk + "n", m.l - 8, y + bh / 2 + 5, name, { "text-anchor": "end", "font-size": 12 }));
          S.push(R(key + rk, { x: m.l, y, width: w, height: bh, fill: col, stroke: w > 0.5 ? C.line : "none", "stroke-width": 0.6 }));
          const bad = (key === "n" && v === 0) || (key === "kv" && r.free > 0 && v * GB > r.free) || (key === "kv" && r.free <= 0);
          const txt = key === "n" && v === 0 ? "0 个（放不下）" : lab(v);
          vals.push(T(key + rk + "v", m.l + w + 6, y + bh / 2 + 5, txt, Object.assign({ "font-size": 12, fill: bad ? C.warn : C.ink }, HALO)));
        });
        S.push(L(key + "ax", { x1: m.l, x2: m.l, y1: y0 + 20, y2: y0 + 72, stroke: C.line }));
        if (key === "kv" && r.free > 0 && r.free / GB <= max) {
          const x = xs(r.free / GB);
          S.push(L("kvfl", { x1: x, x2: x, y1: y0 + 20, y2: y0 + 72, stroke: C.warn, "stroke-dasharray": "4 3", "stroke-width": 1.2 }));
        }
        S.push(...vals);
      });
      return S;
    }
    function state() {
      return { N: M8[model.get()].N, L: Ls.get(), H: HS[Hs.get()], d: DS[Ds.get()], bk: +kp.get(),
        chars: ch.get() * 1e4, ratio: ra.get(), tokB: TBS[tb.get()], mem: +mem.get(), flops: fl.get() * 1e14 };
    }
    function update() {
      const s = state(), r = costCalc(s);
      anim(scene(s, r));
      const bk = s.bk === 0.5 ? "0.5" : String(s.bk), Nt = sci(s.N), Ft = sci(s.flops);
      let o = `每 token 的 KV 缓存 = 2 × ${s.L} × ${s.H} × ${s.d} × ${bk} = <b>${sp(r.perTok)}</b> 字节。<br>` +
        `甲：T = ${ch.get()} 万字 × ${s.ratio.toFixed(2)} = ${sp(r.tA)} token，KV 缓存 = ${sp(r.tA)} × ${sp(r.perTok)} ≈ <b>${f2(r.kvA / GB)} GB</b>；` +
        `乙：${sp(r.tB)} × ${sp(r.perTok)} ≈ <b>${f2(r.kvB / GB)} GB</b>，甲是乙的 ${r.ratioKV >= 10 ? r.ratioKV.toFixed(0) : r.ratioKV.toFixed(1)} 倍。<br>`;
      if (r.free <= 0) o += `<span class="warn">BF16 权重 ${sp(r.wBytes / GB)} GB 已超过显存 ${s.mem} GB</span>，两种做法都无法部署，需要更大的显存或多卡切分。<br>`;
      else o += `可用显存 = ${s.mem} − ${sp(r.wBytes / GB)} = ${sp(r.free / GB)} GB：甲 ${sp(r.free / GB)} ÷ ${sig3(r.kvA / GB)} → <b>${r.nA}</b> 个；乙 ${sp(r.free / GB)} ÷ ${sig3(r.kvB / GB)} → <b>${sp(r.nB)}</b> 个。` +
        (r.nA === 0 ? `<span class="warn">甲连一个请求的 KV 缓存都放不下。</span>` : "") + "<br>";
      o += `预填充：甲 2 × ${Nt} × ${sp(r.tA)} ÷ (${Ft}) ≈ <b>${sec(r.pA)} s</b>；乙 2 × ${Nt} × ${sp(r.tB)} ÷ (${Ft}) ≈ <b>${sec(r.pB)} s</b>，每次提问多等约 ${sec(r.pA - r.pB)} s。`;
      if (r.tA > 131072) o += `<br><span class="warn">甲的 ${sp(r.tA)} token 已超过 128K（131 072 token）窗口</span>，许多模型根本放不进去（见表 8-1）。`;
      out.innerHTML = o;
    }
    // 标签里有下标，slider 用 innerHTML 生成，这里无需额外处理
    ctrls.forEach((c) => c.on(update));
    onResize(svg, update);
    model.on(() => { const M = M8[model.get()]; Ls.set(M.L); Hs.set(HS.indexOf(M.H)); Ds.set(DS.indexOf(M.d)); update(); });
    update();
  }

  // =====================================================================
  // 2. 三信号检索打分（例 8-3、习题 8.7）
  // =====================================================================
  // 纯计算：cands [{imp, h, sim}]，w {rec, imp, rel}，decay 衰减因子
  function gaScore(cands, w, decay) {
    const raw = { rec: cands.map((c) => decay ** c.h), imp: cands.map((c) => c.imp), rel: cands.map((c) => c.sim) };
    const flat = {};
    const norm = (k) => {
      const xs = raw[k], lo = Math.min(...xs), hi = Math.max(...xs), d = hi - lo;
      flat[k] = !(d > 1e-12);
      return xs.map((x) => (d > 1e-12 ? (x - lo) / d : 0));
    };
    const n = { rec: norm("rec"), imp: norm("imp"), rel: norm("rel") };
    const rows = cands.map((c, i) => {
      const part = { rec: w.rec * n.rec[i], imp: w.imp * n.imp[i], rel: w.rel * n.rel[i] };
      return { i, raw: { rec: raw.rec[i], imp: raw.imp[i], rel: raw.rel[i] }, n: { rec: n.rec[i], imp: n.imp[i], rel: n.rel[i] }, part,
        total: part.rec + part.imp + part.rel };
    });
    const order = rows.slice().sort((a, b) => b.total - a.total || a.i - b.i).map((r) => r.i);
    return { rows, order, flat };
  }
  const GA_PRESETS = {
    ex: { w: [1, 1, 1], c: [["m₁ 派对计划", 8, 20, 0.82], ["m₂ 吃了吐司", 1, 1, 0.35], ["m₃ Klaus 的论文", 5, 100, 0.60]] },
    q1: { w: [1, 1, 1], c: [["a", 3, 2, 0.9], ["b", 9, 48, 0.5], ["c", 6, 10, 0.7]] },
    q2: { w: [1, 3, 1], c: [["a", 3, 2, 0.9], ["b", 9, 48, 0.5], ["c", 6, 10, 0.7]] },
  };
  const toCands = (p) => p.c.map(([name, imp, hh, sim]) => ({ name, imp, h: hh, sim }));

  function c8ga(root) {
    const grid = frame(root, "动手试一试：三信号检索打分",
      "按式（8-3）给候选记忆打分：新近性取衰减因子的 Δh 次方（Δh 为距上次访问的小时数），重要性为 1～10 的整数，相关性为与查询的余弦相似度；三项各自在候选集合内做最小—最大归一化后加权求和。选中一条候选后可改它的三个数，也可以增删候选，看条形如何换位。");
    const preset = tabs([["ex", "例 8-3"], ["q1", "习题 8.7（1）"], ["q2", "习题 8.7（2）重要性权重 3"]]);
    root.insertBefore(preset, grid);
    const pick = h(`<div class="w-tabs"></div>`);
    root.insertBefore(pick, grid);
    const sImp = slider("重要性", 1, 10, 1, 8, (v) => `${v}`);
    const sH = slider("距上次访问 Δh", 0, 300, 1, 20, (v) => `${v} 小时`);
    const sSim = slider("相似度", 0, 1, 0.01, 0.82, (v) => v.toFixed(2));
    const wRec = slider("新近性权重 α<sub>rec</sub>", 0, 3, 0.1, 1, (v) => v.toFixed(1));
    const wImp = slider("重要性权重 α<sub>imp</sub>", 0, 3, 0.1, 1, (v) => v.toFixed(1));
    const wRel = slider("相关性权重 α<sub>rel</sub>", 0, 3, 0.1, 1, (v) => v.toFixed(1));
    const dec = slider("衰减因子", 0.95, 0.999, 0.001, 0.995, (v) => v.toFixed(3));
    [sImp, sH, sSim, wRec, wImp, wRel, dec].forEach((c) => grid.appendChild(c.node));
    const bh = 22, gap = 10;
    let W = 600, m = {};
    const svg = mkSvg(root, W, 200, "候选记忆的加权总分"), anim = animator(svg);
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    let cands = [], sel = 0, uid = 0;
    const load = (p) => { cands = toCands(GA_PRESETS[p]).map((c) => Object.assign(c, { id: uid++ })); sel = 0;
      const w = GA_PRESETS[p].w; wRec.set(w[0]); wImp.set(w[1]); wRel.set(w[2]); dec.set(0.995); };

    function drawPick() {
      pick.innerHTML = `<span style="align-self:center;font-size:.86rem">编辑：</span>` +
        cands.map((c, i) => `<button data-i="${i}"${i === sel ? ' class="on"' : ""}>${c.name.split(" ")[0]}</button>`).join("") +
        (cands.length < 6 ? `<button data-a="add">＋ 增加候选</button>` : "") +
        (cands.length > 2 ? `<button data-a="del">删除当前</button>` : "");
      const c = cands[sel]; sImp.set(c.imp); sH.set(c.h); sSim.set(c.sim);
    }
    function scene(res, w) {
      const S = [], n = cands.length, sumW = Math.max(w.rec + w.imp + w.rel, 0.1);
      W = fitW(svg, 600);
      const narrow = W < 480, top = narrow ? 18 : 0;           // 窄屏：名字放到条形上方
      m = narrow ? { l: 10, r: 56, t: 52, b: 26 } : { l: 150, r: 60, t: 34, b: 26 };
      const rowH = top + bh + gap, H = m.t + n * rowH - gap + m.b;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const xs = linScale(0, sumW, m.l, W - m.r);
      let lx = m.l;
      [["新近性", C.dark], ["重要性", C.mid], ["相关性", C.pale]].forEach(([t, c], i) => {
        S.push(R("lg" + i, { x: lx, y: 8, width: 12, height: 10, fill: c, stroke: C.line, "stroke-width": 0.6 }));
        S.push(T("lgt" + i, lx + 17, 17.5, t, { "font-size": 11.5 }));
        lx += 17 + textW(t, 11.5) + 14;
      });
      S.push(T("lgx", narrow ? m.l : lx, narrow ? 36 : 17.5, "条长 = 权重 × 归一化分", { "font-size": 11.5, fill: C.dark }));
      const step = sumW > 6 ? 2 : sumW > 2.5 ? 1 : 0.5;
      for (let v = 0; v <= sumW + 1e-9; v += step) {
        const x = xs(v), k = String(Math.round(v * 10));
        S.push(L("g" + k, { x1: x, x2: x, y1: m.t - 6, y2: H - m.b, stroke: C.grid }));
        S.push(T("gt" + k, x, H - m.b + 15, String(+v.toFixed(1)), { "text-anchor": "middle", "font-size": 11 }));
      }
      const tops = [];
      res.order.forEach((ci, rank) => {
        const c = cands[ci], r = res.rows[ci], y = m.t + rank * rowH + top, id = c.id;
        S.push(narrow ? T("n" + id, m.l, y - 5, `${rank + 1}. ${c.name}`, { "text-anchor": "start", "font-size": 12, fill: ci === sel ? C.accent : C.ink })
                      : T("n" + id, m.l - 8, y + bh / 2 + 5, `${rank + 1}. ${c.name}`, { "text-anchor": "end", "font-size": 12, fill: ci === sel ? C.accent : C.ink }));
        let x = m.l;
        [["rec", C.dark], ["imp", C.mid], ["rel", C.pale]].forEach(([k, col]) => {
          const ww = Math.max(0, xs(r.part[k]) - m.l);
          S.push(R(`b${id}${k}`, { x, y, width: ww, height: bh, fill: col, stroke: ww > 0.5 ? C.line : "none", "stroke-width": 0.6 }));
          x += ww;
        });
        tops.push(T("v" + id, x + 6, y + bh / 2 + 5, r.total.toFixed(3), Object.assign({ "font-size": 12, fill: rank === 0 ? C.accent : C.ink }, HALO)));
      });
      S.push(L("ax", { x1: m.l, x2: m.l, y1: m.t - 6, y2: H - m.b, stroke: C.line }));
      S.push(...tops);
      return S;
    }
    const n3 = (v) => (v === 1 ? "1" : v === 0 ? "0" : v.toFixed(3));
    function update() {
      const w = { rec: wRec.get(), imp: wImp.get(), rel: wRel.get() }, d = dec.get();
      const res = gaScore(cands, w, d);
      anim(scene(res, w));
      const short = (c) => c.name.split(" ")[0];
      const cell = "padding:.1rem .4rem;text-align:right;white-space:nowrap";
      const head = cands.map((c) => `<th style="${cell}">${short(c)}</th>`).join("");
      const row = (lab, f) => `<tr><td style="padding:.1rem .4rem .1rem 0;white-space:nowrap">${lab}</td>${res.rows.map((r) => `<td style="${cell}">${f(r)}</td>`).join("")}</tr>`;
      const tbl = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:.84rem;margin:.2rem 0 .4rem">` +
        `<tr><th></th>${head}</tr>` +
        row(`新近性原始分 ${d.toFixed(3)}<sup>Δh</sup>`, (r) => r.raw.rec.toFixed(3)) +
        row("新近性归一化", (r) => n3(r.n.rec)) +
        row("重要性归一化", (r) => n3(r.n.imp)) +
        row("相关性归一化", (r) => n3(r.n.rel)) +
        row("加权总分", (r) => `<b>${r.total.toFixed(3)}</b>`) + `</table></div>`;
      const c = cands[sel], r = res.rows[sel];
      const ws = (a) => (+a.toFixed(1)).toString();
      let o = tbl + `排序：<b>${res.order.map((i) => short(cands[i])).join(" > ")}</b>。` +
        `<br>s(${short(c)}) = ${ws(w.rec)} × ${n3(r.n.rec)} + ${ws(w.imp)} × ${n3(r.n.imp)} + ${ws(w.rel)} × ${n3(r.n.rel)} = <b>${r.total.toFixed(3)}</b>。`;
      const flatNames = { rec: "新近性", imp: "重要性", rel: "相关性" };
      const fl = Object.keys(res.flat).filter((k) => res.flat[k]).map((k) => flatNames[k]);
      if (fl.length) o += `<br><span class="warn">所有候选的${fl.join("、")}相同</span>，最小—最大归一化的分母为 0，这里记为 0（该信号不起区分作用）。`;
      o += `<br>归一化在候选集合内做：增删一条候选，其余记忆的归一化分也会变。`;
      out.innerHTML = o;
    }
    preset.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      markTab(preset, b); load(b.dataset.p); drawPick(); update();
    });
    pick.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.a === "add") {
        const used = new Set(cands.map((c) => c.name.split(" ")[0]));
        const latin = /^[a-z]$/.test(cands[0].name);
        let k = cands.length + 1, nm;
        do { nm = latin ? String.fromCharCode(96 + k) : `m${sub(k)}`; k++; } while (used.has(nm));
        cands.push({ name: latin ? nm : `${nm} 新记忆`, imp: 5, h: 10, sim: 0.5, id: uid++ });
        sel = cands.length - 1;
      } else if (b.dataset.a === "del") {
        cands.splice(sel, 1); sel = Math.min(sel, cands.length - 1);
      } else sel = +b.dataset.i;
      drawPick(); update();
    });
    sImp.on(() => { cands[sel].imp = sImp.get(); update(); });
    sH.on(() => { cands[sel].h = sH.get(); update(); });
    sSim.on(() => { cands[sel].sim = sSim.get(); update(); });
    [wRec, wImp, wRel, dec].forEach((s) => s.on(update));
    onResize(svg, update);
    load("ex"); drawPick(); update();
  }

  // =====================================================================
  // 3. 遗忘曲线与回忆（例 8-4、习题 8.8）
  // =====================================================================
  // 纯计算：recalls 回忆发生的天数，thr 检索阈值。回忆时 S 加 1、t 归零；
  // 保留率已低于阈值的记忆检索不到，之后的“回忆”不会发生。
  function forgetSim(recalls, thr) {
    const lnk = Math.log(1 / thr), ev = [], segs = [{ t0: 0, S: 1 }];
    let S = 1, last = 0, exit = null;
    recalls.slice().sort((a, b) => a - b).forEach((t) => {
      if (exit !== null) { ev.push({ t, ok: false, Rb: Math.exp(-(t - last) / S), S }); return; }
      const Rb = Math.exp(-(t - last) / S);
      if (Rb < thr) { exit = last + S * lnk; ev.push({ t, ok: false, Rb, S }); return; }
      ev.push({ t, ok: true, Rb, S, dt: t - last }); S += 1; last = t; segs.push({ t0: t, S });
    });
    if (exit === null) exit = last + S * lnk;
    const seg = (t) => { let g = segs[0]; for (const s of segs) if (s.t0 <= t) g = s; return g; };
    const Rat = (t) => { const g = seg(t); return Math.exp(-(t - g.t0) / g.S); };
    return { ev, segs, exit, last, S, lnk, Rat, seg };
  }
  const FG_PRESETS = {
    a: { rc: [], tmax: 10, view: 3, txt: "例 8-4 甲：从未被提起" },
    b: { rc: [1, 3], tmax: 10, view: 7, txt: "例 8-4 乙：第 1、3 天回忆" },
    q: { rc: [2, 5], tmax: 15, view: 5, txt: "习题 8.8：第 2、5 天回忆" },
  };

  function c8forget(root) {
    const grid = frame(root, "动手试一试：遗忘曲线与回忆",
      "按式（8-4）R = e<sup>−t/S</sup> 画出一条记忆的保留率：首次出现时 S = 1，每被回忆一次 S 加 1、t 归零；t 以天计。<b>点击图中任意位置</b>，在那一天（按半天取整）加一次回忆；点已有回忆的竖线附近可删去。保留率低于检索阈值后，这条记忆检索不到，之后的回忆也就不会发生。");
    const preset = tabs([["b", "例 8-4 乙"], ["a", "例 8-4 甲"], ["q", "习题 8.8"]]);
    root.insertBefore(preset, grid);
    const thr = slider("检索阈值", 0.05, 0.5, 0.01, 0.1, (v) => v.toFixed(2));
    const tm = select("时间范围", [["7", "0～7 天"], ["10", "0～10 天"], ["15", "0～15 天"], ["30", "0～30 天"]], "10");
    const view = slider("查看第几天", 0, 10, 0.1, 7, (v) => `第 ${+v.toFixed(1)} 天`);
    [thr, tm, view].forEach((c) => grid.appendChild(c.node));
    const list = h(`<div class="w-tabs" style="margin:.2rem 0 .4rem"></div>`);
    root.appendChild(list);
    const NSMP = 481;
    let W = 600, H = 300, m = { l: 48, r: 16, t: 30, b: 40 }, ys = null;
    const svg = mkSvg(root, W, H, "保留率随时间变化的曲线"), anim = animator(svg);
    svg.style.cursor = "crosshair";
    const out = h(`<div class="w-out"></div>`); root.appendChild(out);
    let rc = [1, 3];

    function scene(f, th, tmax, tv) {
      W = fitW(svg, 600);
      const narrow = W < 480;                                   // 窄屏：图例分两行
      H = narrow ? 290 : 300; m = { l: 48, r: 16, t: narrow ? 48 : 30, b: 40 };
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      ys = linScale(0, 1.08, H - m.b, m.t);
      const S = [], xs = linScale(0, tmax, m.l, W - m.r);
      // 图例
      S.push(L("lg0", { x1: m.l, x2: m.l + 22, y1: 12, y2: 12, stroke: C.rule, "stroke-width": 1.2 }));
      S.push(T("lgt0", m.l + 28, 16, "从未被回忆（S 始终为 1）", { "font-size": 11.5 }));
      const lx = narrow ? m.l : m.l + 28 + textW("从未被回忆（S 始终为 1）", 11.5) + 18, ly = narrow ? 32 : 12;
      S.push(L("lg1", { x1: lx, x2: lx + 22, y1: ly, y2: ly, stroke: C.accent, "stroke-width": 2 }));
      S.push(T("lgt1", lx + 28, ly + 4, "当前的回忆安排", { "font-size": 11.5 }));
      // 低于阈值的区域
      S.push(R("band", { x: m.l, y: ys(th), width: W - m.r - m.l, height: H - m.b - ys(th), fill: C.fill }));
      S.push(T("bandt", m.l + 6, Math.min(ys(th) + 14, H - m.b - 4), "不参与检索", Object.assign({ "font-size": 11, fill: C.dark }, HALO)));
      // 坐标轴与刻度
      [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((v) => {
        const y = ys(v), k = String(v * 10);
        S.push(L("gy" + k, { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid, "stroke-width": v ? 1 : 0 }));
        S.push(T("gyt" + k, m.l - 6, y + 4, v ? v.toFixed(1) : "0", { "text-anchor": "end", "font-size": 11 }));
      });
      const st = tmax <= 10 ? 1 : tmax <= 15 ? 3 : 5;
      for (let d = 0; d <= 30; d += 1) {
        if (d > tmax || d % st) continue;
        const x = xs(d);
        S.push(L("tx" + d, { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 4, stroke: C.line }));
        S.push(T("txt" + d, x, H - m.b + 17, String(d), { "text-anchor": "middle", "font-size": 11 }));
      }
      S.push(L("axx", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: C.line }));
      S.push(L("axy", { x1: m.l, x2: m.l, y1: m.t - 4, y2: H - m.b, stroke: C.line }));
      S.push(T("xl", (m.l + W - m.r) / 2, H - 6, "距首次提及的天数", { "text-anchor": "middle", "font-size": 12 }));
      const cy = (m.t + H - m.b) / 2;
      S.push(T("yl", 13, cy, "保留率 R", { "text-anchor": "middle", "font-size": 12, transform: `rotate(-90 13 ${cy})` }));
      // 阈值线
      S.push(L("th", { x1: m.l, x2: W - m.r, y1: ys(th), y2: ys(th), stroke: C.rule, "stroke-dasharray": "5 3", "stroke-width": 1 }));
      // 曲线（固定采样点数，形状变化时可平滑过渡）
      let pb = "", pc = "";
      for (let i = 0; i < NSMP; i++) {
        const t = tmax * i / (NSMP - 1), x = xs(t).toFixed(2);
        pb += `${x},${ys(Math.exp(-t)).toFixed(2)} `;
        pc += `${x},${ys(f.Rat(t)).toFixed(2)} `;
      }
      S.push({ k: "base", tag: "polyline", a: { points: pb.trim(), fill: "none", stroke: C.rule, "stroke-width": 1.2 } });
      S.push({ k: "cur", tag: "polyline", a: { points: pc.trim(), fill: "none", stroke: C.accent, "stroke-width": 2 } });
      // 回忆竖线与每段的强度 S
      const labs = [];
      f.ev.forEach((e) => {
        if (e.t > tmax) return;
        const x = xs(e.t), k = String(Math.round(e.t * 2));
        S.push(L("rc" + k, { x1: x, x2: x, y1: ys(1), y2: H - m.b, stroke: e.ok ? C.accent : C.warn, "stroke-dasharray": "2 3", "stroke-width": 1 }));
        S.push({ k: "rcd" + k, tag: "circle", a: { cx: x, cy: H - m.b, r: 4, fill: e.ok ? C.accent : C.warn, stroke: "#fff", "stroke-width": 1.2 } });
      });
      f.segs.forEach((g, i) => {
        const nx = i + 1 < f.segs.length ? f.segs[i + 1].t0 : tmax;
        const x0 = xs(g.t0), x1 = xs(Math.min(nx, tmax)), lab = `S=${g.S}`;
        if (g.t0 < tmax && x1 - x0 > textW(lab, 11) + 8) labs.push(T("sl" + i, x0 + 5, ys(1) - 5, lab, Object.assign({ "font-size": 11, fill: C.accent }, HALO)));
      });
      // 退出检索的时刻
      if (f.exit <= tmax) {
        const x = xs(f.exit), lab = `第 ${f.exit.toFixed(1)} 天退出检索`, wl = textW(lab, 11.5);
        S.push({ k: "ex", tag: "circle", a: { cx: x, cy: ys(th), r: 4.5, fill: C.warn, stroke: "#fff", "stroke-width": 1.2 } });
        // 放在阈值线下方的灰带底部，优先放在点的左侧（左侧曲线都在阈值之上，不会压线）
        const left = x - 8 - wl > m.l + textW("不参与检索", 11) + 16;
        S.push(L("exl", { x1: x, x2: x, y1: ys(th), y2: H - m.b, stroke: C.warn, "stroke-dasharray": "2 2", "stroke-width": 1 }));
        labs.push(T("ext", left ? x - 6 - wl : x + 6, H - m.b - 5, lab, Object.assign({ "font-size": 11.5, fill: C.warn }, HALO)));
      }
      // 查看光标
      const vx = xs(tv), vR = f.Rat(tv), vlab = `第 ${+tv.toFixed(1)} 天 R = ${vR.toFixed(3)}`, vw = textW(vlab, 11.5);
      S.push(L("vl", { x1: vx, x2: vx, y1: m.t, y2: H - m.b, stroke: C.dark, "stroke-width": 0.8 }));
      S.push({ k: "vd", tag: "circle", a: { cx: vx, cy: ys(vR), r: 4.5, fill: C.ink, stroke: "#fff", "stroke-width": 1.2 } });
      const vright = vx + 8 + vw < W - m.r;
      // 右侧放得下就放右上；否则放左下（点左侧的曲线在它上方，左下是空的）
      const vy = vright ? Math.max(m.t + 12, Math.min(ys(vR) - 10, H - m.b - 22)) : Math.max(m.t + 12, Math.min(ys(vR) + 20, ys(th) - 5));
      labs.push(T("vt", vright ? vx + 8 : vx - 8 - vw, vy, vlab, Object.assign({ "font-size": 11.5 }, HALO)));
      S.push(...labs);
      return S;
    }
    const n3 = (v) => v.toFixed(3);
    function drawList() {
      const s = rc.slice().sort((a, b) => a - b);
      list.innerHTML = `<span style="align-self:center;font-size:.86rem">回忆：</span>` +
        (s.length ? s.map((t) => `<button data-t="${t}" title="删除这次回忆">第 ${t} 天 ×</button>`).join("") + `<button data-c="1">全部清除</button>`
          : `<span style="align-self:center;font-size:.86rem;color:${C.dark}">（无，点击图中加入）</span>`);
    }
    function update() {
      const th = thr.get(), tmax = +tm.get(), tv = Math.min(view.get(), tmax), f = forgetSim(rc, th);
      anim(scene(f, th, tmax, tv));
      const ln = f.lnk.toFixed(3);
      let o = "";
      f.ev.forEach((e) => {
        if (e.ok) o += `第 ${e.t} 天回忆前：S = ${e.S}，t = ${+e.dt.toFixed(1)}，R = e<sup>−${+e.dt.toFixed(1)}/${e.S}</sup> = <b>${n3(e.Rb)}</b>，回忆后 S = ${e.S + 1}、t 归零。<br>`;
        else o += `<span class="warn">第 ${e.t} 天的回忆不会发生</span>：这条记忆在第 ${f.exit.toFixed(1)} 天保留率已降到 ${th.toFixed(2)}，退出检索，到第 ${e.t} 天时检索不到它。<br>`;
      });
      const lastTxt = f.last ? `第 ${f.last} + ${(f.S * f.lnk).toFixed(1)} = ` : "";
      o += (f.last ? "最后一次回忆后" : "从未被回忆时") + ` S = ${f.S}，降到阈值需 t = S·ln(1/${th.toFixed(2)}) = ${f.S} × ${ln} ≈ ${(f.S * f.lnk).toFixed(1)} 天，` +
        `即<b>${lastTxt}${f.exit.toFixed(1)} 天</b>退出检索` + (f.exit > tmax ? `（超出当前横轴范围）` : "") + "。<br>";
      const g = f.seg(tv);
      o += `第 ${+tv.toFixed(1)} 天：S = ${g.S}，t = ${+(tv - g.t0).toFixed(1)}，R = e<sup>−${+(tv - g.t0).toFixed(1)}/${g.S}</sup> = <b>${n3(f.Rat(tv))}</b>` +
        (f.Rat(tv) < th ? `，<span class="warn">低于阈值</span>` : "") + "。";
      out.innerHTML = o;
    }
    function setRange(tmax) {
      const inp = view.node.querySelector("input"); inp.max = tmax;
      if (view.get() > tmax) view.set(tmax);
    }
    preset.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      markTab(preset, b); const p = FG_PRESETS[b.dataset.p];
      rc = p.rc.slice(); thr.set(0.1); tm.set(String(p.tmax)); setRange(p.tmax); view.set(p.view); drawList(); update();
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.c) rc = []; else rc = rc.filter((t) => t !== +b.dataset.t);
      drawList(); update();
    });
    svg.addEventListener("click", (e) => {
      const box = svg.getBoundingClientRect(), x = (e.clientX - box.left) * W / box.width, tmax = +tm.get();
      if (x < m.l - 4 || x > W - m.r + 4) return;
      const t = (x - m.l) / (W - m.l - m.r) * tmax, tol = 10 / (W - m.l - m.r) * tmax;
      const hit = rc.find((r) => Math.abs(r - t) <= Math.max(tol, 0.2));
      if (hit !== undefined) rc = rc.filter((r) => r !== hit);
      else {
        const s = Math.round(t * 2) / 2;
        if (s <= 0 || s > tmax || rc.includes(s) || rc.length >= 10) return;
        rc.push(s);
      }
      drawList(); update();
    });
    thr.on(update); view.on(update);
    onResize(svg, update);
    tm.on(() => { setRange(+tm.get()); update(); });
    drawList(); update();
  }

  REG.c8cost = c8cost;
  REG.c8ga = c8ga;
  REG.c8forget = c8forget;

  // =====================================================================
  // 数值自检（书中例题与习题答案）
  // =====================================================================
  BookW.TESTS = BookW.TESTS || [];
  BookW.TESTS.push(() => {
    const a = costCalc(EX81);
    const ex = gaScore(toCands(GA_PRESETS.ex), { rec: 1, imp: 1, rel: 1 }, 0.995);
    const q1 = gaScore(toCands(GA_PRESETS.q1), { rec: 1, imp: 1, rel: 1 }, 0.995);
    const q2 = gaScore(toCands(GA_PRESETS.q2), { rec: 1, imp: 3, rel: 1 }, 0.995);
    const nm = (r, set) => r.order.map((i) => set.c[i][0].split(" ")[0]).join(">");
    const fa = forgetSim([], 0.1), fb = forgetSim([1, 3], 0.1), fq = forgetSim([2, 5], 0.1);
    return [
      ["例 8-1 第 1 步 甲的 token 数", a.tA, 1.2e5, 1e-6],
      ["例 8-1 第 2 步 每 token 的 KV 缓存（字节）", a.perTok, 131072, 0],
      ["例 8-1 第 3 步 甲的 KV 缓存（GB）", a.kvA / GB, 15.7, 0.05],
      ["例 8-1 第 4 步 乙的 KV 缓存（GB，约 0.54）", a.kvB / GB, 0.54, 0.005],
      ["例 8-1 第 4 步 乙的 KV 缓存精确值（10⁸ 字节）", a.kvB / 1e8, 5.37, 0.005],
      ["例 8-1 第 5 步 甲的并发数", a.nA, 4, 0],
      ["例 8-1 第 5 步 乙的并发数", a.nB, 119, 0],
      ["例 8-1 第 6 步 甲的预填充时间（s）", a.pA, 4.8, 0.005],
      ["例 8-1 第 7 步 乙的预填充时间（s）", a.pB, 0.16, 0.005],
      ["例 8-1 结论 甲的 KV 缓存约为乙的 29 倍", a.ratioKV, 29, 0.5],
      ["例 8-1 结论 每次提问多等约 4.6 s", a.pA - a.pB, 4.6, 0.05],
      ["例 8-3 新近性原始分 m₁", ex.rows[0].raw.rec, 0.905, 0.0005],
      ["例 8-3 新近性原始分 m₂", ex.rows[1].raw.rec, 0.995, 0.0005],
      ["例 8-3 新近性原始分 m₃", ex.rows[2].raw.rec, 0.606, 0.0005],
      ["例 8-3 新近性归一化 m₁", ex.rows[0].n.rec, 0.768, 0.0005],
      ["例 8-3 重要性归一化 m₃", ex.rows[2].n.imp, 0.571, 0.0005],
      ["例 8-3 相关性归一化 m₃", ex.rows[2].n.rel, 0.532, 0.0005],
      ["例 8-3 总分 m₁", ex.rows[0].total, 2.768, 0.0005],
      ["例 8-3 总分 m₂", ex.rows[1].total, 1.000, 0.0005],
      ["例 8-3 总分 m₃", ex.rows[2].total, 1.103, 0.0005],
      ["例 8-3 排序", nm(ex, GA_PRESETS.ex), "m₁>m₃>m₂"],
      ["习题 8.7 新近性 0.995² ", q1.rows[0].raw.rec, 0.990, 0.0005],
      ["习题 8.7 新近性 0.995⁴⁸", q1.rows[1].raw.rec, 0.786, 0.0005],
      ["习题 8.7 新近性 0.995¹⁰", q1.rows[2].raw.rec, 0.951, 0.0005],
      ["习题 8.7 c 的新近性归一化", q1.rows[2].n.rec, 0.809, 0.0005],
      ["习题 8.7（1）总分 a", q1.rows[0].total, 2.000, 0.0005],
      ["习题 8.7（1）总分 b", q1.rows[1].total, 1.000, 0.0005],
      ["习题 8.7（1）总分 c", q1.rows[2].total, 1.809, 0.0005],
      ["习题 8.7（1）排序", nm(q1, GA_PRESETS.q1), "a>c>b"],
      ["习题 8.7（2）总分 b", q2.rows[1].total, 3.000, 0.0005],
      ["习题 8.7（2）总分 c", q2.rows[2].total, 2.809, 0.0005],
      ["习题 8.7（2）排序", nm(q2, GA_PRESETS.q2), "b>c>a"],
      ["例 8-4 第 1 步 甲第 3 天的保留率", fa.Rat(3), 0.050, 0.0005],
      ["例 8-4 第 2 步 乙第 1 天回忆前", fb.ev[0].Rb, 0.368, 0.0005],
      ["例 8-4 第 3 步 乙第 3 天回忆前", fb.ev[1].Rb, 0.368, 0.0005],
      ["例 8-4 第 4 步 乙第 7 天", fb.Rat(7), 0.264, 0.0005],
      ["例 8-4 第 5 步 S=1 降到 0.1 的天数", 1 * fa.lnk, 2.3, 0.05],
      ["例 8-4 第 5 步 S=2 降到 0.1 的天数", 2 * fa.lnk, 4.6, 0.05],
      ["例 8-4 第 5 步 S=3 降到 0.1 的天数", 3 * fa.lnk, 6.9, 0.05],
      ["例 8-4 甲第 2.3 天退出检索", fa.exit, 2.3, 0.05],
      ["例 8-4 乙退出检索的天数（3 + 6.9）", fb.exit, 9.9, 0.05],
      ["例 8-4 乙第 7 天后再过约 2.9 天降到 0.1", fb.exit - 7, 2.9, 0.05],
      ["习题 8.8 第 2 天回忆前", fq.ev[0].Rb, 0.135, 0.0005],
      ["习题 8.8 第 5 天回忆前", fq.ev[1].Rb, 0.223, 0.0005],
      ["习题 8.8 退出检索的天数（5 + 6.9）", fq.exit, 11.9, 0.05],
    ];
  });
  // 供边界测试用
  BookW._c8 = { costCalc, gaScore, forgetSim };
})();


/* ===== 挂载 ===== */
document.querySelectorAll(".widget[data-widget]").forEach((d) => {
  const f = window.BookW.REG[d.dataset.widget];
  if (!f) return;
  try { f(d); } catch (e) { console.error("widget " + d.dataset.widget, e); d.textContent = "（交互组件加载失败）"; }
});
