/**
 * ============================================================================
 * 02-auth-and-user-settings.js — Lock Screen, Sticky Bar User Pill & Settings
 * ============================================================================
 *
 * Manages:
 *   1. Two-Account Lock Screen UI (`updateLockScreenUI`) supporting strictly
 *      2 accounts: Cloud User (`cloud`) and Digital Marketing / DM User (`dm`).
 *   2. Top-Right Sticky Bar Dynamic Username Pill (`mountStickyBarUserPill`,
 *      `updateStickyBarUserIdentity`, `getActiveLoggedInUserProfile`) on both
 *      the Home Page (`99:298`) and Introduction Page (`102:3259`).
 *   3. Interactive User Settings Dropdown (`populateUserSettingsDropdown`) for
 *      adjusting username/email, display name, role, department, NDA tier,
 *      bound team agent, file scope, and personal agent name, plus switching
 *      between the 2 user accounts.
 *   4. Backend-to-Figma DOM state synchronization (`syncStateToFigmaDOM`).
 */

const LOCK_DEMO_MASKED_PASSWORD = '••••••••••••';

const TWO_USER_ACCOUNTS = {
  cloud: {
    accountKey: 'cloud',
    id: 'persona_creator',
    email: CLOUD_ACCOUNT_EMAIL,
    name: 'Cloud User',
    role: 'Cloud Launch & PM Lead',
    department: 'Google Cloud',
    nda_clearance: 'TIER-2',
    team_agent_id: 'pm_agent',
    personal_agent_name: "Cloud User's Personal Agent",
    workspace_tier: 'federated',
    badge: '☁️ CLOUD USER',
  },
  dm: {
    accountKey: 'dm',
    id: 'persona_brand',
    email: DM_ACCOUNT_EMAIL,
    name: 'Marketing User',
    role: 'Digital Marketing & Brand Lead',
    department: 'Digital Marketing',
    nda_clearance: 'TIER-2',
    team_agent_id: 'brand_agent',
    personal_agent_name: "Marketing User's Personal Agent",
    workspace_tier: 'federated',
    badge: '📣 DM USER',
  },
};

function getStoredUserSettingsMap() {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    // Overrides saved before the built-in account rename still carry the legacy email.
    Object.values(parsed).forEach((entry) => {
      if (entry && typeof entry === 'object') {
        if (entry.email) entry.email = normalizeBuiltinAccountEmail(entry.email);
        if (entry.name === 'Digital Marketing (DM) User') entry.name = 'Marketing User';
      }
    });
    return parsed;
  } catch (_) {
    return {};
  }
}

let userSettingsOverrides = {};
function saveUserSettingsOverrides() {
  Object.entries(userSettingsOverrides || {}).forEach(([k, val]) => {
    if (val && typeof val === 'object') {
      saveStoredUserSettingsForEmail(`account:${k}`, val);
      if (val.email) saveStoredUserSettingsForEmail(val.email, val);
    }
  });
}

function saveStoredUserSettingsForEmail(emailOrAccountKey, settingsObj) {
  if (!emailOrAccountKey) return;
  try {
    const map = getStoredUserSettingsMap();
    const normKey = String(emailOrAccountKey).trim().toLowerCase();
    map[normKey] = Object.assign({}, map[normKey] || {}, settingsObj);
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(map));
  } catch (_) {}
}

