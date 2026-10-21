/**
 * Google Identity Services (GIS) OAuth2 popup sign-in + server-side visitor
 * session (`viewer_session`) synchronization.
 *
 * - Keeps private `user_*` profiles in memory only (`sessionPrivateProfile`),
 *   never in `localStorage` or any shared account switcher.
 * - Handles both Lock Screen "Sign in with Google" and Sign-Up "Sign up with
 *   Google", routing unregistered Google emails into the Google-verified
 *   Sign-Up form (`enterGoogleSignupMode`).
 */

let googleOAuthConfig = {
  google_client_id: '',
  google_enabled: false,
  loaded: false,
};
let googleTokenClient = null;
let googleTokenClientId = '';
let pendingGoogleSignInMode = 'login';
let googleSignupPendingIdentity = null;
let sessionPrivateProfile = null;

function isGoogleSignupMode() {
  return Boolean(
    googleSignupPendingIdentity &&
      googleSignupPendingIdentity.email &&
      document.body &&
      document.body.dataset.googleSignupMode === '1'
  );
}

function getGoogleSignupPendingIdentity() {
  return googleSignupPendingIdentity;
}

function injectGoogleIdentityScript() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('murph-gis-client-script')) return;
  const s = document.createElement('script');
  s.id = 'murph-gis-client-script';
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.defer = true;
  if (document.head) document.head.appendChild(s);
}

async function initGoogleOAuthClient() {
  try {
    const res = await fetch('/api/auth/config', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    googleOAuthConfig = {
      google_client_id: String((data && data.google_client_id) || '').trim(),
      google_enabled: Boolean(data && data.google_enabled && data.google_client_id),
      loaded: true,
    };
    if (googleOAuthConfig.google_enabled) {
      injectGoogleIdentityScript();
    }
  } catch (e) {}
}

function ensureGoogleTokenClient() {
  const cid = googleOAuthConfig.google_client_id;
  if (!cid) return null;
  if (
    typeof window === 'undefined' ||
    !window.google ||
    !window.google.accounts ||
    !window.google.accounts.oauth2
  ) {
    return null;
  }
  if (!googleTokenClient || googleTokenClientId !== cid) {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: handleGoogleAccessTokenResponse,
    });
    googleTokenClientId = cid;
  }
  return googleTokenClient;
}

function enterGoogleSignupMode(identity) {
  if (!identity || !identity.email) return;
  if (typeof clearSignupForm === 'function') {
    clearSignupForm({ keepGoogleMode: true });
  }
  googleSignupPendingIdentity = {
    email: String(identity.email || '').trim().toLowerCase(),
    name: String(identity.name || '').trim(),
    picture: String(identity.picture || '').trim(),
  };
  if (document.body) {
    document.body.dataset.googleSignupMode = '1';
  }
  const nameEl = document.getElementById('signup-input-name');
  const emailEl = document.getElementById('signup-input-email');
  if (nameEl) {
    nameEl.value =
      googleSignupPendingIdentity.name ||
      googleSignupPendingIdentity.email.split('@')[0];
  }
  if (emailEl) {
    emailEl.value = googleSignupPendingIdentity.email;
    emailEl.readOnly = true;
    emailEl.setAttribute('aria-readonly', 'true');
  }
  const pwdRow = document.querySelector('#screen-signup [data-node-id="66:38"]');
  if (pwdRow) pwdRow.style.display = 'none';
  const dividerRow = document.querySelector('#screen-signup [data-node-id="65:443"]');
  if (dividerRow) dividerRow.style.display = 'none';
  const googleBtnLabel = document.querySelector('#screen-signup [data-node-id="65:442"]');
  if (googleBtnLabel) {
    googleBtnLabel.textContent =
      '✓ Verified with Google (' + googleSignupPendingIdentity.email + ')';
  }
  if (typeof setSignupStatusBadge === 'function') {
    setSignupStatusBadge('GOOGLE VERIFIED · FINISH PROFILE', 'ready');
  }
  if (typeof updateBindingPreview === 'function') {
    updateBindingPreview();
  }
}

