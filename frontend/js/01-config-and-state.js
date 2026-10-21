/**
 * 01-config-and-state.js — Configuration, Storage Keys, Runtime State & API Core
 * Centralizes cached DOM references, localStorage keys, seed file/workflow maps,
 * fallback Markdown content, and core DOM/HTTP helpers.
 */

const screens = {
  intro: document.getElementById('screen-intro'),
  lock: document.getElementById('screen-lock'),
  signup: document.getElementById('screen-signup'),
  home: document.getElementById('screen-home'),
};

const hudButtons = Array.from(document.querySelectorAll('[data-switch-screen]'));
const hudStatusBtn = document.getElementById('hud-backend-status');
const hudEnvBtn = document.getElementById('hud-env-switcher');
const hudModelBtn = document.getElementById('hud-model-switcher');
const modelMenuEl = document.getElementById('gemini-model-menu');
const userSettingsMenuEl = document.getElementById('user-settings-dropdown');
const apiKeyInputEl = document.getElementById('gemini-api-key-input');
const popupBackdrop = document.getElementById('os-popup-backdrop');
const popupWrappers = Array.from(document.querySelectorAll('.os-popup-wrapper'));
const floatingWindows = Array.from(document.querySelectorAll('.os-floating-window'));
function getAllFloatingWindows() {
  return Array.from(document.querySelectorAll('.os-floating-window'));
}
const boardPlane = document.getElementById('figma-board-plane');
const toastEl = document.getElementById('murph-toast');
const filePicker = document.getElementById('hidden-file-picker');

const FLOATING_POPUP_SET = new Set([
  '136:341', // Blue Shared File Editor
  '145:1122', // Blue DRIVE Folder
  '136:468', // Yellow CLAIM SCRUB Folder
  '136:579', // Yellow POLICIES Folder
  '136:417', // Yellow HARD-STOP ESCALATIONS Folder
  '136:521', // Yellow DELIVERABLES Folder
  'trash:bin', 'guide:welcome', // Trash Bin / Welcome Guide app windows
]);
let topFloatingZIndex = 3100;

const GEMINI_MODELS = {
  'gemini-3.8-flash': { id: 'gemini-3.8-flash', label: 'GEMINI 3.8 FLASH · v3.8 ▾', hudLabel: '✦ Gemini 3.8 Flash ▾', name: 'Gemini 3.8 Flash', latency: '18ms' },
  'gemini-3.1-pro-preview': { id: 'gemini-3.1-pro-preview', label: 'GEMINI 3.1 PRO · PREVIEW ▾', hudLabel: '✦ Gemini 3.1 Pro ▾', name: 'Gemini 3.1 Pro', latency: '36ms' },
  'gemini-3.5-flash-lite': { id: 'gemini-3.5-flash-lite', label: 'GEMINI 3.5 FLASH-LITE ▾', hudLabel: '✦ Gemini 3.5 Flash-Lite ▾', name: 'Gemini 3.5 Flash-Lite', latency: '11ms' },
  'gemini-3.5-flash': { id: 'gemini-3.5-flash', label: 'GEMINI 3.5 FLASH · v3.5 ▾', hudLabel: '✦ Gemini 3.5 Flash ▾', name: 'Gemini 3.5 Flash', latency: '21ms' },
};
const LEGACY_GEMINI_MODEL_MAP = { 'gemini-2.5-flash': 'gemini-3.8-flash', 'gemini-2.5-pro': 'gemini-3.1-pro-preview', 'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite', 'gemini-2.0-flash': 'gemini-3.5-flash', 'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite', 'gemini-1.5-pro': 'gemini-3.8-flash', 'gemini-1.5-flash': 'gemini-3.8-flash' };
function normalizeGeminiModelId(modelId) {
  const raw = String(modelId || '').trim().toLowerCase();
  if (!raw) return 'gemini-3.8-flash';
  if (LEGACY_GEMINI_MODEL_MAP[raw]) return LEGACY_GEMINI_MODEL_MAP[raw];
  if (GEMINI_MODELS[raw]) return raw;
  if (raw.includes('pro')) return 'gemini-3.1-pro-preview';
  if (raw.includes('lite')) return 'gemini-3.5-flash-lite';
  if (raw.includes('3.5')) return 'gemini-3.5-flash';
  return 'gemini-3.8-flash';
}
const MODEL_STORAGE_KEY = 'murph_selected_gemini_model_v1';
const CUSTOM_FILES_STORAGE_KEY = 'murph_custom_files_v1';
const CUSTOM_WORKFLOWS_STORAGE_KEY = 'murph_custom_workflows_v1';
const DUAL_AUTH_STORAGE_KEY = 'murph_dual_auth_state_v1';
const ACCOUNTS_STORAGE_KEY = 'murph_registered_accounts_v1';
const ACTIVE_ENV_STORAGE_KEY = 'murph_active_environment_v1';
const TRASH_BIN_STORAGE_KEY = 'murph_trash_bin_items_v1';
const DELETED_SEEDS_STORAGE_KEY = 'murph_permanently_deleted_seeds_v1';
const USER_SETTINGS_STORAGE_KEY = 'murph_user_settings_v1';

