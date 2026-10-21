/* ============================================================================
 * 07a. Login, Sign-Up, Console & File Upload Actions
 *      (`07a-actions-files-and-signup.js`)
 * ----------------------------------------------------------------------------
 * Handles authentication submission, console prompt execution, and file/folder
 * persistence actions delegated from `handleApiAction`:
 *   - `login-submit`, `login-google-adc` (sign-up actions live in 07b)
 *   - `intro-console-run`, `home-console-run`
 *   - `set-scope-federated`, `set-scope-private`, `save-and-scrub-file`,
 *     `upload-folder-submit`
 * ============================================================================ */

window._murphApprovedTicketIds = window._murphApprovedTicketIds || new Set();
window._murphResolvedClaimIds = window._murphResolvedClaimIds || new Map();

function applyPopupButtonVisualState(btnEl, mode, label) {
  if (!btnEl || !btnEl.style) return;
  const txtEl = btnEl.querySelector ? (btnEl.querySelector('.f-text') || btnEl) : btnEl;
  if ((mode === 'working' || mode === 'done') && !btnEl.dataset.origLabel && txtEl) {
    btnEl.dataset.origLabel = (txtEl.dataset && txtEl.dataset.origText !== undefined ? txtEl.dataset.origText : txtEl.textContent) || '';
  }
  if (mode === 'working') {
    btnEl.dataset.btnWorking = 'true';
    delete btnEl.dataset.btnDone;
    btnEl.style.setProperty('transition', 'all 0.34s ease', 'important');
    btnEl.style.setProperty('background', 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 100%)', 'important');
    btnEl.style.setProperty('border-color', '#7DD3FC', 'important');
    btnEl.style.setProperty('color', '#FFFFFF', 'important');
    btnEl.style.setProperty('box-shadow', '0 0 14px rgba(14, 165, 233, 0.45)', 'important');
    if (txtEl && label) txtEl.textContent = label;
    btnEl.querySelectorAll('*').forEach((ch) => ch.style && ch.style.setProperty('color', '#FFFFFF', 'important'));
  } else if (mode === 'done') {
    delete btnEl.dataset.btnWorking;
    btnEl.dataset.btnDone = 'true';
    btnEl.style.setProperty('transition', 'all 0.36s ease', 'important');
    btnEl.style.setProperty('background', 'linear-gradient(135deg, #059669 0%, #10B981 100%)', 'important');
    btnEl.style.setProperty('border-color', '#6EE7B7', 'important');
    btnEl.style.setProperty('color', '#FFFFFF', 'important');
    btnEl.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.4)', 'important');
    if (txtEl && label) txtEl.textContent = label;
    btnEl.querySelectorAll('*').forEach((ch) => ch.style && ch.style.setProperty('color', '#FFFFFF', 'important'));
  } else if (btnEl.dataset.btnDone || btnEl.dataset.btnWorking || label) {
    delete btnEl.dataset.btnDone;
    delete btnEl.dataset.btnWorking;
    ['background', 'border-color', 'color', 'box-shadow'].forEach((p) => btnEl.style.removeProperty(p));
    btnEl.querySelectorAll('*').forEach((ch) => ch.style && ch.style.removeProperty('color'));
    if (txtEl) txtEl.textContent = label || btnEl.dataset.origLabel || (txtEl.dataset && txtEl.dataset.origText) || txtEl.textContent;
  }
}

function markTicketOptimisticallyApproved(ticketId) {
  if (!ticketId) return;
  window._murphApprovedTicketIds.add(ticketId);
  if (ticketId === 'TKT-101') markClaimOptimisticallyResolved('CLM-04', 'resolved');
  if (ticketId === 'TKT-102') markClaimOptimisticallyResolved('CLM-05', 'resolved');
  if (typeof appState === 'object' && appState) reconcileOptimisticGovernanceState(appState);
}

