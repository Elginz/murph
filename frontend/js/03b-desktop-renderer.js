/* ============================================================================
 * 03b. Desktop Item Renderer (`03b-desktop-renderer.js`)
 * ----------------------------------------------------------------------------
 * Responsible for:
 *   - Filtering seed Blue files (Row 1) and Yellow workflow folders (Row 2)
 *     by the active user account ('cloud' vs 'dm') and Trash Bin state
 *   - Cloning and mounting custom user-created Blue files and Yellow workflow
 *     folders onto the Home OS desktop
 *   - Updating workflow file pill selectors, dynamic badges, and restoring
 *     saved desktop icon drag offsets
 * ============================================================================ */

function renderDynamicDesktopItems(state) {
  mountTrashBinIcons();
  // 2 built-in accounts ('cloud', 'dm') share seed files; self-registered accounts ('user_<slug>') start empty
  const env = normalizeAccountKey(activeEnvironment);
  const isIsolatedAccount = isCustomAccountKey(env);

  // 1. Show/hide the seed Blue files in Row 1 (99:107) and workflow pills (154:103) by logged-in account & Trash state
  selectedWorkflowFiles.clear();
  Object.entries(SEED_DESKTOP_NODE_ENV_MAP).forEach(([nodeId, meta]) => {
    const hiddenByTrash = isSeedItemHidden(nodeId, meta.env);
    const visibleInEnv = !isIsolatedAccount && isSeedBlueFileVisibleForEnv(meta, env) && !hiddenByTrash;
    const desktopNode = document.querySelector(`#screen-home [data-node-id="${nodeId}"]`);
    if (desktopNode) {
      setDesktopItemVisible(desktopNode, visibleInEnv);
    }
    const wfPill = document.querySelector(`[data-node-id="${meta.pillNode}"]`);
    if (wfPill) {
      wfPill.style.display = visibleInEnv ? '' : 'none';
    }
    if (visibleInEnv) {
      selectedWorkflowFiles.add(meta.filename);
    }
  });

  // Show/hide the DRIVE Blue folder (99:165) in Row 1 if thrown into Trash
  const driveEl = document.querySelector('#screen-home [data-node-id="99:165"]');
  if (driveEl) {
    const driveHidden = isSeedItemHidden('99:165', env);
    setDesktopItemVisible(driveEl, !driveHidden);
  }

  // Show/hide the seed Yellow workflow folders in Row 2 (99:176): only the folders listed for this built-in
  // account (`envs` in SEED_WORKFLOW_NODE_MAP), never for isolated accounts, and not when thrown into Trash
  Object.entries(SEED_WORKFLOW_NODE_MAP).forEach(([wfNodeId, wfMeta]) => {
    const wfEl = document.querySelector(`#screen-home [data-node-id="${wfNodeId}"]`);
    if (wfEl) {
      const wfHidden =
        isIsolatedAccount || !isSeedWorkflowVisibleForEnv(wfMeta, env) || isSeedItemHidden(wfNodeId, env);
      setDesktopItemVisible(wfEl, !wfHidden);
    }
  });

  // Ensure activeBlueFileTitle defaults to a visible seed file for the active built-in account
  activeBlueFileTitle = normalizeSeedFilename(activeBlueFileTitle);
  if (env === 'cloud' || env === 'dm') {
    const visibleSeedNames = Object.values(SEED_DESKTOP_NODE_ENV_MAP)
      .filter((meta) => isSeedBlueFileVisibleForEnv(meta, env))
      .map((meta) => meta.filename);
    if (visibleSeedNames.length && !visibleSeedNames.includes(activeBlueFileTitle)) {
      activeBlueFileTitle = visibleSeedNames[0];
    }
  }

  // 2. Gather custom files for the 2 accounts & filter out items currently in Trash Bin
  const row1 = document.querySelector('#screen-home [data-node-id="99:107"]');
  const templateBlue = document.querySelector('#screen-home [data-node-id="99:108"]');
  const wfPillsContainer = document.querySelector('[data-node-id="154:103"]');
  const templatePill = document.querySelector('[data-node-id="154:104"]');

  const localFilesList = getStoredCustomFiles();
  const localByKey = new Map();
  localFilesList.forEach((lf) => {
    if (!lf || !lf.filename) return;
    const lfEnv = normalizeAccountKey(lf.environment);
    localByKey.set(`${lfEnv}::${String(lf.filename).trim().toUpperCase()}`, lf);
  });

  const allCustomFiles = [];
  const seenKeys = new Set();
  const serverFiles = (state && state.user_files) || [];
  serverFiles.forEach((f) => {
    if (!f || !f.filename) return;
    const upperName = String(f.filename).trim().toUpperCase();
    if (SEED_FILE_IDS.has(f.id) || SEED_FILENAMES_UPPER.has(upperName)) return;
    const fEnv = normalizeAccountKey(f.environment);
    if (isCustomItemInTrash('custom-file', fEnv, f.filename)) return;
    const k = `${fEnv}::${upperName}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      const localMatch = localByKey.get(k) || {};
      const createdAtMs = ensureFileCreatedTimestamp(fEnv, f.filename, f.created_at_ms || localMatch.created_at_ms);
      allCustomFiles.push({
        id: f.id || `custom-file-${upperName}`,
        filename: f.filename,
        content: f.content || localMatch.content || `File: ${f.filename}`,
        visibility: localMatch.visibility || f.visibility || 'federated',
        description: localMatch.description || f.description || `${localMatch.visibility || f.visibility || 'federated'} · ${fEnv.toUpperCase()} file`,
        file_type: f.file_type || localMatch.file_type || '',
        mime_type: f.mime_type || localMatch.mime_type || '',
        data_url: f.data_url || localMatch.data_url || '',
        user_ldap: f.user_ldap || (fEnv === 'dm' ? 'marketing_demo@google.com' : 'cloud_demo@google.com'),
        environment: fEnv,
        created_at_ms: createdAtMs,
      });
    }
  });
  localFilesList.forEach((f) => {
    if (!f || !f.filename) return;
    const upperName = String(f.filename).trim().toUpperCase();
    if (SEED_FILENAMES_UPPER.has(upperName)) return;
    const fEnv = normalizeAccountKey(f.environment);
    if (isCustomItemInTrash('custom-file', fEnv, f.filename)) return;
    const k = `${fEnv}::${upperName}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      const createdAtMs = ensureFileCreatedTimestamp(fEnv, f.filename, f.created_at_ms);
      allCustomFiles.push(Object.assign({}, f, { environment: fEnv, created_at_ms: createdAtMs }));
    }
  });

  const activeCustomFiles = allCustomFiles.filter((f) => f.environment === env);

  if (row1 && templateBlue) {
    row1.querySelectorAll('[data-custom-desktop-item="file"]').forEach((el) => el.remove());
    row1.querySelectorAll('.empty-account-state-card').forEach((el) => el.remove());
    if (wfPillsContainer) {
      wfPillsContainer.querySelectorAll('[data-custom-wf-pill="true"]').forEach((el) => el.remove());
    }

    const driveNode = row1.querySelector('[data-node-id="99:165"]');

    activeCustomFiles.forEach((fObj) => {
      const upperKey = String(fObj.filename).trim().toUpperCase();
      const parts = String(fObj.filename).split('/').filter(Boolean);
      const leafFilename = parts[parts.length - 1] || fObj.filename;
      const fmtMeta =
        typeof getFileFormatMeta === 'function'
          ? getFileFormatMeta(leafFilename, fObj)
          : { shortBadge: 'FILE', badge: 'WORKSPACE FILE', icon: '📄', leafName: leafFilename };
      const rawLines = String(fObj.content || `File: ${leafFilename}`).split('\n');
      BLUE_FILE_FALLBACKS[fObj.filename] = rawLines;
      BLUE_FILE_FALLBACKS[leafFilename] = rawLines;
      const slug = upperKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const customNodeId = `custom-file-${slug}`;
      const clone = templateBlue.cloneNode(true);
      setDesktopItemVisible(clone, true);
      const fileCreatorEnv = normalizeAccountKey(fObj.environment);
      const fileCreatorLdap =
        fObj.user_ldap || (fileCreatorEnv === 'dm' ? 'marketing_demo@google.com' : 'cloud_demo@google.com');
      clone.setAttribute('data-node-id', customNodeId);
      clone.setAttribute('data-custom-desktop-item', 'file');
      clone.setAttribute('data-desktop-draggable', 'true');
      clone.setAttribute('data-open-popup', '136:341');
      clone.setAttribute('data-file-title', fObj.filename);
      clone.setAttribute('data-file-scope', String(fObj.visibility || 'federated'));
      clone.setAttribute('data-created-at-ms', String(fObj.created_at_ms || 0));
      clone.setAttribute('data-creator-env', fileCreatorEnv);
      clone.setAttribute('data-creator-ldap', fileCreatorLdap);
      clone.classList.add('f-custom-desktop-item');
      clone.title = `Click to open ${leafFilename} (${fmtMeta.badge})`;
      clone.style.transform = '';
      clone.dataset.dx = '0';
      clone.dataset.dy = '0';

      const displayTitle = leafFilename
        .replace(/[_-]+/g, ' ')
        .toUpperCase()
        .slice(0, 20);
      const titleEl = clone.querySelector('[data-node-name="Title"]');
      if (titleEl) {
        titleEl.removeAttribute('data-node-id');
        titleEl.textContent = displayTitle;
      }
      const detailEl = clone.querySelector('[data-node-name="Detail"]');
      if (detailEl) {
        detailEl.removeAttribute('data-node-id');
        const scopeLabel = fObj.visibility === 'private' ? 'Private' : 'Federated';
        detailEl.textContent = `${fmtMeta.shortBadge} · ${scopeLabel}`.slice(0, 28);
      }
      const iconFrame = clone.querySelector('[data-node-name="App icon"]');
      if (iconFrame) {
        iconFrame
          .querySelectorAll('.custom-item-pill-badge, .custom-item-format-badge, .dynamic-file-state-badge')
          .forEach((b) => b.remove());
        const fmtBadge = document.createElement('span');
        fmtBadge.className = 'custom-item-format-badge';
        fmtBadge.textContent = fmtMeta.shortBadge;
        fmtBadge.title = `${fmtMeta.badge} (${leafFilename})`;
        iconFrame.appendChild(fmtBadge);
      }
      if (driveNode) {
        row1.insertBefore(clone, driveNode);
      } else {
        row1.appendChild(clone);
      }

      if (wfPillsContainer && templatePill) {
        const pillClone = templatePill.cloneNode(true);
        pillClone.style.display = '';
        pillClone.removeAttribute('data-node-id');
        pillClone.setAttribute('data-custom-wf-pill', 'true');
        pillClone.setAttribute('data-api-action', 'toggle-wf-file');
        pillClone.setAttribute('data-file', fObj.filename);
        const textNodes = pillClone.querySelectorAll('.f-text');
        const labelNode = textNodes[textNodes.length - 1];
        if (labelNode) {
          labelNode.removeAttribute('data-node-id');
          labelNode.textContent = leafFilename.slice(0, 22);
        }
        selectedWorkflowFiles.add(fObj.filename);
        wfPillsContainer.appendChild(pillClone);
      }
    });
  }

  setNodeText('154:144', `${selectedWorkflowFiles.size} file(s) · 1 workflow selected`);

  // 3. Render Newly Created Yellow Agent Workflow Folders in Row 2 (99:176) filtered by environment & Trash state
  const row2 = document.querySelector('#screen-home [data-node-id="99:176"]');
  const templateYellow = document.querySelector('#screen-home [data-node-id="99:177"]');
  const resolveWfCreatorEnv = (w) => {
    const rawEnv = String(w.creator_env || w.environment || '').toLowerCase();
    if (rawEnv === 'cloud' || rawEnv === 'dm' || isCustomAccountKey(normalizeAccountKey(rawEnv))) {
      return normalizeAccountKey(rawEnv);
    }
    if (
      isDmAccountLdap(w.creator_ldap) ||
      w.creator_user_id === 'user_brand'
    ) {
      return 'dm';
    }
    return 'cloud';
  };
  // Visibility: the creator always sees their own workflow; Cloud & DM share each other's workflows; an isolated
  // self-registered account only sees the ones that explicitly @tag its own email, and its own workflows only
  // reach Cloud/DM desktops when they tag them (nothing leaks either way)
  const ownerEmailLower = String((getAccountProfileByKey(env) || {}).email || '').toLowerCase();
  const isWfVisibleHere = (w, wEnv) => {
    if (wEnv === env) return true;
    if (w.creator_user_id && normalizeAccountKeyOrEmpty(w.creator_user_id) === env && isIsolatedAccount) return true;
    const tagged = (w.tagged_users || []).map((t) => String((t && (t.email || t.ldap)) || t || '').toLowerCase());
    if (isIsolatedAccount || isCustomAccountKey(wEnv)) return Boolean(ownerEmailLower) && tagged.includes(ownerEmailLower);
    return Boolean(w.shared_across_environments || tagged.length > 0);
  };
  const mergedWfMap = new Map();
  const serverWfs = (state && state.custom_workflows) || [];
  serverWfs.forEach((w) => {
    if (!w || !w.folder_name) return;
    const wEnv = resolveWfCreatorEnv(w);
    if (!isWfVisibleHere(w, wEnv)) return;
    if (isCustomItemInTrash('custom-workflow', wEnv, w.folder_name)) return;
    mergedWfMap.set(String(w.folder_name).trim().toUpperCase(), Object.assign({}, w, { creator_env: wEnv }));
  });
  getStoredCustomWorkflows().forEach((w) => {
    if (!w || !w.folder_name) return;
    const wEnv = resolveWfCreatorEnv(w);
    if (!isWfVisibleHere(w, wEnv)) return;
    if (isCustomItemInTrash('custom-workflow', wEnv, w.folder_name)) return;
    const key = String(w.folder_name).trim().toUpperCase();
    if (!mergedWfMap.has(key)) {
      mergedWfMap.set(key, Object.assign({}, w, { creator_env: wEnv }));
    }
  });

  if (row2 && templateYellow) {
    row2.querySelectorAll('[data-custom-desktop-item="workflow"]').forEach((el) => el.remove());
    mergedWfMap.forEach((wfObj, upperKey) => {
      const slug = upperKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const customNodeId = `custom-wf-${slug}`;
      const popupMap = {
        scrub: '136:468',
        tickets: '136:730',
        escalations: '136:417',
        policies: '136:579',
        deliverables: '136:521',
      };
      const targetPopup =
        (wfObj.target_popup_id &&
        (FLOATING_POPUP_SET.has(wfObj.target_popup_id) || wfObj.target_popup_id === '136:730')
          ? wfObj.target_popup_id
          : popupMap[wfObj.workflow_type]) || '136:468';

      const wfCreatorEnv = resolveWfCreatorEnv(wfObj);
      const wfCreatorLdap =
        wfObj.creator_ldap || (wfCreatorEnv === 'dm' ? 'marketing_demo@google.com' : 'cloud_demo@google.com');
      const clone = templateYellow.cloneNode(true);
      setDesktopItemVisible(clone, true);
      clone.setAttribute('data-node-id', customNodeId);
      clone.setAttribute('data-custom-desktop-item', 'workflow');
      clone.setAttribute('data-desktop-draggable', 'true');
      clone.setAttribute('data-open-popup', targetPopup);
      clone.setAttribute('data-custom-wf-title', wfObj.folder_name);
      clone.setAttribute('data-custom-wf-ticket-id', wfObj.ticket_id || '');
      clone.setAttribute('data-custom-wf-desc', wfObj.description || '');
      clone.setAttribute('data-custom-wf-file', wfObj.wf_filename || 'CUSTOM_WORKFLOW.wf');
      clone.setAttribute('data-custom-wf-type', wfObj.workflow_type || 'scrub');
      clone.setAttribute('data-custom-wf-files', JSON.stringify(wfObj.selected_files || []));
      clone.setAttribute('data-created-at-ms', String(wfObj.created_at_ms || 0));
      clone.setAttribute('data-creator-env', wfCreatorEnv);
      clone.setAttribute('data-creator-ldap', wfCreatorLdap);
      clone.classList.add('f-custom-desktop-item');
      clone.style.transform = '';
      clone.dataset.dx = '0';
      clone.dataset.dy = '0';

      const titleEl = clone.querySelector('[data-node-name="Title"]');
      if (titleEl) {
        titleEl.removeAttribute('data-node-id');
        titleEl.textContent = String(wfObj.folder_name).toUpperCase().slice(0, 18);
      }
      const detailEl = clone.querySelector('[data-node-name="Detail"]');
      if (detailEl) {
        detailEl.removeAttribute('data-node-id');
        detailEl.textContent = String(
          wfObj.description || `${(wfObj.selected_files && wfObj.selected_files.length) || 0} files · active`
        ).slice(0, 26);
      }
      row2.appendChild(clone);
    });
  }

  ensureWorkflowUserPickerMounted();
  refreshWorkflowTagSelectionUI();
  applySelectedWorkflowTypeUI(activeWorkflowType);
  updateDynamicFileAndFolderBadges(state || appState);
  expireNewFileBadges();
  renderTrashBinWindow();
  updateStickyBarUserIdentity(state || appState);
  restoreDesktopPositions();
  if (typeof syncBottomDockAndPopups === 'function') {
    syncBottomDockAndPopups(state || appState);
  }
}