function getAccountProfileByKey(accountKey) {
  const key = normalizeAccountKey(accountKey);
  const registered = isCustomAccountKey(key) ? getRegisteredAccountByKey(key) : null;
  const base =
    TWO_USER_ACCOUNTS[key] ||
    (registered
      ? {
          accountKey: key, id: key, email: registered.email,
          name: registered.name || registered.email.split('@')[0],
          role: registered.role || 'Team Member',
          department: registered.department || 'Google',
          nda_clearance: registered.nda_clearance || 'TIER-2',
          team_agent_id: registered.team_agent_id || 'pm_agent',
          personal_agent_name: registered.personal_agent_name || `${String(registered.name || 'My').split(' ')[0]}'s Personal Agent`,
          workspace_tier: registered.workspace_tier || 'federated',
          badge: `✦ ${String(registered.department || 'NEW').toUpperCase().slice(0, 12)}`,
        }
      : TWO_USER_ACCOUNTS.cloud);
  const settingsMap = getStoredUserSettingsMap();
  const authEntry = (lockAuthState && lockAuthState[key]) || {};
  const acctOverrides = Object.assign(
    {},
    settingsMap[ base.email.toLowerCase() ] || {},
    authEntry.email ? settingsMap[ String(authEntry.email).toLowerCase() ] || {} : {},
    settingsMap[`account:${key}`] || {}
  );

  const email = base.email.trim().toLowerCase();
  const rawName = (acctOverrides.name || authEntry.name || base.name).trim();
  const displayName = rawName === 'Digital Marketing (DM) User' ? 'Marketing User' : rawName;
  const role = (acctOverrides.role || base.role).trim();
  const department = (acctOverrides.department || base.department).trim();
  const ndaClearance = (acctOverrides.nda_clearance || base.nda_clearance || 'TIER-2').toUpperCase();
  const teamAgentId = acctOverrides.team_agent_id || base.team_agent_id;
  const personalAgentName = acctOverrides.personal_agent_name || base.personal_agent_name;
  const workspaceTier = acctOverrides.workspace_tier || base.workspace_tier || 'federated';
  const shortEmail = email.includes('@') ? email : `${email}@google.com`;

  return {
    accountKey: key, id: base.id, email: shortEmail, username: shortEmail.split('@')[0],
    displayName, name: displayName, initials: getInitials(displayName || shortEmail),
    role, department, ndaClearance, teamAgentId, personalAgentName, workspaceTier,
    environment: key, badge: base.badge,
  };
}

function refreshLockFieldFilledStyle() {
  const emailEl = document.querySelector('#screen-lock [data-node-id="64:8"]');
  const pwdEl = document.querySelector('#screen-lock [data-node-id="64:12"]');
  if (emailEl) {
    const val = (emailEl.textContent || '').trim();
    emailEl.classList.toggle('is-filled', Boolean(val && val.toLowerCase() !== 'email address'));
  }
  if (pwdEl) {
    const val = (pwdEl.textContent || '').trim();
    pwdEl.classList.toggle('is-filled', Boolean(val && val !== 'Password'));
  }
}

function syncLockDemoCredentialFields(acctProfile) {
  const profile = acctProfile || getAccountProfileByKey(activeLockTrack);
  delete document.body.dataset.lockCredentialsEdited;
  setNodeText('64:8', profile.email);
  setNodeText('64:12', LOCK_DEMO_MASKED_PASSWORD);
  document.querySelectorAll('[data-node-id="64:12"]').forEach((el) => {
    el.dataset.demoRealPassword = DEMO_ACCOUNT_PASSWORD;
  });
  refreshLockFieldFilledStyle();
}

const AUTH_COOKIE_NAME = 'murph_auth_session';
const ACTIVE_SCREEN_COOKIE_NAME = 'murph_active_screen';

function readBrowserCookie(cookieName) {
  try {
    const rawCookies = String(document.cookie || '').split(';');
    const prefix = `${cookieName}=`;
    for (const part of rawCookies) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
    }
  } catch (_) {}
  return '';
}

function getAuthCookieSession() {
  const rawVal = readBrowserCookie(AUTH_COOKIE_NAME);
  if (!rawVal) return null;
  try {
    const parsed = JSON.parse(rawVal);
    if (!parsed || typeof parsed !== 'object') return null;
    let accountKey = String(parsed.accountKey || '').trim().toLowerCase();
    const rawEmail = String(parsed.email || '').trim().toLowerCase();
    const email = isCustomAccountKey(accountKey) ? rawEmail : normalizeBuiltinAccountEmail(rawEmail);
    if (!email || !email.includes('@')) return null;
    if (!isCustomAccountKey(accountKey)) {
      if (email === DM_ACCOUNT_EMAIL) accountKey = 'dm';
      else if (email === CLOUD_ACCOUNT_EMAIL) accountKey = 'cloud';
      else if (!accountKey) accountKey = buildAccountKeyFromEmail(email);
    }
    const name = String(parsed.name || '').trim() || (accountKey === 'dm' ? 'Marketing User' : 'Cloud User');
    return { accountKey, email, name, authenticated: true };
  } catch (_) {
    return null;
  }
}

