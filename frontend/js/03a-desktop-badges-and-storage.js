/* ============================================================================
 * 03a. Desktop Badges & Custom Item Persistence (`03a-desktop-badges-and-storage.js`)
 * ----------------------------------------------------------------------------
 * Responsible for:
 *   - Per-account unread notification tracking & click-to-dismiss state machine
 *     (`SEEN_ITEM_NOTIFICATIONS_STORAGE_KEY`, `ITEM_NOTIFICATION_REVISIONS_STORAGE_KEY`,
 *      `getBlueFileNotificationKey`, `getWorkflowNotificationKey`, `bumpDesktopItemNotification`,
 *      `markDesktopItemNotificationSeen`, `markDesktopItemSeenFromPopup`)
 *   - Local persistence helpers for custom files & workflows (`getStoredCustomFiles`,
 *     `saveCustomFileLocal`, `getStoredCustomWorkflows`, `saveCustomWorkflowLocal`)
 *   - Real-time, state-driven desktop & popup badges (`updateDynamicFileAndFolderBadges`)
 * ============================================================================ */

const NEW_BADGE_TTL_MS = 15 * 60 * 1000;
const FILE_TIMESTAMPS_STORAGE_KEY = 'murph_file_created_timestamps_v1';
const SEEN_ITEM_NOTIFICATIONS_STORAGE_KEY = 'murph_seen_item_notifications_v1';
const ITEM_NOTIFICATION_REVISIONS_STORAGE_KEY = 'murph_item_notification_revisions_v1';
const _liveItemNotificationSignatures = {};

function _activeAcctKeyForBadges() {
  return typeof normalizeAccountKey === 'function'
    ? normalizeAccountKey(activeEnvironment)
    : String(activeEnvironment || 'cloud');
}

function getBlueFileNotificationKey(filename) {
  const norm = typeof normalizeSeedFilename === 'function' ? normalizeSeedFilename(filename) : String(filename || '');
  const leaf = String(norm || '').trim().split('/').pop() || String(norm || '').trim();
  return leaf ? `file:${leaf.toUpperCase()}` : '';
}

function getWorkflowNotificationKey(nodeId, customWfTitle) {
  if (customWfTitle && String(customWfTitle).trim()) {
    return `wf-custom:${String(customWfTitle).trim().toUpperCase()}`;
  }
  return nodeId ? `wf-node:${String(nodeId).trim()}` : '';
}

