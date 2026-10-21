// 03e-dock-workflow-sync.js — Syncs Bottom Dock (99:300) icons/badges & all 5 Dock popups with active user's desktop files & workflows.

let _dockSessionLoggedIn = false;
function setDockLoginSessionActive(isActive) { _dockSessionLoggedIn = Boolean(isActive); }

function hasActiveDockLoginSession() {
  if (_dockSessionLoggedIn) return true;
  const homeScreen = document.getElementById('screen-home');
  if ((homeScreen && homeScreen.classList.contains('active')) || (document.body && document.body.classList.contains('home-screen-active'))) {
    _dockSessionLoggedIn = true;
    return true;
  }
  return false;
}

const SEED_WORKFLOW_TYPE_BY_NODE = {
  '99:177': { type: 'scrub', wfFile: 'claim_scrub.wf' },
  '99:188': { type: 'policies', wfFile: 'policy_rates.wf' },
  '99:199': { type: 'escalations', wfFile: 'hard_stops.wf' },
  '99:223': { type: 'deliverables', wfFile: 'deliverables_sync.wf' },
};

const DOCK_CATEGORY_CONFIG = {
  agent: {
    dockNodeId: '99:301', popupId: '136:730', contentNodeId: '183:356', headerBadgeNodeId: '183:355', wfType: 'tickets', label: 'Cross-Team',
    emptyTitle: 'No Active Cross-Team Workflows on Your Desktop',
    emptyDesc: 'Add a Yellow workflow folder on your desktop to start cross-team review.',
    ctaLabel: '+ Launch Cross-Team Workflow',
  },
  scrub: {
    dockNodeId: '99:307', popupId: '155:1214', contentNodeId: '155:1225', headerBadgeNodeId: '155:1224', wfType: 'scrub', label: 'Claim Fixes',
    emptyTitle: 'No Active Claim Fixes Workflow on Your Desktop',
    emptyDesc: 'Add a Claim Fixes workflow folder to check launch claims and apply 1-click fixes.',
    ctaLabel: '+ Launch Claim Fixes Workflow',
  },
  escalations: {
    dockNodeId: '99:314', popupId: '136:836', contentNodeId: '183:197', headerBadgeNodeId: '183:196', wfType: 'escalations', label: 'Blocker Alerts',
    emptyTitle: 'No Active Blocker Alerts Workflow on Your Desktop',
    emptyDesc: 'Add a Blocker Alerts workflow folder to review legal or budget decisions waiting on sign-off.',
    ctaLabel: '+ Launch Blocker Alerts Workflow',
  },
  policies: {
    dockNodeId: '99:320', popupId: '136:890', contentNodeId: '136:901', headerBadgeNodeId: '136:900', wfType: 'policies', label: 'Policy & Sync',
    emptyTitle: 'No Active Policy & Sync Workflow on Your Desktop',
    emptyDesc: 'Add a Policy & Sync workflow folder to view team rules and demo build costs.',
    ctaLabel: '+ Launch Policy & Sync Workflow',
  },
  deliverables: {
    dockNodeId: '99:326', popupId: '136:942', contentNodeId: '136:953', headerBadgeNodeId: '136:952', wfType: 'deliverables', label: 'Deliverables',
    emptyTitle: 'No Active Deliverables Workflow on Your Desktop',
    emptyDesc: 'Add a Deliverables workflow folder to generate your ready-to-share launch files.',
    ctaLabel: '+ Launch Deliverables Workflow',
  },
};

