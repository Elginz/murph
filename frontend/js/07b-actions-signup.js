/* ============================================================================
 * 07b. Sign-Up Page Actions (`07b-actions-signup.js`)
 * ----------------------------------------------------------------------------
 * Creates brand-new, isolated user accounts from `#screen-signup` (65:391):
 *   - `register-submit`        validate → POST /api/auth/register → cache in
 *                              localStorage registry → land on the fresh Home
 *   - `toggle-signup-pwd-1/2`  show / hide password inputs
 *   - `signup-google-prefill`  same 2-demo Google chooser as the Lock Screen's
 *                              `login-google-adc` (Cloud / Marketing demo only)
 * ============================================================================ */

const SIGNUP_FIELD_IDS = {
  name: 'signup-input-name',
  email: 'signup-input-email',
  role: 'signup-input-role',
  dept: 'signup-select-dept',
  pwd1: 'signup-input-password',
  pwd2: 'signup-input-password-confirm',
  team: 'signup-select-team-agent',
  agent: 'signup-input-agent-name',
  refName: 'signup-ref-filename',
  refContent: 'signup-ref-content',
};

function readSignupField(key) {
  const el = document.getElementById(SIGNUP_FIELD_IDS[key]);
  return el ? String(el.value || '').trim() : '';
}

function setSignupFieldError(key, hasError) {
  const el = document.getElementById(SIGNUP_FIELD_IDS[key]);
  if (!el) return;
  const wrap = el.closest('[data-node-name="Input"]') || el;
  wrap.classList.toggle('murph-signup-field-error', Boolean(hasError));
}

function setSignupStatusBadge(text, tone) {
  setNodeText('66:88', text);
  const badge = document.querySelector('#screen-signup [data-node-id="66:86"]');
  if (badge) badge.setAttribute('data-tone', tone || 'ready');
}

function clearSignupForm(opts) {
  if (!(opts && opts.keepGoogleMode) && typeof exitGoogleSignupMode === 'function') {
    exitGoogleSignupMode();
  }
  Object.keys(SIGNUP_FIELD_IDS).forEach((k) => {
    const el = document.getElementById(SIGNUP_FIELD_IDS[k]);
    if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
    setSignupFieldError(k, false);
  });
  signupUploadedFile = null;
  delete document.body.dataset.signupAgentNameTouched;
  setSignupStatusBadge('READY TO SPAWN', 'ready');
  if (typeof updateBindingPreview === 'function') updateBindingPreview();
}

function validateSignupForm() {
  const googleMode = typeof isGoogleSignupMode === 'function' && isGoogleSignupMode();
  const pendingGoogle =
    googleMode && typeof getGoogleSignupPendingIdentity === 'function'
      ? getGoogleSignupPendingIdentity()
      : null;
  const name = readSignupField('name');
  const email = (pendingGoogle && pendingGoogle.email)
    ? String(pendingGoogle.email).trim().toLowerCase()
    : readSignupField('email').toLowerCase();
  const pwd1 = readSignupField('pwd1');
  const pwd2 = readSignupField('pwd2');
  const problems = [];
  const fail = (key, msg) => {
    setSignupFieldError(key, true);
    problems.push(msg);
  };
  ['name', 'email', 'pwd1', 'pwd2'].forEach((k) => setSignupFieldError(k, false));
  if (name.length < 2) fail('name', 'Enter your full name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email', 'Enter a valid work email');
  else if (!googleMode && isEmailTakenByAnyAccount(email)) {
    fail('email', `${email} already has an account — sign in instead`);
  }
  if (!googleMode) {
    if (pwd1.length < 6) fail('pwd1', 'Password needs at least 6 characters');
    if (pwd1 !== pwd2) fail('pwd2', 'Passwords do not match');
  }
  return { ok: problems.length === 0, problems, name, email, pwd1, googleMode };
}

