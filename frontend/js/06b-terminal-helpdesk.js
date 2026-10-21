/**
 * 06b-terminal-helpdesk.js — Interactive Agent Help Desk Sessions, Context & UI Actions
 * Per-account multi-turn conversation history, desktop-consistent workflow/ticket
 * context snapshot for the live Gemini Help Desk Agent, and UI window navigation.
 */

const makeChip = (cmd, label, contextual = false) => ({ cmd, label, contextual });
const DEFAULT_HELPDESK_CHIPS = [
  makeChip('Help', 'Help'),
  makeChip('My workflows', 'My workflows'),
  makeChip('Models', 'Models'),
];
const SEED_NODE_WF_TYPE_MAP = { '99:177': 'scrub', '99:188': 'policies', '99:199': 'escalations', '99:223': 'deliverables' };
const terminalSessionsByAccount = new Map();

function updateTerminalHeaderBar(explicitAccountKey) {
  const acctKey = normalizeAccountKey(explicitAccountKey || activeEnvironment);
  const profile = getAccountProfileByKey(acctKey);
  setNodeText('99:242', (profile && profile.personalAgentName) || 'Personal Agent');
}

async function handleTerminalModelCommand(rawInput) {
  const arg = String(rawInput || '')
    .replace(/^\/?models?\b/i, '')
    .trim()
    .toLowerCase();
  if (!arg) {
    const cur = GEMINI_MODELS[activeGeminiModel] || GEMINI_MODELS['gemini-3.8-flash'];
    const lines = Object.entries(GEMINI_MODELS).map(
      ([id, m]) => `• ${id === activeGeminiModel ? '[ACTIVE] ' : ''}${m.name} (${id}) — ${m.latency}`
    );
    appendTerminalMessage(
      'murph://gemini',
      `Active Help Desk & Runtime Model: ${cur.name} (${activeGeminiModel})\nAvailable Gemini 3.x Models:\n${lines.join('\n')}\nType /model <model-id> (e.g. /model flash, /model pro, /model lite, /model 3.5) or use the top-bar Gemini selector to switch.`,
      'agent'
    );
    renderTerminalChips();
    return;
  }
  const aliasMap = {
    '3.8': 'gemini-3.8-flash',
    'flash': 'gemini-3.8-flash',
    '3.8-flash': 'gemini-3.8-flash',
    'pro': 'gemini-3.1-pro-preview',
    '3.1': 'gemini-3.1-pro-preview',
    '3.1-pro': 'gemini-3.1-pro-preview',
    'gemini-3.1-pro': 'gemini-3.1-pro-preview',
    'lite': 'gemini-3.5-flash-lite',
    'flash-lite': 'gemini-3.5-flash-lite',
    '3.5-flash-lite': 'gemini-3.5-flash-lite',
    '3.5': 'gemini-3.5-flash',
    '3.5-flash': 'gemini-3.5-flash',
  };
  const resolved =
    (GEMINI_MODELS[arg] && arg) ||
    aliasMap[arg] ||
    (typeof LEGACY_GEMINI_MODEL_MAP !== 'undefined' && LEGACY_GEMINI_MODEL_MAP[arg]) ||
    Object.keys(GEMINI_MODELS).find((k) => k.includes(arg) || GEMINI_MODELS[k].name.toLowerCase().includes(arg));
  if (!resolved || !GEMINI_MODELS[resolved]) {
    appendTerminalMessage(
      'murph://gemini',
      `Unknown model "${arg}". Choose one of: ${Object.keys(GEMINI_MODELS).join(', ')}`,
      'warn'
    );
    renderTerminalChips();
    return;
  }
  applyGeminiModelToDOM(resolved, appState && appState.llm_status);
  await apiCall('/api/llm/configure', 'POST', { model: resolved });
  const info = GEMINI_MODELS[resolved];
  appendTerminalMessage(
    'murph://gemini',
    `Switched Help Desk & Runtime model to ${info.name} (${resolved} · ${info.latency}). All subsequent terminal and workspace agent calls now use ${info.name}.`,
    'agent'
  );
  renderTerminalChips();
}