function getActiveUserDesktopSetup(state) {
  const effectiveState = state || (typeof appState !== 'undefined' ? appState : null);
  const loggedIn = hasActiveDockLoginSession();
  const env = typeof normalizeAccountKey === 'function' ? normalizeAccountKey(activeEnvironment) : 'cloud';
  const isIsolatedAccount = typeof isCustomAccountKey === 'function' && isCustomAccountKey(env);
  const rawProfile = typeof getActiveLoggedInUserProfile === 'function'
    ? getActiveLoggedInUserProfile(effectiveState)
    : { displayName: 'Cloud User', name: 'Cloud User', email: 'cloud_demo@google.com' };
  const profile = {
    name: rawProfile.displayName || rawProfile.name || 'Workspace User',
    email: rawProfile.email || '',
    initials: typeof getInitials === 'function' ? getInitials(rawProfile.displayName || rawProfile.name || rawProfile.email) : 'MU',
  };
  const byType = { tickets: [], scrub: [], escalations: [], policies: [], deliverables: [] };
  if (!loggedIn) return { loggedIn: false, isCustom: isIsolatedAccount, activeTrack: env, profile, files: [], workflows: [], byType, state: effectiveState };

  // 1. Collect visible Blue desktop files for active user
  const files = [];
  const seenFileUpper = new Set();
  if (!isIsolatedAccount && typeof SEED_DESKTOP_NODE_ENV_MAP === 'object') {
    Object.entries(SEED_DESKTOP_NODE_ENV_MAP).forEach(([nodeId, meta]) => {
      const hiddenByTrash = typeof isSeedItemHidden === 'function' ? isSeedItemHidden(nodeId, meta.env) : false;
      const visibleInEnv = typeof isSeedBlueFileVisibleForEnv === 'function'
        ? isSeedBlueFileVisibleForEnv(meta, env) && !hiddenByTrash
        : !meta.hidden && meta.env === env && !hiddenByTrash;
      if (visibleInEnv) {
        seenFileUpper.add(String(meta.filename).toUpperCase());
        files.push({ name: meta.filename, nodeId, fileId: meta.fileId, isSeed: true });
      }
    });
  }

  const serverFiles = (effectiveState && effectiveState.user_files) || [];
  const localFiles = typeof getStoredCustomFiles === 'function' ? getStoredCustomFiles() : [];
  [...serverFiles, ...localFiles].forEach((f) => {
    if (!f || !f.filename) return;
    const upperName = String(f.filename).trim().toUpperCase();
    if ((typeof SEED_FILE_IDS !== 'undefined' && SEED_FILE_IDS.has(f.id)) || (typeof SEED_FILENAMES_UPPER !== 'undefined' && SEED_FILENAMES_UPPER.has(upperName))) return;
    const fEnv = typeof normalizeAccountKey === 'function' ? normalizeAccountKey(f.environment) : 'cloud';
    if (fEnv !== env) return;
    if (typeof isCustomItemInTrash === 'function' && isCustomItemInTrash('custom-file', fEnv, f.filename)) return;
    if (!seenFileUpper.has(upperName)) {
      seenFileUpper.add(upperName);
      files.push({ name: f.filename, nodeId: f.id || `custom-file-${upperName}`, isSeed: false });
    }
  });

  // 2. Collect visible Yellow workflow folders on desktop for active user
  const workflows = [];
  if (!isIsolatedAccount && typeof SEED_WORKFLOW_NODE_MAP === 'object') {
    Object.entries(SEED_WORKFLOW_NODE_MAP).forEach(([wfNodeId, wfMeta]) => {
      const hiddenByTrash = typeof isSeedItemHidden === 'function' ? isSeedItemHidden(wfNodeId, env) : false;
      const visibleInEnv = typeof isSeedWorkflowVisibleForEnv === 'function'
        ? isSeedWorkflowVisibleForEnv(wfMeta, env) && !hiddenByTrash
        : Array.isArray(wfMeta.envs) && wfMeta.envs.includes(env) && !hiddenByTrash;
      if (visibleInEnv) {
        const typeSpec = SEED_WORKFLOW_TYPE_BY_NODE[wfNodeId] || { type: 'scrub', wfFile: 'workflow.wf' };
        const wfObj = { id: `seed-${wfNodeId}`, nodeId: wfNodeId, name: wfMeta.title, wfFile: typeSpec.wfFile, type: typeSpec.type, isSeed: true, files: files.map((f) => f.name) };
        workflows.push(wfObj);
        if (byType[wfObj.type]) byType[wfObj.type].push(wfObj);
      }
    });
  }

  const resolveWfCreatorEnv = (w) => {
    const rawEnv = String(w.creator_env || w.environment || '').toLowerCase();
    if (rawEnv === 'cloud' || rawEnv === 'dm' || (typeof isCustomAccountKey === 'function' && isCustomAccountKey(normalizeAccountKey(rawEnv)))) return normalizeAccountKey(rawEnv);
    if (typeof isDmAccountLdap === 'function' && (isDmAccountLdap(w.creator_ldap) || w.creator_user_id === 'user_brand')) return 'dm';
    return 'cloud';
  };

  const ownerEmailLower = String(profile.email || '').toLowerCase();
  const isWfVisibleHere = (w, wEnv) => {
    if (wEnv === env) return true;
    if (w.creator_user_id && typeof normalizeAccountKeyOrEmpty === 'function' && normalizeAccountKeyOrEmpty(w.creator_user_id) === env && isIsolatedAccount) return true;
    const tagged = (w.tagged_users || []).map((t) => String((t && (t.email || t.ldap)) || t || '').toLowerCase());
    if (isIsolatedAccount || (typeof isCustomAccountKey === 'function' && isCustomAccountKey(wEnv))) {
      return Boolean(ownerEmailLower) && tagged.includes(ownerEmailLower);
    }
    return Boolean(w.shared_across_environments || tagged.length > 0);
  };

  const seenWfUpper = new Set();
  const serverWfs = (effectiveState && effectiveState.custom_workflows) || [];
  const localWfs = typeof getStoredCustomWorkflows === 'function' ? getStoredCustomWorkflows() : [];
  [...serverWfs, ...localWfs].forEach((w) => {
    if (!w || !w.folder_name) return;
    const upperKey = String(w.folder_name).trim().toUpperCase();
    if (seenWfUpper.has(upperKey)) return;
    const wEnv = resolveWfCreatorEnv(w);
    if (!isWfVisibleHere(w, wEnv)) return;
    if (typeof isCustomItemInTrash === 'function' && isCustomItemInTrash('custom-workflow', wEnv, w.folder_name)) return;
    seenWfUpper.add(upperKey);
    const wfType = w.workflow_type && byType[w.workflow_type] ? w.workflow_type : 'scrub';
    const wfObj = {
      id: `custom-wf-${upperKey}`, nodeId: `custom-wf-${upperKey}`, name: w.folder_name, wfFile: w.wf_filename || 'CUSTOM_WORKFLOW.wf',
      type: wfType, isSeed: false, files: Array.isArray(w.selected_files) && w.selected_files.length > 0 ? w.selected_files : files.map((f) => f.name), taggedUsers: w.tagged_users || [],
    };
    workflows.push(wfObj);
    byType[wfType].push(wfObj);
  });

  return { loggedIn: true, isCustom: isIsolatedAccount, activeTrack: env, profile, files, workflows, byType, state: effectiveState };
}

