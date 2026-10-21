/**
 * ============================================================================
 * 01b-accounts-registry.js — Registered (Self-Signed-Up) Accounts Registry
 * ============================================================================
 *
 * Extends the 2 built-in accounts (`cloud`, `dm`) with an unbounded list of
 * self-registered accounts created on the Sign-Up page (`#screen-signup`).
 *
 * Every registered account owns an isolated workspace keyed by
 * `accountKey = 'user_<slug>'` (identical to the backend `user_id` that
 * `register_user_account` derives from the email), so files, workflows, trash
 * and desktop positions scoped by `environment` never leak between accounts.
 *
 * Persistence: `localStorage[REGISTERED_ACCOUNTS_STORAGE_KEY]` (frontend
 * cache) + SQLite `account_registry` via `POST /api/auth/register`.
 *
 * Privacy: every Sign-Up account is private to this browser. The list is never
 * filled from the server (which no longer sends other visitors' accounts);
 * an account appears here only after this browser created it or signed in to
 * it by typing its email + password.
 */

const REGISTERED_ACCOUNTS_STORAGE_KEY = 'murph_registered_accounts_v4';
const LEGACY_REGISTERED_ACCOUNTS_STORAGE_KEY = 'murph_registered_accounts_v3';

// Purge any cached private accounts from localStorage so accounts never persist
// in browser storage across visitors or after sign-out.
(function purgeLegacyRegisteredAccountsFromStorage() {
  try {
    localStorage.removeItem(LEGACY_REGISTERED_ACCOUNTS_STORAGE_KEY);
    localStorage.removeItem(REGISTERED_ACCOUNTS_STORAGE_KEY);
  } catch (_) {}
})();
const ONBOARDING_SEEN_STORAGE_KEY = 'murph_onboarding_seen_v1';
const ONBOARDING_BOOT_ID_STORAGE_KEY = 'murph_onboarding_boot_id_v1';

function isCustomAccountKey(key) {
  return typeof key === 'string' && /^user_[a-z0-9_]+$/.test(key);
}

/** Maps any backend/frontend environment string onto an account key ('cloud' | 'dm' | 'user_<slug>'). */
function normalizeAccountKey(rawKey) {
  let key = String(rawKey || '').trim().toLowerCase();
  if (key.startsWith('user:')) key = key.slice(5); // backend `user:<user_id>` environments
  if (key === 'dm') return 'dm';
  if (isCustomAccountKey(key)) return key;
  return 'cloud';
}

function getActiveAccountKey() {
  return normalizeAccountKey(activeEnvironment);
}

/** Like `normalizeAccountKey`, but returns '' for blank input so callers can fall back to LDAP heuristics. */
function normalizeAccountKeyOrEmpty(rawKey) {
  const key = String(rawKey || '').trim().toLowerCase();
  return key ? normalizeAccountKey(key) : '';
}

/** Mirrors `register_user_account`: `re.sub(r"[^a-z0-9_]", "_", username.lower()).strip("_")`. */
function buildAccountKeyFromEmail(email) {
  const username = String(email || '').trim().toLowerCase().split('@')[0];
  const slug = username.replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return `user_${slug || 'new_user'}`;
}

function getRegisteredAccounts() {
  if (typeof sessionPrivateProfile !== 'undefined' && sessionPrivateProfile && sessionPrivateProfile.accountKey) {
    return [sessionPrivateProfile];
  }
  return [];
}

function saveRegisteredAccount(acct) {
  if (!acct || !acct.accountKey || !acct.email) return;
  if (typeof sessionPrivateProfile !== 'undefined') {
    sessionPrivateProfile = acct;
  }
}

function getRegisteredAccountByKey(accountKey) {
  return getRegisteredAccounts().find((a) => a.accountKey === accountKey) || null;
}

function getRegisteredAccountByEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return null;
  return getRegisteredAccounts().find((a) => a.email.toLowerCase() === norm) || null;
}