function exitGoogleSignupMode() {
  googleSignupPendingIdentity = null;
  if (document.body && document.body.dataset) {
    delete document.body.dataset.googleSignupMode;
  }
  const emailEl = document.getElementById('signup-input-email');
  if (emailEl) {
    emailEl.readOnly = false;
    emailEl.removeAttribute('aria-readonly');
  }
  const pwdRow = document.querySelector('#screen-signup [data-node-id="66:38"]');
  if (pwdRow) pwdRow.style.display = 'flex';
  const dividerRow = document.querySelector('#screen-signup [data-node-id="65:443"]');
  if (dividerRow) dividerRow.style.display = 'flex';
  const googleBtnLabel = document.querySelector('#screen-signup [data-node-id="65:442"]');
  if (googleBtnLabel) {
    googleBtnLabel.textContent = 'Sign up with Google';
  }
}

async function handleGoogleAccessTokenResponse(tokenResponse) {
  if (!tokenResponse || tokenResponse.error) {
    if (tokenResponse && tokenResponse.error && tokenResponse.error !== 'popup_closed_by_user') {
      showToast('⚠️ Google Sign-In cancelled or failed (' + tokenResponse.error + ').');
    }
    return;
  }
  const accessToken = String(tokenResponse.access_token || '').trim();
  if (!accessToken) {
    showToast('⚠️ Google did not return an access token.');
    return;
  }
  try {
    const httpRes = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        mode: pendingGoogleSignInMode,
      }),
    });
    const res = await httpRes.json().catch(() => ({}));
    if (!httpRes.ok || res.error) {
      showToast('⚠️ ' + (res.error || 'Google Sign-In failed.'));
      return;
    }
    if (res.status === 'needs_signup') {
      enterGoogleSignupMode({
        email: res.email,
        name: res.name,
        picture: res.picture || '',
      });
      if (typeof switchScreen === 'function') {
        switchScreen('signup');
      }
      showToast(
        '✓ Google verified ' +
          res.email +
          ' — choose your Role & Team Agent to finish creating your workspace.'
      );
      return;
    }
    exitGoogleSignupMode();
    appState = res;
    applyViewerSessionFromState(res);
    const acctKey = normalizeAccountKey(
      res.account_key ||
        (res.viewer_session && res.viewer_session.account_key) ||
        activeEnvironment
    );
    const profile = getAccountProfileByKey(acctKey);
    if (typeof setDockLoginSessionActive === 'function') {
      setDockLoginSessionActive(true);
    }
    if (typeof clearSignupForm === 'function') {
      clearSignupForm();
    }
    syncStateToFigmaDOM(appState);
    if (typeof switchTerminalTranscript === 'function') {
      switchTerminalTranscript(acctKey);
    }
    if (typeof playMurphLoginSound === 'function') {
      playMurphLoginSound();
    }
    switchScreen('home', { animateUnlock: true });
    appendTerminalMessage(
      'murph://auth/google-oauth2',
      'Signed in with Google as ' +
        profile.displayName +
        ' (' +
        profile.email +
        ') · Private workspace.',
      'ok'
    );
    showToast(
      '✓ Signed in with Google as ' + profile.displayName + ' (' + profile.email + ')'
    );
    if (
      typeof openOnboardingTour === 'function' &&
      typeof shouldTriggerFirstLoginTour === 'function' &&
      shouldTriggerFirstLoginTour(acctKey, res)
    ) {
      setTimeout(() => openOnboardingTour(acctKey), 1600);
    }
  } catch (err) {
    showToast('⚠️ Google Sign-In request failed.');
  }
}

function startGoogleSignIn(mode = 'login') {
  pendingGoogleSignInMode = mode === 'signup' ? 'signup' : 'login';
  if (
    typeof window !== 'undefined' &&
    typeof window.__murphTestGoogleToken === 'string' &&
    window.__murphTestGoogleToken.trim()
  ) {
    handleGoogleAccessTokenResponse({
      access_token: window.__murphTestGoogleToken.trim(),
    });
    return;
  }
  if (!googleOAuthConfig.google_enabled || !googleOAuthConfig.google_client_id) {
    showToast(
      "⚠️ Google Sign-In isn't configured on this server yet (set GOOGLE_OAUTH_CLIENT_ID)."
    );
    return;
  }
  const client = ensureGoogleTokenClient();
  if (!client) {
    injectGoogleIdentityScript();
    showToast('⚠️ Google Sign-In library is still loading — please try again in a moment.');
    return;
  }
  client.requestAccessToken({ prompt: 'select_account' });
}