function setPopupNodeVisible(nodeOrEl, visible) {
  const el = typeof nodeOrEl === 'string' ? document.querySelector(`[data-node-id="${nodeOrEl}"]`) : nodeOrEl;
  if (!el) return;
  el.classList.toggle('dock-seed-hidden', !visible);
  if (visible) {
    if (el.style.display === 'none') el.style.removeProperty('display');
  } else {
    el.style.setProperty('display', 'none', 'important');
  }
}

function updateDockButtonVisual(dockNodeId, isActive, badgeCount, tooltipText) {
  const btn = document.querySelector(`[data-node-id="${dockNodeId}"]`);
  if (!btn) return;
  btn.classList.toggle('dock-app-active', Boolean(isActive));
  btn.classList.toggle('dock-app-empty', !isActive);
  btn.title = tooltipText || '';

  let dot = btn.querySelector('.dock-active-dot');
  if (isActive && !dot) {
    dot = document.createElement('span');
    dot.className = 'dock-active-dot';
    btn.appendChild(dot);
  } else if (!isActive && dot) {
    dot.remove();
  }

  if (dockNodeId === '99:314') {
    const hardStopPill = document.querySelector('[data-node-id="99:337"]');
    const hardStopText = document.querySelector('[data-node-id="99:338"]');
    if (hardStopPill) hardStopPill.style.display = isActive && badgeCount > 0 ? 'flex' : 'none';
    if (hardStopText && isActive && badgeCount > 0) hardStopText.textContent = String(badgeCount);
    return;
  }

  let dynBadge = btn.querySelector('.dock-dynamic-badge');
  if (isActive && badgeCount > 0) {
    if (!dynBadge) {
      dynBadge = document.createElement('span');
      dynBadge.className = 'dock-dynamic-badge';
      btn.appendChild(dynBadge);
    }
    dynBadge.textContent = String(badgeCount);
  } else if (dynBadge) {
    dynBadge.remove();
  }
}