function handleTerminalWorkflowsCommand() {
  const acctKey = normalizeAccountKey(activeEnvironment);
  const profile = getAccountProfileByKey(acctKey);
  const wfs = getHelpdeskVisibleWorkflows();
  const files = getActiveAccountFilenames();
  const agentHandle =
    String(profile.personalAgentName || 'personal agent')
      .split("'")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'personal';
  if (!wfs.length) {
    appendTerminalMessage(
      `agent://${agentHandle}`,
      `You currently have 0 workflows on your desktop (${profile.displayName}).\n• Right-click anywhere on the desktop → New Workflow to create a yellow workflow folder.\n• Workflow types: Claim Fixes, Cross-Team Agreement, Blocker Alerts, Policy & Rates Sync, Deliverables.`,
      'agent'
    );
    renderTerminalChips();
    return;
  }
  const lines = wfs.map((w, idx) => {
    const taggedPart = w.taggedUsers && w.taggedUsers.length ? ` · tagged: ${w.taggedUsers.join(', ')}` : '';
    return `${idx + 1}. ${w.title} (${w.typeName}) — ${w.statusLabel}${taggedPart}`;
  });
  appendTerminalMessage(
    `agent://${agentHandle}`,
    `Visible Desktop Workflows for ${profile.displayName} (${wfs.length}):\n${lines.join('\n')}\nActive Blue Files (${files.length}): ${files.join(', ') || 'none'}\nAsk me to "open <workflow name>" or ask any question about these workflows.`,
    'agent'
  );
  renderTerminalChips();
}

function getHelpdeskWorkflowTypeMeta(wfTypeKey) {
  const list = typeof MURPH_WORKFLOW_TYPES !== 'undefined' ? MURPH_WORKFLOW_TYPES : [];
  return list.find((t) => t.key === wfTypeKey) || {
    key: wfTypeKey || 'scrub', name: 'Claim Fixes', legacy: 'Claim Scrub', popup: '136:468',
    desc: 'Audits claims against team policy packs and generates 1-click auto-fixes.',
  };
}

function getActiveTerminalSession(explicitAccountKey) {
  const acctKey = normalizeAccountKey(explicitAccountKey || activeEnvironment);
  if (!terminalSessionsByAccount.has(acctKey)) {
    terminalSessionsByAccount.set(acctKey, {
      accountKey: acctKey,
      messages: [],
      chips: DEFAULT_HELPDESK_CHIPS.slice(),
      history: [],
      historyIdx: -1,
      greeted: false,
    });
  }
  return terminalSessionsByAccount.get(acctKey);
}

function renderTerminalChips() {
  const session = getActiveTerminalSession();
  const nextChips = DEFAULT_HELPDESK_CHIPS.slice();
  session.chips = nextChips;
  const bar = document.getElementById('home-terminal-chips');
  if (!bar) return;
  bar.innerHTML = nextChips
    .map(
      (c, idx) =>
        `<button type="button" class="murph-term-chip" style="--chip-delay: ${idx * 65}ms" data-api-action="terminal-quick-cmd" data-cmd="${escapeHtmlSafe(c.cmd)}">${escapeHtmlSafe(c.label)}</button>`
    )
    .join('');
}

