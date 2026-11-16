/* 目录排版：节号放进固定宽度的一栏，标题换行时与标题首字对齐；“第 N 章”整行显示 */
(function () {
  const re = /^\s*(\d+(?:\.\d+)*)[\s　]+(.+)$/;
  document.querySelectorAll(".sidebar-item-text, #TOC a").forEach((a) => {
    if (a.querySelector(".tnum")) return;
    const t = a.textContent.trim();
    const m = t.match(re);
    a.classList.add("tline");
    if (/^第\s*\d+\s*章/.test(t) || t === "全书导读") a.classList.add("tchap");
    a.innerHTML = m ? `<span class="tnum">${m[1]}</span><span class="ttxt">${m[2]}</span>`
                    : `<span class="tnum"></span><span class="ttxt">${t}</span>`;
  });
})();