function renderPopupEmptyOrActiveShell(catKey, isActive, setup, bannerSubtitle) {
  const cfg = DOCK_CATEGORY_CONFIG[catKey];
  if (!cfg) return null;
  const contentEl = document.querySelector(`[data-node-id="${cfg.contentNodeId}"]`);
  if (!contentEl) return null;

  contentEl.classList.toggle('dock-popup-is-empty', !isActive);
  const popupRoot = contentEl.closest('[id^="popup-"]');
  const headerBadge = document.querySelector(`[data-node-id="${cfg.headerBadgeNodeId}"]`);
  let emptyPanel = contentEl.querySelector(':scope > .dock-empty-state-panel');
  let bannerEl = contentEl.querySelector(':scope > .dock-workflow-context-banner');
  let customListEl = contentEl.querySelector(':scope > .dock-custom-items-list');

  if (!isActive) {
    Array.from(contentEl.children).forEach((child) => {
      if (!child.classList.contains('dock-empty-state-panel')) setPopupNodeVisible(child, false);
    });
    if (popupRoot) {
      popupRoot.querySelectorAll('.workload-topology-container').forEach((tc) => setPopupNodeVisible(tc, false));
    }
    if (headerBadge) headerBadge.textContent = '0 ACTIVE WORKFLOWS · NOT ON DESKTOP';
    if (!emptyPanel) {
      emptyPanel = document.createElement('div');
      emptyPanel.className = 'dock-empty-state-panel';
      contentEl.appendChild(emptyPanel);
    }
    setPopupNodeVisible(emptyPanel, true);
    emptyPanel.style.display = 'flex';
    const fileChipsHtml = setup.files.length > 0
      ? setup.files.map((f) => `<button type="button" class="dock-wf-banner-file-chip" data-open-popup="136:341" data-file-title="${escapeHtmlSafe(f.name)}">${escapeHtmlSafe(f.name)}</button>`).join('')
      : '<span class="dock-wf-banner-muted" style="font-size:11px;">No Blue context files on your desktop yet.</span>';

    emptyPanel.innerHTML = `
      <span class="dock-empty-badge">WORKSPACE SYNC · ${escapeHtmlSafe((setup.profile && setup.profile.name) || 'ACTIVE USER')}</span>
      <h4 class="dock-empty-title">${escapeHtmlSafe(cfg.emptyTitle)}</h4>
      <p class="dock-empty-desc">${escapeHtmlSafe(cfg.emptyDesc)}</p>
      <div class="dock-empty-files-box">
        <span class="dock-empty-files-label">Current Desktop Blue Files (${setup.files.length})</span>
        <div class="dock-wf-banner-files">${fileChipsHtml}</div>
      </div>
      <div class="dock-empty-actions">
        <button type="button" class="dock-empty-cta-primary" data-api-action="dock-launch-workflow-type" data-wf-type="${escapeHtmlSafe(cfg.wfType)}">${escapeHtmlSafe(cfg.ctaLabel)}</button>
        <button type="button" class="dock-empty-cta-secondary" data-open-popup="145:1122">+ Upload / Browse Blue Files</button>
      </div>`;
    return { contentEl, isActive: false };
  }

  if (emptyPanel) setPopupNodeVisible(emptyPanel, false);
  Array.from(contentEl.children).forEach((child) => {
    if (
      !child.classList.contains('dock-empty-state-panel') &&
      !child.classList.contains('dock-workflow-context-banner') &&
      !child.classList.contains('dock-custom-items-list')
    ) setPopupNodeVisible(child, true);
  });

  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'dock-workflow-context-banner';
    contentEl.insertBefore(bannerEl, contentEl.firstChild);
  }
  setPopupNodeVisible(bannerEl, true);
  bannerEl.style.display = 'flex';

  const activeWfs = catKey === 'agent' ? setup.workflows : setup.byType[cfg.wfType] || [];
  const wfPillsHtml = activeWfs.length > 0
    ? activeWfs.map((w) => `<span class="dock-wf-banner-pill">${escapeHtmlSafe(w.name)} (${escapeHtmlSafe(w.wfFile)})</span>`).join('')
    : '<span class="dock-wf-banner-pill">GROUNDED DESKTOP FILES</span>';
  const fileChipsHtml = setup.files.length > 0
    ? setup.files.map((f) => `<button type="button" class="dock-wf-banner-file-chip" data-open-popup="136:341" data-file-title="${escapeHtmlSafe(f.name)}">${escapeHtmlSafe(f.name)}</button>`).join('')
    : '<span class="dock-wf-banner-muted" style="font-size:11px;">No desktop Blue files</span>';

  bannerEl.innerHTML = `
    <div class="dock-wf-banner-top">
      <div class="dock-wf-banner-title">
        <span>ACTIVE WORKFLOW SCOPE (${escapeHtmlSafe((setup.profile && setup.profile.name) || 'USER')}):</span>
        ${wfPillsHtml}
      </div>
      <button type="button" class="dock-wf-banner-action-btn" data-api-action="dock-launch-workflow-type" data-wf-type="${escapeHtmlSafe(cfg.wfType)}">+ New ${escapeHtmlSafe(cfg.label)} Flow</button>
    </div>
    <div class="dock-wf-banner-files">
      <span class="dock-wf-banner-label" style="font-size:11px;font-weight:600;">BOUND BLUE FILES:</span>
      ${fileChipsHtml}
      ${bannerSubtitle ? `<span class="dock-wf-banner-subtitle" style="margin-left:auto;font-size:11px;font-weight:600;">${escapeHtmlSafe(bannerSubtitle)}</span>` : ''}
    </div>`;

  const customWfs = activeWfs.filter((w) => !w.isSeed);
  if (customWfs.length > 0) {
    if (!customListEl) {
      customListEl = document.createElement('div');
      customListEl.className = 'dock-custom-items-list';
      bannerEl.insertAdjacentElement('afterend', customListEl);
    }
    setPopupNodeVisible(customListEl, true);
    customListEl.style.display = 'flex';
    customListEl.innerHTML = customWfs.map((cw) => `
      <div class="dock-custom-wf-card">
        <div class="dock-custom-wf-main">
          <span class="dock-custom-wf-title">${escapeHtmlSafe(cw.name)} · ${escapeHtmlSafe(cw.wfFile)}</span>
          <span class="dock-custom-wf-meta">Bound Context: ${escapeHtmlSafe((cw.files || []).join(' · ') || 'Workspace Blue Files')}${cw.taggedUsers && cw.taggedUsers.length ? ' · Peers: ' + escapeHtmlSafe(cw.taggedUsers.join(', ')) : ''}</span>
        </div>
        <span class="dock-wf-banner-pill">LIVE CUSTOM WORKFLOW</span>
      </div>`).join('');
  } else if (customListEl) {
    setPopupNodeVisible(customListEl, false);
  }
  return { contentEl, isActive: true, headerBadge };
}