function renderTerminalMessageNode(logEl, entry, opts) {
  if (!logEl || !entry) return;
  const options = opts || {};
  const line = document.createElement('div');
  line.className = `murph-term-msg kind-${entry.kind || 'agent'}`;
  if (options.delayMs > 0) {
    line.style.setProperty('--msg-delay', `${options.delayMs}ms`);
  }
  const tagClass = entry.kind === 'user' ? 'user' : entry.kind === 'warn' ? 'warn' : entry.kind === 'agent' ? 'ok' : 'sys';
  const fullText = String(entry.text || '');
  if (options.stream && fullText.length > 0) {
    line.classList.add('is-streaming');
    line.innerHTML =
      `<span class="murph-term-time">${escapeHtmlSafe(entry.time)}</span>` +
      `<span class="murph-term-tag ${tagClass}">${escapeHtmlSafe(entry.source)}</span>` +
      `<span class="murph-term-text"><span class="murph-term-typed"></span><span class="murph-term-rest">${escapeHtmlSafe(fullText)}</span></span>`;
    logEl.appendChild(line);
    const typedEl = line.querySelector('.murph-term-typed');
    const restEl = line.querySelector('.murph-term-rest');
    const totalLen = fullText.length;
    const stepSize = Math.max(2, Math.ceil(totalLen / 20));
    let pos = 0;
    const stepTimer = setInterval(() => {
      if (!line.isConnected || !typedEl || !restEl) {
        clearInterval(stepTimer);
        return;
      }
      pos = Math.min(totalLen, pos + stepSize);
      typedEl.textContent = fullText.slice(0, pos);
      restEl.textContent = fullText.slice(pos);
      logEl.scrollTop = logEl.scrollHeight;
      if (pos >= totalLen) {
        clearInterval(stepTimer);
        setTimeout(() => {
          if (line.isConnected) line.classList.remove('is-streaming');
        }, 280);
      }
    }, 26);
    return;
  }
  line.innerHTML = `<span class="murph-term-time">${escapeHtmlSafe(entry.time)}</span><span class="murph-term-tag ${tagClass}">${escapeHtmlSafe(entry.source)}</span><span class="murph-term-text">${escapeHtmlSafe(fullText)}</span>`;
  logEl.appendChild(line);
}

function seedAccountGreeting(session) {
  const profile = getAccountProfileByKey(session.accountKey);
  session.greeted = true;
  appendTerminalMessage(
    'murph://helpdesk',
    `Agent Help Desk online for ${profile.displayName} (${profile.email}). Chat naturally with ${profile.personalAgentName} about your workflows, launch blockers, tickets, or files — or click a prompt chip below.`,
    'sys'
  );
  if (typeof renderTerminalGroundingBanner === 'function') renderTerminalGroundingBanner();
  renderTerminalChips(DEFAULT_HELPDESK_CHIPS.slice());
}

function switchTerminalTranscript(accountKey) {
  const acctKey = normalizeAccountKey(accountKey || activeEnvironment);
  updateTerminalHeaderBar(acctKey);
  const session = getActiveTerminalSession(acctKey);
  const logEl = document.getElementById('home-terminal-log');
  if (!logEl) return;
  logEl.innerHTML = '';
  if (!session.greeted || session.messages.length === 0) {
    window._murphSuppressTerminalAudio = true;
    try {
      seedAccountGreeting(session);
    } finally {
      window._murphSuppressTerminalAudio = false;
    }
  } else {
    session.messages.forEach((m, idx) => renderTerminalMessageNode(logEl, m, { delayMs: Math.min(idx * 45, 270), stream: false }));
    logEl.scrollTop = logEl.scrollHeight;
    renderTerminalChips(session.chips);
  }
}

function syncTerminalForActiveAccount() {
  const acctKey = normalizeAccountKey(activeEnvironment);
  updateTerminalHeaderBar(acctKey);
  const session = getActiveTerminalSession(acctKey);
  const logEl = document.getElementById('home-terminal-log');
  if (logEl && (!session.greeted || logEl.children.length === 0)) switchTerminalTranscript(acctKey);
}

function clearAllTerminalSessions() {
  terminalSessionsByAccount.clear();
  terminalLiveGeminiWarned = false;
  switchTerminalTranscript(normalizeAccountKey(activeEnvironment));
}

function setTerminalBusyState(isBusy, statusLabel) {
  const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
  const composerEl = document.querySelector('#screen-home [data-node-id="99:264"]');
  if (consoleEl) consoleEl.classList.toggle('is-busy', Boolean(isBusy));
  if (composerEl) composerEl.classList.toggle('is-busy', Boolean(isBusy));
  setNodeText('99:246', isBusy ? statusLabel || 'AGENT THINKING…' : 'AGENT READY');
}