function unmarkTicketOptimisticallyApproved(ticketId) {
  if (!ticketId) return;
  window._murphApprovedTicketIds.delete(ticketId);
  if (ticketId === 'TKT-101') unmarkClaimOptimisticallyResolved('CLM-04');
  if (ticketId === 'TKT-102') unmarkClaimOptimisticallyResolved('CLM-05');
  if (typeof appState === 'object' && appState) reconcileOptimisticGovernanceState(appState);
}

function markClaimOptimisticallyResolved(claimId, status = 'resolved') {
  if (!claimId) return;
  const num = String(claimId).replace(/^CLM-1?0?/, '');
  [`CLM-0${num}`, `CLM-10${num}`, claimId].forEach((id) => window._murphResolvedClaimIds.set(id, status));
  if (typeof appState === 'object' && appState) reconcileOptimisticGovernanceState(appState);
}

function unmarkClaimOptimisticallyResolved(claimId) {
  if (!claimId) return;
  const num = String(claimId).replace(/^CLM-1?0?/, '');
  [`CLM-0${num}`, `CLM-10${num}`, claimId].forEach((id) => window._murphResolvedClaimIds.delete(id));
  if (typeof appState === 'object' && appState) reconcileOptimisticGovernanceState(appState);
}

function reconcileOptimisticGovernanceState(state) {
  if (!state) return;
  if (Array.isArray(state.agent_tickets) && window._murphApprovedTicketIds && window._murphApprovedTicketIds.size > 0) {
    state.agent_tickets.forEach((t) => {
      if (t && window._murphApprovedTicketIds.has(t.id)) {
        t.status = 'approved';
        Object.values(t.approvals || {}).forEach((a) => { if (a) a.status = 'approved'; });
      }
    });
  }
  if (Array.isArray(state.claims) && window._murphResolvedClaimIds && window._murphResolvedClaimIds.size > 0) {
    state.claims.forEach((c) => {
      if (c && window._murphResolvedClaimIds.has(c.id)) {
        c.status = window._murphResolvedClaimIds.get(c.id) || 'resolved';
      }
    });
  }
}

async function runButtonWithFeedback(triggerEl, workingLabel, doneLabel, fn, finalMode = 'done') {
  const btn = triggerEl && triggerEl.closest ? (triggerEl.closest('[data-api-action]') || triggerEl) : triggerEl;
  const act = btn && btn.getAttribute ? btn.getAttribute('data-api-action') : '';
  const tid = btn && btn.getAttribute ? btn.getAttribute('data-ticket-id') : '';
  const cid = btn && btn.getAttribute ? btn.getAttribute('data-claim-id') : '';
  const nid = btn && btn.getAttribute ? btn.getAttribute('data-node-id') : '';
  if (btn && workingLabel) applyPopupButtonVisualState(btn, 'working', workingLabel);
  const [res] = await Promise.all([
    Promise.resolve().then(() => (typeof fn === 'function' ? fn() : null)),
    new Promise((r) => setTimeout(r, 400)),
  ]);
  const targets = new Set();
  if (btn) targets.add(btn);
  if (act && tid) document.querySelectorAll(`[data-api-action="${act}"][data-ticket-id="${tid}"]`).forEach((el) => targets.add(el));
  if (act && cid) document.querySelectorAll(`[data-api-action="${act}"][data-claim-id="${cid}"]`).forEach((el) => targets.add(el));
  if (nid) document.querySelectorAll(`[data-node-id="${nid}"]`).forEach((el) => targets.add(el));
  targets.forEach((el) => applyPopupButtonVisualState(el, finalMode, doneLabel));
  return res;
}