function syncPopupMyAgent(setup) {
  const scopedTickets = typeof getScopedTicketsForActiveUser === 'function'
    ? getScopedTicketsForActiveUser(setup.state)
    : (setup.state && setup.state.agent_tickets) || [];
  const openTicketCount = scopedTickets.filter((t) => t && t.status !== 'approved').length;
  const isActive = setup.loggedIn && (setup.workflows.length > 0 || scopedTickets.length > 0);
  const badgeCount = isActive ? Math.max(setup.workflows.length, openTicketCount) : 0;
  const fileNames = setup.files.map((f) => f.name);
  const wfNames = setup.workflows.map((w) => w.name);

  updateDockButtonVisual(
    '99:301', isActive, badgeCount,
    isActive
      ? `My Agent · ${setup.files.length} Blue File(s), ${setup.workflows.length} Workflow(s), ${scopedTickets.length} Bilateral Ticket(s)`
      : 'My Agent · No active workflows on desktop yet'
  );
  const shell = renderPopupEmptyOrActiveShell('agent', isActive, setup, `${setup.files.length} Blue File(s) · ${setup.workflows.length} Active Workflow(s) · ${scopedTickets.length} Ticket(s)`);
  if (!shell || !shell.isActive) return;

  const userName = (setup.profile && setup.profile.name) || 'Demo User';
  const initials = (setup.profile && setup.profile.initials) || 'MU';
  setNodeText('183:355', `USING ${setup.files.length} TEAM FILE${setup.files.length === 1 ? '' : 'S'} · ${setup.workflows.length} WORKFLOW${setup.workflows.length === 1 ? '' : 'S'}`);
  setNodeText('183:360', initials);
  setNodeText('183:362', `${userName}'s Personal Murph Agent`);
  setNodeText('183:363', `Using ${fileNames.join(', ') || 'shared files'} · Active workflows: ${wfNames.join(', ') || 'Cross-Team Agreement'}`);
  setNodeText('183:369', fileNames.includes('DEMO NDA VAULT.md') ? 'NDA Rules Active' : 'Team Rules Active');
  setNodeText('183:372', `${setup.workflows.length} Workflow${setup.workflows.length === 1 ? '' : 's'} · ${scopedTickets.length} Request${scopedTickets.length === 1 ? '' : 's'}`);
  setNodeText('183:376', `${setup.files.length} File${setup.files.length === 1 ? '' : 's'}`);
  setNodeText('183:377', fileNames.join(' · ') || 'No Blue files on desktop');
  setNodeText('183:380', `${openTicketCount} Open / ${scopedTickets.length} Total`);
  setNodeText('183:381', wfNames.join(' · ') || scopedTickets.map((t) => t.id).join(' · ') || 'No Yellow workflows on desktop');
  setNodeText('183:384', `${Math.max(setup.workflows.length, scopedTickets.length) * 3} Messages`);
  setNodeText('183:385', `Across ${setup.workflows.length} workflow(s) & ${scopedTickets.length} team request(s)`);

  const peerRows = [
    { nodeId: '183:389', file: 'DEMO PRODUCT PRD.md' },
    { nodeId: '183:399', file: 'DEMO NDA VAULT.md' },
    { nodeId: '183:409', file: 'PSO RATE CARD.csv' },
    { nodeId: '183:419', file: 'DEMO BRAND RULES.md' },
  ];
  let visiblePeers = 0;
  peerRows.forEach((row) => {
    const show = !setup.isCustom && fileNames.includes(row.file);
    if (show) visiblePeers += 1;
    setPopupNodeVisible(row.nodeId, show);
  });
  setPopupNodeVisible('183:386', visiblePeers > 0);

  setPopupNodeVisible('183:429', scopedTickets.length > 0);
  setPopupNodeVisible('183:430', scopedTickets.length > 0);
  setPopupNodeVisible('183:431', scopedTickets.length >= 1);
  setPopupNodeVisible('183:452', true);
  setPopupNodeVisible('183:453', scopedTickets.length >= 2);
}

