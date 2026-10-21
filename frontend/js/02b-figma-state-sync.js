/**
 * ============================================================================
 * 02b-figma-state-sync.js — Backend State → Figma DOM Synchronization
 * ============================================================================
 *
 * `syncStateToFigmaDOM(state)` pushes `/api/state` (claims, feasibility,
 * tickets, mesh peers, active account) into the Figma-exported DOM nodes.
 * Split out of `02-auth-and-user-settings.js` to keep files <= 500 lines.
 */

const DOCK_THEME_STORAGE_KEY = 'murph_dock_theme_mode_v1';

function getDockThemeMode() {
  try {
    const saved = localStorage.getItem(DOCK_THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (_) {}
  return 'light';
}

function applyDockThemeModeToDOM(mode) {
  const resolved = mode === 'dark' ? 'dark' : 'light';
  const isLight = resolved === 'light';
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('dock-theme-light', isLight);
    document.body.classList.toggle('dock-theme-dark', !isLight);
  }
  const labelText = isLight ? '☀️ LIGHT MODE' : '🌙 DARK MODE';
  document.querySelectorAll('[data-node-id="99:287"], [data-node-id="102:3250"]').forEach((btn) => {
    btn.classList.toggle('is-light-mode', isLight);
    btn.classList.toggle('is-dark-mode', !isLight);
    btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    btn.setAttribute(
      'title',
      isLight
        ? 'Theme: Light Mode — White Dock & Application Popups with dark text (click to switch to Dark Mode)'
        : 'Theme: Dark Mode — Dark Dock & Application Popups with white text (click to switch to Light Mode)'
    );
  });
  setNodeText('99:289', labelText);
  setNodeText('102:3252', labelText);
  if (typeof applyFileScopeToggleUI === 'function' && typeof document !== 'undefined') {
    document.querySelectorAll('.os-floating-window[data-popup-base-id="136:341"], #popup-136-341').forEach((winEl) => {
      applyFileScopeToggleUI(winEl, winEl.dataset.fileScope || (typeof activeBlueFileScope !== 'undefined' ? activeBlueFileScope : 'federated'));
    });
  }
  if (typeof applySelectedWorkflowTypeUI === 'function' && typeof activeWorkflowType !== 'undefined') {
    applySelectedWorkflowTypeUI(activeWorkflowType);
  } else if (typeof refreshAllOpenWorkloadTopologies === 'function') {
    refreshAllOpenWorkloadTopologies(typeof appState !== 'undefined' ? appState : null);
  }
  return resolved;
}

function setDockThemeMode(mode) {
  const resolved = mode === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(DOCK_THEME_STORAGE_KEY, resolved);
  } catch (_) {}
  return applyDockThemeModeToDOM(resolved);
}

function toggleDockThemeMode() {
  const next = getDockThemeMode() === 'light' ? 'dark' : 'light';
  const applied = setDockThemeMode(next);
  if (typeof refreshAllOpenWorkloadTopologies === 'function') {
    refreshAllOpenWorkloadTopologies(typeof appState !== 'undefined' ? appState : null);
  }
  if (typeof showToast === 'function') {
    showToast(
      applied === 'light'
        ? '☀️ Light Mode active — White Dock & Application Popups with black text'
        : '🌙 Dark Mode active — Dark Dock & Application Popups with white text'
    );
  }
  return applied;
}

function positionGeminiModelDropdown(anchorEl) {
  if (!modelMenuEl) return;
  const cardEl =
    (anchorEl && anchorEl.closest ? anchorEl.closest('[data-node-id="99:95"]') : null) ||
    document.querySelector('#screen-home [data-node-id="99:95"]');
  if (!cardEl) return;
  if (modelMenuEl.parentElement !== cardEl) {
    cardEl.appendChild(modelMenuEl);
  }
  modelMenuEl.style.removeProperty('left');
  modelMenuEl.style.removeProperty('top');
  modelMenuEl.style.removeProperty('width');
  modelMenuEl.style.removeProperty('right');
  modelMenuEl.style.removeProperty('--dropdown-radius');
}