function setAuthCookieSession(sessionObj) {
  if (!sessionObj || !sessionObj.email) return;
  try {
    const rawKey = String(sessionObj.accountKey || '').trim().toLowerCase();
    const rawEmail = String(sessionObj.email).trim().toLowerCase();
    const email = isCustomAccountKey(rawKey) ? rawEmail : normalizeBuiltinAccountEmail(rawEmail);
    const accountKey = isCustomAccountKey(rawKey)
      ? rawKey
      : (email === DM_ACCOUNT_EMAIL ? 'dm' : email === CLOUD_ACCOUNT_EMAIL ? 'cloud' : normalizeAccountKey(rawKey || buildAccountKeyFromEmail(email)));
    const name = String(sessionObj.name || '').trim() || (accountKey === 'dm' ? 'Marketing User' : 'Cloud User');
    const payload = JSON.stringify({ accountKey, email, name, ts: Date.now() });
    document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(payload)}; path=/; max-age=86400; SameSite=Lax`;
  } catch (_) {}
}

function clearAuthCookieSession() {
  try {
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${ACTIVE_SCREEN_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  } catch (_) {}
}

function isUserAuthenticatedByCookie() { return Boolean(getAuthCookieSession()); }
function getActiveScreenCookie() { return readBrowserCookie(ACTIVE_SCREEN_COOKIE_NAME); }
function setActiveScreenCookie(screenName) {
  if (!screenName) return;
  try {
    document.cookie = `${ACTIVE_SCREEN_COOKIE_NAME}=${encodeURIComponent(String(screenName))}; path=/; max-age=86400; SameSite=Lax`;
  } catch (_) {}
}

function updateLockScreenUI() {
  const cloudPill = document.getElementById('lock-track-cloud');
  const dmPill = document.getElementById('lock-track-dm');
  const cloudEmailLabel = document.getElementById('lock-cloud-email-label');
  const dmEmailLabel = document.getElementById('lock-dm-email-label');
  const cloudBadge = document.getElementById('lock-cloud-badge');
  const dmBadge = document.getElementById('lock-dm-badge');
  const statusText = document.getElementById('lock-dual-auth-status-text');

  const cloudProfile = getAccountProfileByKey('cloud');
  const dmProfile = getAccountProfileByKey('dm');
  const activeKey = normalizeAccountKey(activeLockTrack) === 'dm' ? 'dm' : 'cloud';
  const cookieSession = getAuthCookieSession();
  const signedInKey = cookieSession ? cookieSession.accountKey : '';
  const activeProfile = activeKey === 'dm' ? dmProfile : cloudProfile;

  if (cloudPill) {
    cloudPill.classList.toggle('active', activeKey === 'cloud');
    cloudPill.classList.toggle('signed-in', signedInKey === 'cloud');
  }
  if (dmPill) {
    dmPill.classList.toggle('active', activeKey === 'dm');
    dmPill.classList.toggle('signed-in', signedInKey === 'dm');
  }
  if (cloudEmailLabel) cloudEmailLabel.textContent = `${cloudProfile.email} · Google Cloud`;
  if (cloudBadge) cloudBadge.textContent = activeKey === 'cloud' ? '● SELECTED' : (signedInKey === 'cloud' ? 'ACTIVE' : 'CLOUD');
  if (dmEmailLabel) dmEmailLabel.textContent = `${dmProfile.email} · Digital Marketing`;
  if (dmBadge) dmBadge.textContent = activeKey === 'dm' ? '● SELECTED' : (signedInKey === 'dm' ? 'ACTIVE' : 'MARKETING');
  if (statusText) statusText.textContent = `${activeKey === 'dm' ? '📣' : '☁️'} ${activeProfile.displayName} (${activeProfile.email})`;

  // Main heading inside User identity (61:357 -> 61:367) always says "User" for all accounts
  setNodeText('61:367', 'User');
  setNodeText('61:368', activeKey === 'dm' ? `Digital Marketing · ${dmProfile.email}` : `Google Cloud · ${cloudProfile.email}`);

  setNodeText('64:20', 'Sign in');

  // Keep email and masked password pre-filled for built-in demo accounts unless user manually edited fields
  const curEmailText = getNodeText('64:8').trim().toLowerCase();
  if (
    !document.body.dataset.lockCredentialsEdited &&
    (!curEmailText ||
      curEmailText === 'email address' ||
      curEmailText === cloudProfile.email.toLowerCase() ||
      curEmailText === dmProfile.email.toLowerCase())
  ) {
    syncLockDemoCredentialFields(activeProfile);
  } else {
    refreshLockFieldFilledStyle();
  }
}

function isUserCurrentlySignedIn() {
  if (typeof isUserAuthenticatedByCookie === 'function' && isUserAuthenticatedByCookie()) return true;
  const activeKey = normalizeAccountKey(activeEnvironment);
  return Boolean(lockAuthState && lockAuthState[activeKey] && lockAuthState[activeKey].authenticated);
}

function getActiveLoggedInUserProfile(_state) {
  const cookieSession = typeof getAuthCookieSession === 'function' ? getAuthCookieSession() : null;
  const accountKey = normalizeAccountKey((cookieSession && cookieSession.accountKey) || activeEnvironment);
  return getAccountProfileByKey(accountKey);
}

function mountStickyBarUserPill() {
  const targets = [
    { selector: '#screen-home [data-node-id="99:298"]', suffix: 'home', initialsNodeId: '99:299' },
    { selector: '#screen-intro [data-node-id="102:3259"]', suffix: 'intro', initialsNodeId: '102:3260' },
  ];
  targets.forEach(({ selector, suffix, initialsNodeId }) => {
    const pillEl = document.querySelector(selector);
    if (!pillEl) return;
    pillEl.setAttribute('data-api-action', 'toggle-user-settings-menu');
    pillEl.setAttribute('role', 'button');
    pillEl.setAttribute('tabindex', '0');
    if (pillEl.querySelector('.sticky-user-info')) return;

    pillEl.innerHTML = `
      <span class="sticky-user-signed-out-icon" aria-hidden="true">
        <span class="sticky-user-head-dot"></span>
        <svg width="14.5" height="6.5" viewBox="0 0 14.5 6.5" style="overflow: visible; display: block; pointer-events: none"><path d="M-0.741849 6.38973C-0.802752 6.79944 -0.519987 7.18095 -0.110275 7.24185C0.299437 7.30275 0.680946 7.01999 0.741849 6.61027L0 6.5L-0.741849 6.38973ZM13.7582 6.61027C13.8191 7.01999 14.2006 7.30275 14.6103 7.24185C15.02 7.18095 15.3028 6.79944 15.2418 6.38973L14.5 6.5L13.7582 6.61027ZM0 6.5L0.741849 6.61027C1.24169 3.24768 4.00134 0.75 7.25 0.75L7.25 0L7.25 -0.75C3.19866 -0.75 -0.141694 2.35232 -0.741849 6.38973L0 6.5ZM7.25 0L7.25 0.75C10.4987 0.75 13.2583 3.24768 13.7582 6.61027L14.5 6.5L15.2418 6.38973C14.6417 2.35232 11.3013 -0.75 7.25 -0.75L7.25 0Z" fill="rgb(127,142,170)" fill-rule="nonzero"/></svg>
      </span>
      <span class="sticky-user-avatar" data-node-id="${initialsNodeId}" id="sticky-user-avatar-${suffix}"></span>
      <span class="sticky-user-info">
        <span class="sticky-user-name" id="sticky-bar-username-${suffix}"></span>
        <span class="sticky-user-role" id="sticky-bar-userrole-${suffix}"></span>
      </span>
      <span class="sticky-user-caret" aria-hidden="true">▾</span>
    `;
  });
}

function populateUserSettingsDropdown(state) {
  const profile = getActiveLoggedInUserProfile(state);
  const avatarEl = document.getElementById('user-dropdown-avatar');
  const titleEl = document.getElementById('user-dropdown-display-name');
  const emailEl = document.getElementById('user-dropdown-email');
  const envPillEl = document.getElementById('user-dropdown-env-pill');
  const ndaPillEl = document.getElementById('user-dropdown-nda-pill');

  if (avatarEl) avatarEl.textContent = profile.initials;
  if (titleEl) titleEl.textContent = `${profile.displayName} (${profile.role})`;
  if (emailEl) emailEl.textContent = profile.email;
  if (envPillEl) {
    envPillEl.textContent =
      profile.accountKey === 'dm'
        ? '📣 DM USER ACCOUNT'
        : profile.accountKey === 'cloud'
          ? '☁️ CLOUD USER ACCOUNT'
          : `✦ ${String(profile.department || 'NEW').toUpperCase()} · OWN WORKSPACE`;
  }
  if (ndaPillEl) {
    ndaPillEl.textContent = `NDA: ${profile.ndaClearance}`;
  }

  const emailInput = document.getElementById('user-setting-email');
  const nameInput = document.getElementById('user-setting-name');
  const roleInput = document.getElementById('user-setting-role');
  const deptInput = document.getElementById('user-setting-dept');
  const ndaSelect = document.getElementById('user-setting-nda');
  const teamSelect = document.getElementById('user-setting-team-agent');
  const tierSelect = document.getElementById('user-setting-workspace-tier');
  const agentNameInput = document.getElementById('user-setting-agent-name');

  if (emailInput) emailInput.value = profile.email;
  if (nameInput) nameInput.value = profile.displayName;
  if (roleInput) roleInput.value = profile.role;
  if (deptInput) deptInput.value = profile.department;
  if (ndaSelect) ndaSelect.value = profile.ndaClearance;
  if (teamSelect) teamSelect.value = profile.teamAgentId;
  if (tierSelect) tierSelect.value = profile.workspaceTier;
  if (agentNameInput) agentNameInput.value = profile.personalAgentName;

  // Switch User Account shows only the 2 shared demo accounts (Cloud & Marketing)
  const switcherEl = document.getElementById('user-settings-switcher-list');
  const countEl = document.getElementById('user-settings-account-count');
  if (!switcherEl) return;

  const twoAccounts = [getAccountProfileByKey('cloud'), getAccountProfileByKey('dm')];
  if (countEl) countEl.textContent = `${twoAccounts.length} Accounts`;

  switcherEl.innerHTML = twoAccounts
    .map((c) => {
      const isCurrent = c.accountKey === profile.accountKey;
      return `<button type="button" class="user-switch-option ${isCurrent ? 'active' : ''}" data-api-action="select-logged-in-user" data-user-id="${escapeHtmlSafe(c.id)}" data-user-email="${escapeHtmlSafe(c.email)}" data-user-env="${escapeHtmlSafe(c.accountKey)}" data-user-track="${escapeHtmlSafe(c.accountKey)}">
          <span class="user-switch-left">
            <span class="user-switch-avatar">${escapeHtmlSafe(c.initials)}</span>
            <span class="user-switch-text">
              <span class="user-switch-email">${escapeHtmlSafe(c.displayName)} · ${escapeHtmlSafe(c.email)}</span>
              <span class="user-switch-sub">${escapeHtmlSafe(c.role)} · ${escapeHtmlSafe(c.department)}</span>
            </span>
          </span>
          <span class="user-switch-badge">${isCurrent ? '● ACTIVE' : escapeHtmlSafe(c.badge)}</span>
        </button>`;
    })
    .join('');
}

function setUserSettingsMenuOpen(isOpen, triggerEl) {
  if (!userSettingsMenuEl) return;
  const openState = Boolean(isOpen);
  if (openState) {
    const activePill =
      (triggerEl && triggerEl.closest && triggerEl.closest('[data-node-id="99:298"], [data-node-id="102:3259"]')) ||
      document.querySelector(
        document.body.classList.contains('home-screen-active')
          ? '#screen-home [data-node-id="99:298"]'
          : '#screen-intro [data-node-id="102:3259"]'
      );
    if (activePill && typeof activePill.getBoundingClientRect === 'function') {
      const pillRect = activePill.getBoundingClientRect();
      const menuWidth = userSettingsMenuEl.offsetWidth || 388;
      const rightEdge = window.innerWidth - 28;
      const menuLeft = rightEdge - menuWidth;
      const pillCenterX = pillRect.left + pillRect.width / 2;
      const originX = Math.max(48, Math.min(menuWidth - 28, Math.round(pillCenterX - menuLeft)));
      userSettingsMenuEl.style.setProperty('--user-menu-origin-x', `${originX}px`);
    }
    populateUserSettingsDropdown(appState);
  }
  userSettingsMenuEl.classList.toggle('open', openState);
  userSettingsMenuEl.setAttribute('aria-hidden', openState ? 'false' : 'true');
  document
    .querySelectorAll('#screen-home [data-node-id="99:298"], #screen-intro [data-node-id="102:3259"]')
    .forEach((pillEl) => {
      pillEl.classList.toggle('user-menu-open', openState);
      pillEl.classList.toggle('menu-open', openState);
      pillEl.setAttribute('aria-expanded', openState ? 'true' : 'false');
    });
}

function triggerUserIdentitySwitchPulse() {
  const pulseTargets = [
    ...document.querySelectorAll('#screen-home [data-node-id="99:298"], #screen-intro [data-node-id="102:3259"]'),
    document.querySelector('.user-settings-current-card'),
  ].filter(Boolean);
  pulseTargets.forEach((el) => {
    el.classList.remove('is-switching-account');
    void el.offsetWidth;
    el.classList.add('is-switching-account');
  });
  setTimeout(() => {
    pulseTargets.forEach((el) => el.classList.remove('is-switching-account'));
  }, 850);
}

function updateStickyBarUserIdentity(state) {
  mountStickyBarUserPill();
  const signedIn = isUserCurrentlySignedIn();
  const profile = getActiveLoggedInUserProfile(state);
  const acctTag = getAccountShortTag(profile.accountKey);
  const shortRole = String(profile.role || 'Launch Lead').toUpperCase().slice(0, 18);

  ['home', 'intro'].forEach((suffix) => {
    const pillEl = document.querySelector(
      suffix === 'home' ? '#screen-home [data-node-id="99:298"]' : '#screen-intro [data-node-id="102:3259"]'
    );
    const avatarEl = document.getElementById(`sticky-user-avatar-${suffix}`);
    const nameEl = document.getElementById(`sticky-bar-username-${suffix}`);
    const roleEl = document.getElementById(`sticky-bar-userrole-${suffix}`);
    if (pillEl) {
      pillEl.classList.toggle('is-signed-out', !signedIn);
      pillEl.title = signedIn
        ? 'Logged-in user profile & settings · Click to open User Settings dropdown'
        : 'Not signed in · Click to sign in';
    }
    if (avatarEl) avatarEl.textContent = signedIn ? profile.initials : '';
    if (nameEl) nameEl.textContent = signedIn ? profile.email : '';
    if (roleEl) roleEl.textContent = signedIn ? `${acctTag} · ${shortRole}` : '';
  });

  setNodeText('99:299', signedIn ? profile.initials : '');
  setNodeText('102:3260', signedIn ? profile.initials : '');
  setNodeText(
    '102:3303',
    signedIn
      ? `MURPH AGENT CONSOLE / user:${profile.email} / workspace:${profile.accountKey}`
      : 'MURPH AGENT CONSOLE / session:signed-out / auth:required'
  );
  setNodeText(
    '102:3314',
    signedIn
      ? `login verified · identity: ${profile.initials} (${profile.email}) · mandatory session policy satisfied`
      : 'no active session · sign in to bind your personal agent'
  );
  setNodeText('102:3334', signedIn ? `LOGIN VERIFIED · ${profile.initials}` : 'NOT SIGNED IN');
  setNodeText('183:360', signedIn ? profile.initials : '—');
  setNodeText('183:362', signedIn ? profile.personalAgentName : 'Not Signed In');
  setNodeText('99:242', signedIn ? profile.personalAgentName || 'Personal Agent' : 'Personal Agent');
  setNodeText('183:363', signedIn ? `Bound to ${profile.role} · Grounded in 📄 ${activeBlueFileTitle}` : 'Sign in to bind your Personal Agent');
  setNodeText('183:369', signedIn ? `NDA CLEARANCE: ${profile.ndaClearance}` : 'NDA CLEARANCE: —');

  if (hudStatusBtn) {
    if (!signedIn) {
      hudStatusBtn.textContent = '○ Signed Out · Click to Sign In';
    } else {
      const acctShort = isCustomAccountKey(profile.accountKey)
        ? `${profile.department || 'New'} User`
        : profile.accountKey === 'dm'
          ? 'DM User'
          : 'Cloud User';
      hudStatusBtn.textContent = `● ${acctShort} · ${profile.username}@ (${profile.initials}) ▾`;
    }
  }

  if (userSettingsMenuEl && userSettingsMenuEl.classList.contains('open')) {
    if (signedIn) populateUserSettingsDropdown(state);
    else setUserSettingsMenuOpen(false);
  }
}