function syncPopupScrub(setup) {
  const scrubWfs = setup.byType.scrub || [];
  const isActive = setup.loggedIn && scrubWfs.length > 0;
  const hasSeedScrub = !setup.isCustom && scrubWfs.some((w) => w.isSeed);
  const fileNames = setup.files.map((f) => f.name);
  const seedClaimNodes = [
    { nodeId: '155:1253', file: 'DEMO PRODUCT PRD.md' },
    { nodeId: '155:1278', file: 'DEMO BRAND RULES.md' },
    { nodeId: '155:1303', file: 'DEMO NDA VAULT.md' },
  ];
  const matchingSeedClaims = hasSeedScrub ? seedClaimNodes.filter((c) => fileNames.includes(c.file)) : [];
  const visibleClaimsCount = isActive
    ? (hasSeedScrub ? Math.max(matchingSeedClaims.length, 1) : 0) + scrubWfs.filter((w) => !w.isSeed).length
    : 0;

  updateDockButtonVisual(
    '99:307', isActive, visibleClaimsCount,
    isActive ? `Scrub · Active Workflow: ${scrubWfs.map((w) => w.name).join(', ')} (${visibleClaimsCount} item(s))` : 'Scrub · No active Scrub workflow on desktop'
  );
  const shell = renderPopupEmptyOrActiveShell('scrub', isActive, setup, `${scrubWfs.map((w) => w.wfFile).join(', ')} · ${visibleClaimsCount} Item(s) Scoped`);
  if (!shell || !shell.isActive) return;

  setNodeText('155:1224', `${scrubWfs.map((w) => w.name).join(' + ')} · ${setup.files.length} BLUE FILE(S)`);
  setNodeText('155:1227', `ACTIVE WORKFLOW: ${scrubWfs.map((w) => `${w.name} (${w.wfFile})`).join(', ')}`);
  setNodeText('155:1228', `Scoped to desktop files: ${fileNames.join(' · ') || 'None'}`);

  seedClaimNodes.forEach((c) => {
    setPopupNodeVisible(c.nodeId, hasSeedScrub && (matchingSeedClaims.length > 0 ? fileNames.includes(c.file) : true));
  });
  setPopupNodeVisible('155:1252', hasSeedScrub);
}