const SEED_FILE_IDS = new Set(['FILE-PM-101', 'FILE-LEGAL-102', 'FILE-DEAL-103', 'FILE-BRAND-104', 'FILE-OWNER-105']);
// Seed Blue files were renamed with a `DEMO ` prefix on 2026-10-03; legacy names are kept so stale
// server rows / browser sessions keep resolving to the same seed tile instead of rendering as a custom file.
const LEGACY_SEED_FILENAME_MAP = {
  'LAUNCH BRIEF.md': 'DEMO LAUNCH BRIEF.md',
  'PRODUCT PRD.md': 'DEMO PRODUCT PRD.md',
  'NDA VAULT.md': 'DEMO NDA VAULT.md',
  'BRAND RULES.md': 'DEMO BRAND RULES.md',
};
const SEED_FILENAMES_UPPER = new Set([
  'DEMO LAUNCH BRIEF.MD', 'DEMO PRODUCT PRD.MD', 'DEMO NDA VAULT.MD', 'PSO RATE CARD.CSV', 'DEMO BRAND RULES.MD',
  ...Object.keys(LEGACY_SEED_FILENAME_MAP).map((n) => n.toUpperCase()),
]);
function normalizeSeedFilename(name) {
  const raw = String(name || '').trim();
  const hit = Object.keys(LEGACY_SEED_FILENAME_MAP).find((old) => old.toUpperCase() === raw.toUpperCase());
  return hit ? LEGACY_SEED_FILENAME_MAP[hit] : raw;
}

// Environment mapping for the seed Blue desktop files in Row 1 (99:107)
// Cloud account: DEMO PRODUCT PRD.md (99:119), DEMO NDA VAULT.md (99:130)
// DM (Marketing) account: DEMO LAUNCH BRIEF.md (99:108), DEMO BRAND RULES.md (99:152)
// PSO RATE CARD.csv (99:141) stays a backend knowledge file for the Commercial agent (`hidden: true`).
const SEED_DESKTOP_NODE_ENV_MAP = {
  '99:108': { env: 'dm', filename: 'DEMO LAUNCH BRIEF.md', pillNode: '154:104', fileId: 'FILE-OWNER-105' },
  '99:119': { env: 'cloud', filename: 'DEMO PRODUCT PRD.md', pillNode: '154:108', fileId: 'FILE-PM-101' },
  '99:130': { env: 'cloud', filename: 'DEMO NDA VAULT.md', pillNode: '154:112', fileId: 'FILE-LEGAL-102' },
  '99:141': { env: 'cloud', filename: 'PSO RATE CARD.csv', pillNode: '154:116', fileId: 'FILE-DEAL-103', hidden: true },
  '99:152': { env: 'dm', filename: 'DEMO BRAND RULES.md', pillNode: '154:120', fileId: 'FILE-BRAND-104' },
};
function isSeedBlueFileVisibleForEnv(meta, env) {
  return Boolean(meta) && !meta.hidden && meta.env === env;
}