async function restoreAllTrashItems() {
  const trashList = getTrashBinItems();
  if (!trashList.length) {
    showToast('Trash Bin is already empty');
    return;
  }
  for (const item of trashList) {
    if (item.itemKind === 'custom-file' && item.fileObj) {
      saveCustomFileLocal(item.fileObj);
      await apiCall(
        '/api/user/files/upload',
        'POST',
        Object.assign(
          {
            filename: item.fileObj.filename,
            content: item.fileObj.content || `# ${item.fileObj.filename}`,
            tags: item.fileObj.description || 'Restored from Trash Bin',
          },
          getActiveAccountFilePayload(),
          { environment: item.fileObj.environment || activeEnvironment }
        )
      );
    } else if (item.itemKind === 'custom-workflow' && item.wfObj) {
      saveCustomWorkflowLocal(item.wfObj);
      await apiCall('/api/workflows/create', 'POST', item.wfObj);
    }
  }
  saveTrashBinItems([]);
  savePermanentlyDeletedSeeds([]);
  renderDynamicDesktopItems(appState);
  renderTrashBinWindow();
  appendTerminalMessage('murph://trash', `Restored all ${trashList.length} item(s) from Trash Bin.`, 'sys');
  showToast(`↩ Restored all ${trashList.length} item(s) from Trash Bin!`);
}