function syncPopupEscalations(setup) {
  const escWfs = setup.byType.escalations || [];
  const isActive = setup.loggedIn && escWfs.length > 0;
  const hasSeedEsc = !setup.isCustom && escWfs.some((w) => w.isSeed);
  const claimsList = Array.isArray(setup.state && setup.state.claims) ? setup.state.claims : [];
  const openHardStops = hasSeedEsc ? claimsList.filter((c) => c.severity === 'hard_stop' && c.status !== 'resolved').length : 0;
  const customEscCount = escWfs.filter((w) => !w.isSeed).length;
  const badgeCount = isActive ? Math.max(openHardStops + customEscCount, escWfs.length) : 0;

  updateDockButtonVisual(
    '99:314', isActive, badgeCount,
    isActive ? `Hard Stops · Active Workflow: ${escWfs.map((w) => w.name).join(', ')} (${badgeCount} blocker(s))` : 'Hard Stops · No active Escalations workflow on desktop'
  );
  const shell = renderPopupEmptyOrActiveShell('escalations', isActive, setup, `${escWfs.map((w) => w.wfFile).join(', ')} · ${badgeCount} Active Hard Stop(s)`);
  if (!shell || !shell.isActive) return;

  setNodeText('183:196', `${escWfs.map((w) => w.name).join(' + ')} · ${badgeCount} HARD STOP(S)`);
  setNodeText('183:201', `ACTIVE ESCALATION FLOW: ${escWfs.map((w) => `${w.name} (${w.wfFile})`).join(', ')}`);
  setPopupNodeVisible('183:224', hasSeedEsc);
}