function setGeminiModelMenuOpen(isOpen, anchorEl) {
  if (!modelMenuEl) return;
  const open = Boolean(isOpen);
  const info = GEMINI_MODELS[activeGeminiModel] || GEMINI_MODELS['gemini-3.8-flash'];
  setNodeText('99:98', open ? info.label.replace('▾', '▴') : info.label);
  document.querySelectorAll('#screen-home [data-node-id="99:95"]').forEach((cardEl) => {
    cardEl.classList.toggle('model-menu-open', open);
    cardEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  if (open) {
    positionGeminiModelDropdown(anchorEl);
    modelMenuEl.classList.remove('open');
    void modelMenuEl.offsetWidth;
    modelMenuEl.classList.add('open');
  } else {
    modelMenuEl.classList.remove('open');
  }
}

const MURPH_AUDIO_VOLUME_SCALE = 1.5;
let _murphAudioCtx = null;
let _lastMurphLoginSoundMs = 0;
let _lastMurphLogoutSoundMs = 0;
let _lastMurphTermSoundMs = 0;

function getMurphAudioCtx() {
  try {
    if (!_murphAudioCtx && typeof window !== 'undefined') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) _murphAudioCtx = new Ctx();
    }
    if (_murphAudioCtx && _murphAudioCtx.state === 'suspended') _murphAudioCtx.resume().catch(() => {});
  } catch (_) {}
  return _murphAudioCtx;
}

function scheduleMurphTone(ctx, dest, freq, startOffset, duration, peakGain, oscType, freqEnd) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + startOffset;
  const targetGain = Math.min(0.95, peakGain * MURPH_AUDIO_VOLUME_SCALE);
  osc.type = oscType || 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(targetGain, start + Math.min(0.028, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.015);
}

function playMurphClickSound() {
  const ctx = getMurphAudioCtx();
  if (!ctx) return;
  try {
    scheduleMurphTone(ctx, ctx.destination, 1150, 0, 0.018, 0.065, 'triangle', 320);
  } catch (_) {}
}

function playMurphPopupCloseSound() {
  const ctx = getMurphAudioCtx();
  if (!ctx) return;
  try {
    scheduleMurphTone(ctx, ctx.destination, 680, 0.0, 0.045, 0.056, 'sine', 480);
    scheduleMurphTone(ctx, ctx.destination, 480, 0.032, 0.055, 0.048, 'triangle', 340);
  } catch (_) {}
}

function playMurphLoginSound() {
  const nowMs = Date.now();
  if (nowMs - _lastMurphLoginSoundMs < 2200) return;
  _lastMurphLoginSoundMs = nowMs;
  const ctx = getMurphAudioCtx();
  if (!ctx) return;
  try {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, ctx.currentTime);
    filter.connect(ctx.destination);
    [[261.63, 0.0, 1.95, 0.048, 'sine'], [392.0, 0.06, 1.9, 0.04, 'triangle'], [523.25, 0.14, 1.75, 0.062, 'sine'], [659.25, 0.28, 1.65, 0.064, 'sine'], [783.99, 0.44, 1.55, 0.058, 'sine'], [987.77, 0.62, 1.43, 0.046, 'triangle'], [1174.66, 0.8, 1.25, 0.036, 'sine']].forEach((n) => scheduleMurphTone(ctx, filter, n[0], n[1], n[2], n[3], n[4]));
  } catch (_) {}
}

function playMurphLogoutSound() {
  const nowMs = Date.now();
  if (nowMs - _lastMurphLogoutSoundMs < 1500) return;
  _lastMurphLogoutSoundMs = nowMs;
  const ctx = getMurphAudioCtx();
  if (!ctx) return;
  try {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 2.25);
    filter.connect(ctx.destination);
    [[987.77, 0.0, 0.55, 0.052, 'sine'], [783.99, 0.22, 0.65, 0.054, 'sine'], [659.25, 0.46, 0.78, 0.056, 'triangle'], [523.25, 0.74, 1.15, 0.058, 'sine'], [392.0, 1.02, 1.23, 0.048, 'sine'], [196.0, 0.15, 2.1, 0.044, 'triangle', 130.81]].forEach((n) => scheduleMurphTone(ctx, filter, n[0], n[1], n[2], n[3], n[4], n[5]));
  } catch (_) {}
}

