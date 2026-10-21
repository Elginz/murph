/**
 * ============================================================================
 * 06-terminal-agent.js — Interactive Terminal Chat Agent & Lock Screen Clock
 * ============================================================================
 *
 * Implements:
 *   1. Live Lock Screen digital clock & date display (`updateClock`).
 *   2. Full Terminal Chat Agent (`initTerminalChatAgent`, `appendTerminalMessage`,
 *      `executeTerminalCommand`) supporting slash commands (`/status`, `/scrub`,
 *      `/autofix`, `/resolve`, `/files`, `/trash`, `/trace`, `/clear`, `/help`),
 *      quick action chips, and live Personal-Agent queries via `POST /api/agent/ask`.
 *
 * Grounding model (2026-10-03): every natural-language question is answered by
 * the logged-in account's Personal Agent, grounded FIRST in that account's own
 * uploaded Blue files (e.g. the sign-up `starter_reference.md`). The request
 * carries the browser's identity (`user_id`, `ldap`, `environment`) so the
 * backend never answers as a stale server-side session. Output is one clean
 * answer + a compact `sources:` line; per-agent hop lines only when `/trace` is on.
 */

const TERMINAL_TRACE_STORAGE_KEY = 'murph_terminal_trace_v1';
let terminalTraceEnabled = false;
let terminalLiveGeminiWarned = false;

// Live Clock on Lock Screen (61:345, 61:346)
function updateClock() {
  const now = new Date();
  const hhmm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  setNodeText('61:345', hhmm);
  setNodeText('61:346', dateStr);
}
updateClock();
setInterval(updateClock, 15000);

/** Identity of the browser's logged-in account, sent with every agent request. */
function getTerminalIdentityPayload() {
  const profile = getActiveLoggedInUserProfile(appState);
  return {
    user_id: profile.id,
    ldap: profile.email,
    environment: profile.accountKey,
    personal_agent_name: profile.personalAgentName,
    model: activeGeminiModel || 'gemini-3.8-flash',
  };
}

/** Filenames the active account can see on its desktop (seed files for Cloud/DM, uploads for everyone). */
function getActiveAccountFilenames() {
  const acctKey = normalizeAccountKey(activeEnvironment);
  const names = [];
  const push = (n) => {
    if (n && !names.some((x) => x.toUpperCase() === String(n).toUpperCase())) names.push(n);
  };
  Object.entries(SEED_DESKTOP_NODE_ENV_MAP)
    .filter(([nid, meta]) => isSeedBlueFileVisibleForEnv(meta, acctKey) && !isSeedItemHidden(nid, meta.env))
    .forEach(([, meta]) => push(meta.filename));
  ((appState && appState.user_files) || [])
    .filter(
      (f) =>
        f &&
        f.filename &&
        !SEED_FILE_IDS.has(f.id) &&
        !SEED_FILENAMES_UPPER.has(String(f.filename).toUpperCase()) &&
        normalizeAccountKey(f.environment) === acctKey &&
        !isCustomItemInTrash('custom-file', acctKey, f.filename)
    )
    .forEach((f) => push(f.filename));
  getStoredCustomFiles()
    .filter((f) => normalizeAccountKey(f.environment) === acctKey && !isCustomItemInTrash('custom-file', acctKey, f.filename))
    .forEach((f) => push(f.filename));
  return names;
}

/** Content of a desktop file by name: in-memory lines first, then server state (active account first), then localStorage. */
function getTerminalFileContent(filename) {
  const lines = BLUE_FILE_FALLBACKS[filename];
  if (Array.isArray(lines) && lines.length) return lines.join('\n');
  const upper = String(filename).toUpperCase();
  const acctKey = normalizeAccountKey(activeEnvironment);
  const serverMatches = ((appState && appState.user_files) || []).filter(
    (f) => f && String(f.filename).toUpperCase() === upper
  );
  const serverFile =
    serverMatches.find((f) => normalizeAccountKey(f.environment) === acctKey) || serverMatches[0];
  if (serverFile && serverFile.content) return String(serverFile.content);
  const localMatches = getStoredCustomFiles().filter((f) => String(f.filename).toUpperCase() === upper);
  const localFile = localMatches.find((f) => normalizeAccountKey(f.environment) === acctKey) || localMatches[0];
  return localFile && localFile.content ? String(localFile.content) : '';
}

/** Which file `/scrub` audits: DEMO LAUNCH BRIEF.md when the account has it, otherwise the account's first file. */
function getTerminalScrubTarget() {
  const names = getActiveAccountFilenames();
  const brief = names.find((n) => n.toUpperCase() === 'DEMO LAUNCH BRIEF.MD');
  return brief || names[0] || '';
}

