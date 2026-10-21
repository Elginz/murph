/**
 * 07-api-actions.js — Unified UI Action & Backend API Dispatcher
 */

async function handleApiAction(action, triggerEl) {
  if (action === 'toggle-user-settings-menu') {
    if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
    else if (modelMenuEl) modelMenuEl.classList.remove('open');
    if (typeof isUserCurrentlySignedIn === 'function' && !isUserCurrentlySignedIn()) {
      if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
      else if (userSettingsMenuEl) userSettingsMenuEl.classList.remove('open');
      switchScreen('lock');
      return;
    }
    if (userSettingsMenuEl) {
      const willOpen = !userSettingsMenuEl.classList.contains('open');
      if (typeof setUserSettingsMenuOpen === 'function') {
        setUserSettingsMenuOpen(willOpen, triggerEl);
      } else {
        userSettingsMenuEl.classList.toggle('open', willOpen);
        if (willOpen) populateUserSettingsDropdown(appState);
      }
    }
    return;
  }

  if (action === 'close-user-settings-menu') {
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    else if (userSettingsMenuEl) userSettingsMenuEl.classList.remove('open');
    return;
  }

  if (action === 'save-user-settings') {
    const curProfile = getActiveLoggedInUserProfile(appState);
    const emailInputEl = document.getElementById('user-setting-email');
    const nameInputEl = document.getElementById('user-setting-name');
    const roleInputEl = document.getElementById('user-setting-role');
    const deptInputEl = document.getElementById('user-setting-dept');
    const ndaSelectEl = document.getElementById('user-setting-nda');
    const teamAgentSelectEl = document.getElementById('user-setting-team-agent');
    const scopeSelectEl = document.getElementById('user-setting-workspace-tier');
    const personalAgentInputEl = document.getElementById('user-setting-agent-name');

    const newEmail = curProfile.email;
    const newName = (nameInputEl && nameInputEl.value.trim()) || curProfile.displayName || curProfile.name;
    const newRole = (roleInputEl && roleInputEl.value.trim()) || curProfile.role;
    const newDept = (deptInputEl && deptInputEl.value.trim()) || curProfile.department;
    const newNda = (ndaSelectEl && ndaSelectEl.value) || curProfile.ndaClearance || 'TIER-2';
    const newTeamAgent = (teamAgentSelectEl && teamAgentSelectEl.value) || curProfile.teamAgentId || 'pm_agent';
    const newScope = (scopeSelectEl && scopeSelectEl.value) || curProfile.workspaceTier || 'federated';
    const newPersonalAgent = (personalAgentInputEl && personalAgentInputEl.value.trim()) || curProfile.personalAgentName || `${newName.split(' ')[0]}'s Personal Agent`;

    const patch = {
      email: newEmail,
      ldap: newEmail,
      name: newName,
      role: newRole,
      department: newDept,
      nda_clearance: newNda,
      team_agent_id: newTeamAgent,
      personal_agent_name: newPersonalAgent,
      workspace_tier: newScope,
    };

    // Save settings to the active account and email keys
    const acctKey = normalizeAccountKey(activeEnvironment);
    saveStoredUserSettingsForEmail(`account:${acctKey}`, patch);
    saveStoredUserSettingsForEmail(curProfile.email, patch);
    if (isCustomAccountKey(acctKey) && typeof sessionPrivateProfile === 'object' && sessionPrivateProfile) {
      sessionPrivateProfile = Object.assign({}, sessionPrivateProfile, {
        name: newName,
        role: newRole,
        department: newDept,
        nda_clearance: newNda,
        team_agent_id: newTeamAgent,
        personal_agent_name: newPersonalAgent,
        workspace_tier: newScope,
      });
    }

    if (acctKey === 'dm') {
      lockAuthState.dm = { email: newEmail, name: newName, authenticated: true };
    } else if (acctKey === 'cloud') {
      lockAuthState.cloud = { email: newEmail, name: newName, authenticated: true };
    } else if (isCustomAccountKey(acctKey)) {
      lockAuthState[acctKey] = { email: newEmail, name: newName, authenticated: true };
    }
    saveDualAuthState();
    if (typeof isUserAuthenticatedByCookie === 'function' && isUserAuthenticatedByCookie()) {
      setAuthCookieSession({ accountKey: acctKey, email: newEmail, name: newName });
    }

    await apiCall('/api/auth/update_profile', 'POST', {
      user_id: curProfile.id || '',
      environment: acctKey,
      ...patch,
    });

    if (appState) {
      appState.current_user = Object.assign({}, appState.current_user || {}, patch);
    }
    updateLockScreenUI();
    updateStickyBarUserIdentity(appState);
    populateUserSettingsDropdown(appState);
    if (typeof triggerUserIdentitySwitchPulse === 'function') triggerUserIdentitySwitchPulse();
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    else if (userSettingsMenuEl) userSettingsMenuEl.classList.remove('open');
    appendTerminalMessage(
      'murph://auth/settings',
      `Updated user settings for ${newName} (${newEmail}) · Role: ${newRole} · Clearance: ${newNda}`,
      'sys'
    );
    showToast(`Saved user settings for ${newName} (${newEmail})`);
    return;
  }

  if (action === 'select-logged-in-user') {
    const targetEnv = (triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('data-user-env')) || 'cloud';
    const targetTrack = (triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('data-user-track')) || targetEnv;
    const nextAcctKey = targetTrack === 'dm' ? 'dm' : 'cloud';
    const nextProfile = getAccountProfileByKey(nextAcctKey);

    activeEnvironment = nextAcctKey;
    activeLockTrack = nextAcctKey;
    lockAuthState[nextAcctKey] = {
      email: nextProfile.email,
      name: nextProfile.displayName,
      authenticated: true,
    };
    saveDualAuthState();
    setAuthCookieSession({
      accountKey: nextAcctKey,
      email: nextProfile.email,
      name: nextProfile.displayName,
    });

    const res = await apiCall('/api/auth/login', 'POST', {
      persona_id: nextProfile.id,
      email: nextProfile.email,
      custom_ldap: nextProfile.email,
      password: DEMO_ACCOUNT_PASSWORD,
      environment: nextAcctKey,
      require_password: true,
    });

    if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(true);
    updateLockScreenUI();
    renderDynamicDesktopItems(appState);
    updateStickyBarUserIdentity(appState);
    populateUserSettingsDropdown(appState);
    if (typeof triggerUserIdentitySwitchPulse === 'function') triggerUserIdentitySwitchPulse();
    if (typeof switchTerminalTranscript === 'function') {
      switchTerminalTranscript(nextAcctKey);
    }
    if (!document.body.classList.contains('home-screen-active')) {
      switchScreen('home', { animateUnlock: true });
    }
    if (typeof playMurphLoginSound === 'function') playMurphLoginSound();
    showToast(`Logged in as ${nextProfile.displayName} (${nextProfile.email})`);
    if (typeof openOnboardingTour === 'function' && shouldTriggerFirstLoginTour(nextAcctKey, res)) {
      setTimeout(() => openOnboardingTour(nextAcctKey), 1600);
    }
    return;
  }

  if (action === 'user-menu-goto-lock') {
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    else if (userSettingsMenuEl) userSettingsMenuEl.classList.remove('open');
    switchScreen('lock');
    return;
  }

  if (action === 'user-menu-goto-signup') {
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    else if (userSettingsMenuEl) userSettingsMenuEl.classList.remove('open');
    switchScreen('signup');
    return;
  }

  if (action === 'open-onboarding-tour') {
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    if (typeof openOnboardingTour === 'function') openOnboardingTour(getActiveAccountKey(), true);
    return;
  }

  if (action === 'user-menu-logout') {
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    else if (userSettingsMenuEl) userSettingsMenuEl.classList.remove('open');
    if (typeof clearAuthCookieSession === 'function') {
      clearAuthCookieSession();
    }
    if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(false);
    Object.keys(lockAuthState || {}).forEach((k) => {
      if (lockAuthState[k]) lockAuthState[k].authenticated = false;
    });
    saveDualAuthState();
    await apiCall('/api/auth/logout', 'POST', {});
    updateLockScreenUI();
    updateStickyBarUserIdentity(appState);
    if (typeof playMurphLogoutSound === 'function') playMurphLogoutSound();
    switchScreen('lock');
    if (typeof syncBottomDockAndPopups === 'function') syncBottomDockAndPopups(appState);
    showToast('Signed out — auth cookie cleared & returned to Lock Screen');
    return;
  }

  if (action === 'toggle-model-menu') {
    const willOpen = !(modelMenuEl && modelMenuEl.classList.contains('open'));
    if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(willOpen, triggerEl);
    else if (modelMenuEl) modelMenuEl.classList.toggle('open', willOpen);
    return;
  }

  if (action === 'close-model-menu') {
    if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
    else if (modelMenuEl) modelMenuEl.classList.remove('open');
    return;
  }

  if (action === 'select-gemini-model') {
    const rawId = (triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('data-model-id')) || 'gemini-3.8-flash';
    const modelId = normalizeGeminiModelId(rawId);
    if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
    else if (modelMenuEl) modelMenuEl.classList.remove('open');
    applyGeminiModelToDOM(modelId, appState && appState.llm_status);
    await apiCall('/api/llm/configure', 'POST', { model: modelId });
    const info = GEMINI_MODELS[modelId] || GEMINI_MODELS['gemini-3.8-flash'];
    appendTerminalMessage('murph://model', `Switched active runtime & terminal model to ${info.name} (${info.id} · ${info.latency})`, 'sys');
    return;
  }

  if (action === 'save-gemini-api-key') {
    const keyVal = apiKeyInputEl ? apiKeyInputEl.value.trim() : '';
    const res = await apiCall('/api/llm/configure', 'POST', { api_key: keyVal, model: activeGeminiModel });
    if (apiKeyInputEl) apiKeyInputEl.value = '';
    applyGeminiModelToDOM(activeGeminiModel, res && res.llm_status);
    showToast(keyVal ? `Connected live ${GEMINI_MODELS[activeGeminiModel].name} API Key` : `Set ${GEMINI_MODELS[activeGeminiModel].name} to Sandbox Mode`);
    return;
  }

  if (typeof handleTerminalUiAction === 'function' && (await handleTerminalUiAction(action, triggerEl))) {
    return;
  }

  if (action === 'toggle-workload-topology') {
    const container = triggerEl && triggerEl.closest ? triggerEl.closest('.workload-topology-container') : null;
    if (container) {
      const isCollapsed = container.classList.toggle('collapsed');
      triggerEl.textContent = isCollapsed ? 'Expand Topology' : 'Collapse Topology';
    }
    return;
  }
  if (action === 'topo-open-ticket' || action === 'topo-open-ticket-log') {
    if (typeof handleTopologyNodeClick === 'function') handleTopologyNodeClick(triggerEl);
    return;
  }

  if (action === 'switch-doc-view-mode') {
    const mode = (triggerEl && triggerEl.getAttribute('data-doc-mode')) || 'preview';
    const winEl =
      (triggerEl && triggerEl.closest && triggerEl.closest('.os-floating-window')) ||
      document.getElementById('popup-136-341');
    const drawer =
      (triggerEl && triggerEl.closest && triggerEl.closest('.doc-viewer-drawer')) ||
      (winEl && winEl.querySelector('.doc-viewer-drawer'));
    const renderedEl = drawer ? drawer.querySelector('.doc-viewer-rendered') : null;
    const textareaEl = drawer ? drawer.querySelector('.doc-viewer-textarea') : null;
    const winFileTitle = (winEl && winEl.dataset.fileTitle) || activeBlueFileTitle || 'DEMO PRODUCT PRD.md';
    if (drawer && renderedEl && textareaEl) {
      if (mode === 'source' || mode === 'raw') {
        renderedEl.style.display = 'none';
        textareaEl.style.display = 'block';
        textareaEl.focus();
      } else {
        // Sync any edits from textarea back into BLUE_FILE_FALLBACKS & rendered view for this specific window
        const updatedLines = textareaEl.value.split('\n');
        BLUE_FILE_FALLBACKS[winFileTitle] = updatedLines;
        const nonEmpty = updatedLines.filter((l) => l.trim().length > 0);
        EDITOR_LINE_NODE_IDS.forEach((nid, idx) => {
          setWindowNodeText(winEl, nid, nonEmpty[idx] !== undefined ? nonEmpty[idx] : updatedLines[idx] || '');
        });
        const record = typeof findFileRecordByName === 'function' ? findFileRecordByName(winFileTitle) : null;
        renderedEl.innerHTML = renderFilePreviewHtml(textareaEl.value, winFileTitle, record);
        textareaEl.style.display = 'none';
        renderedEl.style.display = 'block';
      }
      drawer.querySelectorAll('[data-api-action="switch-doc-view-mode"]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-doc-mode') === mode);
      });
    }
    return;
  }

  if (action === 'download-active-doc') {
    const winEl =
      (triggerEl && triggerEl.closest && triggerEl.closest('.os-floating-window')) ||
      document.getElementById('popup-136-341');
    const winFileTitle = (winEl && winEl.dataset.fileTitle) || activeBlueFileTitle || 'DOCUMENT.txt';
    const record = typeof findFileRecordByName === 'function' ? findFileRecordByName(winFileTitle) : null;
    const fmt =
      typeof getFileFormatMeta === 'function'
        ? getFileFormatMeta(winFileTitle, record)
        : { leafName: winFileTitle, mimeType: 'text/plain;charset=utf-8' };
    const textareaEl = winEl ? winEl.querySelector('.doc-viewer-textarea') : null;
    const content =
      textareaEl && textareaEl.value
        ? textareaEl.value
        : (BLUE_FILE_FALLBACKS[winFileTitle] || []).join('\n');
    const a = document.createElement('a');
    if (record && record.data_url && String(record.data_url).startsWith('data:')) {
      a.href = record.data_url;
      a.download = fmt.leafName || winFileTitle;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      const blob = new Blob([content], { type: fmt.mimeType || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = fmt.leafName || winFileTitle;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    return;
  }

  if (action === 'trash-active-doc') {
    const winEl =
      (triggerEl && triggerEl.closest && triggerEl.closest('.os-floating-window')) ||
      document.getElementById('popup-136-341');
    const winFileTitle = (winEl && winEl.dataset.fileTitle) || activeBlueFileTitle || 'DEMO PRODUCT PRD.md';
    let desktopEl = Array.from(
      document.querySelectorAll('#screen-home [data-desktop-draggable="true"][data-file-title]')
    ).find(
      (el) =>
        (el.getAttribute('data-file-title') || '').toUpperCase() === String(winFileTitle).toUpperCase()
    );
    if (desktopEl) {
      await moveDesktopElementToTrash(desktopEl);
    } else {
      const trashItems = getTrashBinItems();
      const docContent = (BLUE_FILE_FALLBACKS[winFileTitle] || [`# ${winFileTitle}`]).join('\n');
      trashItems.push({
        trashId: `trash-doc-${Date.now()}`,
        nodeId: `doc-${winFileTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        itemKind: 'custom-file',
        title: winFileTitle,
        subtitle: `${activeEnvironment === 'dm' ? 'DM User' : 'Cloud User'} document`,
        environment: normalizeAccountKey(activeEnvironment),
        fileObj: {
          filename: winFileTitle,
          content: docContent,
          description: `${activeEnvironment === 'dm' ? 'DM User' : 'Cloud User'} document`,
          environment: normalizeAccountKey(activeEnvironment),
          created_at_ms: Date.now(),
        },
        deletedAtMs: Date.now(),
      });
      saveTrashBinItems(trashItems);
      if (winEl) winEl.classList.remove('active');
      renderDynamicDesktopItems(appState);
      renderTrashBinWindow();
      showToast(`🗑️ Dumped "${winFileTitle}" into Trash Bin`);
    }
    openPopup('trash:bin');
    return;
  }

  if (action === 'trash-quick-throw') {
    const nid =
      (triggerEl && triggerEl.getAttribute('data-target-node-id')) ||
      (triggerEl && triggerEl.getAttribute('data-node-id-target'));
    if (!nid) return;
    const desktopEl = document.querySelector(
      `#screen-home [data-desktop-draggable="true"][data-node-id="${nid}"]`
    );
    if (desktopEl) {
      await moveDesktopElementToTrash(desktopEl);
    }
    return;
  }

  if (action === 'trash-restore-item') {
    const tid = triggerEl && triggerEl.getAttribute('data-trash-id');
    if (tid) restoreTrashItem(tid);
    return;
  }

  if (action === 'trash-delete-item') {
    const tid = triggerEl && triggerEl.getAttribute('data-trash-id');
    if (tid) await permanentlyDeleteTrashItem(tid);
    return;
  }

  if (action === 'trash-restore-all') {
    restoreAllTrashItems();
    return;
  }

  if (action === 'trash-empty-all') {
    await emptyTrashBin();
    return;
  }

  if (action === 'refresh-drive-docs') {
    await apiCall('/api/state', 'GET');
    mountAndRefreshDriveDocsBrowser();
    showToast('Synced Google Drive & Workspace Documentation Index');
    return;
  }

  if (action === 'view-drive-doc') {
    const idxAttr = triggerEl && triggerEl.getAttribute('data-drive-idx');
    const driveDoc =
      idxAttr !== null && idxAttr !== undefined ? cachedDriveDocs[parseInt(idxAttr, 10)] : null;
    const docTitle =
      (driveDoc && driveDoc.name) ||
      (triggerEl && triggerEl.getAttribute('data-doc-title')) ||
      'DEMO PRODUCT PRD.md';
    if (driveDoc && driveDoc.content) {
      BLUE_FILE_FALLBACKS[docTitle] = String(driveDoc.content).split('\n');
    }
    openPopup('136:341', docTitle);
    return;
  }

  if (action === 'import-drive-doc') {
    const idxAttr = triggerEl && triggerEl.getAttribute('data-drive-idx');
    const driveDoc =
      idxAttr !== null && idxAttr !== undefined ? cachedDriveDocs[parseInt(idxAttr, 10)] : null;
    const docNum = getStoredCustomFiles().length + 1;
    const filename = (driveDoc && driveDoc.name) || `DRIVE_SPEC_${docNum}.pdf`;
    const activeAcctProfile = getActiveLoggedInUserProfile(appState);
    const filePayload = getActiveAccountFilePayload();
    const acctKey = filePayload.environment;
    const acctLabel = getActiveAccountDisplayLabel();
    const fmt = typeof getFileFormatMeta === 'function' ? getFileFormatMeta(filename, driveDoc) : { ext: 'pdf', mimeType: 'application/pdf' };
    const content =
      (driveDoc && driveDoc.content) ||
      [
        `FILE: ${filename} — Imported Google Drive Document`,
        `Owner: ${activeAcctProfile.email} (${activeAcctProfile.displayName})`,
        `Account: ${acctLabel} · Source: Google Drive Bridge`,
        '',
        '1. Executive Summary',
        'Imported live specification via Google Drive Workspace connector for cross-agent verification.',
        '',
        '2. Validated Governance Constraints',
        '- Customer references must use anonymized "Tier-1 Global Bank" phrasing unless written NDA waiver is signed.',
        '- Singapore (asia-southeast1) and voice CMEK remain in Public Preview for Q3.',
        '- Standard Wave 1 SAP Reference Connector package is capped at $54,000 (3.5 FTE, 14 days).',
      ].join('\n');
    BLUE_FILE_FALLBACKS[filename] = String(content).split('\n');
    saveCustomFileLocal({
      filename,
      content,
      visibility: filePayload.visibility,
      description: `Drive import · ${acctLabel}`,
      file_type: fmt.ext,
      mime_type: (driveDoc && driveDoc.mimeType) || fmt.mimeType,
      environment: acctKey,
    });
    await apiCall(
      '/api/user/files/upload',
      'POST',
      Object.assign({ filename, content, tags: `Drive import · ${acctLabel}` }, filePayload)
    );
    renderDynamicDesktopItems(appState);
    mountAndRefreshDriveDocsBrowser();
    window._murphSuppressNextOpenSeen = true;
    openPopup('136:341', filename);
    showToast(`Imported & opened ${filename} from Google Drive!`);
    return;
  }

  if (typeof handleDockWorkflowAction === 'function' && handleDockWorkflowAction(action, triggerEl)) {
    return;
  }
  if (await handleSignupAction(action, triggerEl)) {
    return;
  }
  if (await handleFileAndSignupAction(action, triggerEl)) {
    return;
  }
  await handleGovernanceAndWorkflowAction(action, triggerEl);
}