function playMurphSignupSuccessSound() {
  _lastMurphLoginSoundMs = Date.now();
  const ctx = getMurphAudioCtx();
  if (!ctx) return;
  try {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3400, ctx.currentTime);
    filter.connect(ctx.destination);
    [[523.25, 0.0, 0.36, 0.064, 'sine'], [659.25, 0.12, 0.42, 0.066, 'sine'], [783.99, 0.24, 0.5, 0.068, 'sine'], [1046.5, 0.38, 1.82, 0.072, 'sine'], [1318.51, 0.54, 1.68, 0.054, 'triangle'], [1567.98, 0.7, 1.55, 0.045, 'sine'], [261.63, 0.38, 1.87, 0.046, 'triangle']].forEach((n) => scheduleMurphTone(ctx, filter, n[0], n[1], n[2], n[3], n[4]));
  } catch (_) {}
}

function playMurphTerminalSound(kind) {
  if (typeof window !== 'undefined' && window._murphSuppressTerminalAudio) return;
  const nowMs = Date.now();
  if (nowMs - _lastMurphTermSoundMs < 40) return;
  _lastMurphTermSoundMs = nowMs;
  const ctx = getMurphAudioCtx();
  if (!ctx) return;
  try {
    if (kind === 'thinking') scheduleMurphTone(ctx, ctx.destination, 660, 0, 0.045, 0.036, 'sine', 920);
    else if (kind === 'warn') {
      scheduleMurphTone(ctx, ctx.destination, 440, 0, 0.075, 0.058, 'triangle', 392);
      scheduleMurphTone(ctx, ctx.destination, 370, 0.09, 0.095, 0.062, 'triangle', 311);
    } else if (kind === 'sys') scheduleMurphTone(ctx, ctx.destination, 880, 0, 0.062, 0.038, 'sine', 1046.5);
    else {
      scheduleMurphTone(ctx, ctx.destination, 740, 0, 0.058, 0.052, 'sine');
      scheduleMurphTone(ctx, ctx.destination, 1108.73, 0.052, 0.092, 0.056, 'triangle');
    }
  } catch (_) {}
}

async function triggerSignupSuccessButtonState(userName) {
  const btnEl = document.querySelector('#screen-signup [data-node-id="65:468"]');
  const labelEl = document.querySelector('#screen-signup [data-node-id="65:469"]');
  if (!btnEl) return;
  const prev = { bg: btnEl.style.background, border: btnEl.style.border, shadow: btnEl.style.boxShadow, tf: btnEl.style.transform, txt: labelEl ? labelEl.textContent : 'Create Account & Spawn Personal Agent' };
  Object.assign(btnEl.style, { transition: 'all 0.42s cubic-bezier(0.16, 1, 0.3, 1)', background: 'linear-gradient(135deg, #059669 0%, #10B981 55%, #34D399 100%)', border: '1.5px solid #A7F3D0', boxShadow: '0 0 28px rgba(16, 185, 129, 0.65), 0 8px 20px rgba(2, 6, 23, 0.5)', transform: 'scale(1.015)' });
  if (labelEl) labelEl.textContent = `✓ Account Created (${userName || 'Ready'}) — Launching Murph OS…`;
  await new Promise((r) => setTimeout(r, 1250));
  setTimeout(() => {
    Object.assign(btnEl.style, { background: prev.bg, border: prev.border, boxShadow: prev.shadow, transform: prev.tf });
    if (labelEl) labelEl.textContent = prev.txt;
  }, 1450);
}

function getScopedTicketsForActiveUser(state, popupEl) {
  const allTickets = Array.isArray(state && state.agent_tickets) ? state.agent_tickets : [];
  const profile = typeof getActiveLoggedInUserProfile === 'function' ? getActiveLoggedInUserProfile(state) : {};
  const activeEmail = String(profile.email || '').toLowerCase();
  const activeHandle = activeEmail.split('@')[0];
  const activeId = String(profile.id || '').toLowerCase();
  const isCustom = typeof isCustomAccountKey === 'function' && isCustomAccountKey(activeEnvironment);
  const matchesUser = (uid, ldap) => {
    const uLow = String(uid || '').toLowerCase();
    const lLow = String(ldap || '').toLowerCase();
    return Boolean((activeId && uLow === activeId) || (activeEmail && lLow === activeEmail) || (activeHandle && lLow && lLow.split('@')[0] === activeHandle));
  };
  const scoped = allTickets.filter((t) => {
    if (!t) return false;
    if (matchesUser(t.requester_user_id, t.requester_ldap)) return true;
    if (Array.isArray(t.participating_users) && t.participating_users.some((pu) => pu && matchesUser(pu.user_id, pu.ldap))) return true;
    return !isCustom && (t.id === 'TKT-101' || t.id === 'TKT-102');
  });
  const winEl = popupEl || (typeof document !== 'undefined' ? document.getElementById('popup-136-730') : null);
  const focusId = winEl && winEl.dataset ? winEl.dataset.customWfTicketId : '';
  return scoped.slice().sort((a, b) => {
    if (focusId && a.id === focusId && b.id !== focusId) return -1;
    if (focusId && b.id === focusId && a.id !== focusId) return 1;
    return (a.id === 'TKT-101' || a.id === 'TKT-102' ? 1 : 0) - (b.id === 'TKT-101' || b.id === 'TKT-102' ? 1 : 0);
  });
}

