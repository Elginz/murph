/**
 * ============================================================================
 * 03-trash-and-desktop.js — Trash Bin App (`#popup-trash-bin`)
 * ============================================================================
 *
 * Implements:
 *   1. Desktop Trash Bin tile (`#desktop-trash-bin`)
 *   2. Drag-and-drop throw detection, Restore, Delete Forever, Restore All & Empty Trash
 */

function mountTrashBinIcons() {
  const row1 = document.querySelector('#screen-home [data-node-id="99:107"]');
  if (row1 && !document.getElementById('desktop-trash-bin')) {
    const trashTile = document.createElement('div');
    trashTile.id = 'desktop-trash-bin';
    trashTile.className = 'f-frame f-interactive f-desktop-item desktop-trash-bin-tile';
    trashTile.setAttribute('data-node-id', 'trash:desktop-icon');
    trashTile.setAttribute('data-desktop-draggable', 'true');
    trashTile.setAttribute('data-open-popup', 'trash:bin');
    trashTile.title = 'Trash Bin · Drag & drop any desktop file or folder here to throw in Trash, or click to open Trash Bin';
    trashTile.innerHTML = `
      <div class="trash-app-icon-box" data-node-name="App icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M3 6H5H21" stroke="#F87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#F87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="rgba(239, 68, 68, 0.14)"/>
          <path d="M10 11V17" stroke="#FCA5A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 11V17" stroke="#FCA5A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="trash-tile-title" data-node-name="Title">TRASH BIN</div>
      <div class="trash-tile-detail" id="desktop-trash-bin-detail" data-node-name="Detail">0 items · drag to throw</div>
    `;
    row1.appendChild(trashTile);
  }
  const existingDockTrash = document.getElementById('dock-trash-bin');
  if (existingDockTrash) {
    existingDockTrash.remove();
  }
}