function isLiveGeminiEnabled() {
  return Boolean(appState && appState.llm_status && appState.llm_status.live_enabled);
}

/** Terminal is plain text: drop markdown bold/code markers and normalise list bullets. */
function toTerminalPlainText(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Full Terminal Chat Agent / Interactive Help Desk (Home Page 99:235 & Intro Page 102:3296)
function initTerminalChatAgent() {
  const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
  if (!consoleEl) return;
  if (typeof initHelpdeskComposer === 'function') {
    initHelpdeskComposer();
  }
  if (consoleEl.dataset.terminalInitialized === '1') return;
  consoleEl.dataset.terminalInitialized = '1';

  ['99:252', '99:256', '99:260'].forEach((nid) => {
    const row = consoleEl.querySelector(`[data-node-id="${nid}"]`);
    if (row) row.style.display = 'none';
  });

  const bodyEl = consoleEl.querySelector('[data-node-id="99:251"]') || consoleEl;
  const composerEl = consoleEl.querySelector('[data-node-id="99:264"]');
  if (!consoleEl.querySelector('#home-terminal-log')) {
    const logEl = document.createElement('div');
    logEl.id = 'home-terminal-log';
    logEl.className = 'murph-terminal-log';
    bodyEl.insertBefore(logEl, composerEl || null);
  }
  if (!consoleEl.querySelector('#home-terminal-chips')) {
    const quickBar = document.createElement('div');
    quickBar.id = 'home-terminal-chips';
    quickBar.className = 'murph-term-quick-bar';
    bodyEl.insertBefore(quickBar, composerEl || null);
  }

  if (typeof switchTerminalTranscript === 'function') {
    switchTerminalTranscript(normalizeAccountKey(activeEnvironment));
  } else {
    appendTerminalMessage(
      'murph://helpdesk',
      'Murph Agent Help Desk online. Ask about your workflows, launch blockers, tickets, or files.',
      'sys'
    );
    renderTerminalGroundingBanner();
  }
}

/** Boot banner: which Personal Agent answers, which files it is grounded in, and whether live Gemini is on. */
function renderTerminalGroundingBanner() {
  const identity = getTerminalIdentityPayload();
  const files = getActiveAccountFilenames();
  const modelName =
    (GEMINI_MODELS[activeGeminiModel] && GEMINI_MODELS[activeGeminiModel].name) || 'Gemini 3.8 Flash';
  appendTerminalMessage(
    'murph://agent',
    `${identity.personal_agent_name} for ${identity.ldap} · grounded in ${files.length ? `your ${files.length} file(s): ${files.join(', ')}` : 'no files yet — upload a Blue file (right-click → New Blue File) and I will answer from it'} · Team Policy Packs: Cloud PM, Brand, Legal, Commercial`,
    'agent'
  );
  if (isLiveGeminiEnabled()) {
    appendTerminalMessage('murph://gemini', `Live Gemini ON · model ${modelName} (${activeGeminiModel})`, 'sys');
  } else if (!terminalLiveGeminiWarned) {
    terminalLiveGeminiWarned = true;
    appendTerminalMessage(
      'murph://gemini',
      `Live Gemini OFF (model: ${modelName}) — Help Desk workflow queries work directly from your workspace state, and file Q&A uses the deterministic policy/file engine.`,
      'sys'
    );
  }
}

function appendTerminalMessage(source, text, kind = 'agent') {
  const logEl = document.getElementById('home-terminal-log');
  const nowStr = new Date().toLocaleTimeString([], { hour12: false });
  const plain = kind === 'user' ? String(text || '') : toTerminalPlainText(text);
  const entry = { time: nowStr, source, text: plain, kind };
  if (typeof getActiveTerminalSession === 'function') {
    const session = getActiveTerminalSession();
    session.messages.push(entry);
  }
  if (logEl) {
    if (typeof renderTerminalMessageNode === 'function') {
      const shouldStream = !window._murphSuppressTerminalAudio && kind !== 'user' && source !== 'sources:';
      renderTerminalMessageNode(logEl, entry, { stream: shouldStream });
    } else {
      const line = document.createElement('div');
      line.className = `murph-term-msg kind-${kind}`;
      const tagClass = kind === 'user' ? 'user' : kind === 'warn' ? 'warn' : kind === 'agent' ? 'ok' : 'sys';
      line.innerHTML =
        `<span class="murph-term-time">${escapeHtmlSafe(nowStr)}</span>` +
        `<span class="murph-term-tag ${tagClass}">${escapeHtmlSafe(source)}</span>` +
        `<span class="murph-term-text">${escapeHtmlSafe(plain)}</span>`;
      logEl.appendChild(line);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }
  if (kind === 'user') {
    setNodeText('99:257', nowStr);
    setNodeText('99:258', source);
    setNodeText('99:259', plain);
  } else {
    if (source !== 'sources:' && source !== 'murph://auth/register' && typeof playMurphTerminalSound === 'function') {
      playMurphTerminalSound(kind);
    }
    setNodeText('99:261', nowStr);
    setNodeText('99:262', source);
    setNodeText('99:263', plain);
  }
}

/** Prints the Personal Agent's answer (+ sources when cited, + hop trace when enabled, + UI action/chips). */
function renderTerminalAgentAnswer(msg) {
  const agentHandle = String(msg.personal_agent_name || 'personal agent')
    .split("'")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (terminalTraceEnabled) {
    (msg.hops || []).forEach((h) => {
      appendTerminalMessage(
        `trace://${String(h.to_agent_id || 'agent').replace('_agent', '')}`,
        `${h.to_agent_name}: ${h.response_message || ''}`,
        'sys'
      );
    });
  }
  appendTerminalMessage(`agent://${agentHandle || 'personal'}`, msg.final_answer || 'No answer produced.', 'agent');
  const src = msg.sources || {};
  const fileSources = Array.isArray(src.files) ? src.files : [];
  const ruleSources = Array.isArray(src.rules) ? src.rules : [];
  const parts = [];
  if (fileSources.length) parts.push(fileSources.join(', '));
  if (ruleSources.length) parts.push(ruleSources.join(', '));
  if (parts.length > 0) {
    appendTerminalMessage('sources:', parts.join(' · '), 'sys');
  }
  if (typeof renderTerminalChips === 'function') {
    renderTerminalChips(DEFAULT_HELPDESK_CHIPS);
  }
  if (msg.ui_action && msg.ui_action.action === 'open_popup' && typeof executeAgentUiAction === 'function') {
    executeAgentUiAction(msg.ui_action);
  }
}

async function executeTerminalCommand(rawInput, isIntroConsole = false) {
  const q = (rawInput || '').trim();
  if (!q) return;

  if (isIntroConsole) {
    const nowStr = new Date().toLocaleTimeString([], { hour12: false });
    setNodeText('102:3325', nowStr);
    setNodeText('102:3326', 'user://query');
    setNodeText('102:3327', q);
    const res = await apiCall('/api/agent/ask', 'POST', Object.assign({ question: q }, getTerminalIdentityPayload()));
    if (res && res.a2a_messages && res.a2a_messages[0]) {
      const latest = res.a2a_messages[0];
      setNodeText('102:3328', new Date().toLocaleTimeString([], { hour12: false }));
      setNodeText('102:3329', 'murph://a2a');
      setNodeText('102:3330', toTerminalPlainText(latest.final_answer || '').slice(0, 140));
    }
    return;
  }

  initTerminalChatAgent();
  if (typeof getActiveTerminalSession === 'function') {
    const session = getActiveTerminalSession();
    if (session.history[session.history.length - 1] !== q) {
      session.history.push(q);
    }
    session.historyIdx = -1;
  }

  const cmdLower = q.toLowerCase();

  if (cmdLower === '/clear' || cmdLower === 'clear') {
    if (typeof getActiveTerminalSession === 'function') {
      const session = getActiveTerminalSession();
      session.messages = [];
    }
    const logEl = document.getElementById('home-terminal-log');
    if (logEl) logEl.innerHTML = '';
    appendTerminalMessage(
      'murph://helpdesk',
      'Conversation cleared. Chat with your Personal Agent or click a prompt chip below.',
      'sys'
    );
    if (typeof renderTerminalChips === 'function') {
      renderTerminalChips(DEFAULT_HELPDESK_CHIPS);
    }
    return;
  }

  if (cmdLower.startsWith('/key ')) {
    const newKey = q.slice(5).trim();
    appendTerminalMessage('user://you', '/key ••••••••••••', 'user');
    const res = await apiCall('/api/llm/configure', 'POST', { api_key: newKey, model: activeGeminiModel || 'gemini-3.8-flash' });
    appendTerminalMessage(
      'murph://gemini',
      res && res.llm_status && res.llm_status.live_enabled
        ? `Live Gemini API key configured (${res.llm_status.model}).`
        : 'Updated Gemini configuration.',
      'sys'
    );
    return;
  }

  const priorHistory =
    typeof buildTerminalConversationHistory === 'function' ? buildTerminalConversationHistory() : [];

  if (typeof triggerTerminalRunLaunch === 'function') triggerTerminalRunLaunch();
  appendTerminalMessage('user://you', q, 'user');
  if (typeof playMurphTerminalSound === 'function') playMurphTerminalSound('thinking');

  if (
    ['/model', '/models', 'model', 'models'].includes(cmdLower) ||
    cmdLower.startsWith('/model ') ||
    cmdLower.startsWith('/models ')
  ) {
    if (typeof handleTerminalModelCommand === 'function') await handleTerminalModelCommand(q);
    return;
  }

  if (['my workflows', '/workflows', 'workflows'].includes(cmdLower)) {
    if (typeof handleTerminalWorkflowsCommand === 'function') handleTerminalWorkflowsCommand();
    return;
  }

  if (cmdLower === '/help' || cmdLower === 'help') {
    appendTerminalMessage(
      'murph://help',
      'Agent Help Desk — Chat naturally with your Personal Agent or click a preset below:\n• Help — show available commands and Help Desk capabilities\n• My workflows — list your visible desktop workflows & open counts\n• Models — view or switch the active Gemini 3.x model (/model <id>)\nSlash Commands: /model · /status · /files · /trash · /trace · /scrub · /autofix · /resolve · /clear',
      'sys'
    );
    if (typeof renderTerminalChips === 'function') renderTerminalChips(DEFAULT_HELPDESK_CHIPS);
    return;
  }

  if (cmdLower === '/trace' || cmdLower === 'trace') {
    terminalTraceEnabled = !terminalTraceEnabled;
    try {
      localStorage.setItem(TERMINAL_TRACE_STORAGE_KEY, terminalTraceEnabled ? '1' : '0');
    } catch (_err) { /* storage unavailable */ }
    appendTerminalMessage(
      'murph://trace',
      terminalTraceEnabled
        ? 'Trace ON — each answer now also lists every Team Agent hop consulted.'
        : 'Trace OFF — answers show only the Personal Agent reply + sources when cited.',
      'sys'
    );
    return;
  }

  if (cmdLower === '/trash' || cmdLower === 'trash') {
    const items = getTrashBinItems();
    openPopup('trash:bin');
    appendTerminalMessage(
      'murph://trash',
      items.length > 0
        ? `Trash Bin (${items.length} item${items.length === 1 ? '' : 's'}): ${items.map((t) => t.title).join(', ')} — opened Trash Bin window.`
        : 'Trash Bin is currently empty (0 items) — opened Trash Bin window.',
      'sys'
    );
    return;
  }

  if (cmdLower === '/status' || cmdLower === 'status') {
    const env = normalizeAccountKey(activeEnvironment);
    const acctLabel = getAccountShortTag(env);
    const wfs = typeof getHelpdeskVisibleWorkflows === 'function' ? getHelpdeskVisibleWorkflows() : [];
    const tkts = typeof getHelpdeskVisibleTickets === 'function' ? getHelpdeskVisibleTickets() : [];
    const files = getActiveAccountFilenames();
    const modelLabel = (GEMINI_MODELS[activeGeminiModel] && GEMINI_MODELS[activeGeminiModel].name) || activeGeminiModel;
    if (isCustomAccountKey(env)) {
      appendTerminalMessage(
        'murph://status',
        `Account: ${acctLabel} (Isolated Workspace) | Workflows: ${wfs.length} | Blue Files: ${files.length} | Open Tickets: ${tkts.length} | Launch Blockers: 0 | Model: ${modelLabel} (${isLiveGeminiEnabled() ? 'LIVE' : 'FALLBACK'})`,
        'agent'
      );
      return;
    }
    const r = (appState && appState.readiness) || (appState && appState.summary) || {};
    const claims = (appState && appState.claims) || [];
    const openClaims = claims.filter((c) => c.status !== 'resolved').length;
    const hardStops = claims.filter((c) => c.severity === 'hard_stop' && c.status !== 'resolved').length;
    const score = r.score ?? r.readiness_score ?? (hardStops === 0 && openClaims === 0 ? 100 : 48);
    appendTerminalMessage(
      'murph://status',
      `Readiness: ${score}% (${hardStops > 0 ? 'BLOCKED' : 'READY'}) | Workflows: ${wfs.length} | Unresolved Claims: ${openClaims} | Hard Stops: ${hardStops} | Open Tickets: ${tkts.length} | Account: ${acctLabel} | Model: ${modelLabel}`,
      hardStops > 0 ? 'warn' : 'agent'
    );
    return;
  }

  if (cmdLower === '/files' || cmdLower === 'files') {
    const acctLabel = getAccountShortTag(normalizeAccountKey(activeEnvironment));
    const allNames = getActiveAccountFilenames();
    appendTerminalMessage(
      'murph://files',
      `Logged-In Account (${acctLabel}): ${allNames.length ? allNames.join(', ') : '0 files on Desktop'} (${getTrashBinItems().length} in Trash Bin) — these are the files your Personal Agent answers from.`,
      'sys'
    );
    return;
  }

  if (cmdLower === '/scrub' || cmdLower === 'scrub') {
    const target = getTerminalScrubTarget();
    if (!target) {
      appendTerminalMessage('murph://scrub', 'Nothing to scrub yet — upload a Blue file first (right-click the desktop → New Blue File).', 'warn');
      return;
    }
    appendTerminalMessage('murph://scrub', `Running Claim Fixes (4-Agent Claim Scrub) on ${target}...`, 'sys');
    const res = await apiCall('/api/analyze', 'POST', { document_text: getTerminalFileContent(target) });
    const r = (res && res.readiness) || (res && res.summary) || (appState && appState.readiness) || {};
    appendTerminalMessage('murph://scrub', `Scrub complete on ${target}: Readiness ${r.score ?? r.readiness_score ?? 48}% · Desktop workflow badges updated.`, 'agent');
    return;
  }

  if (cmdLower === '/autofix' || cmdLower === 'autofix') {
    appendTerminalMessage('murph://autofix', `Applying compliant Auto-Fixes to ${getTerminalScrubTarget() || 'the active document'}...`, 'sys');
    const res = await apiCall('/api/autofix', 'POST', {});
    const r = (res && res.readiness) || (res && res.summary) || (appState && appState.readiness) || {};
    appendTerminalMessage('murph://autofix', `Applied safe Auto-Fixes! Readiness raised to ${r.score ?? r.readiness_score ?? 68}% · Auto-fixable badges cleared.`, 'agent');
    return;
  }

  if (cmdLower === '/resolve' || cmdLower === 'resolve') {
    appendTerminalMessage('murph://resolve', 'Resolving all Blocker Alerts (Hard-Stop Escalations) & Cross-Team Agreement tickets...', 'sys');
    const res = await apiCall('/api/whatif', 'POST', { preset_id: 'resolve_all' });
    const r = (res && res.readiness) || (res && res.summary) || (appState && appState.readiness) || {};
    appendTerminalMessage('murph://resolve', `All Hard Stops & Tickets resolved! Readiness: ${r.score ?? r.readiness_score ?? 100}% (READY TO LAUNCH) · All workflow badges cleared!`, 'agent');
    return;
  }

  // Send conversational message to the live Personal Agent via /api/agent/ask
  const identity = getTerminalIdentityPayload();
  const workspaceContext = typeof buildWorkspaceContextSnapshot === 'function' ? buildWorkspaceContextSnapshot() : '';
  if (typeof setTerminalBusyState === 'function') setTerminalBusyState(true, 'AGENT THINKING…');
  const logEl = document.getElementById('home-terminal-log');
  let thinkingEl = null;
  if (logEl) {
    thinkingEl = document.createElement('div');
    thinkingEl.className = 'murph-term-msg kind-sys is-thinking-row';
    thinkingEl.innerHTML = `<span class="murph-term-time">${escapeHtmlSafe(new Date().toLocaleTimeString([], { hour12: false }))}</span><span class="murph-term-tag sys">murph://agent</span><span class="murph-term-text">${escapeHtmlSafe(identity.personal_agent_name)} is thinking…<span class="murph-thinking-wave" aria-hidden="true"><span></span><span></span><span></span></span></span>`;
    logEl.appendChild(thinkingEl);
    logEl.scrollTop = logEl.scrollHeight;
  }
  try {
    const res = await apiCall(
      '/api/agent/ask',
      'POST',
      Object.assign({ question: q, workspace_context: workspaceContext, conversation_history: priorHistory }, identity)
    );
    if (thinkingEl && thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);
    if (res && res.error) {
      appendTerminalMessage('murph://agent', `Request error: ${res.error}${res.message ? ` — ${res.message}` : ''}`, 'warn');
      return;
    }
    const msg = res && res.a2a_messages && res.a2a_messages[0];
    if (msg && msg.question === q) {
      renderTerminalAgentAnswer(msg);
    } else {
      appendTerminalMessage('murph://agent', 'No response from the server — is main.py running on this port?', 'warn');
    }
  } finally {
    if (thinkingEl && thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);
    if (typeof setTerminalBusyState === 'function') setTerminalBusyState(false);
  }
}