function getHelpdeskVisibleWorkflows() {
  const env = normalizeAccountKey(activeEnvironment);
  const isIsolated = isCustomAccountKey(env);
  const claims = (appState && appState.claims) || [];
  const unresolved = claims.filter((c) => c.status !== 'resolved');
  const autoFixes = claims.filter((c) => c.severity === 'auto_fix' && c.status !== 'resolved');
  const hardStops = claims.filter((c) => c.severity === 'hard_stop' && c.status !== 'resolved');
  const countByType = {
    scrub: isIsolated ? 0 : unresolved.length,
    policies: isIsolated ? 0 : autoFixes.length,
    escalations: isIsolated ? 0 : hardStops.length,
    tickets: isIsolated ? 0 : hardStops.length,
    deliverables: isIsolated ? 0 : unresolved.length,
  };
  const results = [];

  if (!isIsolated) {
    Object.entries(SEED_WORKFLOW_NODE_MAP).forEach(([nodeId, meta]) => {
      if (!isSeedWorkflowVisibleForEnv(meta, env) || isSeedItemHidden(nodeId, env)) return;
      const wfType = SEED_NODE_WF_TYPE_MAP[nodeId] || 'scrub';
      const typeMeta = getHelpdeskWorkflowTypeMeta(wfType);
      const openCount = countByType[wfType] ?? 0;
      const desktopEl = document.querySelector(`#screen-home [data-node-id="${nodeId}"]`);
      results.push({
        id: nodeId, title: meta.title, subtitle: meta.subtitle, wfType, typeName: typeMeta.name,
        popupId: meta.popupId, openCount,
        statusLabel: openCount > 0 ? `${openCount} open item(s)` : '✓ 0 open (all clear)',
        taggedUsers: [], files: getActiveAccountFilenames(), isSeed: true, desktopEl,
      });
    });
  }

  const resolveWfCreatorEnv = (w) => {
    const rawEnv = String(w.creator_env || w.environment || '').toLowerCase();
    if (rawEnv === 'cloud' || rawEnv === 'dm' || isCustomAccountKey(normalizeAccountKey(rawEnv))) return normalizeAccountKey(rawEnv);
    return isDmAccountLdap(w.creator_ldap) || w.creator_user_id === 'user_brand' ? 'dm' : 'cloud';
  };
  const ownerEmailLower = String((getAccountProfileByKey(env) || {}).email || '').toLowerCase();
  const isWfVisibleHere = (w, wEnv) => {
    if (wEnv === env) return true;
    if (w.creator_user_id && normalizeAccountKeyOrEmpty(w.creator_user_id) === env && isIsolated) return true;
    const tagged = (w.tagged_users || []).map((t) => String((t && (t.email || t.ldap)) || t || '').toLowerCase());
    if (isIsolated || isCustomAccountKey(wEnv)) return Boolean(ownerEmailLower) && tagged.includes(ownerEmailLower);
    return Boolean(w.shared_across_environments || tagged.length > 0);
  };

  const mergedCustom = new Map();
  [((appState && appState.custom_workflows) || []), getStoredCustomWorkflows()].forEach((list) => {
    list.forEach((w) => {
      if (!w || !w.folder_name) return;
      const wEnv = resolveWfCreatorEnv(w);
      if (!isWfVisibleHere(w, wEnv) || isCustomItemInTrash('custom-workflow', wEnv, w.folder_name)) return;
      const key = String(w.folder_name).trim().toUpperCase();
      if (!mergedCustom.has(key)) mergedCustom.set(key, Object.assign({}, w, { creator_env: wEnv }));
    });
  });

  mergedCustom.forEach((w, upperKey) => {
    const wfType = w.workflow_type || 'scrub';
    const typeMeta = getHelpdeskWorkflowTypeMeta(wfType);
    const slug = upperKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const desktopEl = document.querySelector(`#screen-home [data-node-id="custom-wf-${slug}"]`);
    const tagged = (w.tagged_users || []).map((t) => String((t && (t.email || t.ldap)) || t || '').trim()).filter(Boolean);
    const openCount = countByType[wfType] ?? 0;
    const statusLabel = tagged.length
      ? `settled w/ ${tagged.map((u) => '@' + u.split('@')[0]).join(', ')}`
      : openCount > 0 ? `${openCount} open item(s)` : 'active workflow';
    results.push({
      id: `custom-wf-${slug}`, title: String(w.folder_name).toUpperCase(),
      subtitle: w.description || typeMeta.desc, wfType, typeName: typeMeta.name,
      popupId: w.target_popup_id || typeMeta.popup || '136:468', openCount, statusLabel,
      taggedUsers: tagged, files: Array.isArray(w.selected_files) ? w.selected_files : [],
      prompt: w.prompt || '', isSeed: false, desktopEl,
    });
  });
  return results;
}