async function handleSignupAction(action, triggerEl) {
  if (action === 'toggle-signup-pwd-1' || action === 'toggle-signup-pwd-2') {
    const input = document.getElementById(
      action === 'toggle-signup-pwd-1' ? SIGNUP_FIELD_IDS.pwd1 : SIGNUP_FIELD_IDS.pwd2
    );
    if (input) {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      if (triggerEl) triggerEl.classList.toggle('is-revealed', reveal);
      input.focus();
    }
    return true;
  }

  if (action === 'login-google-adc' || action === 'signup-google-prefill') {
    if (typeof startGoogleSignIn === 'function') {
      startGoogleSignIn(action === 'signup-google-prefill' ? 'signup' : 'login');
    }
    return true;
  }

  if (action === 'register-submit') {
    const v = validateSignupForm();
    if (!v.ok) {
      setSignupStatusBadge('FIX FIELDS', 'error');
      showToast(`⚠️ ${v.problems[0]}`);
      return true;
    }
    const role = readSignupField('role') || 'Team Member';
    const dept = readSignupField('dept') || 'Google Cloud';
    const teamAgentId = readSignupField('team') || 'pm_agent';
    const teamObj = TEAM_AGENTS_CYCLE.find((t) => t.id === teamAgentId) || TEAM_AGENTS_CYCLE[0];
    const personalAgentName = readSignupField('agent') || `${v.name.split(' ')[0]}'s Personal Agent`;

    // Optional starter file: anything typed/uploaded becomes the first file of the new workspace
    const refName = readSignupField('refName') || (signupUploadedFile && signupUploadedFile.filename) || '';
    const refContent = readSignupField('refContent') || (signupUploadedFile && signupUploadedFile.content) || '';
    const refFilename = refName || 'starter_reference.txt';
    const refFmt = typeof getFileFormatMeta === 'function' ? getFileFormatMeta(refFilename, signupUploadedFile) : { ext: 'txt', mimeType: 'text/plain' };
    const starterFile =
      refContent.trim().length > 0 || (signupUploadedFile && signupUploadedFile.dataUrl)
        ? {
            filename: refFilename,
            content: refContent || `File: ${refFilename} (${refFmt.badge || refFmt.ext.toUpperCase()})`,
            file_type: (signupUploadedFile && signupUploadedFile.fileType) || refFmt.ext || 'txt',
            mime_type: (signupUploadedFile && signupUploadedFile.mimeType) || refFmt.mimeType || 'text/plain',
            data_url: (signupUploadedFile && signupUploadedFile.dataUrl) || '',
          }
        : null;

    setSignupStatusBadge('PROVISIONING…', 'busy');

    const res = await apiCall('/api/auth/register', 'POST', {
      ldap: v.email,
      name: v.name,
      role,
      org: dept,
      team_agent_id: teamAgentId,
      personal_agent_name: personalAgentName,
      password: v.googleMode ? '' : v.pwd1,
      google_signup: Boolean(v.googleMode),
      environment: '',
      start_empty: !starterFile,
      initial_files: starterFile ? [starterFile] : [],
      require_initial_file: false,
    });
    if (res && res.error) {
      setSignupStatusBadge('REGISTRATION FAILED', 'error');
      showToast(`⚠️ ${res.error}`);
      return true;
    }

    const accountKey = normalizeAccountKey(
      (res && res.account_key) ||
        (res && res.viewer_session && res.viewer_session.account_key) ||
        buildAccountKeyFromEmail(v.email)
    );

    saveRegisteredAccount({
      accountKey,
      email: v.email,
      name: v.name,
      role,
      department: dept,
      team_agent_id: teamAgentId,
      personal_agent_name: personalAgentName,
      nda_clearance: 'TIER-2',
      workspace_tier: 'federated',
      passwordHash: v.googleMode ? '' : hashAccountSecret(v.pwd1),
      created_at_ms: Date.now(),
    });
    if (typeof applyViewerSessionFromState === 'function') {
      applyViewerSessionFromState(res);
    }
    lockAuthState[accountKey] = { email: v.email, name: v.name, authenticated: true };
    activeEnvironment = accountKey;
    activeLockTrack = 'cloud';
    saveDualAuthState();
    setAuthCookieSession({
      accountKey,
      email: v.email,
      name: v.name,
    });

    if (starterFile) {
      saveCustomFileLocal({
        filename: starterFile.filename,
        content: starterFile.content,
        description: 'starter · my first workspace file',
        file_type: starterFile.file_type,
        mime_type: starterFile.mime_type,
        data_url: starterFile.data_url,
        environment: accountKey,
        user_ldap: v.email,
        created_at_ms: Date.now(),
      });
      BLUE_FILE_FALLBACKS[starterFile.filename] = starterFile.content.split('\n');
      activeBlueFileTitle = starterFile.filename;
    }

    if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(true);
    setSignupStatusBadge('ACCOUNT CREATED ✓', 'ready');
    if (typeof playMurphSignupSuccessSound === 'function') playMurphSignupSuccessSound();
    if (typeof triggerSignupSuccessButtonState === 'function') {
      await triggerSignupSuccessButtonState(v.name);
    }
    clearSignupForm();
    updateLockScreenUI();
    renderDynamicDesktopItems(appState);
    updateStickyBarUserIdentity(appState);
    if (typeof switchTerminalTranscript === 'function') {
      switchTerminalTranscript(accountKey);
    }
    switchScreen('home', { animateUnlock: true });
    appendTerminalMessage(
      'murph://auth/register',
      `Welcome, ${v.name}. Created account ${v.email} with ${personalAgentName} bound to ${teamObj.name}. Your workspace starts ${starterFile ? `with 1 starter file (${starterFile.filename})` : 'empty'} — right-click the desktop to add Blue files or create Workflows (yellow folders).`,
      'sys'
    );
    showToast(`✓ Account created · Welcome, ${v.name}! Your fresh workspace is ready.`);
    if (typeof resetOnboardingFlagsForAccount === 'function') resetOnboardingFlagsForAccount(accountKey);
    if (typeof openOnboardingTour === 'function') {
      setTimeout(() => openOnboardingTour(accountKey, true), 1600); // new account ⇒ tour always appears
    }
    return true;
  }

  return false;
}