async function emptyTrashBin() {
  const trashList = getTrashBinItems();
  if (!trashList.length) {
    showToast('Trash Bin is already empty');
    return;
  }
  const delSeeds = getPermanentlyDeletedSeeds();
  for (const item of trashList) {
    if (
      item.itemKind === 'seed-file' ||
      item.itemKind === 'seed-workflow' ||
      item.itemKind === 'seed-drive'
    ) {
      const key =
        item.itemKind === 'seed-file'
          ? item.nodeId
          : `${item.environment || 'cloud'}::${item.nodeId}`;
      if (!delSeeds.includes(key)) {
        delSeeds.push(key);
      }
    }
    if (item.serverFileId) {
      await apiCall('/api/user/files/delete', 'POST', { file_id: item.serverFileId });
    }
    if (item.itemKind === 'custom-workflow' && appState && Array.isArray(appState.custom_workflows)) {
      appState.custom_workflows = appState.custom_workflows.filter(
        (w) =>
          !(
            String(w.folder_name || '').toUpperCase() === String(item.title || '').toUpperCase() &&
            String(w.environment || 'cloud') === String(item.environment || 'cloud')
          )
      );
    }
  }
  savePermanentlyDeletedSeeds(delSeeds);
  saveTrashBinItems([]);
  renderDynamicDesktopItems(appState);
  renderTrashBinWindow();
  appendTerminalMessage(
    'murph://trash',
    `Emptied Trash Bin (${trashList.length} item(s) permanently deleted).`,
    'warn'
  );
  showToast(`🔥 Emptied Trash Bin (${trashList.length} item(s) permanently deleted)!`);
}