function getSeenItemNotificationsMap() {
  try {
    const raw = localStorage.getItem(SEEN_ITEM_NOTIFICATIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveSeenItemNotificationsMap(map) {
  try {
    localStorage.setItem(SEEN_ITEM_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(map || {}));
  } catch (_) {}
}

function getItemNotificationRevisionsMap() {
  try {
    const raw = localStorage.getItem(ITEM_NOTIFICATION_REVISIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getDesktopItemRevisionInfo(itemKey) {
  if (!itemKey) return { rev: 0, pendingCount: 0 };
  const acctKey = _activeAcctKeyForBadges();
  const map = getItemNotificationRevisionsMap();
  const entry = map[`${acctKey}::${itemKey}`] || map[`global::${itemKey}`] || {};
  return { rev: Number(entry.rev || 0), pendingCount: Number(entry.pendingCount || 0) };
}

function bumpDesktopItemNotification(itemKey, pendingCount = 1) {
  if (!itemKey) return;
  const acctKey = _activeAcctKeyForBadges();
  const revMap = getItemNotificationRevisionsMap();
  const prev = revMap[`global::${itemKey}`] || revMap[`${acctKey}::${itemKey}`] || { rev: 0 };
  const nextEntry = {
    rev: Number(prev.rev || 0) + 1,
    pendingCount: Math.max(1, Number(pendingCount || 1)),
    updatedAtMs: Date.now(),
  };
  revMap[`${acctKey}::${itemKey}`] = nextEntry;
  revMap[`global::${itemKey}`] = nextEntry;
  try {
    localStorage.setItem(ITEM_NOTIFICATION_REVISIONS_STORAGE_KEY, JSON.stringify(revMap));
  } catch (_) {}
  const seenMap = getSeenItemNotificationsMap();
  delete seenMap[`${acctKey}::${itemKey}`];
  saveSeenItemNotificationsMap(seenMap);
}

function isDesktopItemSignatureSeen(itemKey, sig) {
  if (!itemKey || !sig) return false;
  const fullKey = `${_activeAcctKeyForBadges()}::${itemKey}`;
  _liveItemNotificationSignatures[fullKey] = sig;
  const seenMap = getSeenItemNotificationsMap();
  return seenMap[fullKey] === sig;
}

function markDesktopItemNotificationSeen(itemKey) {
  if (!itemKey) return;
  const fullKey = `${_activeAcctKeyForBadges()}::${itemKey}`;
  if (!_liveItemNotificationSignatures[fullKey] && typeof appState !== 'undefined') {
    updateDynamicFileAndFolderBadges(appState);
  }
  const currentSig = _liveItemNotificationSignatures[fullKey];
  if (!currentSig) return;
  const seenMap = getSeenItemNotificationsMap();
  seenMap[fullKey] = currentSig;
  saveSeenItemNotificationsMap(seenMap);
}

function markDesktopItemSeenFromPopup(popupId, resolvedFileTitle, triggerEl) {
  if (window._murphSuppressNextOpenSeen) {
    window._murphSuppressNextOpenSeen = false;
    return;
  }
  if (popupId === '136:341') {
    const fTitle =
      resolvedFileTitle ||
      (triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('data-file-title')) ||
      activeBlueFileTitle;
    const itemKey = getBlueFileNotificationKey(fTitle);
    if (itemKey) {
      markDesktopItemNotificationSeen(itemKey);
      updateDynamicFileAndFolderBadges(appState);
    }
    return;
  }
  const popupSeedNodeMap = { '136:468': '99:177', '136:579': '99:188', '136:417': '99:199', '136:521': '99:223' };
  if (popupSeedNodeMap[popupId] || popupId === '136:730') {
    const tileEl =
      triggerEl && triggerEl.closest
        ? triggerEl.closest('[data-custom-desktop-item="workflow"], [data-node-id]') || triggerEl
        : triggerEl;
    const customWfTitle =
      (tileEl && tileEl.getAttribute && tileEl.getAttribute('data-custom-wf-title')) ||
      (triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('data-custom-wf-title')) ||
      '';
    const trigNodeId = (tileEl && tileEl.getAttribute && tileEl.getAttribute('data-node-id')) || '';
    let itemKey = '';
    if (customWfTitle) {
      itemKey = getWorkflowNotificationKey(null, customWfTitle);
    } else if (trigNodeId && typeof SEED_WORKFLOW_NODE_MAP === 'object' && SEED_WORKFLOW_NODE_MAP[trigNodeId]) {
      itemKey = getWorkflowNotificationKey(trigNodeId, null);
    } else if (!triggerEl && popupSeedNodeMap[popupId]) {
      itemKey = getWorkflowNotificationKey(popupSeedNodeMap[popupId], null);
    }
    if (itemKey) {
      markDesktopItemNotificationSeen(itemKey);
      updateDynamicFileAndFolderBadges(appState);
    }
  }
}

function clearAllDesktopItemNotifications() {
  Object.keys(_liveItemNotificationSignatures).forEach((k) => delete _liveItemNotificationSignatures[k]);
  try {
    localStorage.removeItem(SEEN_ITEM_NOTIFICATIONS_STORAGE_KEY);
    localStorage.removeItem(ITEM_NOTIFICATION_REVISIONS_STORAGE_KEY);
  } catch (_) {}
}

function getFileTimestampMap() {
  try {
    const raw = localStorage.getItem(FILE_TIMESTAMPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function ensureFileCreatedTimestamp(envKey, filename, explicitCreatedMs) {
  const k = `${String(envKey || 'cloud')}::${String(filename || '').trim().toUpperCase()}`;
  const map = getFileTimestampMap();
  if (explicitCreatedMs && typeof explicitCreatedMs === 'number' && explicitCreatedMs > 0) {
    map[k] = explicitCreatedMs;
    try {
      localStorage.setItem(FILE_TIMESTAMPS_STORAGE_KEY, JSON.stringify(map));
    } catch (_) {}
    return explicitCreatedMs;
  }
  if (typeof map[k] === 'number' && map[k] > 0) return map[k];
  const nowMs = Date.now();
  map[k] = nowMs;
  try {
    localStorage.setItem(FILE_TIMESTAMPS_STORAGE_KEY, JSON.stringify(map));
  } catch (_) {}
  return nowMs;
}

function expireNewFileBadges() {
  const nowMs = Date.now();
  document.querySelectorAll('.custom-item-pill-badge[data-created-at-ms]').forEach((badgeEl) => {
    const createdMs = parseInt(badgeEl.getAttribute('data-created-at-ms') || '0', 10);
    if (!createdMs || nowMs - createdMs >= NEW_BADGE_TTL_MS) {
      badgeEl.remove();
    } else {
      const minsLeft = Math.max(1, Math.ceil((NEW_BADGE_TTL_MS - (nowMs - createdMs)) / 60000));
      badgeEl.title = `Newly added file · "NEW" badge auto-expires in ${minsLeft} min`;
    }
  });
}
setInterval(expireNewFileBadges, 5000);

function getStoredCustomFiles() {
  try {
    const raw = localStorage.getItem(CUSTOM_FILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveCustomFileLocal(fileObj) {
  if (!fileObj || !fileObj.filename) return;
  const envKey = fileObj.environment || activeEnvironment || 'cloud';
  const createdAtMs = ensureFileCreatedTimestamp(envKey, fileObj.filename, fileObj.created_at_ms || Date.now());
  const enriched = Object.assign({}, fileObj, { environment: envKey, created_at_ms: createdAtMs });
  try {
    const list = getStoredCustomFiles().filter(
      (f) =>
        !(
          String(f.filename || '').toUpperCase() === String(enriched.filename).toUpperCase() &&
          String(f.environment || 'cloud') === String(envKey)
        )
    );
    list.push(enriched);
    localStorage.setItem(CUSTOM_FILES_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
  bumpDesktopItemNotification(getBlueFileNotificationKey(fileObj.filename), 1);
}

function getActiveAccountFilePayload(visibility) {
  const profile = getActiveLoggedInUserProfile(appState);
  const acctKey = normalizeAccountKey(activeEnvironment);
  return {
    user_id: profile.id,
    ldap: profile.email,
    environment: acctKey,
    visibility: visibility || (isCustomAccountKey(acctKey) ? 'private' : 'federated'),
  };
}

function getActiveAccountDisplayLabel() {
  const acctKey = normalizeAccountKey(activeEnvironment);
  if (acctKey === 'dm') return 'Digital Marketing (DM) User';
  if (acctKey === 'cloud') return 'Cloud User';
  const profile = getActiveLoggedInUserProfile(appState);
  return `${profile.displayName} (${profile.department || 'own workspace'})`;
}

function getStoredCustomWorkflows() {
  try {
    const raw = localStorage.getItem(CUSTOM_WORKFLOWS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveCustomWorkflowLocal(wfObj) {
  if (!wfObj || !wfObj.folder_name) return;
  let envKey = String(wfObj.creator_env || wfObj.environment || '').toLowerCase();
  if (isCustomAccountKey(normalizeAccountKey(envKey))) envKey = normalizeAccountKey(envKey);
  if (envKey !== 'cloud' && envKey !== 'dm' && !isCustomAccountKey(envKey)) {
    envKey =
      isDmAccountLdap(wfObj.creator_ldap) || wfObj.creator_user_id === 'user_brand'
        ? 'dm'
        : normalizeAccountKey(activeEnvironment);
  }
  const enriched = Object.assign({}, wfObj, {
    environment: envKey,
    creator_env: envKey,
    created_at_ms: wfObj.created_at_ms || Date.now(),
  });
  try {
    const list = getStoredCustomWorkflows().filter(
      (w) => String(w.folder_name || '').toUpperCase() !== String(enriched.folder_name).toUpperCase()
    );
    list.push(enriched);
    localStorage.setItem(CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
  bumpDesktopItemNotification(getWorkflowNotificationKey(null, wfObj.folder_name), 1);
}

function canCurrentUserDeleteDesktopItem(desktopEl) {
  if (!desktopEl || desktopEl.id === 'desktop-trash-bin') return { allowed: false, reason: 'system' };
  const activeEnv = normalizeAccountKey(activeEnvironment);
  const nodeId = desktopEl.getAttribute('data-node-id') || '';
  if (SEED_DESKTOP_NODE_ENV_MAP[nodeId] || SEED_WORKFLOW_NODE_MAP[nodeId] || nodeId === '99:165') {
    return { allowed: true, creatorEnv: activeEnv };
  }
  let creatorEnv = normalizeAccountKeyOrEmpty(desktopEl.getAttribute('data-creator-env'));
  let creatorLdap = (desktopEl.getAttribute('data-creator-ldap') || '').trim();
  if (creatorEnv !== 'cloud' && creatorEnv !== 'dm' && !isCustomAccountKey(creatorEnv)) {
    creatorEnv = isDmAccountLdap(creatorLdap) ? 'dm' : creatorLdap ? 'cloud' : activeEnv;
  }
  if (!creatorLdap) {
    creatorLdap = creatorEnv === 'dm' ? 'marketing_demo@google.com' : 'cloud_demo@google.com';
  }
  const creatorLabel =
    creatorEnv === 'dm' ? `Digital Marketing User (${creatorLdap})` : `Cloud User (${creatorLdap})`;
  return { allowed: creatorEnv === activeEnv, creatorEnv, creatorLdap, creatorLabel };
}

function setDynamicBadgeOnIcon(desktopNodeEl, count, variant = 'red', tooltip = '') {
  if (!desktopNodeEl) return;
  const iconFrame = desktopNodeEl.querySelector('[data-node-name="App icon"]') || desktopNodeEl;
  let badge = iconFrame.querySelector('.dynamic-file-state-badge');
  if (!count || count <= 0) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    iconFrame.appendChild(badge);
  }
  badge.className = `dynamic-file-state-badge ${variant}`;
  badge.textContent = String(count);
  if (tooltip) badge.title = tooltip;
}

function updateDynamicFileAndFolderBadges(state) {
  const claims = (state && state.claims) || [];
  const tickets = (state && state.agent_tickets) || [];
  const unresolvedClaims = claims.filter((c) => c.status !== 'resolved');
  const autoFixClaims = claims.filter((c) => c.severity === 'auto_fix' && c.status !== 'resolved');
  const hardStopClaims = claims.filter((c) => c.severity === 'hard_stop' && c.status !== 'resolved');
  const pmClaims = unresolvedClaims.filter((c) => c.agent === 'pm_agent');
  const legalClaims = unresolvedClaims.filter((c) => c.agent === 'legal_agent');
  const commClaims = unresolvedClaims.filter((c) => c.agent === 'commercial_agent');
  const brandClaims = unresolvedClaims.filter((c) => c.agent === 'brand_agent');

  // 1. Seed Blue Shared Desktop Files (Row 1)
  const blueFileBadgeSpecs = [
    { nodeId: '99:108', filename: 'DEMO LAUNCH BRIEF.md', detailNodeId: '99:118', claims: unresolvedClaims, variant: hardStopClaims.length > 0 ? 'red' : 'amber', openDetail: `${unresolvedClaims.length} open claim(s) · scrub`, solvedDetail: '✓ 0 open · brief verified' },
    { nodeId: '99:119', filename: 'DEMO PRODUCT PRD.md', detailNodeId: '99:129', claims: pmClaims, variant: 'amber', openDetail: `${pmClaims.length} PM drift · maya.lin@`, solvedDetail: '✓ PM verified · maya.lin@' },
    { nodeId: '99:130', filename: 'DEMO NDA VAULT.md', detailNodeId: '99:140', claims: legalClaims, variant: 'red', openDetail: `${legalClaims.length} NDA stop · priya.nair@`, solvedDetail: '✓ NDA cleared · priya.nair@' },
    { nodeId: '99:141', filename: 'PSO RATE CARD.csv', detailNodeId: '99:151', claims: commClaims, variant: 'red', openDetail: `${commClaims.length} cap overrun · $82k`, solvedDetail: '✓ $54k locked · within cap' },
    { nodeId: '99:152', filename: 'DEMO BRAND RULES.md', detailNodeId: '99:164', claims: brandClaims, variant: 'amber', openDetail: `${brandClaims.length} brand drift · marketing_demo@`, solvedDetail: '✓ Brand clean · marketing_demo@' },
  ];

  blueFileBadgeSpecs.forEach((spec) => {
    const itemKey = getBlueFileNotificationKey(spec.filename);
    const revInfo = getDesktopItemRevisionInfo(itemKey);
    const claimCount = spec.claims.length;
    const rawCount = claimCount > 0 ? claimCount : revInfo.rev > 0 ? revInfo.pendingCount || 1 : 0;
    const claimsSig = spec.claims.map((c) => `${c.id}:${c.status}:${c.severity}:${String(c.current_text || '').length}`).join('|');
    const sig = `seed-file:${spec.nodeId}:claims(${claimsSig}):rev(${revInfo.rev})`;
    const unreadCount = rawCount > 0 && !isDesktopItemSignatureSeen(itemKey, sig) ? rawCount : 0;
    const fileEl = document.querySelector(`#screen-home [data-node-id="${spec.nodeId}"]`);
    setDynamicBadgeOnIcon(fileEl, unreadCount, spec.variant, unreadCount > 0 ? `${unreadCount} unread notification(s) · Click file to view & clear` : '');
    setNodeText(spec.detailNodeId, claimCount > 0 ? spec.openDetail : spec.solvedDetail);
  });

  // 1b. Custom Uploaded Blue Files in Row 1
  document.querySelectorAll('#screen-home [data-custom-desktop-item="file"]').forEach((fileEl) => {
    const fname = fileEl.getAttribute('data-file-title') || '';
    const itemKey = getBlueFileNotificationKey(fname);
    const revInfo = getDesktopItemRevisionInfo(itemKey);
    const upperFname = String(fname).trim().toUpperCase();
    const matchingTickets = tickets.filter(
      (t) =>
        t &&
        t.status !== 'resolved' &&
        t.status !== 'approved' &&
        (String(t.title || '').toUpperCase().includes(upperFname) || String(t.request_summary || '').toUpperCase().includes(upperFname))
    );
    const rawCount = Math.max(matchingTickets.length, revInfo.pendingCount || 1);
    const createdMs = fileEl.getAttribute('data-created-at-ms') || '0';
    const scopeAttr = fileEl.getAttribute('data-file-scope') || '';
    const tSig = matchingTickets.map((t) => `${t.id}:${t.status}`).join('|');
    const sig = `custom-file:${itemKey}:c(${createdMs}):s(${scopeAttr}):t(${tSig}):rev(${revInfo.rev})`;
    const unreadCount = rawCount > 0 && !isDesktopItemSignatureSeen(itemKey, sig) ? rawCount : 0;
    const iconFrame = fileEl.querySelector('[data-node-name="App icon"]');
    if (iconFrame) iconFrame.querySelectorAll('.custom-item-pill-badge').forEach((b) => b.remove());
    setDynamicBadgeOnIcon(fileEl, unreadCount, 'cyan', unreadCount > 0 ? `${unreadCount} unread notification(s) · Click file to view & clear` : '');
  });

  // 2. Seed Yellow Workflow Folders (Row 2)
  const scrubFolderEl = document.querySelector('#screen-home [data-node-id="99:177"]');
  const scrubRev = getDesktopItemRevisionInfo('wf-node:99:177');
  const scrubRawCount = unresolvedClaims.length || (scrubRev.rev > 0 ? scrubRev.pendingCount || 1 : 0);
  const scrubSig = `wf:99:177:claims(${unresolvedClaims.map((c) => `${c.id}:${c.status}:${c.severity}:${String(c.current_text || '').length}`).join('|')}):rev(${scrubRev.rev})`;
  const scrubUnread = scrubRawCount > 0 && !isDesktopItemSignatureSeen('wf-node:99:177', scrubSig) ? scrubRawCount : 0;
  setDynamicBadgeOnIcon(scrubFolderEl, scrubUnread, hardStopClaims.length > 0 ? 'red' : 'amber', scrubUnread > 0 ? `${scrubUnread} unread notification(s) · Click folder to view & clear` : '');
  setNodeText('99:187', unresolvedClaims.length > 0 ? `${unresolvedClaims.length} open · ${autoFixClaims.length} auto-fix` : `✓ All ${claims.length || 7} claims solved`);

  const polRev = getDesktopItemRevisionInfo('wf-node:99:188');
  const polRawCount = autoFixClaims.length || (polRev.rev > 0 ? polRev.pendingCount || 1 : 0);
  const polRulesCount = (state && state.policy_rules && state.policy_rules.length) || 0;
  const polSig = `wf:99:188:af(${autoFixClaims.map((c) => `${c.id}:${c.status}`).join('|')}):r(${polRulesCount}):rev(${polRev.rev})`;
  const polUnread = polRawCount > 0 && !isDesktopItemSignatureSeen('wf-node:99:188', polSig) ? polRawCount : 0;
  setNodeText('99:208', polUnread);
  document.querySelectorAll('[data-node-id="99:207"]').forEach((el) => { el.style.display = polUnread > 0 ? '' : 'none'; });
  setNodeText('99:198', autoFixClaims.length > 0 ? `${autoFixClaims.length} policy drift active` : '✓ 0 drift · policies synced');

  const blkRev = getDesktopItemRevisionInfo('wf-node:99:199');
  const blkRawCount = hardStopClaims.length || (blkRev.rev > 0 ? blkRev.pendingCount || 1 : 0);
  const blkSig = `wf:99:199:hs(${hardStopClaims.map((c) => `${c.id}:${c.status}`).join('|')}):rev(${blkRev.rev})`;
  const blkUnread = blkRawCount > 0 && !isDesktopItemSignatureSeen('wf-node:99:199', blkSig) ? blkRawCount : 0;
  setNodeText('99:161', blkUnread);
  document.querySelectorAll('[data-node-id="99:160"]').forEach((el) => { el.style.display = blkUnread > 0 ? '' : 'none'; });
  setNodeText('99:338', hardStopClaims.length);
  document.querySelectorAll('[data-node-id="99:337"]').forEach((el) => { el.style.display = hardStopClaims.length > 0 ? '' : 'none'; });
  setNodeText('99:211', hardStopClaims.length > 0 ? `${hardStopClaims.length} need sign-off` : '✓ 0 hard stops · all clear');

  const delivFolderEl = document.querySelector('#screen-home [data-node-id="99:223"]');
  const delivRev = getDesktopItemRevisionInfo('wf-node:99:223');
  const delivRawCount = unresolvedClaims.length || (delivRev.rev > 0 ? delivRev.pendingCount || 1 : 0);
  const delivSig = `wf:99:223:claims(${unresolvedClaims.map((c) => `${c.id}:${c.status}`).join('|')}):rev(${delivRev.rev})`;
  const delivUnread = delivRawCount > 0 && !isDesktopItemSignatureSeen('wf-node:99:223', delivSig) ? delivRawCount : 0;
  setDynamicBadgeOnIcon(delivFolderEl, delivUnread, 'cyan', delivUnread > 0 ? `${delivUnread} unread notification(s) · Click folder to view & clear` : '');
  setNodeText('99:233', unresolvedClaims.length > 0 ? `${unresolvedClaims.length} blocker(s) pending` : '✓ 4/4 deliverables sealed');

  // 3. Custom Yellow Workflow Folders in Row 2
  const envKey = _activeAcctKeyForBadges();
  const isIsolated = typeof isCustomAccountKey === 'function' && isCustomAccountKey(envKey);
  const seedAgentByFile = { 'DEMO PRODUCT PRD.MD': 'pm_agent', 'DEMO NDA VAULT.MD': 'legal_agent', 'PSO RATE CARD.CSV': 'commercial_agent', 'DEMO BRAND RULES.MD': 'brand_agent' };
  document.querySelectorAll('#screen-home [data-custom-desktop-item="workflow"]').forEach((wfEl) => {
    const wfTitle = wfEl.getAttribute('data-custom-wf-title') || '';
    const wfType = wfEl.getAttribute('data-custom-wf-type') || 'scrub';
    const wfTicketId = wfEl.getAttribute('data-custom-wf-ticket-id') || '';
    const itemKey = getWorkflowNotificationKey(null, wfTitle);
    const revInfo = getDesktopItemRevisionInfo(itemKey);
    let selectedFiles = [];
    try { selectedFiles = JSON.parse(wfEl.getAttribute('data-custom-wf-files') || '[]'); } catch (_) {}
    const upperFiles = (Array.isArray(selectedFiles) ? selectedFiles : []).map((f) =>
      String(typeof normalizeSeedFilename === 'function' ? normalizeSeedFilename(f) : f || '').trim().toUpperCase()
    );
    let scopedClaims = [];
    if (!isIsolated) {
      if (upperFiles.includes('DEMO LAUNCH BRIEF.MD')) {
        scopedClaims = unresolvedClaims;
      } else {
        const agents = new Set(upperFiles.map((uf) => seedAgentByFile[uf]).filter(Boolean));
        if (agents.size > 0) scopedClaims = unresolvedClaims.filter((c) => agents.has(c.agent));
      }
    }
    let typeClaims = scopedClaims;
    if (wfType === 'policies') typeClaims = scopedClaims.filter((c) => c.severity === 'auto_fix');
    else if (wfType === 'escalations') typeClaims = scopedClaims.filter((c) => c.severity === 'hard_stop');
    else if (wfType === 'tickets') typeClaims = [];

    const linkedTicket = tickets.find(
      (t) => t && ((wfTicketId && t.id === wfTicketId) || (wfTitle && String(t.title || '').toUpperCase().includes(wfTitle.trim().toUpperCase())))
    );
    const ticketOpenCount = linkedTicket && linkedTicket.status !== 'resolved' && linkedTicket.status !== 'approved' ? 1 : 0;
    const wfRawCount = typeClaims.length > 0 ? typeClaims.length : ticketOpenCount > 0 ? ticketOpenCount : revInfo.pendingCount || 1;
    const claimsSig = typeClaims.map((c) => `${c.id}:${c.status}:${c.severity}`).join('|');
    const ticketSig = linkedTicket ? `${linkedTicket.id}:${linkedTicket.status}:${(linkedTicket.discussion_log || []).length}:${linkedTicket.human_decision || ''}` : 'none';
    const sig = `custom-wf:${itemKey}:t(${wfType}):c(${claimsSig}):tk(${ticketSig}):rev(${revInfo.rev})`;
    const wfUnread = wfRawCount > 0 && !isDesktopItemSignatureSeen(itemKey, sig) ? wfRawCount : 0;

    const iconFrame = wfEl.querySelector('[data-node-name="App icon"]');
    if (iconFrame) iconFrame.querySelectorAll('[data-node-id="99:207"], [data-node-id="99:160"], .custom-item-pill-badge').forEach((b) => b.remove());
    setDynamicBadgeOnIcon(wfEl, wfUnread, wfType === 'escalations' ? 'red' : 'amber', wfUnread > 0 ? `${wfUnread} unread notification(s) · Click folder to view & clear` : '');
    const detailEl = wfEl.querySelector('[data-node-name="Detail"]');
    if (detailEl) {
      detailEl.textContent = wfUnread > 0 ? `${wfUnread} notification(s) · active` : typeClaims.length > 0 ? `${typeClaims.length} task(s) open · viewed` : '✓ Synced · 0 open tasks';
    }
  });

  // Update popup header badges dynamically as well
  setNodeText('136:478', unresolvedClaims.length > 0 ? `${unresolvedClaims.length} OPEN · ${autoFixClaims.length} AUTO-FIXES` : `✓ ALL ${claims.length || 7} CLAIMS SOLVED`);
  setNodeText('183:285', hardStopClaims.length > 0 ? `${hardStopClaims.length} ACTIVE HARD STOPS` : '✓ 0 HARD STOPS · UNBLOCKED');
  setNodeText('187:18', autoFixClaims.length > 0 ? `${autoFixClaims.length} DRIFT · 4 PACKS ACTIVE` : '✓ 0 DRIFT · 4 PACKS SYNCED');
  setNodeText('136:531', unresolvedClaims.length === 0 ? '✓ 4 ASSETS SEALED & READY' : `${4 - Math.min(3, hardStopClaims.length)}/4 READY · ${unresolvedClaims.length} OPEN`);
  if (typeof syncBottomDockAndPopups === 'function') syncBottomDockAndPopups(state);
}
