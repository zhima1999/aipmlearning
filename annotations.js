/**
 * AI PM 学习中心 — 文本批注（笔记）系统
 * 功能：选中文字 → 添加笔记 → 高亮显示 → 侧边笔记面板查看
 * 存储：localStorage（按页面路径独立存储）
 * 导入/导出：支持跨设备迁移笔记
 */

(function () {
  "use strict";

  const STORAGE_PREFIX = "aipm_notes_";

  /* ========== 状态 ========== */
  let currentSelection = null;   // 当前选中的 Range
  let currentSelectedText = "";  // 选中的纯文本
  let notes = [];                // 当前页面的所有笔记
  let highlightIdCounter = 0;   // 高亮元素 ID 计数器

  /* ========== 初始化 ========== */
  function init() {
    loadNotes();
    createUI();
    bindEvents();
    restoreHighlights();
  }

  /* ========== 加载笔记 ========== */
  function getPageKey() {
    const path = window.location.pathname;
    return STORAGE_PREFIX + path;
  }

  function loadNotes() {
    try {
      const raw = localStorage.getItem(getPageKey());
      notes = raw ? JSON.parse(raw) : [];
      if (notes.length > 0) {
        highlightIdCounter = Math.max(...notes.map((n) => n.id)) + 1;
      }
    } catch {
      notes = [];
    }
  }

  function saveNotes() {
    localStorage.setItem(getPageKey(), JSON.stringify(notes));
  }

  /* ========== 创建 UI ========== */
  function createUI() {
    // 1. 浮动笔记按钮（选中文字后出现）
    const floatingBtn = document.createElement("div");
    floatingBtn.id = "note-float-btn";
    floatingBtn.innerHTML = "📝 添加笔记";
    floatingBtn.style.cssText = `
      position: absolute;
      z-index: 9999;
      background: #238636;
      color: #fff;
      font-size: 13px;
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      display: none;
      user-select: none;
      transition: opacity 0.15s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    document.body.appendChild(floatingBtn);

    // 2. 笔记编辑弹窗
    const modal = document.createElement("div");
    modal.id = "note-modal";
    modal.innerHTML = `
      <div class="note-modal-backdrop"></div>
      <div class="note-modal-box">
        <div class="note-modal-header">
          <span>📝 添加阅读笔记</span>
          <button class="note-modal-close">&times;</button>
        </div>
        <div class="note-modal-selected-text"></div>
        <textarea class="note-modal-textarea" placeholder="写下你的笔记、疑问或思考…"></textarea>
        <div class="note-modal-actions">
          <button class="note-modal-cancel">取消</button>
          <button class="note-modal-save">保存笔记</button>
        </div>
      </div>
    `;
    modal.style.cssText = "display:none;";
    document.body.appendChild(modal);

    // 3. 隐藏的文件上传 input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.id = "note-import-input";
    fileInput.style.cssText = "display:none;";
    document.body.appendChild(fileInput);

    // 4. 侧边笔记面板切换按钮
    const panelToggle = document.createElement("button");
    panelToggle.id = "note-panel-toggle";
    panelToggle.innerHTML = "📋<span class='note-count-badge'>0</span>";
    panelToggle.title = "查看笔记";
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
        <button class="note-panel-clear">清除</button>
      </div>
    `;
    document.body.appendChild(panel);

    updateBadge();
  }

  /* ========== 事件绑定 ========== */
  function bindEvents() {
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);

    const floatBtn = document.getElementById("note-float-btn");
    floatBtn.addEventListener("click", openModal);

    const modal = document.getElementById("note-modal");
    modal.querySelector(".note-modal-backdrop").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-close").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-cancel").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-save").addEventListener("click", saveNote);

    document.getElementById("note-panel-toggle").addEventListener("click", togglePanel);
    document.querySelector(".note-panel-close").addEventListener("click", togglePanel);
    document.querySelector(".note-panel-clear").addEventListener("click", clearNotes);
    document.querySelector(".note-panel-export").addEventListener("click", exportNotes);
    document.querySelector(".note-panel-import").addEventListener("click", () => {
      document.getElementById("note-import-input").click();
    });

    document.getElementById("note-import-input").addEventListener("change", importNotes);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // 点击页面其他地方关闭 tooltip
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#note-tooltip") && !e.target.closest(".note-highlight")) {
        removeTooltip();
      }
    });
  }

  /* ========== 文字选中处理 ========== */
  function onMouseUp(e) {
    if (e.target.closest("#note-float-btn")) return;
    if (e.target.closest("#note-modal")) return;

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

    currentSelection = sel.getRangeAt(0).cloneRange();
    currentSelectedText = text;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.getElementById("note-float-btn");
    btn.style.display = "block";
    btn.style.left = `${window.scrollX + rect.left + rect.width / 2 - 50}px`;
    btn.style.top = `${window.scrollY + rect.top - 36}px`;
  }

  function onSelectionChange() {
    const modal = document.getElementById("note-modal");
    if (modal.style.display === "block") return;
  }

  function hideFloatBtn() {
    const btn = document.getElementById("note-float-btn");
    if (btn) btn.style.display = "none";
  }

  /* ========== 弹窗操作 ========== */
  function openModal() {
    hideFloatBtn();
    const modal = document.getElementById("note-modal");
    const selectedTextDiv = modal.querySelector(".note-modal-selected-text");
    selectedTextDiv.textContent = `「${truncate(currentSelectedText, 100)}」`;
    modal.querySelector(".note-modal-textarea").value = "";
    modal.style.display = "block";
    setTimeout(() => modal.querySelector(".note-modal-textarea").focus(), 100);
  }

  function closeModal() {
    const modal = document.getElementById("note-modal");
    if (modal) modal.style.display = "none";
    window.getSelection().removeAllRanges();
  }

  function saveNote() {
    const textarea = document.getElementById("note-modal").querySelector(".note-modal-textarea");
    const noteContent = textarea.value.trim();
    if (!noteContent) {
      textarea.focus();
      textarea.style.borderColor = "#f85149";
      setTimeout(() => (textarea.style.borderColor = ""), 1500);
      return;
    }

    const note = {
      id: highlightIdCounter++,
      selectedText: currentSelectedText,
      note: noteContent,
      createdAt: new Date().toISOString(),
    };

    notes.push(note);
    saveNotes();
    closeModal();
    highlightText(note);
    updateBadge();
    renderPanelList();
  }

  /* ========== 高亮文字 ========== */
  function highlightText(note) {
    if (!currentSelection) return;

    const span = document.createElement("span");
    span.className = "note-highlight";
    span.dataset.noteId = note.id;
    span.title = `📝 ${truncate(note.note, 50)}`;

    try {
      currentSelection.surroundContents(span);
    } catch {
      const fragment = currentSelection.extractContents();
      span.appendChild(fragment);
      currentSelection.insertNode(span);
    }

    span.addEventListener("click", (e) => {
      e.stopPropagation();
      showNoteTooltip(note.id);
    });
  }

  function restoreHighlights() {
    notes.forEach((note) => {
      highlightTextBySearch(note);
    });
  }

  function highlightTextBySearch(note) {
    if (!note.selectedText) return;
    const bodyText = document.body.innerText;
    const idx = bodyText.indexOf(note.selectedText);
    if (idx === -1) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let targetNode = null;
    let targetOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLen = node.textContent.length;
      if (charCount + nodeLen > idx) {
        targetNode = node;
        targetOffset = idx - charCount;
        break;
      }
      charCount += nodeLen;
    }

    if (targetNode) {
      try {
        const range = document.createRange();
        range.setStart(targetNode, targetOffset);
        range.setEnd(targetNode, targetOffset + note.selectedText.length);

        const span = document.createElement("span");
        span.className = "note-highlight";
        span.dataset.noteId = note.id;
        span.title = `📝 ${truncate(note.note, 50)}`;

        range.surroundContents(span);
        span.addEventListener("click", (e) => {
          e.stopPropagation();
          showNoteTooltip(note.id);
        });
      } catch {
        // 忽略无法高亮的情况
      }
    }
  }

  /* ========== 笔记 Tooltip ========== */
  function showNoteTooltip(noteId) {
    removeTooltip();

    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    const tooltip = document.createElement("div");
    tooltip.id = "note-tooltip";
    tooltip.innerHTML = `
      <div class="note-tooltip-content">${escapeHtml(note.note).replace(/\n/g, "<br>")}</div>
      <div class="note-tooltip-actions">
        <button class="note-tooltip-edit" data-id="${noteId}">编辑</button>
        <button class="note-tooltip-delete" data-id="${noteId}">删除</button>
      </div>
    `;
    document.body.appendChild(tooltip);

    const hl = document.querySelector(`[data-note-id="${noteId}"]`);
    if (hl) {
      const rect = hl.getBoundingClientRect();
      tooltip.style.left = `${window.scrollX + rect.left}px`;
      tooltip.style.top = `${window.scrollY + rect.bottom + 8}px`;
    }

    tooltip.querySelector(".note-tooltip-edit").addEventListener("click", () => editNote(noteId));
    tooltip.querySelector(".note-tooltip-delete").addEventListener("click", () => deleteNote(noteId));
  }

  function removeTooltip() {
    const old = document.getElementById("note-tooltip");
    if (old) old.remove();
  }

  function editNote(noteId) {
    removeTooltip();
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    const newContent = prompt("编辑笔记：", note.note);
    if (newContent !== null && newContent.trim()) {
      note.note = newContent.trim();
      saveNotes();
      updateBadge();
      renderPanelList();
      const hl = document.querySelector(`[data-note-id="${noteId}"]`);
      if (hl) hl.title = `📝 ${truncate(note.note, 50)}`;
    }
  }

  function deleteNote(noteId) {
    removeTooltip();
    if (!confirm("确定删除这条笔记吗？")) return;
    notes = notes.filter((n) => n.id !== noteId);
    saveNotes();
    const hl = document.querySelector(`[data-note-id="${noteId}"]`);
    if (hl) {
      const parent = hl.parentNode;
      parent.replaceChild(document.createTextNode(hl.textContent), hl);
      parent.normalize();
    }
    updateBadge();
    renderPanelList();
  }

  /* ========== 导入/导出 ========== */

  /**
   * 导出所有笔记（全部页面）为 JSON 文件
   * 文件格式：{ version, exportDate, pages: { "页面路径": [笔记数组] } }
   */
  function exportNotes() {
    const allData = {};
    let totalNotes = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const pageNotes = JSON.parse(localStorage.getItem(key));
          if (pageNotes && pageNotes.length > 0) {
            // key 格式：aipm_notes_/path/to/page.html
            const pagePath = key.replace(STORAGE_PREFIX, "");
            allData[pagePath] = pageNotes;
            totalNotes += pageNotes.length;
          }
        } catch {}
      }
    }

    if (totalNotes === 0) {
      alert("还没有任何笔记可以导出。");
      return;
    }

    const exportObj = {
      version: 1,
      exportDate: new Date().toISOString(),
      totalNotes: totalNotes,
      pages: allData,
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `aipm-notes-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 显示导出成功提示
    showToast(`✅ 已导出 ${totalNotes} 条笔记`);
  }

  /**
   * 从 JSON 文件导入笔记
   * 支持合并模式：已有笔记不被覆盖，新的笔记追加
   */
  function importNotes(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // 校验格式
        if (!data.pages || typeof data.pages !== "object") {
          alert("文件格式不正确，请选择由本系统导出的 JSON 文件。");
          return;
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const [pagePath, pageNotes] of Object.entries(data.pages)) {
          const key = STORAGE_PREFIX + pagePath;
          let existingNotes = [];
          try {
            const raw = localStorage.getItem(key);
            existingNotes = raw ? JSON.parse(raw) : [];
          } catch {}

          // 合并：跳过 ID 已存在的笔记
          const existingIds = new Set(existingNotes.map((n) => n.id));
          for (const note of pageNotes) {
            if (!existingIds.has(note.id)) {
              existingNotes.push(note);
              importedCount++;
            } else {
              skippedCount++;
            }
          }

          // 重新排序 ID 计数器
          if (existingNotes.length > 0) {
            const maxId = Math.max(...existingNotes.map((n) => n.id));
            // 如果当前页面是这个页面，同步更新 highlightIdCounter
            if (key === getPageKey()) {
              highlightIdCounter = maxId + 1;
            }
          }

          localStorage.setItem(key, JSON.stringify(existingNotes));
        }

        // 重新加载当前页面笔记
        loadNotes();

        // 重新渲染：先清除所有高亮，再重新高亮
        document.querySelectorAll(".note-highlight").forEach((hl) => {
          const parent = hl.parentNode;
          parent.replaceChild(document.createTextNode(hl.textContent), hl);
          parent.normalize();
        });
        restoreHighlights();
        updateBadge();
        renderPanelList();

        let msg = `✅ 导入完成！新增 ${importedCount} 条笔记`;
        if (skippedCount > 0) msg += `，跳过 ${skippedCount} 条重复笔记`;
        showToast(msg);

      } catch (err) {
        alert("文件解析失败，请确认文件格式是否正确。\n错误：" + err.message);
      }
    };

    reader.readAsText(file);
    // 清空 input，允许重复选择同一文件
    e.target.value = "";
  }

  /* ========== Toast 提示 ========== */
  function showToast(msg) {
    const existing = document.getElementById("note-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "note-toast";
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 24px;
      z-index: 11000;
      background: #1a2e1a;
      color: #3fb950;
      border: 1px solid #238636;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: noteToastIn 0.3s ease;
    `;
    // 添加动画样式
    if (!document.getElementById("note-toast-style")) {
      const style = document.createElement("style");
      style.id = "note-toast-style";
      style.textContent = `
        @keyframes noteToastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes noteToastOut { from { opacity: 1; } to { opacity: 0; transform: translateY(12px); } }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "noteToastOut 0.3s ease forwards";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  /* ========== 侧边面板 ========== */
  function togglePanel() {
    const panel = document.getElementById("note-panel");
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      renderPanelList();
    }
  }

  function renderPanelList() {
    const list = document.querySelector(".note-panel-list");
    if (notes.length === 0) {
      list.innerHTML = `<div class="note-panel-empty">还没有笔记，选中文字后点击 📝 添加笔记吧！</div>`;
      return;
    }

    list.innerHTML = notes
      .slice()
      .reverse()
      .map(
        (n) => `
      <div class="note-panel-item" data-id="${n.id}">
        <div class="note-panel-item-selected">「${escapeHtml(truncate(n.selectedText, 60))}」</div>
        <div class="note-panel-item-note">${escapeHtml(n.note).replace(/\n/g, "<br>")}</div>
        <div class="note-panel-item-meta">
          <span>${formatDate(n.createdAt)}</span>
          <span>
            <button class="note-panel-item-edit" data-id="${n.id}">编辑</button>
            <button class="note-panel-item-delete" data-id="${n.id}">删除</button>
          </span>
        </div>
      </div>
    `
      )
      .join("");

    list.querySelectorAll(".note-panel-item-edit").forEach((btn) => {
      btn.addEventListener("click", () => editNote(Number(btn.dataset.id)));
    });
    list.querySelectorAll(".note-panel-item-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteNote(Number(btn.dataset.id)));
    });

    list.querySelectorAll(".note-panel-item").forEach((item) => {
      item.querySelector(".note-panel-item-selected").addEventListener("click", () => {
        const id = Number(item.dataset.id);
        const hl = document.querySelector(`[data-note-id="${id}"]`);
        if (hl) {
          hl.scrollIntoView({ behavior: "smooth", block: "center" });
          hl.style.outline = "2px solid #f0883e";
          setTimeout(() => (hl.style.outline = ""), 2000);
        }
      });
    });
  }

  function clearNotes() {
    if (!confirm("确定清除本页所有笔记吗？此操作不可撤销。")) return;
    notes = [];
    highlightIdCounter = 0;
    saveNotes();
    document.querySelectorAll(".note-highlight").forEach((hl) => {
      const parent = hl.parentNode;
      parent.replaceChild(document.createTextNode(hl.textContent), hl);
      parent.normalize();
    });
    updateBadge();
    renderPanelList();
  }

  function updateBadge() {
    const badge = document.querySelector(".note-count-badge");
    if (badge) badge.textContent = notes.length;
  }

  /* ========== 工具函数 ========== */
  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + "…" : str;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /* ========== 启动 ========== */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
