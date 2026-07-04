/**
 * AI PM 学习中心 — 文本批注（笔记）系统
 * 功能：选中文字 → 添加笔记 → 高亮显示 → 侧边笔记面板查看
 * 存储：localStorage（按页面路径独立存储）
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
    // 用相对路径作为 key，兼容 GitHub Pages 子路径
    const path = window.location.pathname;
    return STORAGE_PREFIX + path;
  }

  function loadNotes() {
    try {
      const raw = localStorage.getItem(getPageKey());
      notes = raw ? JSON.parse(raw) : [];
      // 恢复 ID 计数器
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

    // 3. 侧边笔记面板切换按钮
    const panelToggle = document.createElement("button");
    panelToggle.id = "note-panel-toggle";
    panelToggle.innerHTML = "📋<span class='note-count-badge'>0</span>";
    panelToggle.title = "查看笔记";
    document.body.appendChild(panelToggle);

    // 4. 侧边笔记面板
    const panel = document.createElement("div");
    panel.id = "note-panel";
    panel.innerHTML = `
      <div class="note-panel-header">
        <span>📋 我的笔记</span>
        <button class="note-panel-close">&times;</button>
      </div>
      <div class="note-panel-list"></div>
      <div class="note-panel-footer">
        <button class="note-panel-clear">清除本页笔记</button>
      </div>
    `;
    document.body.appendChild(panel);

    updateBadge();
  }

  /* ========== 事件绑定 ========== */
  function bindEvents() {
    // 文字选中 → 显示浮动按钮
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);

    // 浮动按钮点击 → 打开编辑弹窗
    const floatBtn = document.getElementById("note-float-btn");
    floatBtn.addEventListener("click", openModal);

    // 弹窗关闭/取消/保存
    const modal = document.getElementById("note-modal");
    modal.querySelector(".note-modal-backdrop").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-close").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-cancel").addEventListener("click", closeModal);
    modal.querySelector(".note-modal-save").addEventListener("click", saveNote);

    // 侧边面板
    document.getElementById("note-panel-toggle").addEventListener("click", togglePanel);
    document.querySelector(".note-panel-close").addEventListener("click", togglePanel);
    document.querySelector(".note-panel-clear").addEventListener("click", clearNotes);

    // ESC 关闭弹窗
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  /* ========== 文字选中处理 ========== */
  function onMouseUp(e) {
    // 如果点击的是浮动按钮本身，不处理
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

    // 定位浮动按钮
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.getElementById("note-float-btn");
    btn.style.display = "block";
    btn.style.left = `${window.scrollX + rect.left + rect.width / 2 - 50}px`;
    btn.style.top = `${window.scrollY + rect.top - 36}px`;
  }

  function onSelectionChange() {
    // 如果弹窗打开，不隐藏按钮
    const modal = document.getElementById("note-modal");
    if (modal.style.display === "block") return;
  }

  function hideFloatBtn() {
    document.getElementById("note-float-btn").style.display = "none";
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
    document.getElementById("note-modal").style.display = "none";
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
      // 跨元素选中时 surroundContents 会失败，用 insertNode 兜底
      const fragment = currentSelection.extractContents();
      span.appendChild(fragment);
      currentSelection.insertNode(span);
    }

    // 点击高亮文字 → 显示笔记
    span.addEventListener("click", () => showNoteTooltip(note.id));
  }

  function restoreHighlights() {
    // 重新加载页面时，需要从存储的 selectedText 重新高亮
    // 由于 DOM 已重新渲染，无法直接定位，采用「搜索文字并高亮」策略
    notes.forEach((note) => {
      highlightTextBySearch(note);
    });
  }

  function highlightTextBySearch(note) {
    if (!note.selectedText) return;
    const bodyText = document.body.innerText;
    const idx = bodyText.indexOf(note.selectedText);
    if (idx === -1) return;

    // 用 TreeWalker 找到文字节点并高亮
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
        // 忽略无法高亮的情况（文字已被其他高亮包裹等）
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

    // 定位到对应高亮元素附近
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
      // 更新 title
      const hl = document.querySelector(`[data-note-id="${noteId}"]`);
      if (hl) hl.title = `📝 ${truncate(note.note, 50)}`;
    }
  }

  function deleteNote(noteId) {
    removeTooltip();
    if (!confirm("确定删除这条笔记吗？")) return;
    notes = notes.filter((n) => n.id !== noteId);
    saveNotes();
    // 移除高亮
    const hl = document.querySelector(`[data-note-id="${noteId}"]`);
    if (hl) {
      const parent = hl.parentNode;
      parent.replaceChild(document.createTextNode(hl.textContent), hl);
      parent.normalize();
    }
    updateBadge();
    renderPanelList();
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

    // 绑定按钮事件
    list.querySelectorAll(".note-panel-item-edit").forEach((btn) => {
      btn.addEventListener("click", () => editNote(Number(btn.dataset.id)));
    });
    list.querySelectorAll(".note-panel-item-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteNote(Number(btn.dataset.id)));
    });

    // 点击选中文字 → 滚动到对应位置
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
    // 移除所有高亮
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
