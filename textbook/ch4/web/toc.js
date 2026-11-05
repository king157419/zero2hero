/* 目录排版：把开头的节号拆出来放进固定宽度的一栏，标题换行时与标题首字对齐 */
(function () {
  const re = /^\s*(\d+(?:\.\d+)*)[\s　]+(.+)$/;
  document.querySelectorAll(".sidebar-item-text, #TOC a").forEach((a) => {
    if (a.querySelector(".tnum")) return;
    const m = a.textContent.match(re);
    a.classList.add("tline");
    a.innerHTML = m ? `<span class="tnum">${m[1]}</span><span class="ttxt">${m[2]}</span>`
                    : `<span class="tnum"></span><span class="ttxt">${a.textContent.trim()}</span>`;
  });
  // 习题、术语与参考文献前加一条细线，与正文各节分开
  const ex = document.querySelector('.sidebar-item a[href$="exercises.html"]');
  if (ex) ex.closest(".sidebar-item").classList.add("tsep");
  // 第 4 章总标题不缩进
  const top = document.querySelector('.sidebar-item a[href$="index.html"] .tnum');
  if (top) top.parentElement.classList.add("tchap");
})();
