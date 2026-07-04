/**
 * AI PM 学习中心 — 文本批注（笔记）系统 v3
 * 交互模式：微信读书风格 — 段落虚线下划线 + 点击弹出笔记
 * 存储：localStorage，刷新/重启不丢失
 * 导入/导出：支持跨设备迁移
 */

(function () {
  "use strict";

  const STORAGE_KEY_PREFIX = "aipm_notes_";

  /* ========== 状态 ========== */
  let currentSelectionRange = null;
  let currentSelectedText = "";
  let notes = [];
  let idCounter = 0;

  /* ========== 初始化 ========== */
  function init() {
    loadNotes();
    createUI();
    bindEvents();
    restoreMarks();
    console.log("[笔记系统] 初始化完成，当前页笔记数：", notes.length);
  }

  /* ========== 存储 ========== */
  function getStorageKey() {
    return STORAGE_KEY_PREFIX + window.location.pathname;
  }

  function loadNotes() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      notes = raw ? JSON.parse(raw) : [];
      if (notes.length > 0) {
        idCounter = Math.max(...notes.map((n) => n.id)) + 1;
      }
    } catch (e) {
      console.warn("[笔记系统] 加载笔记失败：", e);
      notes = [];
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(notes));
    } catch (e) {
      console.warn("[笔记系统] 保存笔记失败：", e);
    }
  }

  /* ========== 找到选中文字所在的段落元素 ========== */
  function findParagraphByText(searchText) {
    if (!searchText) return null;
    const trimmed = searchText.trim().replace(/\s+/g, " ");

    // 优先匹配精确的块级元素
    const candidates = document.querySelectorAll(
      "p, li, h1, h2, h3, h4, td, .dialogue-line, .takeaway-item, .faq-a, .glossary-def, .card-desc, .phase-desc"
    );

    let bestEl = null;
    let bestLen = Infinity;

    candidates.forEach((el) => {
      const elText = el.textContent.trim().replace(/\s+/g, " ");
      if (elText.includes(trimmed) && elText.length < bestLen) {
        bestEl = el;
        bestLen = elText.length;
      }
    });

    if (bestEl) return bestEl;

    // 回退：在更大范围内搜索
    const containers = document.querySelectorAll(
      "article, .main-content, .content, .post-content, main, body"
    );
    for (const el of containers) {
      if (el.textContent.includes(trimmed)) return el;
    }

    return null;
  }

  /* ========== 创建 UI ========== */
  function createUI() {
    // 1. 浮动「写笔记」按钮
    const fb = document.createElement("div");
    fb.id = "note-float-btn";
    fb.textContent = "📝 写笔记";
    fb.style.cssText = [
      "position:absolute", "z-index:9999", "display:none",
      "background:#238636", "color:#fff", "font-size:13px",
      "padding:7px 16px", "border-radius:8px", "cursor:pointer",
      "box-shadow:0 4px 16px rgba(0,0,0,0.45)",
      "user-select:none", "font-family:inherit", "letter-spacing:0.3px"
    ].join(";");
    document.body.appendChild(fb);

    // 2. 笔记编辑弹窗
    const modal = document.createElement("div");
    modal.id = "note-modal";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="note-modal-backdrop"></div>
      <div class="note-modal-box">
        <div class="note-modal-header">
          <span>📝 添加阅读笔记</span>
          <button class="note-modal-close">&times;</button>
        </div>
        <div class="note-modal-selected-text"></div>
        <textarea class="note-modal-textarea" placeholder="写下你的思考、疑问或总结…"></textarea>
        <div class="note-modal-actions">
          <button class="note-modal-cancel">取消</button>
          <button class="note-modal-save">保存笔记</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // 3. 隐藏的文件上传 input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.id = "note-import-input";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    // 4. 侧边笔记面板 - 切换按钮
    const panelToggle = document.createElement("button");
    panelToggle.id = "note-panel-toggle";
    panelToggle.innerHTML = `📋<span class="note-count-badge">0</span>`;
    panelToggle.title = "我的笔记";
    document.body.appendChild(panelToggle);

    // 5. 侧边笔记面板
    const panel = document.createElement("div");
    panel.id = "note-panel";
    panel.innerHTML = `
      <div class="note-panel-header">
        <span>📋 我的笔记</span>
        <button class="note-panel-close">&times;</button>
      </div>
      <div class="note-panel-list"></div>
      <div class="note-panel-footer">
        <button class="note-panel-export" title="导出所有笔记为 JSON 文件">导出</button>
        <button class="note-panel-import" title="从 JSON 文件导入笔记">导入</button>
        <button class="note-panel-clear">清除本页</button>
      </div>`;
    document.body.appendChild(panel);

    updateBadge();
  }

  /* ========== 事件绑定 ========== */
  function bindEvents() {
    // 文字选中
    document.addEventListener("mouseup", onMouseUp);

    // 浮动按钮点击
    document.getElementById("note-float-btn").addEventListener("click", onFloatBtnClick);

    // 弹窗操作
    const modal = document.getElementById("note-modal");
    modal.querySelector(".note-modal-backdrop").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-close").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-cancel").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-save").addEventListener("click", onSaveNote);

    // 侧边面板
    document.getElementById("note-panel-toggle").addEventListener("click", togglePanel);
    document.querySelector("#note-panel .note-panel-close").addEventListener("click", togglePanel);
    document.querySelector(".note-panel-clear").addEventListener("click", clearNotes);
    document.querySelector(".note-panel-export").addEventListener("click", onExportNotes);
    document.querySelector(".note-panel-import").addEventListener("click", () => {
      document.getElementById("note-import-input").click();
    });
    document.getElementById("note-import-input").addEventListener("change", onImportNotes);

    // ESC 关闭弹窗
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // 点击空白处关闭 tooltip
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#note-tooltip") && !e.target.closest(".note-mark")) {
        removeTooltip();
      }
    });
  }

  /* ========== 文字选中处理 ========== */
  function onMouseUp(e) {
    // 忽略在 UI 控件上的选中
    if (e.target.closest("#note-float-btn")) return;
    if (e.target.closest("#note-modal")) return;
    if (e.target.closest("#note-panel")) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideFloatBtn();
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 2) {
      hideFloatBtn();
      return;
    }

    // 保存选中范围和文字
    currentSelectionRange = sel.getRangeAt(0).cloneRange();
    currentSelectedText = text;

    // 定位浮动按钮（在选中区域上方居中）
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.getElementById("note-float-btn");
    btn.style.display = "block";
    btn.style.left = Math.max(8, window.scrollX + rect.left + rect.width / 2 - 52) + "px";
    btn.style.top = (window.scrollY + rect.top - 38) + "px";
  }

  function hideFloatBtn() {
    const btn = document.getElementById("note-float-btn");
    if (btn) btn.style.display = "none";
  }

  /* ========== 弹窗操作 ========== */
  function onFloatBtnClick() {
    hideFloatBtn();
    const modal = document.getElementById("note-modal");
    modal.querySelector(".note-modal-selected-text").textContent =
      "「" + truncate(currentSelectedText, 100) + "」";
    modal.querySelector(".note-modal-textarea").value = "";
    modal.style.display = "block";
    setTimeout(() => {
      const ta = modal.querySelector(".note-modal-textarea");
      if (ta) ta.focus();
    }, 100);
  }

  function closeModal() {
    const modal = document.getElementById("note-modal");
    if (modal) modal.style.display = "none";
    window.getSelection().removeAllRanges();
  }

  function onSaveNote() {
    const ta = document.getElementById("note-modal").querySelector(".note-modal-textarea");
    const content = ta.value.trim();
    if (!content) {
      ta.focus();
      ta.style.borderColor = "#f85149";
      setTimeout(() => { ta.style.borderColor = ""; }, 1500);
      return;
    }

    const note = {
      id: idCounter++,
      selectedText: currentSelectedText.trim(),
      note: content,
      createdAt: new Date().toISOString()
    };

    notes.push(note);
    saveNotes();
    closeModal();
    applyMarkToParagraph(note);
    updateBadge();
    renderPanelList();
    showToast("✅ 笔记已保存");
  }

  /* ========== 段落标记（微信读书风格） ========== */
  function applyMarkToParagraph(note) {
    const el = findParagraphByText(note.selectedText);
    if (!el) {
      console.warn("[笔记系统] 找不到对应段落：", note.selectedText.slice(0, 30));
      return;
    }

    el.classList.add("note-mark");
    el.dataset.noteId = note.id;
    el.title = "📝 点击查看笔记";

    // 使用事件委托，避免重复绑定
    el.addEventListener("click", function handler(e) {
      e.stopPropagation();
      showTooltip(note.id, el);
    });
  }

  function restoreMarks() {
    notes.forEach((note) => {
      // 先清除旧的标记再重新应用（处理页面动态内容）
      const el = findParagraphByText(note.selectedText);
      if (el) {
        el.classList.add("note-mark");
        el.dataset.noteId = note.id;
        el.title = "📝 点击查看笔记";
        el.addEventListener("click", function handler(e) {
          e.stopPropagation();
          showTooltip(note.id, el);
        });
      }
    });
  }

  /* ========== Tooltip（弹出笔记卡片） ========== */
  function showTooltip(noteId, anchorEl) {
    removeTooltip();

    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    const tip = document.createElement("div");
    tip.id = "note-tooltip";
    tip.innerHTML = `
      <div class="note-tooltip-content">${escapeHTML(note.note).replace(/\n/g, "<br>")}</div>
      <div class="note-tooltip-meta">${formatDate(note.createdAt)}</div>
      <div class="note-tooltip-actions">
        <button class="note-tooltip-edit" data-id="${noteId}">编辑</button>
        <button class="note-tooltip-delete" data-id="${noteId}">删除</button>
      </div>`;
    document.body.appendChild(tip);

    // 定位：在锚点元素下方居中
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      let left = window.scrollX + rect.left + rect.width / 2 - 170;
      left = Math.max(8, Math.min(left, window.innerWidth - 368));
      tip.style.left = left + "px";
      tip.style.top = (window.scrollY + rect.bottom + 10) + "px";
    }

    // 绑定按钮事件
    tip.querySelector(".note-tooltip-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      removeTooltip();
      onEditNote(noteId);
    });
    tip.querySelector(".note-tooltip-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      removeTooltip();
      onDeleteNote(noteId);
    });
  }

  function removeTooltip() {
    const old = document.getElementById("note-tooltip");
    if (old) old.remove();
  }

  function onEditNote(noteId) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const newContent = prompt("编辑笔记：", note.note);
    if (newContent !== null && newContent.trim()) {
      note.note = newContent.trim();
      saveNotes();
      updateBadge();
      renderPanelList();
    }
  }

  function onDeleteNote(noteId) {
    if (!confirm("确定删除这条笔记吗？")) return;
    notes = notes.filter((n) => n.id !== noteId);
    saveNotes();

    // 清除段落标记
    const el = document.querySelector(`[data-note-id="${noteId}"]`);
    if (el) {
      el.classList.remove("note-mark");
      delete el.dataset.noteId;
      el.title = "";
    }

    updateBadge();
    renderPanelList();
    showToast("已删除笔记");
  }

  /* ========== 导入/导出 ========== */
  function onExportNotes() {
    // 收集所有页面的笔记
    const allData = {};
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const arr = JSON.parse(localStorage.getItem(key));
          if (arr && arr.length > 0) {
            const pagePath = key.replace(STORAGE_KEY_PREFIX, "");
            allData[pagePath] = arr;
            total += arr.length;
          }
        } catch (e) { /* ignore */ }
      }
    }

    if (total === 0) {
      alert("还没有任何笔记可以导出。");
      return;
    }

    const payload = {
      version: 1,
      exportDate: new Date().toISOString(),
      totalNotes: total,
      pages: allData
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aipm-notes-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✅ 已导出 " + total + " 条笔记");
  }

  function onImportNotes(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.pages || typeof data.pages !== "object") {
          alert("文件格式不正确，请选择由「导出」功能生成的 JSON 文件。");
          return;
        }

        let imported = 0, skipped = 0;
        for (const [pagePath, pageNotes] of Object.entries(data.pages)) {
          const key = STORAGE_KEY_PREFIX + pagePath;
          let existing = [];
          try {
            existing = JSON.parse(localStorage.getItem(key)) || [];
          } catch (e) { /* ignore */ }

          const existingIds = new Set(existing.map((n) => n.id));
          for (const n of pageNotes) {
            if (!existingIds.has(n.id)) {
              existing.push(n);
              imported++;
            } else {
              skipped++;
            }
          }
          localStorage.setItem(key, JSON.stringify(existing));
        }

        // 重新加载当前页
        loadNotes();
        // 清除旧标记
        document.querySelectorAll(".note-mark").forEach((el) => {
          el.classList.remove("note-mark");
          delete el.dataset.noteId;
        });
        restoreMarks();
        updateBadge();
        renderPanelList();
        showToast("✅ 导入完成！新增 " + imported + " 条" +
          (skipped > 0 ? "，跳过 " + skipped + " 条重复" : ""));
      } catch (err) {
        alert("文件解析失败：" + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* ========== Toast 提示 ========== */
  function showToast(msg) {
    const old = document.getElementById("note-toast");
    if (old) old.remove();

    const t = document.createElement("div");
    t.id = "note-toast";
    t.textContent = msg;
    t.style.cssText = [
      "position:fixed", "bottom:80px", "right:24px", "z-index:11000",
      "background:#1a2e1a", "color:#3fb950",
      "border:1px solid #238636", "padding:12px 20px",
      "border-radius:10px", "font-size:14px", "font-weight:500",
      "box-shadow:0 8px 24px rgba(0,0,0,0.4)",
      "animation:noteToastIn 0.3s ease"
    ].join(";");
    document.body.appendChild(t);

    // 注入动画 keyframes（如果还没有）
    if (!document.getElementById("note-toast-style")) {
      const s = document.createElement("style");
      s.id = "note-toast-style";
      s.textContent = "@keyframes noteToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}";
      document.head.appendChild(s);
    }

    setTimeout(() => {
      t.style.animation = "noteToastIn 0.3s ease reverse forwards";
      setTimeout(() => t.remove(), 300);
    }, 2500);
  }

  /* ========== 侧边笔记面板 ========== */
  function togglePanel() {
    const panel = document.getElementById("note-panel");
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) renderPanelList();
  }

  function renderPanelList() {
    const list = document.querySelector("#note-panel .note-panel-list");
    if (!list) return;

    if (notes.length === 0) {
      list.innerHTML = '<div class="note-panel-empty">还没有笔记<br>选中文字后点击 📝 添加笔记吧！</div>';
      return;
    }

    list.innerHTML = notes.slice().reverse().map((n) => `
      <div class="note-panel-item" data-id="${n.id}">
        <div class="note-panel-item-selected">「${escapeHTML(truncate(n.selectedText, 50))}」</div>
        <div class="note-panel-item-note">${escapeHTML(n.note).replace(/\n/g, "<br>")}</div>
        <div class="note-panel-item-meta">
          <span>${formatDate(n.createdAt)}</span>
          <span>
            <button class="note-panel-item-edit" data-id="${n.id}">编辑</button>
            <button class="note-panel-item-delete" data-id="${n.id}">删除</button>
          </span>
        </div>
      </div>`).join("");

    // 绑定事件
    list.querySelectorAll(".note-panel-item-edit").forEach((b) => {
      b.addEventListener("click", () => onEditNote(Number(b.dataset.id)));
    });
    list.querySelectorAll(".note-panel-item-delete").forEach((b) => {
      b.addEventListener("click", () => onDeleteNote(Number(b.dataset.id)));
    });
    list.querySelectorAll(".note-panel-item-selected").forEach((el) => {
      el.addEventListener("click", () => {
        const id = Number(el.closest(".note-panel-item").dataset.id);
        const target = document.querySelector(`[data-note-id="${id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.style.outline = "2px solid #f0883e";
          setTimeout(() => { target.style.outline = ""; }, 2000);
        }
      });
    });
  }

  function clearNotes() {
    if (!confirm("确定清除本页所有笔记吗？此操作不可撤销。")) return;
    notes = [];
    idCounter = 0;
    saveNotes();
    document.querySelectorAll(".note-mark").forEach((el) => {
      el.classList.remove("note-mark");
      delete el.dataset.noteId;
    });
    updateBadge();
    renderPanelList();
    showToast("已清除本页所有笔记");
  }

  function updateBadge() {
    const b = document.querySelector(".note-count-badge");
    if (b) b.textContent = notes.length;
  }

  /* ========== 工具函数 ========== */
  function truncate(s, len) {
    if (!s) return "";
    return s.length > len ? s.slice(0, len) + "…" : s;
  }

  function escapeHTML(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ========== 启动 ========== */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