function getHelpdeskVisibleTickets() {
  const env = normalizeAccountKey(activeEnvironment);
  const myEmail = normalizeBuiltinAccountEmail(getAccountProfileByKey(env).email);
  const allTickets = (appState && appState.agent_tickets) || [];
  if (!isCustomAccountKey(env)) return allTickets;
  return allTickets.filter((t) => {
    const req = normalizeBuiltinAccountEmail(t.requester_ldap || (t.requester_user && t.requester_user.ldap) || '');
    if (req && req === myEmail) return true;
    const parts = [].concat(t.participating_users || [], t.target_users || []).map((u) => normalizeBuiltinAccountEmail((u && (u.ldap || u.email)) || u || ''));
    return parts.includes(myEmail);
  });
}

function buildWorkspaceContextSnapshot() {
  const env = normalizeAccountKey(activeEnvironment);
  const profile = getAccountProfileByKey(env);
  const wfs = getHelpdeskVisibleWorkflows();
  const tkts = getHelpdeskVisibleTickets();
  const files = getActiveAccountFilenames();
  const wfSummary = wfs.length
    ? wfs.map((w) => `${w.title} [type=${w.typeName}, popup_id=${w.popupId}, status=${w.statusLabel}${w.taggedUsers.length ? `, tagged=${w.taggedUsers.join(',')}` : ''}]`).join('; ')
    : '0 workflows on desktop';
  const tktSummary = tkts.length
    ? tkts.map((t) => {
        const cpText = t.compromise_proposal && (t.compromise_proposal.compromise_summary || t.compromise_proposal.summary);
        return `${t.id} "${t.title}" [${t.status}]${cpText ? ` -> ${cpText.slice(0, 90)}` : ''}`;
      }).join('; ')
    : '0 open tickets';
  let blockerLine = 'Isolated workspace (0 launch blockers).';
  if (!isCustomAccountKey(env)) {
    const r = (appState && appState.readiness) || (appState && appState.summary) || {};
    const claims = ((appState && appState.claims) || []).filter((c) => c.status !== 'resolved');
    const feas = (appState && appState.feasibility) || {};
    blockerLine = `Readiness ${r.score ?? r.readiness_score ?? 48}% (${r.label || r.launch_status || 'BLOCKED'}). Budget $${feas.projected_spend || 82000}/$${feas.allocated_budget || 60000}. Open claims (${claims.length}): ${claims.map((c) => `${c.id} [${c.severity}] ${c.category}: ${c.issue}`).join(' | ')}.`;
  }
  return `Account: ${profile.displayName} (${profile.email}, env=${env})\nDesktop Blue Files: ${files.join(', ') || 'none'}\nVisible Desktop Workflows: ${wfSummary}\nCross-Team Agreement Tickets: ${tktSummary}\nLaunch Status: ${blockerLine}`.slice(0, 1450);
}

function buildTerminalConversationHistory() {
  const session = getActiveTerminalSession();
  const turns = [];
  (session.messages || []).forEach((m) => {
    if (!m || !m.text) return;
    if (m.source === 'murph://agent' && m.text.includes('grounded in')) return;
    if (m.kind === 'user') {
      turns.push({ role: 'user', text: String(m.text) });
    } else if (m.kind === 'agent' && String(m.source || '').startsWith('agent://')) {
      turns.push({ role: 'model', text: String(m.text) });
    }
  });
  return turns.slice(-10);
}