/** Non-reversible fingerprint used only in memory during the current session. */
function hashAccountSecret(secret) {
  let h = 5381;
  const s = String(secret || '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}:${s.length}`;
}

function verifyRegisteredAccountPassword(acct, password) {
  if (!acct) return false;
  if (!acct.passwordHash) return true;
  return hashAccountSecret(password) === acct.passwordHash;
}

/**
 * After the backend accepted a password sign-in (`loginRes`) to a private
 * account, stores its profile in memory (`sessionPrivateProfile`) for this tab.
 */
function adoptPrivateAccountFromLogin(loginRes, email, password) {
  if (!loginRes || loginRes.error || !password) return null;
  const user = loginRes.user || loginRes.current_user || {};
  const accountKey = normalizeAccountKey(
    loginRes.account_key ||
      (loginRes.viewer_session && loginRes.viewer_session.account_key) ||
      user.id ||
      ''
  );
  let wantEmail = String(email || '').trim().toLowerCase();
  if (wantEmail && !wantEmail.includes('@')) wantEmail = `${wantEmail}@google.com`;
  if (!isCustomAccountKey(accountKey) || String(user.ldap || '').toLowerCase() !== wantEmail) return null;
  const cleanName = String(user.name || wantEmail.split('@')[0]).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const agents = Array.isArray(loginRes.user_agents) ? loginRes.user_agents : [];
  const agent = agents.find((a) => a && a.owner_user_id === accountKey && a.agent_type === 'personal') || {};
  const acct = {
    accountKey,
    email: wantEmail,
    name: cleanName,
    role: user.role || 'Team Member',
    department: user.department || 'Google Cloud',
    team_agent_id: user.team_agent_id || 'pm_agent',
    personal_agent_name: agent.name || `${cleanName.split(' ')[0]}'s Personal Agent`,
    nda_clearance: 'TIER-2',
    workspace_tier: 'federated',
    passwordHash: hashAccountSecret(password),
    created_at_ms: Date.now(),
  };
  saveRegisteredAccount(acct);
  return acct;
}

/** True when `email` is already used by Cloud User, DM User, or a registered account. */
function isEmailTakenByAnyAccount(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return false;
  if (getRegisteredAccountByEmail(norm)) return true;
  return ['cloud', 'dm'].some((k) => {
    try {
      return getAccountProfileByKey(k).email.toLowerCase() === norm;
    } catch (_) {
      return false;
    }
  });
}

function hasSeenOnboardingTour(accountKey) {
  try {
    const raw = localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY);
    const seen = raw ? JSON.parse(raw) : {};
    return Boolean(seen && seen[accountKey]);
  } catch (_) {
    return false;
  }
}

function markOnboardingTourSeen(accountKey) {
  try {
    const raw = localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY);
    const seen = raw && typeof JSON.parse(raw) === 'object' ? JSON.parse(raw) : {};
    seen[accountKey] = Date.now();
    localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch (_) {}
}

/** Per-account flag: the empty-workspace Welcome card retires once the tour has been closed (03d GUIDE app keeps it). */
const WELCOME_CARD_DISMISSED_STORAGE_KEY = 'murph_welcome_card_dismissed_v1';

function readAccountFlagMap(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function hasDismissedWelcomeCard(accountKey) {
  return Boolean(readAccountFlagMap(WELCOME_CARD_DISMISSED_STORAGE_KEY)[accountKey]);
}

function markWelcomeCardDismissed(accountKey) {
  try {
    const map = readAccountFlagMap(WELCOME_CARD_DISMISSED_STORAGE_KEY);
    map[accountKey] = Date.now();
    localStorage.setItem(WELCOME_CARD_DISMISSED_STORAGE_KEY, JSON.stringify(map));
  } catch (_) {}
}

/** A brand-new account always gets the tour + fresh desktop/terminal layout, even if a stale flag survived under the same key. */
function resetOnboardingFlagsForAccount(accountKey) {
  [ONBOARDING_SEEN_STORAGE_KEY, WELCOME_CARD_DISMISSED_STORAGE_KEY].forEach((storageKey) => {
    try {
      const map = readAccountFlagMap(storageKey);
      delete map[accountKey];
      localStorage.setItem(storageKey, JSON.stringify(map));
    } catch (_) {}
  });
  if (typeof clearAccountDesktopPositions === 'function') {
    clearAccountDesktopPositions(accountKey);
  }
}

/**
 * Resets the seen-tour flag for the 2 built-in demo accounts (`cloud`, `dm`)
 * whenever the backend `server_boot_id` changes (i.e. each time `server.py`
 * starts on port 8080/8088 or the workspace is reset), so both demo accounts
 * get the onboarding tour once on their first login per server run.
 */
function syncOnboardingTourWithServerBoot(state) {
  const bootId = state && typeof state.server_boot_id === 'string' ? state.server_boot_id.trim() : '';
  if (!bootId) return;
  try {
    const prevBootId = localStorage.getItem(ONBOARDING_BOOT_ID_STORAGE_KEY) || '';
    if (prevBootId !== bootId) {
      localStorage.setItem(ONBOARDING_BOOT_ID_STORAGE_KEY, bootId);
      const seen = readAccountFlagMap(ONBOARDING_SEEN_STORAGE_KEY);
      delete seen.cloud;
      delete seen.dm;
      localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, JSON.stringify(seen));
    }
  } catch (_) {}
}

/**
 * Returns true if `accountKey` ('cloud', 'dm', or 'user_<slug>') should open
 * the onboarding tour on this login, enforcing once-per-server-run for demo accounts.
 */
function shouldTriggerFirstLoginTour(accountKey, loginRes) {
  const key = normalizeAccountKey(accountKey);
  if (hasSeenOnboardingTour(key)) return false;
  if ((key === 'cloud' || key === 'dm') && loginRes && typeof loginRes.show_onboarding_tour === 'boolean') {
    if (!loginRes.show_onboarding_tour) {
      markOnboardingTourSeen(key);
      return false;
    }
  }
  return true;
}

/** Human-readable short tag for sticky bar / switcher badges. */
function getAccountShortTag(accountKey) {
  if (accountKey === 'dm') return 'DM USER';
  if (accountKey === 'cloud') return 'CLOUD USER';
  const acct = getRegisteredAccountByKey(accountKey);
  const dept = acct && acct.department ? String(acct.department).toUpperCase().slice(0, 14) : 'NEW';
  return `${dept} ACCOUNT`;
}

function pruneRegisteredAccountsAgainstServer() {}