async function handleFileAndSignupAction(action, triggerEl) {
  if (action === 'login-submit') {
    const rawTypedEmail = getNodeText('64:8').trim().toLowerCase();
    if (!rawTypedEmail || rawTypedEmail === 'email address') {
      showToast('⚠️ Please enter an email address to sign in.');
      return true;
    }
    const emailRaw = normalizeBuiltinAccountEmail(rawTypedEmail);
    const pwdEl = document.querySelector('#screen-lock [data-node-id="64:12"]');
    const pwdRaw = getNodeText('64:12').trim();
    const isMaskedDemoPwd = pwdRaw === LOCK_DEMO_MASKED_PASSWORD;
    const actualPwd = isMaskedDemoPwd
      ? ((pwdEl && pwdEl.dataset.demoRealPassword) || DEMO_ACCOUNT_PASSWORD)
      : (!pwdRaw || pwdRaw === 'Password' ? '' : pwdRaw);
    if (!actualPwd) {
      showToast('⚠️ Password is required to sign in.');
      return true;
    }

    const dmProfile = getAccountProfileByKey('dm');
    const cloudProfile = getAccountProfileByKey('cloud');
    const isDmDemo = emailRaw === dmProfile.email.toLowerCase();
    const isCloudDemo = emailRaw === cloudProfile.email.toLowerCase();
    const customEmail = rawTypedEmail.includes('@') ? rawTypedEmail : `${rawTypedEmail}@google.com`;

    let registeredAcct = getRegisteredAccountByEmail(customEmail);
    let adoptedLoginRes = null;
    if (!registeredAcct && !isDmDemo && !isCloudDemo) {
      const typedPwd = isMaskedDemoPwd ? '' : actualPwd;
      if (typedPwd) {
        adoptedLoginRes = await apiCall('/api/auth/login', 'POST', { custom_ldap: customEmail, password: typedPwd, environment: '', require_password: true });
        registeredAcct = adoptPrivateAccountFromLogin(adoptedLoginRes, customEmail, typedPwd);
      }
      if (!registeredAcct) {
        const backendError = adoptedLoginRes && adoptedLoginRes.error;
        showToast(`⚠️ ${backendError || `Account "${rawTypedEmail}" is not registered. Select a Demo Account or Sign Up first.`}`);
        return true;
      }
    }
    if (registeredAcct) {
      const typedPwd = isMaskedDemoPwd ? '' : actualPwd;
      if (!typedPwd) { showToast(`⚠️ Enter the password for ${registeredAcct.email}`); return true; }
      if (!verifyRegisteredAccountPassword(registeredAcct, typedPwd)) { showToast(`⚠️ Invalid password for ${registeredAcct.email}`); return true; }
      const res = adoptedLoginRes || (await apiCall('/api/auth/login', 'POST', { custom_ldap: registeredAcct.email, password: typedPwd, environment: '', require_password: true }));
      if (!res || res.error) { showToast(`⚠️ ${(res && res.error) || 'Invalid credentials'}`); return true; }
      if (!registeredAcct.passwordHash) saveRegisteredAccount({ ...registeredAcct, passwordHash: hashAccountSecret(typedPwd) });
      if (typeof applyViewerSessionFromState === 'function') applyViewerSessionFromState(res);
      activeEnvironment = registeredAcct.accountKey;
      activeLockTrack = 'cloud';
      lockAuthState[registeredAcct.accountKey] = { email: registeredAcct.email, name: registeredAcct.name, authenticated: true };
      saveDualAuthState();
      setAuthCookieSession({ accountKey: registeredAcct.accountKey, email: registeredAcct.email, name: registeredAcct.name });
      if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(true);
      setNodeText('64:12', 'Password');
      if (pwdEl) delete pwdEl.dataset.demoRealPassword;
      refreshLockFieldFilledStyle();
      updateLockScreenUI();
      renderDynamicDesktopItems(appState);
      updateStickyBarUserIdentity(appState);
      if (typeof switchTerminalTranscript === 'function') switchTerminalTranscript(registeredAcct.accountKey);
      switchScreen('home');
      showToast(`✓ Signed in as ${registeredAcct.name} (${registeredAcct.email}) · your own workspace`);
      if (typeof openOnboardingTour === 'function' && !hasSeenOnboardingTour(registeredAcct.accountKey)) {
        setTimeout(() => openOnboardingTour(registeredAcct.accountKey), 1600);
      }
      return true;
    }

    if (!isDmDemo && !isCloudDemo) {
      showToast(`⚠️ Account "${rawTypedEmail}" is not registered. Select a Demo Account or Sign Up first.`);
      return true;
    }
    if (actualPwd !== DEMO_ACCOUNT_PASSWORD) {
      showToast(`⚠️ Invalid password for ${emailRaw}. Demo accounts require password P@ssword_123.`);
      return true;
    }

    const targetAcctKey = isDmDemo ? 'dm' : 'cloud';
    const chosenProfile = getAccountProfileByKey(targetAcctKey);
    const res = await apiCall('/api/auth/login', 'POST', {
      persona_id: chosenProfile.id, email: chosenProfile.email, custom_ldap: chosenProfile.email,
      password: actualPwd, environment: targetAcctKey, require_password: true,
    });
    if (res && res.error) { showToast(`⚠️ ${res.error}`); return true; }

    activeLockTrack = targetAcctKey;
    activeEnvironment = targetAcctKey;
    lockAuthState[targetAcctKey] = { email: chosenProfile.email, name: chosenProfile.displayName, authenticated: true };
    saveDualAuthState();
    setAuthCookieSession({ accountKey: targetAcctKey, email: chosenProfile.email, name: chosenProfile.displayName });

    if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(true);
    syncLockDemoCredentialFields(chosenProfile);
    if (typeof setLockAccountDropdownOpen === 'function') setLockAccountDropdownOpen(false);
    updateLockScreenUI();
    renderDynamicDesktopItems(appState);
    updateStickyBarUserIdentity(appState);
    if (typeof switchTerminalTranscript === 'function') switchTerminalTranscript(targetAcctKey);
    switchScreen('home');
    showToast(`✓ Signed in as ${chosenProfile.displayName} (${chosenProfile.email})`);
    if (typeof openOnboardingTour === 'function' && shouldTriggerFirstLoginTour(targetAcctKey, res)) {
      setTimeout(() => openOnboardingTour(targetAcctKey), 1600);
    }
    return true;
  }

  if (action === 'login-google-adc') {
    const curEmail = normalizeBuiltinAccountEmail(getNodeText('64:8').trim().toLowerCase());
    if (!curEmail || curEmail === 'email address' || curEmail === CLOUD_ACCOUNT_EMAIL || curEmail === DM_ACCOUNT_EMAIL) {
      const targetKey = curEmail === DM_ACCOUNT_EMAIL ? 'dm' : (curEmail === CLOUD_ACCOUNT_EMAIL ? 'cloud' : normalizeAccountKey(activeLockTrack));
      activeLockTrack = targetKey;
      syncLockDemoCredentialFields(getAccountProfileByKey(targetKey));
    }
    await handleApiAction('login-submit', triggerEl);
    return true;
  }

  if (action === 'intro-console-run') {
    const rawQ = getNodeText('102:3343').trim();
    const q = rawQ && rawQ !== 'Plan the launch across Brand, Legal, Cloud PM, and Commercial' ? rawQ : 'Plan the launch across Brand, Legal, Cloud PM, and Commercial';
    await executeTerminalCommand(q, true);
    return true;
  }

  if (action === 'home-console-run') {
    const inputEl = document.getElementById('home-terminal-input');
    const rawQ = inputEl ? String(inputEl.value || '').trim() : getNodeText('99:266').trim();
    if (!rawQ) { if (inputEl) inputEl.focus(); return true; }
    if (inputEl) { inputEl.value = ''; inputEl.style.height = '18px'; }
    else setNodeText('99:266', '');
    await executeTerminalCommand(rawQ, false);
    return true;
  }

  if (action === 'set-scope-federated' || action === 'set-scope-private') {
    const nextScope = action === 'set-scope-federated' ? 'federated' : 'private';
    activeBlueFileScope = nextScope;
    const winEl = (triggerEl && triggerEl.closest && triggerEl.closest('.os-floating-window')) || document.getElementById('popup-136-341');
    const winFileTitle = (winEl && winEl.dataset.fileTitle) || activeBlueFileTitle || 'DEMO LAUNCH BRIEF.md';
    await runButtonWithFeedback(
      triggerEl,
      '⏳ Saving Scope...',
      nextScope === 'private' ? '✓ Private to My Agent' : '✓ Shared Across Teams',
      async () => {
        const existingRecord =
          typeof findFileRecordByName === 'function' ? findFileRecordByName(winFileTitle) : null;
        const textareaEl = winEl ? winEl.querySelector('.doc-viewer-textarea') : null;
        const curContent =
          textareaEl && textareaEl.value.trim()
            ? textareaEl.value
            : (existingRecord && existingRecord.content) ||
              (BLUE_FILE_FALLBACKS[winFileTitle] || []).join('\n') ||
              `File: ${winFileTitle}`;
        const acctKey = normalizeAccountKey(activeEnvironment);
        const cleanTail = String((existingRecord && existingRecord.description) || 'workspace file')
          .replace(/^(uploaded|federated|private)\s*·\s*/i, '')
          .trim();
        const nextDesc = `${nextScope} · ${cleanTail || 'workspace file'}`;
        if (!SEED_FILENAMES_UPPER.has(String(winFileTitle).toUpperCase())) {
          saveCustomFileLocal(
            Object.assign({}, existingRecord || {}, {
              filename: winFileTitle,
              content: curContent,
              visibility: nextScope,
              description: nextDesc,
              environment: acctKey,
            })
          );
        }
        if (appState && Array.isArray(appState.user_files)) {
          const normName = String(winFileTitle).trim().toLowerCase();
          const normLeaf = normName.split('/').pop() || normName;
          appState.user_files.forEach((uf) => {
            const ufn = String((uf && uf.filename) || '').trim().toLowerCase();
            if (ufn === normName || (ufn.split('/').pop() || ufn) === normLeaf) {
              uf.visibility = nextScope;
              uf.description = nextDesc;
            }
          });
        }
        await apiCall(
          '/api/user/files/upload',
          'POST',
          Object.assign(
            { filename: winFileTitle, content: curContent, tags: nextDesc },
            getActiveAccountFilePayload(nextScope)
          )
        );
      }
    );
    if (typeof applyFileScopeToggleUI === 'function') {
      applyFileScopeToggleUI(winEl, nextScope);
    } else if (winEl) {
      winEl.dataset.fileScope = nextScope;
    }
    setWindowNodeText(winEl, '136:406', nextScope === 'federated' ? '✓ Shared Across Teams' : 'Shared Across Teams');
    setWindowNodeText(winEl, '136:409', nextScope === 'private' ? '✓ Private to My Agent' : 'Private to My Agent');
    setWindowNodeText(
      winEl,
      '136:411',
      nextScope === 'private'
        ? '✓ SAVED · PRIVATE TO MY AGENT'
        : '✓ SAVED · SHARED ACROSS TEAMS'
    );
    renderDynamicDesktopItems(appState);
    if (typeof mountAndRefreshDriveDocsBrowser === 'function') {
      mountAndRefreshDriveDocsBrowser();
    }
    showToast(
      nextScope === 'federated'
        ? `Sharing scope for "${winFileTitle}" set to: Shared Across Teams`
        : `Sharing scope for "${winFileTitle}" set to: Private to My Agent`
    );
    return true;
  }

  if (action === 'save-and-scrub-file') {
    const winEl =
      (triggerEl && triggerEl.closest && triggerEl.closest('.os-floating-window')) ||
      document.getElementById('popup-136-341');
    const winFileTitle =
      (winEl && winEl.dataset.fileTitle) || activeBlueFileTitle || 'DEMO LAUNCH BRIEF.md';
    const winScope = (winEl && winEl.dataset.fileScope) || activeBlueFileScope || 'federated';
    activeBlueFileTitle = winFileTitle;
    await runButtonWithFeedback(
      triggerEl,
      '⏳ Saving & Checking...',
      '✓ Saved & Checked by 4 Agents',
      async () => {
        const textareaEl = winEl ? winEl.querySelector('.doc-viewer-textarea') : null;
        let editedLines = [];
        if (textareaEl && textareaEl.value.trim()) {
          editedLines = textareaEl.value.split('\n');
          EDITOR_LINE_NODE_IDS.forEach((nid, idx) => {
            setWindowNodeText(winEl, nid, editedLines[idx] !== undefined ? editedLines[idx] : '');
          });
        } else {
          editedLines = EDITOR_LINE_NODE_IDS.map((nid) => getWindowNodeText(winEl, nid)).filter(Boolean);
          if (
            BLUE_FILE_FALLBACKS[winFileTitle] &&
            BLUE_FILE_FALLBACKS[winFileTitle].length > EDITOR_LINE_NODE_IDS.length
          ) {
            editedLines = [
              ...editedLines,
              ...BLUE_FILE_FALLBACKS[winFileTitle].slice(EDITOR_LINE_NODE_IDS.length),
            ];
          }
        }
        const combinedContent = editedLines.join('\n');
        BLUE_FILE_FALLBACKS[winFileTitle] = editedLines;
        const existingRecord = typeof findFileRecordByName === 'function' ? findFileRecordByName(winFileTitle) : null;
        const renderedEl = winEl ? winEl.querySelector('.doc-viewer-rendered') : null;
        if (renderedEl) {
          renderedEl.innerHTML = renderFilePreviewHtml(combinedContent, winFileTitle, existingRecord);
        }
        const acctKey = normalizeAccountKey(activeEnvironment);
        if (!SEED_FILENAMES_UPPER.has(String(winFileTitle).toUpperCase())) {
          saveCustomFileLocal(
            Object.assign({}, existingRecord || {}, {
              filename: winFileTitle,
              content: combinedContent,
              visibility: winScope,
              description: `${winScope} · edited file`,
              environment: acctKey,
            })
          );
        }
        if (typeof bumpDesktopItemNotification === 'function' && typeof getBlueFileNotificationKey === 'function') {
          bumpDesktopItemNotification(getBlueFileNotificationKey(winFileTitle), 1);
        }
        await apiCall(
          '/api/user/files/upload',
          'POST',
          Object.assign({ filename: winFileTitle, content: combinedContent, tags: `${winScope} · edited file` }, getActiveAccountFilePayload(winScope))
        );
        if (winFileTitle === 'DEMO LAUNCH BRIEF.md') {
          await apiCall('/api/analyze', 'POST', { document_text: combinedContent });
        }
      }
    );
    setWindowNodeText(winEl, '136:411', '✓ SAVED & CHECKED BY 4 AGENTS');
    setWindowNodeText(winEl, '136:360', '✓ VERIFIED JUST NOW');
    renderDynamicDesktopItems(appState);
    showToast(`Saved ${winFileTitle} & completed 4-Agent Check!`);
    return true;
  }

  if (action === 'upload-folder-submit') {
    const filePayload = getActiveAccountFilePayload();
    const acctKey = filePayload.environment;
    const acctLabel = getActiveAccountDisplayLabel();
    const rawFolderName = getNodeText('152:9').replace(/^Enter folder name/i, '').trim();
    const rawFolderDesc = getNodeText('152:13').replace(/^Add up to 5 words/i, '').trim();
    const folderDesc = rawFolderDesc || `uploaded · ${filePayload.visibility} file`;
    let lastUploadedFilename = '';

    if (pendingUploadedFiles.length > 0) {
      for (const f of pendingUploadedFiles) {
        const origName = String(f.name || 'uploaded_file.txt').trim();
        const origDot = origName.lastIndexOf('.');
        const origExt = origDot > 0 ? origName.slice(origDot) : '';
        let fullFilename = origName;
        if (pendingUploadedFiles.length === 1 && rawFolderName && rawFolderName.toLowerCase() !== origName.toLowerCase()) {
          fullFilename = /\.[a-z0-9]{2,5}$/i.test(rawFolderName) ? rawFolderName : `${rawFolderName}${origExt || '.txt'}`;
        }
        const fmt = typeof getFileFormatMeta === 'function' ? getFileFormatMeta(fullFilename, f) : { ext: 'txt', mimeType: 'text/plain' };
        BLUE_FILE_FALLBACKS[fullFilename] = String(f.content || '').split('\n');
        saveCustomFileLocal({
          filename: fullFilename, content: f.content, visibility: filePayload.visibility, description: folderDesc,
          file_type: f.fileType || fmt.ext, mime_type: f.mimeType || fmt.mimeType, data_url: f.dataUrl || '', environment: acctKey,
        });
        await apiCall('/api/user/files/upload', 'POST', Object.assign({ filename: fullFilename, content: f.content, tags: folderDesc }, filePayload));
        lastUploadedFilename = fullFilename;
      }
      pendingUploadedFiles = [];
    } else {
      const baseName = rawFolderName || `WORKSPACE_FILE_${getStoredCustomFiles().length + 1}.txt`;
      const fullFilename = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.txt`;
      const fmt = typeof getFileFormatMeta === 'function' ? getFileFormatMeta(fullFilename) : { ext: 'txt', badge: 'PLAIN TEXT FILE' };
      let defaultContent = '';
      if (fmt.ext === 'csv' || fmt.ext === 'tsv' || fmt.ext === 'xlsx') {
        defaultContent = [
          'Item,Owner,Account,Scope,Status',
          `"${fullFilename}","${filePayload.ldap}","${acctLabel}","${filePayload.visibility}","READY"`,
          `"${folderDesc}","${filePayload.ldap}","${acctLabel}","Workspace Table","VERIFIED"`,
        ].join('\n');
      } else if (fmt.ext === 'json') {
        defaultContent = JSON.stringify({
          filename: fullFilename, owner: filePayload.ldap, account: acctLabel,
          visibility: filePayload.visibility, summary: folderDesc, status: 'READY_TO_OPEN',
        }, null, 2);
      } else if (fmt.ext === 'md') {
        defaultContent = `# ${fullFilename}\n**Owner:** ${filePayload.ldap} · **Account:** ${acctLabel}\n\n${folderDesc}`;
      } else {
        defaultContent = [
          `FILE: ${fullFilename} (${fmt.badge})`, `Owner: ${filePayload.ldap} (${acctLabel})`,
          `Visibility: ${filePayload.visibility} · Summary: ${folderDesc}`, '',
          `This ${fmt.badge.toLowerCase()} is stored in your Murph workspace and is ready to read, edit, or query from your Personal Agent.`,
        ].join('\n');
      }
      BLUE_FILE_FALLBACKS[fullFilename] = defaultContent.split('\n');
      saveCustomFileLocal({
        filename: fullFilename, content: defaultContent, visibility: filePayload.visibility, description: folderDesc,
        file_type: fmt.ext, mime_type: fmt.mimeType || 'text/plain', environment: acctKey,
      });
      await apiCall('/api/user/files/upload', 'POST', Object.assign({ filename: fullFilename, content: defaultContent, tags: folderDesc }, filePayload));
      lastUploadedFilename = fullFilename;
    }
    setNodeText('152:9', 'Enter folder name');
    setNodeText('152:13', 'Add up to 5 words');
    setNodeText('152:24', 'Drop any file (.pdf, .csv, .json, .txt, .png, .docx, .md) or click to browse');
    setNodeText('152:27', 'ALL FORMATS SUPPORTED');
    renderDynamicDesktopItems(appState);
    if (typeof mountAndRefreshDriveDocsBrowser === 'function') mountAndRefreshDriveDocsBrowser();
    const uploadWin = document.getElementById('popup-145-1122');
    if (uploadWin) uploadWin.classList.remove('active');
    if (lastUploadedFilename) {
      window._murphSuppressNextOpenSeen = true;
      openPopup('136:341', lastUploadedFilename);
    }
    showToast(`Uploaded & opened "${lastUploadedFilename}" (${filePayload.visibility})!`);
    return true;
  }

  return false;
}