function syncStateToFigmaDOM(state) {
  if (!state) return;
  if (typeof reconcileOptimisticGovernanceState === 'function') reconcileOptimisticGovernanceState(state);
  const meshNodes = (state.agent_mesh && state.agent_mesh.nodes) || state.user_agents || [];
  const peerCount = Math.max(meshNodes.length, 10);
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  if (typeof applyViewerSessionFromState === 'function' && state.viewer_session) applyViewerSessionFromState(state);
  const cookieSession = typeof getAuthCookieSession === 'function' ? getAuthCookieSession() : null;
  if (cookieSession && cookieSession.accountKey) activeEnvironment = normalizeAccountKey(cookieSession.accountKey);
  else if (activeEnvironment !== 'cloud' && activeEnvironment !== 'dm' && !isCustomAccountKey(activeEnvironment)) activeEnvironment = normalizeAccountKey(state.active_environment);
  if (typeof syncOnboardingTourWithServerBoot === 'function') syncOnboardingTourWithServerBoot(state);

  const llmStatus = state.llm_status || {};
  applyGeminiModelToDOM(normalizeGeminiModelId(localStorage.getItem(MODEL_STORAGE_KEY) || llmStatus.model || activeGeminiModel), llmStatus);

  renderDynamicDesktopItems(state);
  updateLockScreenUI();
  updateStickyBarUserIdentity(state);
  applyDockThemeModeToDOM(getDockThemeMode());
  setNodeText('99:293', `SYNCED ${nowTime}`);
  setNodeText('102:3255', `SYNCED ${nowTime}`);
  setNodeText('183:367', `${peerCount} / ${peerCount} PEER AGENTS ONLINE`);

  const claims = state.claims || [];
  const isDone = (c) => Boolean(c && (c.status === 'resolved' || c.status === 'approved_override'));
  const findClm = (...ids) => claims.find((c) => c && ids.includes(c.id));
  const autoFixClaims = claims.filter((c) => c.severity === 'auto_fix' && !isDone(c));
  const hardStopClaims = claims.filter((c) => c.severity === 'hard_stop' && !isDone(c));
  const resolvedClaims = claims.filter(isDone);
  updateDynamicFileAndFolderBadges(state);

  const setBtnDone = (btnId, lblId, done, doneLbl) => {
    document.querySelectorAll(`[data-node-id="${btnId}"]`).forEach((b) => {
      if (typeof applyPopupButtonVisualState === 'function') applyPopupButtonVisualState(b, done ? 'done' : 'idle', done ? doneLbl : '');
    });
    if (done && doneLbl) setNodeText(lblId, doneLbl);
    else if (!done && typeof restoreOrigNodeText === 'function') restoreOrigNodeText(lblId);
  };

  setNodeText('155:1245', `● ${resolvedClaims.length + 2} APPROVED`);
  setNodeText('155:1248', `● ${autoFixClaims.length} EASY FIXES`);
  setNodeText('155:1251', `● ${hardStopClaims.length} BLOCKERS`);

  const clm02 = findClm('CLM-02', 'CLM-102');
  const clm01 = findClm('CLM-01', 'CLM-101');
  const clm03 = findClm('CLM-03', 'CLM-103');
  const clm04 = findClm('CLM-04', 'CLM-104');
  const clm05 = findClm('CLM-05', 'CLM-105');

  if (isDone(clm02)) {
    setNodeText('155:1260', '✓ FIXED');
    setBtnDone('155:1272', '155:1273', true, '✓ Fix Applied');
    setNodeText('171:23', '✓ FIXED');
    setNodeText('171:101', '✓ Fixed! Launch Readiness raised from 60% → 75%');
    setBtnDone('174:7', '174:8', true, '✓ Fix Applied to Launch Brief');
    setNodeText('181:22', '✓ IN SYNC');
  } else {
    if (typeof restoreOrigNodeText === 'function') restoreOrigNodeText('155:1260', '171:23', '171:101', '181:22');
    setBtnDone('155:1272', '155:1273', false);
    setBtnDone('174:7', '174:8', false);
  }
  if (isDone(clm01) && (!clm03 || isDone(clm03))) {
    setNodeText('155:1285', '✓ FIXED');
    setBtnDone('155:1297', '155:1298', true, '✓ Fix Applied');
    setNodeText('181:33', '✓ IN SYNC');
  } else {
    if (typeof restoreOrigNodeText === 'function') restoreOrigNodeText('155:1285', '181:33');
    setBtnDone('155:1297', '155:1298', false);
  }
  setBtnDone('155:1332', '155:1333', autoFixClaims.length === 0 && claims.length > 0, '✓ All Easy Fixes Applied');

  if (isDone(clm04)) {
    const isW04 = clm04.status === 'approved_override';
    setNodeText('155:1310', '✓ ANONYMIZED');
    setBtnDone('155:1322', '155:1323', true, '✓ Anonymized');
    setNodeText('183:230', isW04 ? 'BLOCKER 01 · ✓ WAIVER SIGNED' : 'BLOCKER 01 · ✓ LEGAL UNBLOCKED');
    setBtnDone(isW04 ? '183:237' : '183:239', isW04 ? '183:238' : '183:240', false);
    setBtnDone(isW04 ? '183:239' : '183:237', isW04 ? '183:240' : '183:238', true, isW04 ? '✓ Waiver Approved' : '✓ Option A Approved');
    setNodeText('183:288', '✓ RESOLVED — LEGAL TEAM UNBLOCKED');
    setNodeText('183:289', '✓ DONE');
    setNodeText('183:294', '✓ NDA CLEARED');
    setBtnDone('183:342', '183:343', true, isW04 ? '✓ Option B Waiver Signed · Legal Unblocked' : '✓ Option A Approved · Legal Unblocked');
    setNodeText('181:44', '✓ NDA CLEARED');
  } else {
    if (typeof restoreOrigNodeText === 'function') restoreOrigNodeText('155:1310', '183:230', '183:288', '183:289', '183:294', '181:44');
    [['155:1322', '155:1323'], ['183:237', '183:238'], ['183:239', '183:240'], ['183:342', '183:343']].forEach(([b, l]) => setBtnDone(b, l, false));
  }

  if (isDone(clm05)) {
    const isW05 = clm05.status === 'approved_override';
    setNodeText('183:248', isW05 ? 'BLOCKER 02 · ✓ WAIVER SIGNED' : 'BLOCKER 02 · ✓ BUDGET UNBLOCKED');
    setBtnDone(isW05 ? '183:255' : '183:257', isW05 ? '183:256' : '183:258', false);
    setBtnDone(isW05 ? '183:257' : '183:255', isW05 ? '183:258' : '183:256', true, isW05 ? '✓ Waiver Approved (+$22k)' : '✓ Option A Approved ($54k · 14d)');
    setNodeText('187:26', isW05 ? '✓ WAIVER ACTIVE (+$22K)' : '✓ WITHIN $60K BUDGET');
    setNodeText('181:55', isW05 ? '✓ WAIVER ACTIVE' : '✓ WITHIN $60K CAP');
    if (isW05) {
      [['187:77', '187:78'], ['187:41', '187:42'], ['181:79', '181:80'], ['136:939', '136:940']].forEach(([b, l]) => setBtnDone(b, l, false));
      setBtnDone('187:75', '187:76', true, '✓ Budget Waiver Active (+$22k)');
    } else {
      setBtnDone('187:75', '187:76', false);
      setBtnDone('187:77', '187:78', true, '✓ $54k SAP Setup Locked for Wave 1');
      setBtnDone('187:41', '187:42', true, '✓ Wave 1 Active');
      setBtnDone('181:79', '181:80', true, '✓ Wave 1 Selected');
      setBtnDone('136:939', '136:940', true, '✓ $54k SAP Setup Locked');
    }
  } else {
    if (typeof restoreOrigNodeText === 'function') restoreOrigNodeText('183:248', '187:26', '187:30', '187:34', '187:38', '181:55');
    [['183:255', '183:256'], ['183:257', '183:258'], ['187:75', '187:76'], ['187:77', '187:78'], ['187:41', '187:42'], ['181:79', '181:80'], ['187:54', '187:55'], ['181:89', '181:90'], ['136:939', '136:940']].forEach(([b, l]) => setBtnDone(b, l, false));
  }
  setBtnDone('183:272', '183:273', hardStopClaims.length === 0 && claims.length > 0, '✓ All Blockers Resolved');

  const feas = state.feasibility || {};
  if (feas.projected_spend !== undefined) {
    const spendStr = `$${Number(feas.projected_spend).toLocaleString()}`;
    const capStr = `$${Math.round((feas.allocated_budget || 60000) / 1000)}k cap`;
    const reqFte = feas.projected_fte ?? feas.required_fte ?? 3.5;
    const capFte = feas.team_capacity_fte ?? feas.available_fte ?? 4.0;
    const fteOver = feas.fte_overload ?? Math.max(0, +(reqFte - capFte).toFixed(1));
    const projDays = feas.critical_path_days ?? feas.projected_days ?? 14;
    const tgtDays = feas.target_launch_days ?? 18;
    const slipDays = feas.schedule_slip_days ?? Math.max(0, projDays - tgtDays);
    setNodeText('183:208', `${spendStr} / ${capStr}`);
    setNodeText('183:211', feas.budget_delta > 0 ? `+$${Math.round(feas.budget_delta / 1000)}k OVER BUDGET` : '✓ WITHIN BUDGET');
    setNodeText('183:214', `${reqFte} / ${capFte} People`);
    setNodeText('183:217', fteOver > 0 ? `+${fteOver} OVER TEAM LIMIT` : '✓ FITS TEAM');
    setNodeText('183:220', `${projDays} / ${tgtDays} Days`);
    setNodeText('183:223', slipDays > 0 ? `+${slipDays} DAYS PAST OCT 18` : '✓ 4 DAYS EARLY');
    if (hardStopClaims.length === 0) {
      setNodeText('183:201', 'All blockers resolved — Ready for Launch');
      setNodeText('183:204', '4 / 4 TEAMS READY · ZERO BLOCKERS');
      setNodeText('181:12', '✓ 0 BLOCKERS');
    } else {
      if (typeof restoreOrigNodeText === 'function') restoreOrigNodeText('183:204', '181:12');
      setNodeText('183:201', `${hardStopClaims.length} blocker(s) waiting on sign-off`);
    }
  }

  // Update Bilateral Tickets in My Agent Dock Popup (136:730)
  const activeProfile = typeof getActiveLoggedInUserProfile === 'function' ? getActiveLoggedInUserProfile(state) : {};
  const scopedTickets = getScopedTicketsForActiveUser(state);
  const openTickets = scopedTickets.filter((t) => t.status !== 'approved');
  setNodeText('183:380', `0${openTickets.length} Active`);
  setNodeText('183:481', openTickets.length > 0 ? `⚡ Approve All Team Agreements (${openTickets.length}) →` : '✓ All Team Agreements Approved');
  setBtnDone('183:480', '183:481', openTickets.length === 0 && scopedTickets.length > 0, '✓ All Team Agreements Approved');
  const shortenAgentChatLine = (rawMsg) => {
    const msg = String(rawMsg || '').trim();
    if (/both the SAP connector and bespoke mainframe|both SAP and Mainframe/i.test(msg)) return 'SAP + Mainframe ($82k) is over our $60k budget.';
    if (/PSO-SAP-REF.*54,000|Standard SAP setup is \$54k/i.test(msg)) return 'Ship $54k SAP Demo now; move $28k Mainframe to Wave 2.';
    if (/Tier-2 Mutual NDA|Apex Bank is under NDA/i.test(msg)) return "Say 'a major global bank' (NDA) — 68% stat is approved.";
    if (/us-central1.*europe-west4|US & Europe are live/i.test(msg)) return 'US & Europe live now; Singapore in Preview until Nov 15.';
    return msg.length > 88 ? `${msg.slice(0, 85).trim()}…` : msg;
  };
  const formatTicketTurnLine = (turn) => {
    if (!turn) return '';
    const rawSpeaker = turn.speaker_agent_name || turn.speaker || turn.speaker_agent_id || 'Agent';
    const speaker = rawSpeaker.replace(/'s Personal Agent/i, ' Agent').replace(/Central Workspace Agent/i, 'Workspace Agent');
    return `<strong>${speaker}:</strong> "${shortenAgentChatLine(turn.message)}"`;
  };
  const renderTicketCardBilateralBanner = (cardNodeId, tktObj) => {
    document.querySelectorAll(`[data-node-id="${cardNodeId}"]`).forEach((cardEl) => {
      let banner = cardEl.querySelector('.settled-update-banner');
      if (!tktObj) { if (banner) banner.remove(); return; }
      if (!banner) { banner = document.createElement('div'); banner.className = 'settled-update-banner'; cardEl.appendChild(banner); }
      const rawTurns = tktObj.agent_debate_turns || [];
      const peerTurns = rawTurns.filter((t) => t && t.speaker_agent_id !== 'workspace_agent');
      const turnHtml = (peerTurns.length ? peerTurns : rawTurns).slice(0, 2).map((t) => `<div style="font-size:12px;opacity:0.92;margin-bottom:2px;">💬 ${formatTicketTurnLine(t)}</div>`).join('');
      const appPills = Object.values(tktObj.approvals || {}).map((a) => `<span style="display:inline-block;margin-right:10px;font-weight:700;">${String(a.ldap || a.name || '').split('@')[0]}@ ${a.status === 'approved' ? '✓ Signed' : '⏳ Pending'}</span>`).join('');
      banner.innerHTML = `<div style="font-weight:700;margin-bottom:3px;">⚡ AGENT CHAT &amp; SIGN-OFF</div>${turnHtml}${appPills ? `<div style="margin-top:4px;padding-top:3px;border-top:1px dashed rgba(148,163,184,0.35);">${appPills}</div>` : ''}`;
    });
  };
  const syncTicketCardToDOM = (tkt, ids) => {
    if (!tkt) return;
    setNodeText(ids.id, tkt.id);
    const shortTitle = tkt.id === 'TKT-101' ? 'Oct 18 Keynote: Bank Name & Singapore Wording' : tkt.id === 'TKT-102' ? 'Oct 18 Demo Budget: $82k Plan vs. $60k Limit' : tkt.title;
    setNodeText(ids.title, shortTitle);
    const appEntries = Object.values(tkt.approvals || {});
    const approvedCnt = appEntries.filter((a) => a.status === 'approved').length;
    const totalCnt = appEntries.length || 1;
    const myEmail = String(activeProfile.email || '').toLowerCase();
    const myApproval = appEntries.find((a) => a.user_id === activeProfile.id || String(a.ldap || '').toLowerCase() === myEmail);
    const isApproved = tkt.status === 'approved' || (window._murphApprovedTicketIds && window._murphApprovedTicketIds.has(tkt.id));
    const needsMySignoff = !isApproved && myApproval && myApproval.status === 'pending';
    setNodeText(ids.badge, isApproved ? `✓ APPROVED (${totalCnt}/${totalCnt})` : needsMySignoff ? `⏳ NEEDS YOUR APPROVAL (${approvedCnt}/${totalCnt})` : tkt.status === 'partially_approved' ? `⏳ PARTIALLY APPROVED (${approvedCnt}/${totalCnt})` : '⚡ READY FOR SIGN-OFF');
    setNodeText(ids.btn, isApproved ? '✓ Approved' : '✓ Approve Agreement');
    setBtnDone(ids.approveBtn, ids.btn, isApproved, '✓ Approved');
    document.querySelectorAll(`[data-node-id="${ids.card}"]`).forEach((el) => el.setAttribute('data-ticket-card-id', tkt.id));
    document.querySelectorAll(`[data-node-id="${ids.approveBtn}"], [data-node-id="${ids.openBtn}"]`).forEach((btnEl) => btnEl.setAttribute('data-ticket-id', tkt.id));
    const reqAgent = tkt.requester_personal_agent_name || `${(tkt.requester_ldap || 'cloud_demo').split('@')[0]}@'s Personal Agent`;
    const peerAgents = (tkt.participating_users || []).filter((u) => u && u.routing_mode !== 'requester' && u.user_id !== tkt.requester_user_id).map((u) => u.personal_agent_name || `${(u.ldap || u.name || 'peer').split('@')[0]}@'s Personal Agent`);
    setNodeText(ids.agents, peerAgents.length ? `${reqAgent} ⇄ ${peerAgents.join(' + ')}` : reqAgent);
    const fileLabels = (tkt.shared_files || []).map((sf) => {
      const cleanName = typeof normalizeSeedFilename === 'function' ? normalizeSeedFilename(sf.filename) : sf.filename;
      return sf.raw_redacted || sf.visibility === 'private_vetted_summary' ? `${cleanName} [Private Vetted]` : cleanName;
    });
    if (fileLabels.length) setNodeText(ids.files, fileLabels.join(' + '));
    const rawSummary = (tkt.compromise_proposal && (tkt.compromise_proposal.compromise_summary || tkt.compromise_proposal.summary)) || '';
    const cpSummary = tkt.id === 'TKT-101' && rawSummary.length > 110 ? "Say 'a major global bank' (keep 68% stat) and list Singapore as Preview until Nov 15." : tkt.id === 'TKT-102' && rawSummary.length > 110 ? 'Ship the $54k Standard SAP Demo for Oct 18; move the $28k Mainframe add-on to Wave 2.' : rawSummary;
    if (cpSummary) setNodeText(ids.summary, cpSummary);
    renderTicketCardBilateralBanner(ids.card, tkt);
  };
  syncTicketCardToDOM(scopedTickets[0], { card: '183:431', id: '183:434', title: '183:435', badge: '183:438', agents: '183:442', files: '183:445', summary: '183:447', approveBtn: '183:449', btn: '183:450', openBtn: '183:451' });
  syncTicketCardToDOM(scopedTickets[1], { card: '183:453', id: '183:456', title: '183:457', badge: '183:460', agents: '183:464', files: '183:467', summary: '183:469', approveBtn: '183:471', btn: '183:472', openBtn: '183:473' });
  document.querySelectorAll('[data-node-id="183:429"]').forEach((secEl) => {
    let extraWrap = secEl.querySelector('#my-agent-extra-tickets-list');
    const extraTickets = scopedTickets.slice(2);
    if (!extraTickets.length) { if (extraWrap) extraWrap.remove(); return; }
    if (!extraWrap) {
      extraWrap = document.createElement('div');
      extraWrap.id = 'my-agent-extra-tickets-list';
      extraWrap.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:8px;margin-top:4px;';
      secEl.appendChild(extraWrap);
    }
    extraWrap.innerHTML = extraTickets.map((t) => {
      const cpSum = (t.compromise_proposal && t.compromise_proposal.compromise_summary) || t.request_summary || '';
      const isApp = t.status === 'approved' || t.status === 'partially_approved' || (window._murphApprovedTicketIds && window._murphApprovedTicketIds.has(t.id));
      const doneStyle = isApp ? 'data-btn-done="true" style="background:linear-gradient(135deg,#059669 0%,#10B981 100%) !important;border-color:#6EE7B7 !important;color:#FFFFFF !important;box-shadow:0 0 12px rgba(16,185,129,0.35) !important;"' : '';
      return `<div class="settled-update-banner" data-ticket-card-id="${t.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;"><div style="flex:1;"><strong>${t.id} · ${t.title}</strong> (${isApp ? '<span style="color:#059669;font-weight:700;">✓ APPROVED (2/2)</span>' : '⏳ PENDING SIGN-OFF'})<div style="margin-top:2px;">${cpSum}</div></div><button type="button" class="dock-wf-banner-action-btn" data-api-action="approve-ticket" data-ticket-id="${t.id}" ${doneStyle}>${isApp ? '✓ Approved' : '✓ Approve Compromise'}</button></div>`;
    }).join('');
  });

  refreshAllOpenWorkloadTopologies(state);
  if (typeof syncTerminalForActiveAccount === 'function') syncTerminalForActiveAccount(state);
  if (typeof syncBottomDockAndPopups === 'function') syncBottomDockAndPopups(state);
}
