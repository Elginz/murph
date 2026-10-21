/**
 * ============================================================================
 * 07c-actions-workflow-wizard.js — Workflow Creation Wizard, Account Switcher & Reset
 * ============================================================================
 *
 * Handles:
 *   1. Workflow Creation Wizard Step 1-4 actions (`select-wf-type`,
 *      `toggle-wf-file`, `toggle-wf-tag-user`, `toggle-ticket-tag-user`,
 *      `launch-workflow`).
 *   2. Lock-screen track selection, quick-fill, and live environment/persona switching.
 *   3. Full SQLite + localStorage workspace reset (`reset-workspace`).
 */

function setLockAccountDropdownOpen(isOpen) {
  const barEl = document.getElementById('lock-dual-auth-bar');
  const btnEl = document.getElementById('lock-account-dropdown-btn');
  if (barEl) barEl.classList.toggle('open', Boolean(isOpen));
  if (btnEl) btnEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

async function handleWorkflowWizardAndResetAction(action, triggerEl) {
  if (action === 'toggle-theme-mode') {
    if (typeof toggleDockThemeMode === 'function') {
      toggleDockThemeMode();
    }
    return true;
  }

  if (action === 'toggle-lock-account-menu') {
    const barEl = document.getElementById('lock-dual-auth-bar');
    const willOpen = barEl ? !barEl.classList.contains('open') : false;
    setLockAccountDropdownOpen(willOpen);
    return true;
  }

  if (action === 'select-lock-track') {
    const track = (triggerEl && triggerEl.getAttribute('data-lock-track')) === 'dm' ? 'dm' : 'cloud';
    activeLockTrack = track;
    const acctProfile = getAccountProfileByKey(track);
    syncLockDemoCredentialFields(acctProfile);
    setLockAccountDropdownOpen(false);
    updateLockScreenUI();
    return true;
  }

  if (action === 'quick-fill-lock') {
    const track = (triggerEl && triggerEl.getAttribute('data-lock-track')) === 'dm' ? 'dm' : 'cloud';
    const acctProfile = getAccountProfileByKey(track);
    activeLockTrack = track;
    syncLockDemoCredentialFields(acctProfile);
    setLockAccountDropdownOpen(false);
    updateLockScreenUI();
    await handleApiAction('login-submit', triggerEl);
    return true;
  }

  if (action === 'switch-env' || action === 'cycle-environment' || action === 'cycle-persona') {
    const nextAcctKey = activeEnvironment === 'dm' ? 'cloud' : 'dm';
    const nextProfile = getAccountProfileByKey(nextAcctKey);
    activeEnvironment = nextAcctKey;
    activeLockTrack = nextAcctKey;
    lockAuthState[nextAcctKey] = {
      email: nextProfile.email,
      name: nextProfile.displayName,
      authenticated: true,
    };
    syncLockDemoCredentialFields(nextProfile);
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
    if (typeof switchTerminalTranscript === 'function') {
      switchTerminalTranscript(nextAcctKey);
    }
    showToast(`Switched active user account to ${nextProfile.displayName} (${nextProfile.email})`);
    if (
      document.body.classList.contains('home-screen-active') &&
      typeof openOnboardingTour === 'function' &&
      shouldTriggerFirstLoginTour(nextAcctKey, res)
    ) {
      setTimeout(() => openOnboardingTour(nextAcctKey), 1200);
    }
    return true;
  }

  if (action === 'select-wf-type') {
    activeWorkflowType = triggerEl.getAttribute('data-wf-type') || 'scrub';
    applySelectedWorkflowTypeUI(activeWorkflowType);
    return true;
  }

  if (action === 'toggle-wf-file') {
    const fName = triggerEl.getAttribute('data-file');
    if (!fName) return true;
    if (selectedWorkflowFiles.has(fName)) {
      if (selectedWorkflowFiles.size > 1) selectedWorkflowFiles.delete(fName);
    } else {
      selectedWorkflowFiles.add(fName);
    }
    triggerEl.style.opacity = selectedWorkflowFiles.has(fName) ? '1' : '0.45';
    refreshWorkflowTagSelectionUI();
    return true;
  }

  if (action === 'toggle-wf-tag-user') {
    const uLdap = triggerEl.getAttribute('data-user-ldap');
    if (!uLdap) return true;
    toggleWorkflowTaggedUser(uLdap);
    return true;
  }

  if (action === 'toggle-ticket-tag-user') {
    const uLdap = triggerEl.getAttribute('data-user-ldap');
    if (!uLdap) return true;
    if (selectedTicketTaggedUsers.has(uLdap)) {
      selectedTicketTaggedUsers.delete(uLdap);
    } else {
      selectedTicketTaggedUsers.add(uLdap);
    }
    document.querySelectorAll('[data-api-action="toggle-ticket-tag-user"]').forEach((chip) => {
      const chipLdap = chip.getAttribute('data-user-ldap');
      chip.classList.toggle('active', selectedTicketTaggedUsers.has(chipLdap));
    });
    const inputEl = document.querySelector('[data-node-id="183:477"]');
    if (inputEl) {
      let curText = inputEl.textContent.trim();
      if (curText.startsWith('murph > Ask your Personal Agent')) {
        curText = 'murph > Settle launch alignment across shared files with ';
      }
      const handle = `@${uLdap.split('@')[0]}`;
      if (selectedTicketTaggedUsers.has(uLdap) && !curText.includes(handle)) {
        curText = `${curText} ${handle}`.trim();
      }
      inputEl.textContent = curText;
    }
    return true;
  }

  if (action === 'launch-workflow') {
    const acctKey = normalizeAccountKey(activeEnvironment);
    const acctLabel =
      acctKey === 'dm'
        ? 'Digital Marketing (DM) User'
        : acctKey === 'cloud'
          ? 'Cloud User'
          : `${getAccountProfileByKey(acctKey).displayName}'s workspace`;
    const wfFile = getNodeText('154:131') || 'Q4_KEYNOTE_CLAIM_SCRUB.wf';
    const promptText = getNodeText('154:136').replace(/^Add specific instructions.*/i, '').trim();
    const rawFolderName = getNodeText('163:11').replace(/^Enter a folder name.*/i, '').trim();
    const rawFolderDesc = getNodeText('163:14').replace(/^Add a short description.*/i, '').trim();
    const folderName =
      rawFolderName ||
      wfFile.replace(/\.wf$/i, '').replace(/[_-]+/g, ' ').trim() ||
      `AGENT WORKFLOW ${getStoredCustomWorkflows().length + 1}`;

    // Collect tagged users from dropdowns, pills, and custom @ldap input
    const customTagInput = document.getElementById('wf-tag-users-input');
    const customTagRaw = customTagInput ? customTagInput.value.trim() : '';
    const extraTags = customTagRaw
      ? customTagRaw
          .split(/[\s,;]+/)
          .map((t) => t.replace(/^@/, '').trim())
          .filter(Boolean)
          .map((t) => (t.includes('@') ? t.toLowerCase() : `${t.toLowerCase()}@google.com`))
      : [];
    const primarySelectEl = document.getElementById('wf-settlement-user-select');
    const footerSelectEl = document.getElementById('wf-footer-user-select');
    const dropdownUser =
      (primarySelectEl && primarySelectEl.value) ||
      (footerSelectEl && footerSelectEl.value) ||
      '';
    const taggedSet = new Set([...Array.from(selectedWorkflowTaggedUsers), ...extraTags]);
    if (dropdownUser && dropdownUser !== '__all__') {
      taggedSet.add(dropdownUser);
    }
    const taggedUsersList = Array.from(taggedSet);
    const taggedShortHandles = taggedUsersList.map((u) => `@${String(u).split('@')[0]}`).join(', ');

    const folderDesc =
      rawFolderDesc ||
      (taggedShortHandles ? `Settled w/ ${taggedShortHandles}` : promptText.slice(0, 26)) ||
      `${selectedWorkflowFiles.size} files · ${activeWorkflowType} wf`;

    const floatingPopupMap = {
      scrub: '136:468',
      tickets: '136:730',
      escalations: '136:417',
      policies: '136:579',
      deliverables: '136:521',
    };
    const targetPopupId = floatingPopupMap[activeWorkflowType] || '136:468';
    const creatorProfile = getActiveLoggedInUserProfile(appState);

    const newWfObj = {
      folder_name: folderName,
      description: folderDesc,
      workflow_type: activeWorkflowType,
      wf_filename: wfFile,
      selected_files: Array.from(selectedWorkflowFiles),
      prompt: promptText,
      target_popup_id: targetPopupId,
      environment: acctKey,
      shared_across_environments: taggedUsersList.length > 0,
      creator_user_id: creatorProfile.id || (acctKey === 'dm' ? 'user_brand' : 'user_owner'),
      creator_ldap: creatorProfile.email,
      tagged_users: taggedUsersList,
    };
    saveCustomWorkflowLocal(newWfObj);

    const updatedState = await apiCall('/api/workflows/create', 'POST', newWfObj);
    if (updatedState && Array.isArray(updatedState.custom_workflows)) {
      const serverWf = updatedState.custom_workflows.find(
        (w) => String(w.folder_name || '').toUpperCase() === folderName.toUpperCase()
      );
      if (serverWf) {
        saveCustomWorkflowLocal(serverWf);
      }
    }
    renderDynamicDesktopItems(appState);

    // Reset Step 4 inputs for next workflow creation
    setNodeText('163:11', 'Enter a folder name...');
    setNodeText('163:14', 'Add a short description...');
    if (customTagInput) {
      customTagInput.value = '';
    }

    closeOverlayPopups();
    const customSlug = folderName
      .toUpperCase()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const createdDesktopEl = document.querySelector(
      `#screen-home [data-node-id="custom-wf-${customSlug}"]`
    );
    window._murphSuppressNextOpenSeen = true;
    openPopup(targetPopupId, null, null, createdDesktopEl);
    if (taggedUsersList.length > 0) {
      showToast(
        `✓ Agents settled "${folderName.toUpperCase()}" & updated both ${creatorProfile.email.split('@')[0]}@ and ${taggedShortHandles}!`
      );
    } else {
      showToast(
        `Created & persisted workflow folder "${folderName.toUpperCase()}" under ${acctLabel}!`
      );
    }
    return true;
  }

  if (action === 'reset-workspace') {
    resetDesktopPositions();
    if (window._murphApprovedTicketIds && window._murphApprovedTicketIds.clear) window._murphApprovedTicketIds.clear();
    if (window._murphResolvedClaimIds && window._murphResolvedClaimIds.clear) window._murphResolvedClaimIds.clear();
    if (typeof clearAllDesktopItemNotifications === 'function') {
      clearAllDesktopItemNotifications();
    }
    lockAuthState = {
      cloud: { email: 'cloud_demo@google.com', name: 'Cloud User', authenticated: false },
      dm: { email: 'marketing_demo@google.com', name: 'Marketing User', authenticated: false },
    };
    activeLockTrack = 'cloud';
    activeEnvironment = 'cloud';
    userSettingsOverrides = {};
    if (typeof clearAuthCookieSession === 'function') {
      clearAuthCookieSession();
    }
    try {
      localStorage.removeItem(CUSTOM_FILES_STORAGE_KEY);
      localStorage.removeItem(CUSTOM_WORKFLOWS_STORAGE_KEY);
      localStorage.removeItem(DUAL_AUTH_STORAGE_KEY);
      localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_ENV_STORAGE_KEY);
      localStorage.removeItem(FILE_TIMESTAMPS_STORAGE_KEY);
      localStorage.removeItem(TRASH_BIN_STORAGE_KEY);
      localStorage.removeItem(DELETED_SEEDS_STORAGE_KEY);
      localStorage.removeItem(USER_SETTINGS_STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_SEEN_STORAGE_KEY);
      localStorage.removeItem(WELCOME_CARD_DISMISSED_STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_BOOT_ID_STORAGE_KEY);
      if (typeof DOCK_THEME_STORAGE_KEY !== 'undefined') {
        localStorage.removeItem(DOCK_THEME_STORAGE_KEY);
      }
    } catch (_) {}
    if (typeof setDockThemeMode === 'function') {
      setDockThemeMode('light');
    }
    if (typeof sessionPrivateProfile !== 'undefined') {
      sessionPrivateProfile = null;
    }
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await apiCall('/api/project/reset', 'POST', { reset_all: true });
    updateLockScreenUI();
    renderDynamicDesktopItems(appState);
    updateStickyBarUserIdentity(appState);
    if (typeof clearAllTerminalSessions === 'function') {
      clearAllTerminalSessions();
    }
    switchScreen('lock');
    showToast('Reset SQLite workspace, Trash Bin, and auth session — please sign in on the Lock Screen');
    return true;
  }

  return false;
}