function executeAgentUiAction(uiAction) {
  if (!uiAction || uiAction.action !== 'open_popup' || !uiAction.popup_id) return;
  const popupId = String(uiAction.popup_id).trim();
  const targetTitle = String(uiAction.target_title || '').trim();
  const wfs = getHelpdeskVisibleWorkflows();
  const matchedWf = targetTitle
    ? wfs.find((w) => w.title.toLowerCase() === targetTitle.toLowerCase() || w.title.toLowerCase().includes(targetTitle.toLowerCase()))
    : wfs.find((w) => w.popupId === popupId);
  if (popupId === '136:341') {
    const files = getActiveAccountFilenames();
    const matchedFile = files.find((f) => f.toLowerCase() === targetTitle.toLowerCase() || f.toLowerCase().includes(targetTitle.toLowerCase())) || files[0] || targetTitle;
    openPopup('136:341', matchedFile || null);
    return;
  }
  openPopup(popupId, targetTitle || (matchedWf && matchedWf.title) || null, null, (matchedWf && matchedWf.desktopEl) || null);
}

function triggerTerminalRunLaunch() {
  const runBtn = document.getElementById('home-terminal-run-btn');
  if (!runBtn) return;
  runBtn.classList.remove('is-launching');
  void runBtn.offsetWidth;
  runBtn.classList.add('is-launching');
  setTimeout(() => runBtn.classList.remove('is-launching'), 520);
}

function initHelpdeskComposer() {
  const inputEl = document.getElementById('home-terminal-input');
  const composerEl = document.querySelector('#screen-home [data-node-id="99:264"]');
  if (!inputEl || inputEl.dataset.helpdeskBound === '1') return;
  inputEl.dataset.helpdeskBound = '1';
  let typingTimer = null;
  const syncHeight = () => {
    inputEl.style.height = '20px';
    inputEl.style.height = `${Math.min(64, Math.max(20, inputEl.scrollHeight))}px`;
    if (composerEl) {
      composerEl.classList.add('is-typing');
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => composerEl.classList.remove('is-typing'), 620);
    }
  };
  inputEl.addEventListener('input', syncHeight);
  inputEl.addEventListener('keydown', async (e) => {
    const session = getActiveTerminalSession();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (composerEl) composerEl.classList.remove('is-typing');
      triggerTerminalRunLaunch();
      await handleApiAction('home-console-run', inputEl);
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && inputEl.selectionStart === 0 && session.history.length > 0) {
      e.preventDefault();
      session.historyIdx = session.historyIdx < 0 ? session.history.length - 1 : Math.max(0, session.historyIdx - 1);
      inputEl.value = session.history[session.historyIdx] || '';
      syncHeight();
    } else if (e.key === 'ArrowDown' && !e.shiftKey && session.historyIdx >= 0) {
      e.preventDefault();
      session.historyIdx = session.historyIdx + 1 >= session.history.length ? -1 : session.historyIdx + 1;
      inputEl.value = session.historyIdx < 0 ? '' : session.history[session.historyIdx] || '';
      syncHeight();
    }
  });
  if (composerEl) {
    composerEl.addEventListener('click', (e) => {
      if (!e.target.closest('[data-api-action="home-console-run"]')) inputEl.focus();
    });
  }
}

async function handleTerminalUiAction(action, triggerEl) {
  if (action === 'terminal-toggle-expand') {
    const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
    if (consoleEl) {
      const willExpand = !consoleEl.classList.contains('is-expanded');
      consoleEl.classList.toggle('is-expanded', willExpand);
      if (!willExpand) {
        delete consoleEl.dataset.w;
        delete consoleEl.dataset.h;
        consoleEl.style.width = '560px';
        consoleEl.style.height = '310px';
      }
      if (typeof saveDesktopPositions === 'function') saveDesktopPositions();
      const logEl = document.getElementById('home-terminal-log');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }
    return true;
  }
  if (action === 'terminal-clear') {
    await executeTerminalCommand('/clear', false);
    return true;
  }
  if (action === 'terminal-quick-cmd') {
    await executeTerminalCommand((triggerEl && triggerEl.getAttribute('data-cmd')) || 'My workflows', false);
    return true;
  }
  return false;
}