function setSessionPrivateProfileFromViewer(vs) {
  if (!vs || !vs.signed_in || !isCustomAccountKey(vs.account_key)) {
    sessionPrivateProfile = null;
    return;
  }
  const acctKey = normalizeAccountKey(vs.account_key);
  const userObj = (vs && vs.user) || {};
  const rawName = String(userObj.name || vs.name || vs.email || 'Workspace User');
  const cleanName = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim() || rawName;
  const email = String(vs.email || userObj.ldap || '').trim().toLowerCase();
  const teamId = String(userObj.team_agent_id || 'agent_data').trim();
  const teamDef =
    typeof getSignupTeamAgentDef === 'function'
      ? getSignupTeamAgentDef(teamId)
      : { name: 'Data Team Agent', clearance: 'L2 Dept Confidential' };
  sessionPrivateProfile = {
    accountKey: acctKey,
    email,
    password: '',
    name: cleanName,
    role: userObj.role || 'Staff Engineer',
    department: userObj.department || 'Cloud AI & Platform Engineering',
    team_agent_id: teamId,
    team_agent_name: teamDef.name,
    personal_agent_name: userObj.personal_agent_name || cleanName.split(' ')[0] + '_agent',
    nda_clearance: userObj.nda_clearance || teamDef.clearance,
    workspace_tier: 'federated',
    auth_provider: vs.provider || 'google',
  };
  if (typeof lockAuthState === 'object' && lockAuthState) {
    lockAuthState[acctKey] = {
      email,
      name: cleanName,
      authenticated: true,
    };
  }
}

function applyViewerSessionFromState(state) {
  const vs = state && state.viewer_session;
  if (!vs || typeof vs !== 'object') return;
  if (vs.signed_in && vs.account_key) {
    const key = normalizeAccountKey(vs.account_key);
    setSessionPrivateProfileFromViewer(vs);
    activeEnvironment = key;
    activeLockTrack = key === 'dm' ? 'dm' : 'cloud';
    const displayName =
      (vs.user && vs.user.name) || vs.name || vs.email || 'Workspace User';
    if (typeof lockAuthState === 'object' && lockAuthState) {
      lockAuthState[key] = {
        email: vs.email || '',
        name: String(displayName).replace(/\s*\([^)]*\)\s*$/, '').trim(),
        authenticated: true,
      };
    }
    if (typeof saveDualAuthState === 'function') saveDualAuthState();
    if (typeof setAuthCookieSession === 'function') {
      setAuthCookieSession({
        accountKey: key,
        email: vs.email || '',
        name: displayName,
      });
    }
    return;
  }
  const wasSignedIn =
    typeof isUserCurrentlySignedIn === 'function' && isUserCurrentlySignedIn();
  sessionPrivateProfile = null;
  if (typeof clearAuthCookieSession === 'function') clearAuthCookieSession();
  if (typeof lockAuthState === 'object' && lockAuthState) {
    Object.keys(lockAuthState).forEach((k) => {
      if (isCustomAccountKey(k)) {
        delete lockAuthState[k];
      } else if (lockAuthState[k]) {
        lockAuthState[k].authenticated = false;
      }
    });
  }
  if (typeof saveDualAuthState === 'function') saveDualAuthState();
  if (typeof setDockLoginSessionActive === 'function') {
    setDockLoginSessionActive(false);
  }
  if (
    wasSignedIn &&
    typeof document !== 'undefined' &&
    document.body &&
    document.body.classList.contains('home-screen-active') &&
    typeof switchScreen === 'function'
  ) {
    switchScreen('lock');
    showToast('🔒 Your session ended — please sign in again.');
  }
}

function handleSessionExpired() {
  applyViewerSessionFromState({ viewer_session: { signed_in: false } });
  if (
    typeof document !== 'undefined' &&
    document.body &&
    !document.body.classList.contains('lock-screen-active') &&
    !document.body.classList.contains('intro-screen-active') &&
    typeof switchScreen === 'function'
  ) {
    switchScreen('lock');
  }
  showToast('🔒 Your session expired — please sign in again.');
}

if (typeof window !== 'undefined') {
  initGoogleOAuthClient();
}