function syncPopupPolicies(setup) {
  const polWfs = setup.byType.policies || [];
  const isActive = setup.loggedIn && polWfs.length > 0;
  const hasSeedPol = !setup.isCustom && polWfs.some((w) => w.isSeed);
  const fileNames = setup.files.map((f) => f.name);
  const packNodes = [
    { nodeId: '181:17', file: 'DEMO PRODUCT PRD.md' },
    { nodeId: '181:28', file: 'DEMO BRAND RULES.md' },
    { nodeId: '181:39', file: 'DEMO NDA VAULT.md' },
    { nodeId: '181:50', file: 'PSO RATE CARD.csv' },
  ];
  const matchedPacks = hasSeedPol ? packNodes.filter((p) => fileNames.includes(p.file)) : [];
  const badgeCount = isActive ? Math.max(matchedPacks.length, polWfs.length) : 0;

  updateDockButtonVisual(
    '99:320', isActive, badgeCount,
    isActive ? `Policy & Rates · Active Workflow: ${polWfs.map((w) => w.name).join(', ')}` : 'Policy & Rates · No active Policy & Rates workflow on desktop'
  );
  const shell = renderPopupEmptyOrActiveShell('policies', isActive, setup, `${polWfs.map((w) => w.wfFile).join(', ')} · ${badgeCount} Policy Pack(s) Bound`);
  if (!shell || !shell.isActive) return;

  setNodeText('136:900', `${polWfs.map((w) => w.name).join(' + ')} · ${badgeCount} PACK(S) ACTIVE`);
  setNodeText('136:904', `BOUND WORKFLOW: ${polWfs.map((w) => `${w.name} (${w.wfFile})`).join(', ')} · FILES: ${fileNames.join(', ') || 'Workspace'}`);

  packNodes.forEach((p) => {
    setPopupNodeVisible(p.nodeId, hasSeedPol && (matchedPacks.length > 0 ? fileNames.includes(p.file) : true));
  });
  setPopupNodeVisible('181:16', hasSeedPol);
  setPopupNodeVisible('181:61', hasSeedPol || fileNames.includes('PSO RATE CARD.csv'));
  setPopupNodeVisible('181:64', hasSeedPol);
}

function syncPopupDeliverables(setup) {
  const delivWfs = setup.byType.deliverables || [];
  const isActive = setup.loggedIn && delivWfs.length > 0;
  const hasSeedDeliv = !setup.isCustom && delivWfs.some((w) => w.isSeed);
  const fileNames = setup.files.map((f) => f.name);
  const badgeCount = isActive ? (hasSeedDeliv ? 4 : 0) + delivWfs.filter((w) => !w.isSeed).length : 0;

  updateDockButtonVisual(
    '99:326', isActive, badgeCount,
    isActive ? `Deliverables · Active Workflow: ${delivWfs.map((w) => w.name).join(', ')} (${badgeCount} output(s))` : 'Deliverables · No active Deliverables workflow on desktop'
  );
  const shell = renderPopupEmptyOrActiveShell('deliverables', isActive, setup, `${delivWfs.map((w) => w.wfFile).join(', ')} · Grounded on ${fileNames.join(', ') || 'Desktop Files'}`);
  if (!shell || !shell.isActive) return;

  setNodeText('136:952', `${delivWfs.map((w) => w.name).join(' + ')} · ${setup.files.length} SOURCE FILE(S)`);
  setNodeText('183:7', `DELIVERABLES PIPELINE — ${delivWfs.map((w) => `${w.name} (${w.wfFile})`).join(', ')}`);
  const sourceSummary = `Sources: ${fileNames.join(' + ') || 'Workspace Blue Files'}`;
  ['183:33', '183:63', '183:90', '183:117'].forEach((pillId) => setNodeText(pillId, sourceSummary));
  setPopupNodeVisible('183:21', hasSeedDeliv);
}

function syncBottomDockAndPopups(state) {
  const setup = getActiveUserDesktopSetup(state);
  syncPopupMyAgent(setup);
  syncPopupScrub(setup);
  syncPopupEscalations(setup);
  syncPopupPolicies(setup);
  syncPopupDeliverables(setup);
}

function handleDockWorkflowAction(action, triggerEl) {
  if (action !== 'dock-launch-workflow-type') return false;
  const wfType = (triggerEl && triggerEl.getAttribute('data-wf-type')) || 'scrub';
  if (typeof openPopup === 'function') openPopup('145:1045');
  if (typeof applySelectedWorkflowTypeUI === 'function') applySelectedWorkflowTypeUI(wfType);
  return true;
}