// Seed Yellow workflow folders in Row 2 (99:176). `envs` lists the built-in accounts that see the folder:
// Cloud = DEMO CLAIM FIX + DEMO DELIVERABLES, DM = DEMO CLAIM FIX + DEMO BLOCKERS (user decision 2026-10-03).
const SEED_WORKFLOW_NODE_MAP = {
  '99:177': { title: 'DEMO CLAIM FIX', subtitle: 'Claim Fixes · Auto-Fixes for Launch Copy', popupId: '136:468', envs: ['cloud', 'dm'] },
  '99:188': { title: 'POLICY & RATES SYNC', subtitle: 'Policy & Rates · Team Rules & Budget Simulator', popupId: '136:579', envs: [] },
  '99:199': { title: 'DEMO BLOCKERS', subtitle: 'Blocker Alerts · Decisions Waiting on Sign-Off', popupId: '136:417', envs: ['dm'] },
  '99:223': { title: 'DEMO DELIVERABLES', subtitle: 'Deliverables · Ready-to-Share Launch Files', popupId: '136:521', envs: ['cloud'] },
};
function isSeedWorkflowVisibleForEnv(meta, env) {
  return Boolean(meta) && Array.isArray(meta.envs) && meta.envs.includes(env);
}

function getTrashBinItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRASH_BIN_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function saveTrashBinItems(items) {
  try { localStorage.setItem(TRASH_BIN_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (_) {}
}

function getPermanentlyDeletedSeeds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_SEEDS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function savePermanentlyDeletedSeeds(arr) {
  try { localStorage.setItem(DELETED_SEEDS_STORAGE_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (_) {}
}

function escapeHtmlSafe(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const escapeHtml = escapeHtmlSafe;

function setDesktopItemVisible(el, isVisible) {
  if (!el) return;
  if (isVisible) {
    el.classList.remove('is-desktop-hidden');
    el.style.removeProperty('display');
    el.style.display = 'flex';
  } else {
    el.classList.add('is-desktop-hidden');
    el.style.setProperty('display', 'none', 'important');
  }
}

function isSeedItemHidden(nodeId, envKey) {
  const trashList = getTrashBinItems();
  const deletedSeeds = getPermanentlyDeletedSeeds();
  if (deletedSeeds.includes(nodeId) || (envKey && deletedSeeds.includes(`${envKey}::${nodeId}`))) return true;
  return trashList.some(
    (item) =>
      item.nodeId === nodeId &&
      (item.itemKind === 'seed-file' ||
        item.itemKind === 'seed-drive' ||
        (item.itemKind === 'seed-workflow' && (!item.environment || !envKey || item.environment === envKey)))
  );
}

function isCustomItemInTrash(itemKind, envKey, title) {
  const normTitle = String(title || '').trim().toUpperCase();
  const normEnv = String(envKey || 'cloud').toLowerCase();
  return getTrashBinItems().some((item) => {
    if (item.itemKind !== itemKind || String(item.title || '').trim().toUpperCase() !== normTitle) return false;
    if (itemKind === 'custom-workflow') return true;
    const itemEnv = String(item.environment || 'cloud').toLowerCase();
    return !normEnv || normEnv === 'all' || itemEnv === 'all' || itemEnv === normEnv;
  });
}

let activeGeminiModel = 'gemini-3.8-flash';
try {
  const savedModel = normalizeGeminiModelId(localStorage.getItem(MODEL_STORAGE_KEY));
  if (savedModel && GEMINI_MODELS[savedModel]) activeGeminiModel = savedModel;
} catch (_) {}

// Built-in demo account identities. Legacy ldaps (efch@ / alex.rivera@, pre-2026-10-03) are
// mapped forward so stale localStorage sessions and backend rows keep resolving after the rename.
const CLOUD_ACCOUNT_EMAIL = 'cloud_demo@google.com';
const DM_ACCOUNT_EMAIL = 'marketing_demo@google.com';
const DEMO_ACCOUNT_PASSWORD = 'P@ssword_123';
const LEGACY_ACCOUNT_EMAIL_MAP = { 'efch@google.com': CLOUD_ACCOUNT_EMAIL, 'alex.rivera@google.com': DM_ACCOUNT_EMAIL };
function normalizeBuiltinAccountEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (typeof getRegisteredAccountByEmail === 'function' && getRegisteredAccountByEmail(norm)) return norm;
  return LEGACY_ACCOUNT_EMAIL_MAP[norm] || norm;
}
function isDmAccountLdap(ldap) {
  const norm = normalizeBuiltinAccountEmail(ldap);
  return norm === DM_ACCOUNT_EMAIL || norm.startsWith('marketing_demo@') || norm.startsWith('alex.rivera@');
}

let activeLockTrack = 'cloud'; // 'cloud' | 'dm'
let lockAuthState = {
  cloud: { email: CLOUD_ACCOUNT_EMAIL, name: 'Cloud User', authenticated: false },
  dm: { email: DM_ACCOUNT_EMAIL, name: 'Marketing User', authenticated: false },
};
let activeEnvironment = 'cloud'; // 'cloud' | 'dm' (Active Logged-In User Account)

try {
  const savedAuth = localStorage.getItem(DUAL_AUTH_STORAGE_KEY);
  if (savedAuth) {
    const parsed = JSON.parse(savedAuth);
    if (parsed && typeof parsed === 'object') {
      if (parsed.cloud && parsed.cloud.email) {
        lockAuthState.cloud = {
          email: normalizeBuiltinAccountEmail(parsed.cloud.email),
          name: parsed.cloud.name || 'Cloud User',
          authenticated: Boolean(parsed.cloud.authenticated),
        };
      }
      if (parsed.dm && parsed.dm.email) {
        const rawDmName = parsed.dm.name === 'Digital Marketing (DM) User' ? 'Marketing User' : parsed.dm.name;
        lockAuthState.dm = {
          email: normalizeBuiltinAccountEmail(parsed.dm.email),
          name: rawDmName || 'Marketing User',
          authenticated: Boolean(parsed.dm.authenticated),
        };
      }
    }
  }
  const savedEnv = localStorage.getItem(ACTIVE_ENV_STORAGE_KEY);
  if (savedEnv === 'cloud' || savedEnv === 'dm') {
    activeEnvironment = savedEnv;
    activeLockTrack = savedEnv;
  } else if (savedEnv && /^user_[a-z0-9_]+$/.test(savedEnv)) {
    activeEnvironment = savedEnv; // Newly registered account (see 01b-accounts-registry.js)
    activeLockTrack = 'cloud';
  } else {
    activeEnvironment = 'cloud';
    activeLockTrack = 'cloud';
  }
} catch (_) {}

function saveDualAuthState() {
  try {
    localStorage.setItem(DUAL_AUTH_STORAGE_KEY, JSON.stringify(lockAuthState));
    localStorage.setItem(ACTIVE_ENV_STORAGE_KEY, normalizeAccountKey(activeEnvironment));
  } catch (_) {}
}

function getStoredAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveRegisteredAccountLocal(acctObj) {
  if (!acctObj || !acctObj.email) return;
  try {
    const list = getStoredAccounts().filter(
      (a) => String(a.email || '').toLowerCase() !== String(acctObj.email).toLowerCase()
    );
    list.push(acctObj);
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
}

let appState = null;
let isStaticHttpServer = false;
let activeBlueFileTitle = 'DEMO PRODUCT PRD.md';
let activeBlueFileScope = 'federated';
let activeEscalationOpt = 'approve_compromise';
let activeDeliverableTab = 'blog';
let activeWorkflowType = 'scrub';
let selectedWorkflowFiles = new Set([
  'DEMO LAUNCH BRIEF.md',
  'DEMO PRODUCT PRD.md',
  'DEMO NDA VAULT.md',
  'DEMO BRAND RULES.md',
]);
let selectedWorkflowTaggedUsers = new Set(['marketing_demo@google.com', 'priya.nair@google.com']);
let selectedTicketTaggedUsers = new Set();
const WORKFLOW_TAGGABLE_USERS = [
  { id: 'user_brand', ldap: 'marketing_demo@google.com', name: 'DM User', role: 'Cloud Brand Lead', teamAgent: 'brand_agent' },
  { id: 'user_legal', ldap: 'priya.nair@google.com', name: 'Priya Nair', role: 'Product Counsel', teamAgent: 'legal_agent' },
  { id: 'user_pm', ldap: 'maya.lin@google.com', name: 'Maya Lin', role: 'Staff Cloud PM', teamAgent: 'pm_agent' },
  { id: 'user_deal', ldap: 'marcus.vance@google.com', name: 'Marcus Vance', role: 'VP Cloud GTM Ops', teamAgent: 'commercial_agent' },
  { id: 'user_owner', ldap: 'cloud_demo@google.com', name: 'Cloud User', role: 'Cloud Launch Lead', teamAgent: 'pm_agent' },
];
let pendingUploadedFiles = [];
let signupUploadedFile = null;

function applyGeminiModelToDOM(modelId, llmStatus) {
  const mKey = normalizeGeminiModelId(modelId || activeGeminiModel);
  activeGeminiModel = mKey;
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, mKey);
  } catch (_) {}
  const info = GEMINI_MODELS[mKey] || GEMINI_MODELS['gemini-3.8-flash'];
  const isMenuOpen = Boolean(modelMenuEl && modelMenuEl.classList.contains('open'));
  setNodeText('99:98', isMenuOpen ? info.label.replace('▾', '▴') : info.label);
  setNodeText('99:101', info.latency);
  setNodeText('99:105', llmStatus && llmStatus.live_enabled ? 'LIVE API' : 'SECURE');
  if (hudModelBtn) hudModelBtn.textContent = info.hudLabel;
  document.querySelectorAll('.gemini-model-option').forEach((btn) => {
    const active = btn.getAttribute('data-model-id') === mKey;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (typeof updateTerminalHeaderBar === 'function') updateTerminalHeaderBar();
}


const BLUE_FILE_FALLBACKS = {
  'DEMO LAUNCH BRIEF.md': [
    '# Cloud Launch Brief — Oct 18 Keynote',
    '**Owner:** Growth + Product Marketing (cloud_demo@google.com)',
    '',
    '## Key Launch Claims',
    '- **Regions:** Available today in the US & Europe; Singapore opens in Public Preview until Nov 15.',
    '- **Speed:** Vertex AI Agent Builder on Google Cloud is 3.2x faster.',
    '- **Customer Story:** Cut compliance review times by 68% at a major global bank.',
    '- **Launch Demo:** Uses the standard $54k SAP Demo (fits our $60k budget).',
    '> Goal: Activate 40 customer partners in the first 30 days.',
  ],
  'DEMO PRODUCT PRD.md': [
    '# Product Rules — Vertex AI Agent Builder v2.4',
    '**Owner:** maya.lin@google.com (Product Manager)',
    '',
    '## What Can Be Claimed',
    '- **Live Regions:** US (Iowa) and Europe (Netherlands) are live today.',
    '- **Preview Until Nov 15:** Singapore region and voice encryption are in Public Preview until Nov 15, 2026.',
    '- **Verified Speed:** Confirmed 3.2x faster response time in product testing.',
    '',
    '> Always clearly separate Live features from Preview features.',
  ],
  'DEMO NDA VAULT.md': [
    '# Legal & Customer NDA Rules',
    '**Owner:** priya.nair@google.com (Legal Counsel)',
    '',
    '## Customer Naming Rules',
    '- **No Real Bank Names:** Naming "Apex Global Bank" is blocked by our customer NDA.',
    '- **Approved Wording:** Use "a leading Tier-1 Global Investment Bank" instead.',
    '- **Approved Stat:** The "68% faster compliance review" stat is pre-approved once unnamed.',
    '',
    '> Using a real customer logo on stage requires a signed Legal waiver (+5 days).',
  ],
  'PSO RATE CARD.csv': [
    '# Demo Build Options & Budget (PSO RATE CARD.csv)',
    '**Owner:** marcus.vance@google.com (Commercial Ops)',
    '**Budget Limit:** $60,000 Max · 4 Engineers · 18 Business Days',
    '',
    '## Available Demo Packages',
    '- **Standard SAP Demo:** $54,000 · 3.5 engineers · 14 days (Fits Launch Budget)',
    '- **Custom Mainframe Add-On:** +$28,000 · +2 engineers · 28 days (Over Budget)',
    '- **Both Combined:** $82,000 ($22k over budget) and misses the Oct 18 launch date.',
    '',
    '> Recommendation: Ship the $54k Standard SAP Demo now; move Mainframe to Wave 2.',
  ],
  'DEMO BRAND RULES.md': [
    '# Google Cloud Brand & Naming Rules',
    '**Owner:** marketing_demo@google.com (Brand Lead)',
    '',
    '## Approved Product Naming',
    '- **Company Name:** Always write "Google Cloud" (never use old "GCP" acronym).',
    '- **Product Name:** Use "Google Cloud Vertex AI Agent Builder".',
    '- **Do Not Use:** Never use "Autonomous Brain", "Bard", or "Duet AI".',
    '',
    '> Brand naming mistakes can be auto-fixed in 1 click.',
  ],
};

const EDITOR_LINE_NODE_IDS = ['136:364', '136:367', '136:370', '136:376', '136:379', '136:385', '136:388', '136:391', '136:394', '136:400'];

const TEAM_AGENTS_CYCLE = [
  { id: 'pm_agent', name: 'Cloud PM Team Agent' },
  { id: 'brand_agent', name: 'Brand & Comms Team Agent' },
  { id: 'legal_agent', name: 'Legal & NDA Team Agent' },
  { id: 'commercial_agent', name: 'Commercial & PSO Team Agent' },
];
let teamAgentCycleIdx = 0;

const TOAST_AUTO_CLOSE_MS = 5000;
let toastTimer = null;
function showToast(msg, durationMs = TOAST_AUTO_CLOSE_MS) {
  if (!toastEl || !msg) return;
  const text = String(msg);
  const isWarn = /^[🔒🗑️🔥⚠️]/.test(text);
  const isSuccess = /^[✓↩]/.test(text);
  const headerLabel = text.startsWith('🔒') ? 'CREATOR PERMISSION LOCK' : text.startsWith('🗑️') || text.startsWith('🔥') ? 'TRASH BIN ACTION' : isSuccess ? 'WORKSPACE SYNCED' : 'MURPH SYSTEM NOTICE';
  toastEl.classList.toggle('is-warn', isWarn);
  toastEl.classList.toggle('is-success', isSuccess && !isWarn);
  toastEl.innerHTML = `<div class="murph-toast-titlebar"><span class="murph-toast-title">${headerLabel}</span><button type="button" class="murph-toast-close" aria-label="Close notification">✕</button></div><div class="murph-toast-body"></div>`;
  const bodyEl = toastEl.querySelector('.murph-toast-body');
  if (bodyEl) bodyEl.textContent = text;
  const closeBtn = toastEl.querySelector('.murph-toast-close');
  if (closeBtn) closeBtn.onclick = () => toastEl.classList.remove('visible');
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, durationMs || TOAST_AUTO_CLOSE_MS);
}

function setNodeText(nodeId, text) {
  if (text === undefined || text === null) return;
  document.querySelectorAll(`[data-node-id="${nodeId}"]`).forEach((el) => {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') el.value = String(text);
    else {
      if (el.dataset && el.dataset.origText === undefined) el.dataset.origText = el.textContent || '';
      el.textContent = String(text);
    }
  });
}

function restoreOrigNodeText(...nodeIds) {
  nodeIds.forEach((nodeId) => {
    document.querySelectorAll(`[data-node-id="${nodeId}"]`).forEach((el) => {
      if (el.dataset && el.dataset.origText !== undefined) el.textContent = el.dataset.origText;
    });
  });
}

function getNodeText(nodeId) {
  const el = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!el) return '';
  return (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') ? String(el.value || '').trim() : el.textContent.trim();
}

function getInitials(nameOrLdap) {
  const clean = String(nameOrLdap || 'EC').split('(')[0].replace(/@.*$/, '').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'EC';
}

async function apiCall(path, method = 'GET', body = null) {
  if (isStaticHttpServer && method !== 'GET') {
    return appState;
  }
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== null && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const serverHdr = (res.headers && res.headers.get('server')) || '';
    if (serverHdr.includes('SimpleHTTP')) {
      isStaticHttpServer = true;
    }
    if (!res.ok) {
      if (((res.headers && res.headers.get('content-type')) || '').includes('json')) {
        const errBody = await res.json().catch(() => ({}));
        if (res.status === 401 && errBody && errBody.session_expired && typeof handleSessionExpired === 'function') {
          handleSessionExpired();
        }
        return { error: `HTTP ${res.status}`, ...errBody };
      }
      isStaticHttpServer = true;
      return appState;
    }
    const data = await res.json();
    if (data && ('current_user' in data || Array.isArray(data.scenarios))) {
      appState = data;
      syncStateToFigmaDOM(appState);
    }
    return data;
  } catch (err) {
    isStaticHttpServer = true;
    return appState;
  }
}