function renderTrashBinWindow() {
  mountTrashBinIcons();
  const trashList = getTrashBinItems();
  const count = trashList.length;

  // Update desktop Trash Bin icon badge & subtitle
  const desktopTrashEl = document.getElementById('desktop-trash-bin');
  const desktopDetailEl = document.getElementById('desktop-trash-bin-detail');
  if (desktopTrashEl) {
    setDynamicBadgeOnIcon(
      desktopTrashEl,
      count,
      'red',
      `${count} item(s) in Trash Bin · Click to restore or permanently delete`
    );
  }
  if (desktopDetailEl) {
    desktopDetailEl.textContent = count > 0 ? `${count} item(s) in trash` : '0 items · drag to throw';
  }

  // Update Floating Trash Bin Window header & footer
  const countPillEl = document.getElementById('trash-win-count-pill');
  if (countPillEl) {
    countPillEl.textContent = count === 1 ? '1 ITEM IN TRASH' : `${count} ITEMS IN TRASH`;
  }
  const footerNoteEl = document.getElementById('trash-win-footer-note');
  if (footerNoteEl) {
    footerNoteEl.textContent =
      count > 0
        ? `${count} item(s) in Trash Bin · Restore back to desktop or permanently delete`
        : 'Trash Bin is empty · Drag any desktop file or folder to throw it away';
  }

  // Populate Quick-Throw chips for currently visible desktop files & workflow folders owned by active user
  const quickBarEl = document.getElementById('trash-quick-throw-list');
  if (quickBarEl) {
    const visibleItems = [];
    document
      .querySelectorAll('#screen-home [data-desktop-draggable="true"]')
      .forEach((el) => {
        const nid = el.getAttribute('data-node-id');
        if (!nid || nid === 'trash:desktop-icon' || el.id === 'desktop-trash-bin') return;
        if (el.classList.contains('is-desktop-hidden') || el.style.display === 'none') return;
        const perm =
          typeof canCurrentUserDeleteDesktopItem === 'function'
            ? canCurrentUserDeleteDesktopItem(el)
            : { allowed: true };
        const titleNode = el.querySelector('[data-node-name="Title"]');
        const fileTitle =
          el.getAttribute('data-file-title') ||
          el.getAttribute('data-custom-wf-title') ||
          (titleNode ? titleNode.textContent.trim() : nid);
        const isWf =
          Boolean(SEED_WORKFLOW_NODE_MAP[nid]) ||
          el.getAttribute('data-custom-desktop-item') === 'workflow';
        visibleItems.push({ nid, label: fileTitle, isWf, allowed: perm.allowed, creatorLabel: perm.creatorLabel });
      });
    if (visibleItems.length === 0) {
      quickBarEl.innerHTML = `<span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #64748B;">No active desktop items in this account</span>`;
    } else {
      quickBarEl.innerHTML = visibleItems
        .map((item) =>
          item.allowed
            ? `<button type="button" class="trash-quick-throw-chip" data-api-action="trash-quick-throw" data-target-node-id="${escapeHtmlSafe(item.nid)}" title="Throw ${escapeHtmlSafe(item.label)} into Trash Bin">🗑️ Throw ${item.isWf ? '📁' : '📄'} ${escapeHtmlSafe(item.label)}</button>`
            : `<button type="button" class="trash-quick-throw-chip" data-api-action="trash-quick-throw" data-target-node-id="${escapeHtmlSafe(item.nid)}" title="Only creator (${escapeHtmlSafe(item.creatorLabel || 'creator')}) can delete ${escapeHtmlSafe(item.label)}" style="opacity:0.65;">🔒 ${item.isWf ? '📁' : '📄'} ${escapeHtmlSafe(item.label)}</button>`
        )
        .join('');
    }
  }

  // Populate Trashed Items list
  const listEl = document.getElementById('trash-items-list');
  if (!listEl) return;
  if (count === 0) {
    listEl.innerHTML = `
      <div class="trash-empty-placeholder">
        🗑️ <strong>Trash Bin is empty.</strong><br/>
        Drag &amp; drop any Blue file or Yellow workflow folder onto the <strong>TRASH BIN</strong> icon or click <strong>🗑️ Move to Trash</strong> inside any file window.
      </div>
    `;
    return;
  }

  listEl.innerHTML = trashList
    .slice()
    .reverse()
    .map((item) => {
      const isWf = item.itemKind === 'seed-workflow' || item.itemKind === 'custom-workflow';
      const icon = isWf ? '📁' : '📄';
      const kindLabel = isWf ? 'WORKFLOW FOLDER' : 'BLUE FILE';
      const envLabel = item.environment === 'dm' ? 'DM USER' : 'CLOUD USER';
      const timeStr = item.deletedAtMs
        ? new Date(item.deletedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        : 'just now';
      return `
        <div class="trash-item-row" data-trash-row-id="${escapeHtmlSafe(item.trashId)}">
          <div class="trash-item-info">
            <div class="trash-item-title-row">
              <span class="trash-item-name">${icon} ${escapeHtmlSafe(item.title)}</span>
              <span class="trash-item-kind-pill ${isWf ? 'workflow' : ''}">${kindLabel}</span>
              <span class="trash-item-kind-pill">${escapeHtmlSafe(envLabel)}</span>
            </div>
            <span class="trash-item-meta">${escapeHtmlSafe(item.subtitle || 'Desktop workspace item')} · Thrown at ${escapeHtmlSafe(timeStr)}</span>
          </div>
          <div class="trash-item-actions">
            <button type="button" class="trash-btn restore" data-api-action="trash-restore-item" data-trash-id="${escapeHtmlSafe(item.trashId)}">↩ Restore</button>
            <button type="button" class="trash-btn delete" data-api-action="trash-delete-item" data-trash-id="${escapeHtmlSafe(item.trashId)}">✕ Delete Forever</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function closeMatchingFloatingWindowsForTrashedItem(item) {
  if (!item) return;
  getAllFloatingWindows().forEach((fw) => {
    if (fw.id === 'popup-trash-bin') return;
    if (item.itemKind === 'seed-drive') {
      if (fw.id === 'popup-145-1122' || fw.dataset.popupBaseId === '145:1122') {
        fw.classList.remove('active');
      }
    } else if (item.itemKind === 'seed-file' || item.itemKind === 'custom-file') {
      if (
        fw.dataset.fileTitle &&
        String(fw.dataset.fileTitle).trim().toUpperCase() === String(item.title).trim().toUpperCase()
      ) {
        fw.classList.remove('active');
      }
    } else if (item.itemKind === 'seed-workflow') {
      const wfMeta = SEED_WORKFLOW_NODE_MAP[item.nodeId];
      if (wfMeta && fw.dataset.popupBaseId === wfMeta.popupId && !fw.dataset.customWfTitle) {
        fw.classList.remove('active');
      }
    } else if (item.itemKind === 'custom-workflow') {
      if (
        fw.dataset.customWfTitle &&
        String(fw.dataset.customWfTitle).trim().toUpperCase() === String(item.title).trim().toUpperCase()
      ) {
        fw.classList.remove('active');
      }
    }
  });
}

async function moveDesktopElementToTrash(desktopEl, preDragPos) {
  if (!desktopEl || desktopEl.id === 'desktop-trash-bin') return;
  const nodeId = desktopEl.getAttribute('data-node-id') || '';
  if (!nodeId || nodeId === 'trash:desktop-icon' || nodeId === 'guide:desktop-icon') return;

  const titleNode = desktopEl.querySelector('[data-node-name="Title"]');
  const itemDisplayTitle =
    desktopEl.getAttribute('data-file-title') ||
    desktopEl.getAttribute('data-custom-wf-title') ||
    (titleNode ? titleNode.textContent.trim() : '') ||
    'Item';

  // Enforce Creator-Only Deletion for shared custom workflows & custom files
  const perm =
    typeof canCurrentUserDeleteDesktopItem === 'function'
      ? canCurrentUserDeleteDesktopItem(desktopEl)
      : { allowed: true };
  if (!perm.allowed) {
    const snapDx = preDragPos && typeof preDragPos.dx === 'number' ? preDragPos.dx : 0;
    const snapDy = preDragPos && typeof preDragPos.dy === 'number' ? preDragPos.dy : 0;
    desktopEl.dataset.dx = String(snapDx);
    desktopEl.dataset.dy = String(snapDy);
    desktopEl.style.transform =
      Math.abs(snapDx) > 0.5 || Math.abs(snapDy) > 0.5 ? `translate3d(${snapDx}px, ${snapDy}px, 0)` : '';
    desktopEl.classList.remove('is-over-trash');
    saveDesktopPositions();
    const denyMsg = `Only the initial creator (${perm.creatorLabel || perm.creatorLdap}) can delete "${itemDisplayTitle}".`;
    appendTerminalMessage('murph://trash/permission-denied', denyMsg, 'warn');
    showToast(`🔒 Permission denied: ${denyMsg}`);
    return;
  }

  const env = normalizeAccountKey(activeEnvironment);
  const trashList = getTrashBinItems();
  let newTrashEntry = null;

  if (SEED_DESKTOP_NODE_ENV_MAP[nodeId]) {
    const seedMeta = SEED_DESKTOP_NODE_ENV_MAP[nodeId];
    const detailNode = desktopEl.querySelector('[data-node-name="Detail"]');
    newTrashEntry = {
      trashId: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId,
      itemKind: 'seed-file',
      title: seedMeta.filename,
      subtitle: (detailNode && detailNode.textContent.trim()) || `${seedMeta.env.toUpperCase()} seed file`,
      environment: seedMeta.env,
      fileId: seedMeta.fileId,
      content: (BLUE_FILE_FALLBACKS[seedMeta.filename] || []).join('\n'),
      deletedAtMs: Date.now(),
    };
  } else if (nodeId === '99:165') {
    const detailNode = desktopEl.querySelector('[data-node-name="Detail"]');
    newTrashEntry = {
      trashId: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId: '99:165',
      itemKind: 'seed-drive',
      title: 'DRIVE',
      subtitle: (detailNode && detailNode.textContent.trim()) || 'Google Drive ADC import',
      environment: env,
      deletedAtMs: Date.now(),
    };
  } else if (desktopEl.getAttribute('data-custom-desktop-item') === 'file') {
    const filename = desktopEl.getAttribute('data-file-title') || 'CUSTOM_FILE.md';
    const detailNode = desktopEl.querySelector('[data-node-name="Detail"]');
    const storedFiles = getStoredCustomFiles();
    const matchedLocal = storedFiles.find(
      (f) => String(f.filename || '').toUpperCase() === String(filename).toUpperCase()
    );
    const serverFiles = (appState && appState.user_files) || [];
    const matchedServer = serverFiles.find(
      (f) => String(f.filename || '').toUpperCase() === String(filename).toUpperCase()
    );
    const fileContent =
      (matchedLocal && matchedLocal.content) ||
      (matchedServer && matchedServer.content) ||
      (BLUE_FILE_FALLBACKS[filename] || [`# ${filename}`]).join('\n');
    const fileDesc =
      (matchedLocal && matchedLocal.description) ||
      (detailNode && detailNode.textContent.trim()) ||
      `editable · ${env.toUpperCase()} file`;

    // Remove from active local custom files storage and in-memory appState immediately
    try {
      const remaining = storedFiles.filter(
        (f) => String(f.filename || '').toUpperCase() !== String(filename).toUpperCase()
      );
      localStorage.setItem(CUSTOM_FILES_STORAGE_KEY, JSON.stringify(remaining));
    } catch (_) {}
    if (appState && Array.isArray(appState.user_files)) {
      appState.user_files = appState.user_files.filter(
        (f) => String(f.filename || '').toUpperCase() !== String(filename).toUpperCase()
      );
    }

    newTrashEntry = {
      trashId: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId,
      itemKind: 'custom-file',
      title: filename,
      subtitle: fileDesc,
      environment: env,
      serverFileId: matchedServer && matchedServer.id ? matchedServer.id : null,
      fileObj: {
        filename,
        content: fileContent,
        description: fileDesc,
        environment: env,
        created_at_ms: (matchedLocal && matchedLocal.created_at_ms) || Date.now(),
      },
      deletedAtMs: Date.now(),
    };

    if (matchedServer && matchedServer.id) {
      apiCall('/api/user/files/delete', 'POST', { file_id: matchedServer.id });
    }
  } else if (SEED_WORKFLOW_NODE_MAP[nodeId]) {
    const wfMeta = SEED_WORKFLOW_NODE_MAP[nodeId];
    newTrashEntry = {
      trashId: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId,
      itemKind: 'seed-workflow',
      title: wfMeta.title,
      subtitle: wfMeta.subtitle,
      environment: env,
      deletedAtMs: Date.now(),
    };
  } else if (desktopEl.getAttribute('data-custom-desktop-item') === 'workflow') {
    const folderName = desktopEl.getAttribute('data-custom-wf-title') || 'CUSTOM WORKFLOW';
    const folderDesc = desktopEl.getAttribute('data-custom-wf-desc') || 'Custom workflow folder';
    const wfFile = desktopEl.getAttribute('data-custom-wf-file') || 'CUSTOM_WORKFLOW.wf';
    const wfType = desktopEl.getAttribute('data-custom-wf-type') || 'scrub';
    const targetPopupId = desktopEl.getAttribute('data-open-popup') || '136:468';

    const storedWfs = getStoredCustomWorkflows();
    const serverWfs = (appState && appState.custom_workflows) || [];
    const matchedWf =
      storedWfs.find((w) => String(w.folder_name || '').toUpperCase() === String(folderName).toUpperCase()) ||
      serverWfs.find((w) => String(w.folder_name || '').toUpperCase() === String(folderName).toUpperCase());

    // Remove from localStorage and in-memory appState.custom_workflows immediately
    try {
      const remainingWfs = storedWfs.filter(
        (w) => String(w.folder_name || '').toUpperCase() !== String(folderName).toUpperCase()
      );
      localStorage.setItem(CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify(remainingWfs));
    } catch (_) {}
    if (appState && Array.isArray(appState.custom_workflows)) {
      appState.custom_workflows = appState.custom_workflows.filter(
        (w) => String(w.folder_name || '').toUpperCase() !== String(folderName).toUpperCase()
      );
    }

    const creatorEnv = perm.creatorEnv || env;
    newTrashEntry = {
      trashId: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId,
      itemKind: 'custom-workflow',
      title: folderName,
      subtitle: folderDesc,
      environment: creatorEnv,
      wfObj: Object.assign(
        {
          folder_name: folderName,
          description: folderDesc,
          workflow_type: wfType,
          wf_filename: wfFile,
          target_popup_id: targetPopupId,
          environment: creatorEnv,
          creator_env: creatorEnv,
        },
        matchedWf || {},
        { environment: creatorEnv, creator_env: creatorEnv }
      ),
      deletedAtMs: Date.now(),
    };

    apiCall('/api/workflows/delete', 'POST', {
      folder_name: folderName,
      requester_env: env,
      requester_ldap: perm.creatorLdap || '',
    });
  } else {
    // Fallback for any other draggable desktop item (Blue file or Yellow folder)
    const fallbackTitleEl = desktopEl.querySelector('[data-node-name="Title"]');
    const fallbackDetailEl = desktopEl.querySelector('[data-node-name="Detail"]');
    const fallbackTitle =
      desktopEl.getAttribute('data-file-title') ||
      desktopEl.getAttribute('data-custom-wf-title') ||
      (fallbackTitleEl ? fallbackTitleEl.textContent.trim() : '') ||
      'DESKTOP ITEM';
    const fallbackSubtitle = fallbackDetailEl ? fallbackDetailEl.textContent.trim() : 'Desktop item';
    const isWfPopup = ['136:468', '136:579', '136:417', '136:521', '136:730'].includes(
      desktopEl.getAttribute('data-open-popup') || ''
    );
    newTrashEntry = {
      trashId: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId: nodeId || `custom-item-${Date.now()}`,
      itemKind: isWfPopup ? 'seed-workflow' : 'seed-file',
      title: fallbackTitle,
      subtitle: fallbackSubtitle,
      environment: env,
      deletedAtMs: Date.now(),
    };
  }

  if (!newTrashEntry) return;

  // Reset dragged offset on the element and hide immediately before re-rendering
  desktopEl.dataset.dx = '0';
  desktopEl.dataset.dy = '0';
  desktopEl.style.transform = '';
  desktopEl.classList.remove('is-over-trash');
  setDesktopItemVisible(desktopEl, false);
  saveDesktopPositions();

  // Avoid duplicate trash entries for the exact same nodeId + title
  const deduped = trashList.filter(
    (item) =>
      !(
        item.nodeId === newTrashEntry.nodeId &&
        String(item.title || '').toUpperCase() === String(newTrashEntry.title || '').toUpperCase() &&
        (newTrashEntry.itemKind === 'custom-workflow' ||
          String(item.environment || 'cloud') === String(newTrashEntry.environment || 'cloud'))
      )
  );
  deduped.push(newTrashEntry);
  saveTrashBinItems(deduped);
  closeMatchingFloatingWindowsForTrashedItem(newTrashEntry);
  renderDynamicDesktopItems(appState);
  renderTrashBinWindow();
  saveDesktopPositions();
  appendTerminalMessage('murph://trash', `Dumped "${newTrashEntry.title}" (${newTrashEntry.itemKind}) into Trash Bin.`, 'warn');
  showToast(`🗑️ Dumped "${newTrashEntry.title}" into Trash Bin!`);
}

async function restoreTrashItem(trashId) {
  const trashList = getTrashBinItems();
  const target = trashList.find((item) => item.trashId === trashId);
  if (!target) return;
  saveTrashBinItems(trashList.filter((item) => item.trashId !== trashId));
  savePermanentlyDeletedSeeds(
    getPermanentlyDeletedSeeds().filter((k) => k !== target.nodeId && k !== `${target.environment}::${target.nodeId}`)
  );
  if (target.itemKind === 'custom-file' && target.fileObj) {
    saveCustomFileLocal(target.fileObj);
    await apiCall(
      '/api/user/files/upload',
      'POST',
      Object.assign(
        {
          filename: target.fileObj.filename,
          content: target.fileObj.content || `# ${target.fileObj.filename}`,
          tags: target.fileObj.description || 'Restored from Trash Bin',
        },
        getActiveAccountFilePayload(),
        { environment: target.fileObj.environment || activeEnvironment }
      )
    );
  } else if (target.itemKind === 'custom-workflow' && target.wfObj) {
    saveCustomWorkflowLocal(target.wfObj);
    await apiCall('/api/workflows/create', 'POST', target.wfObj);
  }
  renderDynamicDesktopItems(appState);
  renderTrashBinWindow();
  appendTerminalMessage('murph://trash', `Restored "${target.title}" from Trash Bin back to desktop.`, 'sys');
  showToast(`↩ Restored "${target.title}" back to desktop!`);
}

async function permanentlyDeleteTrashItem(trashId) {
  const trashList = getTrashBinItems();
  const target = trashList.find((item) => item.trashId === trashId);
  if (!target) return;
  saveTrashBinItems(trashList.filter((item) => item.trashId !== trashId));
  if (['seed-file', 'seed-workflow', 'seed-drive'].includes(target.itemKind)) {
    const delSeeds = getPermanentlyDeletedSeeds();
    const key = target.itemKind === 'seed-file' ? target.nodeId : `${target.environment || 'cloud'}::${target.nodeId}`;
    if (!delSeeds.includes(key)) {
      delSeeds.push(key);
      savePermanentlyDeletedSeeds(delSeeds);
    }
  }
  if (target.serverFileId) {
    await apiCall('/api/user/files/delete', 'POST', { file_id: target.serverFileId });
  }
  if (target.itemKind === 'custom-workflow') {
    await apiCall('/api/workflows/delete', 'POST', {
      folder_name: target.title,
      requester_env: target.environment || activeEnvironment,
    });
  }
  renderDynamicDesktopItems(appState);
  renderTrashBinWindow();
  appendTerminalMessage('murph://trash', `Permanently deleted "${target.title}" from Trash Bin.`, 'warn');
  showToast(`🔥 Permanently deleted "${target.title}"`);
}
