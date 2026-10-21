/**
 * 04-popups-docs-and-topology.js — Multi-Window Popups, Multi-Format File Viewer & Drive Browser
 */

function escapeHtmlSafe(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FILE_FORMAT_META_MAP = {
  csv: { ext: 'csv', shortBadge: 'CSV', badge: 'CSV SPREADSHEET', icon: '📊', previewLabel: '📊 Spreadsheet Table View', editorLabel: '✏️ Edit CSV Rows', mimeType: 'text/csv;charset=utf-8' },
  tsv: { ext: 'tsv', shortBadge: 'TSV', badge: 'TSV SPREADSHEET', icon: '📊', previewLabel: '📊 Spreadsheet Table View', editorLabel: '✏️ Edit TSV Rows', mimeType: 'text/tab-separated-values;charset=utf-8' },
  json: { ext: 'json', shortBadge: 'JSON', badge: 'JSON DATA FILE', icon: '🗂️', previewLabel: '🗂️ Structured JSON View', editorLabel: '✏️ Edit Raw JSON', mimeType: 'application/json;charset=utf-8' },
  pdf: { ext: 'pdf', shortBadge: 'PDF', badge: 'PDF DOCUMENT', icon: '📕', previewLabel: '📕 PDF Document View', editorLabel: '✏️ Edit Document Text', mimeType: 'application/pdf' },
  png: { ext: 'png', shortBadge: 'PNG', badge: 'PNG IMAGE', icon: '🖼️', previewLabel: '🖼️ Image Preview', editorLabel: '✏️ Image Notes', mimeType: 'image/png', isImage: true },
  jpg: { ext: 'jpg', shortBadge: 'JPG', badge: 'JPEG IMAGE', icon: '🖼️', previewLabel: '🖼️ Image Preview', editorLabel: '✏️ Image Notes', mimeType: 'image/jpeg', isImage: true },
  jpeg: { ext: 'jpeg', shortBadge: 'JPEG', badge: 'JPEG IMAGE', icon: '🖼️', previewLabel: '🖼️ Image Preview', editorLabel: '✏️ Image Notes', mimeType: 'image/jpeg', isImage: true },
  gif: { ext: 'gif', shortBadge: 'GIF', badge: 'GIF IMAGE', icon: '🖼️', previewLabel: '🖼️ Image Preview', editorLabel: '✏️ Image Notes', mimeType: 'image/gif', isImage: true },
  webp: { ext: 'webp', shortBadge: 'WEBP', badge: 'WEBP IMAGE', icon: '🖼️', previewLabel: '🖼️ Image Preview', editorLabel: '✏️ Image Notes', mimeType: 'image/webp', isImage: true },
  svg: { ext: 'svg', shortBadge: 'SVG', badge: 'SVG VECTOR', icon: '🖼️', previewLabel: '🖼️ Vector Preview', editorLabel: '✏️ Edit SVG Source', mimeType: 'image/svg+xml', isImage: true },
  docx: { ext: 'docx', shortBadge: 'DOCX', badge: 'WORD DOCUMENT', icon: '📘', previewLabel: '📘 Document Reader View', editorLabel: '✏️ Edit Document Text', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  doc: { ext: 'doc', shortBadge: 'DOC', badge: 'WORD DOCUMENT', icon: '📘', previewLabel: '📘 Document Reader View', editorLabel: '✏️ Edit Document Text', mimeType: 'application/msword' },
  xlsx: { ext: 'xlsx', shortBadge: 'XLSX', badge: 'EXCEL WORKBOOK', icon: '📗', previewLabel: '📗 Workbook Table View', editorLabel: '✏️ Edit Sheet Data', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { ext: 'pptx', shortBadge: 'PPTX', badge: 'SLIDE DECK', icon: '📙', previewLabel: '📙 Slide Deck View', editorLabel: '✏️ Edit Slide Text', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  txt: { ext: 'txt', shortBadge: 'TXT', badge: 'PLAIN TEXT FILE', icon: '📄', previewLabel: '📄 Clean Text Reader', editorLabel: '✏️ Edit Plain Text', mimeType: 'text/plain;charset=utf-8' },
  log: { ext: 'log', shortBadge: 'LOG', badge: 'LOG FILE', icon: '📄', previewLabel: '📄 Log Inspector View', editorLabel: '✏️ Edit Raw Log', mimeType: 'text/plain;charset=utf-8' },
  md: { ext: 'md', shortBadge: 'MD', badge: 'MARKDOWN SPEC', icon: '📝', previewLabel: '📝 Formatted Document View', editorLabel: '✏️ Edit Document Source', mimeType: 'text/markdown;charset=utf-8', isMarkdown: true },
};

function getFileFormatMeta(filename, fileObj) {
  const raw = String(filename || (fileObj && fileObj.filename) || 'document.txt').trim();
  const leaf = raw.split('/').pop() || raw;
  const dotIdx = leaf.lastIndexOf('.');
  const ext = dotIdx > 0 ? leaf.slice(dotIdx + 1).toLowerCase() : String((fileObj && fileObj.file_type) || 'txt').toLowerCase();
  if (FILE_FORMAT_META_MAP[ext]) return Object.assign({ leafName: leaf }, FILE_FORMAT_META_MAP[ext]);
  const isCode = ['py', 'js', 'ts', 'sql', 'yaml', 'yml', 'html', 'xml', 'sh', 'css'].includes(ext);
  return {
    leafName: leaf,
    ext: ext || 'txt',
    shortBadge: (ext || 'FILE').toUpperCase().slice(0, 5),
    badge: isCode ? `${ext.toUpperCase()} SOURCE FILE` : `${(ext || 'TEXT').toUpperCase()} DOCUMENT`,
    icon: isCode ? '💻' : '📄',
    previewLabel: isCode ? `💻 ${ext.toUpperCase()} Code View` : `📄 ${ext ? ext.toUpperCase() : 'Document'} Reader View`,
    editorLabel: isCode ? '✏️ Edit Source Code' : '✏️ Edit File Content',
    mimeType: 'text/plain;charset=utf-8',
    isCode,
  };
}

function findFileRecordByName(fileTitle) {
  const norm = String(fileTitle || '').trim().toLowerCase();
  const leafNorm = (norm.split('/').pop() || norm).trim();
  if (!norm) return null;
  const env = typeof normalizeAccountKey === 'function' ? normalizeAccountKey(activeEnvironment) : 'cloud';
  const localFiles = typeof getStoredCustomFiles === 'function' ? getStoredCustomFiles() : [];
  const matchFn = (f) => {
    if (!f || !f.filename) return false;
    const fn = String(f.filename).trim().toLowerCase();
    return fn === norm || (fn.split('/').pop() || fn).trim() === leafNorm;
  };
  const localHit = localFiles.find((f) => matchFn(f) && normalizeAccountKey(f.environment) === env) || localFiles.find(matchFn) || null;
  let serverHit = null;
  if (appState && Array.isArray(appState.user_files)) {
    const matchMap = {
      'demo launch brief.md': 'FILE-OWNER-105',
      'demo product prd.md': 'FILE-PM-101',
      'demo nda vault.md': 'FILE-LEGAL-102',
      'pso rate card.csv': 'FILE-DEAL-103',
      'demo brand rules.md': 'FILE-BRAND-104',
    };
    const targetId = matchMap[norm] || matchMap[leafNorm];
    serverHit =
      appState.user_files.find((f) => ((targetId && f.id === targetId) || matchFn(f)) && normalizeAccountKey(f.environment) === env) ||
      appState.user_files.find((f) => (targetId && f.id === targetId) || matchFn(f)) ||
      null;
  }
  if (!localHit && !serverHit) return null;
  const merged = Object.assign({}, serverHit || {}, localHit || {});
  merged.visibility = (localHit && localHit.visibility) || (serverHit && serverHit.visibility) || merged.visibility;
  return merged;
}

function parseCsvLineSafe(line, delim) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delim && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function renderFilePreviewHtml(rawText, fileTitle, fileObj) {
  const resolvedTitle = fileTitle || (fileObj && fileObj.filename) || activeBlueFileTitle || 'Document.txt';
  const record = fileObj || findFileRecordByName(resolvedTitle);
  const fmt = getFileFormatMeta(resolvedTitle, record);
  const text = String(rawText || (record && record.content) || '');
  const dataUrl = (record && record.data_url) || (text.startsWith('data:') ? text.trim() : '');
  const metaBanner = `<div class="doc-format-banner"><span class="doc-format-pill">${escapeHtmlSafe(fmt.icon)} ${escapeHtmlSafe(fmt.badge)}</span><span class="doc-format-filename">${escapeHtmlSafe(fmt.leafName)}</span></div>`;

  if (fmt.isImage && dataUrl) {
    return `${metaBanner}<div class="doc-media-preview-wrap"><img class="doc-image-preview" src="${escapeHtmlSafe(dataUrl)}" alt="${escapeHtmlSafe(fmt.leafName)}" /></div>${text && !text.startsWith('data:') ? `<div class="doc-plain-block">${escapeHtmlSafe(text)}</div>` : ''}`;
  }
  if (fmt.ext === 'pdf' && dataUrl.startsWith('data:application/pdf')) {
    return `${metaBanner}<div class="doc-media-preview-wrap"><embed class="doc-pdf-embed" src="${escapeHtmlSafe(dataUrl)}" type="application/pdf" /></div>${text && !text.startsWith('data:') ? `<div class="doc-plain-block">${escapeHtmlSafe(text)}</div>` : ''}`;
  }

  if (fmt.ext === 'csv' || fmt.ext === 'tsv' || fmt.ext === 'xlsx') {
    const delim = fmt.ext === 'tsv' ? '\t' : ',';
    const notes = [];
    const tableLines = [];
    text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const cleaned = l.replace(/^-\s+/, '');
      if (cleaned.includes(delim) && !l.startsWith('#') && !l.startsWith('**') && !l.startsWith('>')) tableLines.push(cleaned);
      else notes.push(l);
    });
    if (tableLines.length > 0) {
      const rows = tableLines.map((l) => parseCsvLineSafe(l, delim));
      const hdr = rows[0];
      const thHtml = `<th>#</th>` + hdr.map((h) => `<th>${escapeHtmlSafe(h)}</th>`).join('');
      const trHtml = rows.slice(1).map((r, rIdx) => `<tr><td class="doc-csv-rownum">${rIdx + 1}</td>${hdr.map((_, cIdx) => `<td>${escapeHtmlSafe(r[cIdx] !== undefined ? r[cIdx] : '')}</td>`).join('')}</tr>`).join('');
      const notesHtml = notes.length ? `<div class="doc-csv-notes">${notes.map((n) => `<div>${escapeHtmlSafe(n.replace(/^#+\s*/, ''))}</div>`).join('')}</div>` : '';
      return `${metaBanner}${notesHtml}<div class="doc-csv-table-wrap"><table class="doc-csv-table"><thead><tr>${thHtml}</tr></thead><tbody>${trHtml || `<tr><td colspan="${hdr.length + 1}">1 header row loaded</td></tr>`}</tbody></table></div>`;
    }
  }

  if (fmt.ext === 'json') {
    let pretty = text;
    let summaryPills = '';
    try {
      const parsed = JSON.parse(text);
      pretty = JSON.stringify(parsed, null, 2);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        summaryPills = `<div class="doc-json-keys">${Object.keys(parsed).slice(0, 8).map((k) => `<span class="doc-json-key-chip">${escapeHtmlSafe(k)}: <strong>${escapeHtmlSafe(typeof parsed[k] === 'object' ? (Array.isArray(parsed[k]) ? `[${parsed[k].length}]` : '{…}') : String(parsed[k]).slice(0, 28))}</strong></span>`).join('')}</div>`;
      }
    } catch (_) {}
    return `${metaBanner}${summaryPills}<pre class="doc-code-pre">${escapeHtmlSafe(pretty)}</pre>`;
  }

  if (fmt.isCode || fmt.ext === 'txt' || fmt.ext === 'log') {
    const numbered = text.split('\n').map((line, idx) => `<div class="doc-plain-line"><span class="doc-plain-ln">${String(idx + 1).padStart(2, '0')}</span><span class="doc-plain-tx">${escapeHtmlSafe(line) || '&nbsp;'}</span></div>`).join('');
    return `${metaBanner}<div class="doc-plain-reader">${numbered}</div>`;
  }

  const htmlParts = [metaBanner];
  text.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('# ')) htmlParts.push(`<h1>${escapeHtmlSafe(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) htmlParts.push(`<h2>${escapeHtmlSafe(line.slice(3))}</h2>`);
    else if (line.startsWith('### ')) htmlParts.push(`<h3>${escapeHtmlSafe(line.slice(4))}</h3>`);
    else if (line.startsWith('> ')) htmlParts.push(`<blockquote>${escapeHtmlSafe(line.slice(2))}</blockquote>`);
    else if (line.startsWith('- ')) htmlParts.push(`<div class="doc-bullet-line">• ${escapeHtmlSafe(line.slice(2))}</div>`);
    else htmlParts.push(`<div>${escapeHtmlSafe(line)}</div>`);
  });
  return htmlParts.join('');
}

function renderMarkdownPreviewHtml(mdText, fileTitle, fileObj) {
  return renderFilePreviewHtml(mdText, fileTitle, fileObj);
}

function setWindowNodeText(winEl, nodeId, text) {
  if (!winEl) {
    setNodeText(nodeId, text);
    return;
  }
  winEl.querySelectorAll(`[data-node-id="${nodeId}"]`).forEach((el) => {
    el.textContent = text;
  });
}

function getWindowNodeText(winEl, nodeId) {
  if (!winEl) return getNodeText(nodeId);
  const el = winEl.querySelector(`[data-node-id="${nodeId}"]`);
  return el ? el.textContent.trim() : '';
}

function getOrCreateBlueFileWindow(fileTitle) {
  const resolvedTitle = normalizeSeedFilename(fileTitle || activeBlueFileTitle || 'DEMO PRODUCT PRD.md');
  const slug = String(resolvedTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file';
  const winId = `popup-136-341-${slug}`;
  let winEl = document.getElementById(winId);
  if (!winEl) {
    const baseTemplate = document.getElementById('popup-136-341');
    if (!baseTemplate) return null;
    winEl = baseTemplate.cloneNode(true);
    winEl.id = winId;
    winEl.dataset.popupBaseId = '136:341';
    winEl.dataset.fileTitle = resolvedTitle;
    winEl.classList.remove('active', 'is-dragging');
    delete winEl.dataset.userDragged;
    winEl.dataset.dx = '0';
    winEl.dataset.dy = '0';
    if (baseTemplate.parentNode) baseTemplate.parentNode.insertBefore(winEl, baseTemplate.nextSibling);
  } else {
    winEl.dataset.fileTitle = resolvedTitle;
    winEl.dataset.popupBaseId = '136:341';
  }
  return winEl;
}

function applyFileScopeToggleUI(winEl, scope) {
  const resolvedScope = scope === 'private' ? 'private' : 'federated';
  activeBlueFileScope = resolvedScope;
  const root = winEl || document.getElementById('popup-136-341');
  if (!root) return resolvedScope;
  root.dataset.fileScope = resolvedScope;
  const isLight = typeof getDockThemeMode === 'function' && getDockThemeMode() === 'light';
  const fedEl = root.querySelector('[data-node-id="136:404"]');
  const privEl = root.querySelector('[data-node-id="136:407"]');
  const styleOption = (el, dotId, lblId, isActive) => {
    if (!el) return;
    el.style.background = isActive
      ? (isLight ? '#F1F5F9' : '#1E293B')
      : (isLight ? '#F8FAFC' : '#0F172A');
    el.style.border = isActive
      ? `1.5px solid ${isLight ? '#0F172A' : '#F8FAFC'}`
      : `1px solid ${isLight ? '#CBD5E1' : '#334155'}`;
    el.style.opacity = isActive ? '1' : '0.8';
    el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    const dot = el.querySelector(`[data-node-id="${dotId}"]`);
    if (dot) {
      dot.style.background = isActive ? (isLight ? '#0F172A' : '#F8FAFC') : '#64748B';
      dot.style.boxShadow = 'none';
    }
    const lbl = el.querySelector(`[data-node-id="${lblId}"]`);
    if (lbl) lbl.style.color = isActive ? (isLight ? '#0F172A' : '#F8FAFC') : (isLight ? '#334155' : '#CBD5E1');
  };
  styleOption(fedEl, '136:405', '136:406', resolvedScope === 'federated');
  styleOption(privEl, '136:408', '136:409', resolvedScope === 'private');
  const fTitle = root.dataset.fileTitle || activeBlueFileTitle || 'DEMO LAUNCH BRIEF.md';
  const fmt = getFileFormatMeta(fTitle, findFileRecordByName(fTitle));
  const scopeBadge = resolvedScope === 'private' ? '🔒 PRIVATE TO MY AGENT' : '🌐 FEDERATED ACROSS TEAMS';
  setWindowNodeText(root, '136:351', `${fmt.icon} ${fmt.badge} · ${scopeBadge}`);
  return resolvedScope;
}

function getOrCreateYellowWorkflowWindow(popupId, triggerEl) {
  const safeId = 'popup-' + popupId.replace(':', '-');
  const baseWin = document.getElementById(safeId);
  if (!baseWin) return null;
  baseWin.dataset.popupBaseId = popupId;
  const customWfTitle = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-title') : null;
  const customWfTicketId = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-ticket-id') : null;
  if (!customWfTitle) return baseWin;

  const wfSlug = String(customWfTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-wf';
  const customWinId = `${safeId}-wf-${wfSlug}`;
  let customWin = document.getElementById(customWinId);
  if (!customWin) {
    customWin = baseWin.cloneNode(true);
    customWin.id = customWinId;
    customWin.dataset.popupBaseId = popupId;
    customWin.dataset.customWfTitle = customWfTitle;
    if (customWfTicketId) customWin.dataset.customWfTicketId = customWfTicketId;
    customWin.classList.remove('active', 'is-dragging');
    delete customWin.dataset.userDragged;
    customWin.dataset.dx = '0';
    customWin.dataset.dy = '0';
    if (baseWin.parentNode) baseWin.parentNode.insertBefore(customWin, baseWin.nextSibling);
  } else if (customWfTicketId) {
    customWin.dataset.customWfTicketId = customWfTicketId;
  }
  return customWin;
}

function ensureDocViewerDrawerMounted(fullDocText, targetWin, fileTitle, fileObj) {
  const popupEl = targetWin || document.getElementById('popup-136-341');
  if (!popupEl) return;
  const boundTitle = normalizeSeedFilename(fileTitle || popupEl.dataset.fileTitle || activeBlueFileTitle || 'DEMO PRODUCT PRD.md');
  popupEl.dataset.fileTitle = boundTitle;
  const record = fileObj || findFileRecordByName(boundTitle);
  const fmt = getFileFormatMeta(boundTitle, record);

  const contentArea = popupEl.querySelector('[data-node-id="136:352"]') || popupEl.querySelector('[data-node-id="136:341"]') || popupEl;
  const legacyEditorBox = popupEl.querySelector('[data-node-id="136:361"]');
  let drawer = popupEl.querySelector('.doc-viewer-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.className = 'doc-viewer-drawer';
    drawer.innerHTML = `
      <div class="doc-viewer-header">
        <div class="doc-viewer-tabs">
          <button type="button" class="doc-viewer-tab-btn active" data-api-action="switch-doc-view-mode" data-doc-mode="preview">${escapeHtmlSafe(fmt.previewLabel)}</button>
          <button type="button" class="doc-viewer-tab-btn" data-api-action="switch-doc-view-mode" data-doc-mode="source">${escapeHtmlSafe(fmt.editorLabel)}</button>
        </div>
        <div class="doc-viewer-tabs">
          <button type="button" class="doc-viewer-tab-btn" data-api-action="download-active-doc">⬇️ Download (${escapeHtmlSafe(fmt.shortBadge)})</button>
          <button type="button" class="doc-viewer-tab-btn danger" data-api-action="trash-active-doc">🗑️ Move to Trash</button>
        </div>
      </div>
      <div class="doc-viewer-rendered"></div>
      <textarea class="doc-viewer-textarea" spellcheck="false"></textarea>
    `;
    if (legacyEditorBox && legacyEditorBox.parentNode === contentArea) contentArea.insertBefore(drawer, legacyEditorBox);
    else contentArea.appendChild(drawer);
    const ta = drawer.querySelector('.doc-viewer-textarea');
    if (ta) {
      ta.addEventListener('input', () => {
        const curTitle = popupEl.dataset.fileTitle || boundTitle;
        const updatedLines = ta.value.split('\n');
        BLUE_FILE_FALLBACKS[curTitle] = updatedLines;
        const nonEmpty = updatedLines.filter((l) => l.trim().length > 0);
        EDITOR_LINE_NODE_IDS.forEach((nid, idx) => {
          if (nonEmpty[idx] !== undefined) setWindowNodeText(popupEl, nid, nonEmpty[idx]);
        });
        const previewEl = drawer.querySelector('.doc-viewer-rendered');
        if (previewEl) previewEl.innerHTML = renderFilePreviewHtml(ta.value, curTitle, findFileRecordByName(curTitle));
      });
    }
  } else if (legacyEditorBox && legacyEditorBox.parentNode === contentArea && drawer.parentNode !== contentArea) {
    contentArea.insertBefore(drawer, legacyEditorBox);
  }

  if (legacyEditorBox) legacyEditorBox.style.display = 'none';
  const prevBtn = drawer.querySelector('[data-doc-mode="preview"]');
  const srcBtn = drawer.querySelector('[data-doc-mode="source"]');
  const dlBtn = drawer.querySelector('[data-api-action="download-active-doc"]');
  if (prevBtn) prevBtn.textContent = fmt.previewLabel;
  if (srcBtn) srcBtn.textContent = fmt.editorLabel;
  if (dlBtn) dlBtn.textContent = `⬇️ Download (${fmt.shortBadge})`;

  const previewEl = drawer.querySelector('.doc-viewer-rendered');
  const textareaEl = drawer.querySelector('.doc-viewer-textarea');
  if (previewEl) {
    previewEl.innerHTML = renderFilePreviewHtml(fullDocText, boundTitle, record);
    previewEl.style.display = 'block';
  }
  if (textareaEl) {
    textareaEl.value = fullDocText;
    textareaEl.style.display = 'none';
  }
  drawer.querySelectorAll('[data-api-action="switch-doc-view-mode"]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-doc-mode') === 'preview');
  });
}

function loadBlueFileIntoPopup(fileTitle, targetWin) {
  const resolvedTitle = normalizeSeedFilename(fileTitle || activeBlueFileTitle || 'DEMO LAUNCH BRIEF.md');
  activeBlueFileTitle = resolvedTitle;
  const winEl = targetWin || getOrCreateBlueFileWindow(resolvedTitle) || document.getElementById('popup-136-341');
  if (winEl) winEl.dataset.fileTitle = resolvedTitle;
  const found = findFileRecordByName(resolvedTitle);
  const fmt = getFileFormatMeta(resolvedTitle, found);
  const envKey = typeof normalizeAccountKey === 'function' ? normalizeAccountKey(activeEnvironment) : 'cloud';
  const defaultScope = typeof isCustomAccountKey === 'function' && isCustomAccountKey(envKey) ? 'private' : 'federated';
  const resolvedScope =
    (found && (found.visibility === 'private' || found.visibility === 'federated') && found.visibility) ||
    (winEl && (winEl.dataset.fileScope === 'private' || winEl.dataset.fileScope === 'federated') && winEl.dataset.fileScope) ||
    defaultScope;

  setWindowNodeText(winEl, '136:348', fmt.leafName);
  applyFileScopeToggleUI(winEl, resolvedScope);
  setWindowNodeText(winEl, '136:357', `/workspace/${envKey}/${fmt.leafName.replace(/\s+/g, '_')}`);
  setWindowNodeText(winEl, '136:360', 'OPEN · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));

  let lines = BLUE_FILE_FALLBACKS[resolvedTitle] || BLUE_FILE_FALLBACKS[fmt.leafName];
  if (found && found.content) {
    const rawLines = String(found.content).split('\n');
    if (rawLines.some((l) => l.trim().length > 0)) {
      lines = rawLines;
      BLUE_FILE_FALLBACKS[resolvedTitle] = rawLines;
    }
  }
  if (!lines || !lines.length) {
    lines = [`File: ${fmt.leafName}`, `Format: ${fmt.badge}`, '', 'Ready to view and edit in workspace.'];
  }

  const nonEmptyLines = lines.filter((l) => String(l).trim().length > 0);
  EDITOR_LINE_NODE_IDS.forEach((nid, idx) => {
    setWindowNodeText(winEl, nid, nonEmptyLines[idx] !== undefined ? nonEmptyLines[idx] : lines[idx] || '');
  });

  ensureDocViewerDrawerMounted(lines.join('\n'), winEl, resolvedTitle, found);
}

const FALLBACK_DRIVE_DOCS = [
  {
    id: 'gdoc-atlas-brief-2026',
    name: 'Cloud Next Q4 Launch Brief & Messaging Matrix.pdf',
    mimeType: 'application/pdf',
    owner: 'cloud_demo@google.com',
    content: '# Cloud Launch Brief (PDF)\n**Owner:** cloud_demo@google.com\n\n## Key Approved Points\n- Live today in the US (Iowa) and Europe (Netherlands).\n- Public Preview in Singapore until Nov 15, 2026.\n- Customer Story: "a leading Tier-1 Global Investment Bank" (68% faster compliance review).\n- Speed: 3.2x faster response time.',
  },
  {
    id: 'gsheet-pso-wave1-calculator',
    name: 'Q4 Wave 1 PSO Packaging & SOW Calculator.csv',
    mimeType: 'text/csv',
    owner: 'marcus.vance@google.com',
    content: 'Package,Deliverable,Cost_USD,Engineers,Days,Status\nPSO-SAP-REF,Standard SAP Demo,$54000,3.5,14,APPROVED_WAVE_1\nPSO-MAINFRAME-CUSTOM,Custom Mainframe Add-On,$28000,2.0,28,MOVED_TO_WAVE_2\nPSO-SEC-CMEK,Security & Voice Encryption Add-On,$18000,1.0,8,OPTIONAL_ADDON',
  },
  {
    id: 'gdoc-vertex-security-whitepaper',
    name: 'Vertex AI Zero Data Retention & CMEK Spec.json',
    mimeType: 'application/json',
    owner: 'maya.lin@google.com',
    content: JSON.stringify({ owner: 'maya.lin@google.com', live_regions: ['US (Iowa)', 'Europe (Netherlands)'], preview_until_nov_15: ['Singapore', 'Voice Encryption'], verified_speedup: '3.2x faster' }, null, 2),
  },
  {
    id: 'gdoc-nda-clearance-tracker',
    name: 'Apex Global Bank Mutual NDA & Clearance Notes.txt',
    mimeType: 'text/plain',
    owner: 'priya.nair@google.com',
    content: 'CUSTOMER NDA RULES — Q4 LAUNCH\nOwner: priya.nair@google.com (Legal Counsel)\nRule: Naming "Apex Global Bank" is blocked by customer NDA.\nApproved Wording: "a leading Tier-1 Global Investment Bank"\nApproved Stat: 68% faster compliance review time',
  },
];
let cachedDriveDocs = FALLBACK_DRIVE_DOCS.slice();

async function mountAndRefreshDriveDocsBrowser() {
  const popupEl = document.getElementById('popup-145-1122');
  if (!popupEl) return;
  const rootFrame = popupEl.querySelector('[data-node-id="145:1122"]') || popupEl;
  let browser = popupEl.querySelector('.drive-docs-browser');
  if (!browser) {
    browser = document.createElement('div');
    browser.className = 'drive-docs-browser';
    browser.innerHTML = `
      <div class="drive-uploaded-section" id="drive-uploaded-files-section"></div>
      <div class="drive-docs-top">
        <span class="drive-docs-title">📄 GOOGLE DRIVE &amp; MULTI-FORMAT WORKSPACE CATALOG</span>
        <button type="button" class="drive-doc-btn" data-api-action="refresh-drive-docs">↻ Sync Drive Catalog</button>
      </div>
      <div class="drive-docs-list" id="drive-docs-list"></div>
    `;
    rootFrame.appendChild(browser);
  }

  const uploadedSection = browser.querySelector('#drive-uploaded-files-section');
  if (uploadedSection) {
    const env = typeof normalizeAccountKey === 'function' ? normalizeAccountKey(activeEnvironment) : 'cloud';
    const localFiles = (typeof getStoredCustomFiles === 'function' ? getStoredCustomFiles() : []).filter(
      (f) => f && f.filename && normalizeAccountKey(f.environment) === env && !isCustomItemInTrash('custom-file', env, f.filename)
    );
    const serverFiles = ((appState && appState.user_files) || []).filter(
      (f) => f && f.filename && !SEED_FILE_IDS.has(f.id) && !SEED_FILENAMES_UPPER.has(String(f.filename).toUpperCase()) && normalizeAccountKey(f.environment) === env && !isCustomItemInTrash('custom-file', env, f.filename)
    );
    const merged = [];
    const seen = new Set();
    [...localFiles, ...serverFiles].forEach((f) => {
      const k = String(f.filename).trim().toUpperCase();
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(f);
      }
    });
    uploadedSection.innerHTML = merged.length
      ? `<div class="drive-docs-top" style="margin-bottom:8px;"><span class="drive-docs-title">📂 YOUR UPLOADED &amp; WORKSPACE FILES (${merged.length}) — CLICK TO OPEN</span></div>
         <div class="drive-docs-list" style="margin-bottom:14px;">${merged.map((f) => {
           const fmt = getFileFormatMeta(f.filename, f);
           return `<div class="drive-doc-row"><div class="drive-doc-info"><span class="drive-doc-name">${escapeHtmlSafe(fmt.icon)} ${escapeHtmlSafe(fmt.leafName)} <span class="doc-inline-ext-badge">${escapeHtmlSafe(fmt.shortBadge)}</span></span><span class="drive-doc-meta">${escapeHtmlSafe(fmt.badge)} · ${escapeHtmlSafe(f.description || 'Uploaded file · Click Open to view')}</span></div><div class="drive-doc-actions"><button type="button" class="drive-doc-btn" data-open-popup="136:341" data-file-title="${escapeHtmlSafe(f.filename)}">↗ Open File</button></div></div>`;
         }).join('')}</div>`
      : '';
  }

  const listEl = browser.querySelector('#drive-docs-list');
  if (listEl) {
    try {
      const res = await apiCall('/api/drive/query', 'POST', { query: '', mime_filter: 'all', page_size: 8 });
      const driveFiles = (res && res.drive_query_result && res.drive_query_result.files) || (res && res.drive_files) || [];
      if (Array.isArray(driveFiles) && driveFiles.length > 0) {
        const extCycle = ['.pdf', '.csv', '.json', '.txt'];
        cachedDriveDocs = driveFiles.map((df, i) => {
          const rawName = String(df.name || `Workspace Document ${i + 1}`);
          const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
          const inferredExt = (df.mimeType || '').includes('spreadsheet') || (df.mimeType || '').includes('csv') ? '.csv' : (df.mimeType || '').includes('json') ? '.json' : (df.mimeType || '').includes('pdf') ? '.pdf' : extCycle[i % extCycle.length];
          return {
            id: df.id || `drive-doc-${i}`,
            name: hasExt ? rawName : `${rawName}${inferredExt}`,
            mimeType: df.mimeType || 'application/pdf',
            owner: df.owner || df.ownerEmail || 'Google Drive ADC',
            content: df.content || df.content_preview || df.description || `Document: ${rawName}\nImported via Google Drive ADC into Murph Workspace (${activeEnvironment}).`,
          };
        });
      }
    } catch (_) {}

    listEl.innerHTML = cachedDriveDocs.map((doc, idx) => {
      const fmt = getFileFormatMeta(doc.name, doc);
      return `<div class="drive-doc-row"><div class="drive-doc-info"><span class="drive-doc-name">${escapeHtmlSafe(fmt.icon)} ${escapeHtmlSafe(doc.name)} <span class="doc-inline-ext-badge">${escapeHtmlSafe(fmt.shortBadge)}</span></span><span class="drive-doc-meta">${escapeHtmlSafe(fmt.badge)} · ${escapeHtmlSafe(doc.owner || 'Google Workspace')}</span></div><div class="drive-doc-actions"><button type="button" class="drive-doc-btn" data-api-action="view-drive-doc" data-drive-idx="${idx}" data-doc-title="${escapeHtmlSafe(doc.name)}">↗ Open</button><button type="button" class="drive-doc-btn" data-api-action="import-drive-doc" data-drive-idx="${idx}">+ Add to Desktop</button></div></div>`;
    }).join('');
  }
}
