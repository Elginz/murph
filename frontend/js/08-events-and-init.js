/**
 * ============================================================================
 * 08-events-and-init.js — Event Delegation, File Picker & Application Bootstrap
 * ============================================================================
 *
 * Wires up:
 *   1. Global delegated `click` and `keydown` listeners for Figma nodes, popups,
 *      menus, and keyboard shortcuts (`Escape`, `Enter`).
 *   2. Live Personal-to-Team Agent binding preview on the Sign-Up screen.
 *   3. Local file upload reader (`#hidden-file-picker`) for reference specs & folders.
 *   4. Startup initialization hydrating the Sticky Bar user pill, Lock Screen,
 *      Terminal Chat Agent, Trash Bin, dynamic badges, and `/api/state` sync.
 */

// Tactile ~18ms click sound on interactive buttons & distinct ~85ms close sound on popup close buttons
document.addEventListener(
  'click',
  (e) => {
    if (suppressDesktopClick || !e.target || !e.target.closest) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.target.closest('.os-floating-window [data-node-name="Zoom"], .os-popup-wrapper [data-node-name="Zoom"]')) {
      if (typeof playMurphClickSound === 'function') playMurphClickSound();
      return;
    }
    const closeBtnEl = e.target.closest(
      '[data-close-popup], .murph-tour-close, .murph-google-chooser-close, [data-api-action="close-user-settings-menu"], [data-api-action="close-model-menu"]'
    );
    if (closeBtnEl || e.target === popupBackdrop) {
      if (typeof playMurphPopupCloseSound === 'function') playMurphPopupCloseSound();
      return;
    }
    const interactiveEl = e.target.closest(
      'button, .f-interactive, [data-api-action], [data-open-popup], [data-goto], [data-switch-screen], [data-action], [role="button"], [role="option"], .murph-ctx-item'
    );
    if (interactiveEl && typeof playMurphClickSound === 'function') {
      playMurphClickSound();
    }
  },
  true
);

// Delegated click handler for all Figma node interactions
document.addEventListener('click', async (e) => {
  // If a desktop file/folder was just dragged and dropped, suppress the click so it doesn't open the modal
  if (suppressDesktopClick) {
    suppressDesktopClick = false;
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // Close Gemini model menu & User Settings dropdown if clicking outside them
  if (modelMenuEl && modelMenuEl.classList.contains('open') && !e.target.closest('#gemini-model-menu, [data-api-action="toggle-model-menu"]')) {
    if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
    else modelMenuEl.classList.remove('open');
  }
  if (userSettingsMenuEl && userSettingsMenuEl.classList.contains('open') && !e.target.closest('#user-settings-dropdown, [data-api-action="toggle-user-settings-menu"]')) {
    if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
    else userSettingsMenuEl.classList.remove('open');
  }
  const lockAuthBarEl = document.getElementById('lock-dual-auth-bar');
  if (lockAuthBarEl && lockAuthBarEl.classList.contains('open') && !e.target.closest('#lock-dual-auth-bar')) {
    if (typeof setLockAccountDropdownOpen === 'function') setLockAccountDropdownOpen(false);
    else lockAuthBarEl.classList.remove('open');
  }

  if (e.target === popupBackdrop) {
    closePopups();
    return;
  }

  const zoomTrigger = e.target.closest('.os-floating-window [data-node-name="Zoom"], .os-popup-wrapper [data-node-name="Zoom"]');
  if (zoomTrigger) {
    e.stopPropagation();
    const popupWin = zoomTrigger.closest('.os-floating-window, .os-popup-wrapper');
    if (popupWin && typeof togglePopupMaximize === 'function') togglePopupMaximize(popupWin);
    return;
  }

  const closeTrigger = e.target.closest('[data-close-popup]');
  if (closeTrigger) {
    e.stopPropagation();
    const tmsg = closeTrigger.getAttribute('data-toast');
    closePopups(closeTrigger);
    if (tmsg) showToast(tmsg);
    return;
  }

  const apiTrigger = e.target.closest('[data-api-action]');
  if (apiTrigger) {
    e.stopPropagation();
    const act = apiTrigger.getAttribute('data-api-action');
    if (act === 'toggle-model-menu' && e.target.closest('#gemini-model-menu')) return;
    await handleApiAction(act, apiTrigger);
    return;
  }

  const scrollTrigger = e.target.closest('[data-scroll-to]');
  if (scrollTrigger) {
    const destEl = document.querySelector(`[data-node-id="${scrollTrigger.getAttribute('data-scroll-to')}"]`);
    if (destEl) destEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const gotoTrigger = e.target.closest('[data-goto]');
  const popupTrigger = e.target.closest('[data-open-popup]');
  const toastTrigger = e.target.closest('[data-toast]');
  const actionTrigger = e.target.closest('[data-action]');

  if (actionTrigger) {
    const act = actionTrigger.getAttribute('data-action');
    if ((act === 'upload-ref-file' || act === 'browse-folder-files') && filePicker) {
      filePicker.dataset.mode = act;
      filePicker.click();
    }
    return;
  }

  if (gotoTrigger) {
    const destScreen = gotoTrigger.getAttribute('data-goto');
    const wasBlockedFromHome = destScreen === 'home' && typeof isUserAuthenticatedByCookie === 'function' && !isUserAuthenticatedByCookie();
    switchScreen(destScreen);
    if (!wasBlockedFromHome) {
      if (popupTrigger) openPopup(popupTrigger.getAttribute('data-open-popup'), popupTrigger.getAttribute('data-file-title'), popupTrigger.getAttribute('data-deliv-tab'), popupTrigger);
      if (toastTrigger) showToast(toastTrigger.getAttribute('data-toast'));
    }
    return;
  }

  if (popupTrigger) {
    openPopup(popupTrigger.getAttribute('data-open-popup'), popupTrigger.getAttribute('data-file-title'), popupTrigger.getAttribute('data-deliv-tab'), popupTrigger);
    if (toastTrigger) showToast(toastTrigger.getAttribute('data-toast'));
    return;
  }

  if (toastTrigger) {
    showToast(toastTrigger.getAttribute('data-toast'));
    return;
  }

  const fileChipEl = e.target.closest('[data-node-id="183:34"], [data-node-id="183:37"], [data-node-id="183:40"], [data-node-id="183:64"], [data-node-id="183:67"], [data-node-id="183:91"], [data-node-id="183:94"], [data-node-id="183:118"], [data-node-id="155:1233"], [data-node-id="155:1236"], [data-node-id="155:1239"]');
  if (fileChipEl) {
    const rawChipText = (fileChipEl.textContent || '').replace(/^📄\s*/, '').split('·')[0].trim();
    if (rawChipText) openPopup('136:341', rawChipText, null, fileChipEl);
    return;
  }

  const popupCardEl = e.target.closest('[data-node-id="136:404"], [data-node-id="136:407"], [data-node-id="171:27"], [data-node-id="171:52"], [data-node-id="171:77"], [data-node-id="183:300"], [data-node-id="183:305"], [data-node-id="183:310"], [data-node-id="183:319"], [data-node-id="183:327"], [data-node-id="183:158"], [data-node-id="183:164"], [data-node-id="183:170"], [data-node-id="187:28"], [data-node-id="187:32"], [data-node-id="187:36"], [data-node-id="187:41"], [data-node-id="187:54"], [data-node-id="187:67"], [data-node-id="183:374"], [data-node-id="183:378"], [data-node-id="183:382"], [data-node-id="183:389"], [data-node-id="183:399"], [data-node-id="183:409"], [data-node-id="183:419"], [data-node-id="183:431"], [data-node-id="183:453"], #my-agent-extra-tickets-list > *, [data-node-id="155:1253"], [data-node-id="155:1278"], [data-node-id="155:1303"], [data-node-id="183:206"], [data-node-id="183:212"], [data-node-id="183:218"], [data-node-id="183:225"], [data-node-id="183:243"], [data-node-id="183:261"], [data-node-id="181:17"], [data-node-id="181:28"], [data-node-id="181:39"], [data-node-id="181:50"], [data-node-id="181:71"], [data-node-id="181:81"], [data-node-id="183:12"], [data-node-id="183:15"], [data-node-id="183:18"], [data-node-id="183:22"], [data-node-id="183:52"], [data-node-id="183:79"], [data-node-id="183:106"], .drive-doc-row, .workload-route-card');
  if (popupCardEl && popupCardEl.parentElement) {
    const wasSelected = popupCardEl.classList.contains('is-card-selected');
    Array.from(popupCardEl.parentElement.children).forEach((sib) => sib.classList.remove('is-card-selected'));
    if (!wasSelected) popupCardEl.classList.add('is-card-selected');
    if (typeof playMurphClickSound === 'function') playMurphClickSound();
  }
});

// Keyboard shortcuts (Escape closes popups & dropdowns, Enter submits console / login / dock prompt)
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    if (modelMenuEl && modelMenuEl.classList.contains('open')) {
      if (typeof playMurphPopupCloseSound === 'function') playMurphPopupCloseSound();
      if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
      else modelMenuEl.classList.remove('open');
      return;
    }
    if (userSettingsMenuEl && userSettingsMenuEl.classList.contains('open')) {
      if (typeof playMurphPopupCloseSound === 'function') playMurphPopupCloseSound();
      if (typeof setUserSettingsMenuOpen === 'function') setUserSettingsMenuOpen(false);
      else userSettingsMenuEl.classList.remove('open');
      return;
    }
    const lockAuthBarEl = document.getElementById('lock-dual-auth-bar');
    if (lockAuthBarEl && lockAuthBarEl.classList.contains('open')) {
      if (typeof playMurphPopupCloseSound === 'function') playMurphPopupCloseSound();
      if (typeof setLockAccountDropdownOpen === 'function') setLockAccountDropdownOpen(false);
      else lockAuthBarEl.classList.remove('open');
      return;
    }
    if (document.querySelector('.os-floating-window.active, .os-popup-wrapper.active, #murph-onboarding-tour.open, #google-account-chooser-modal.open')) {
      if (typeof playMurphPopupCloseSound === 'function') playMurphPopupCloseSound();
    }
    closePopups();
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && e.target.getAttribute('contenteditable') === 'true') {
    const role = e.target.getAttribute('data-role');
    const nid = e.target.getAttribute('data-node-id');
    if (role === 'console-input') {
      e.preventDefault();
      await handleApiAction('intro-console-run', e.target);
    } else if (role === 'home-console-input') {
      e.preventDefault();
      await handleApiAction('home-console-run', e.target);
    } else if (role === 'dock-agent-input') {
      e.preventDefault();
      const q = getNodeText('183:477').replace(/^murph\s*>\s*/i, '').trim();
      if (q) {
        const taggedIds = Array.from(selectedTicketTaggedUsers);
        const creatorProfile = getActiveLoggedInUserProfile(appState);
        await apiCall('/api/tickets/create', 'POST', {
          title: q.slice(0, 56),
          request_summary: q,
          requester_user_id: creatorProfile.id || (activeEnvironment === 'dm' ? 'user_brand' : 'user_owner'),
          target_user_ids: taggedIds,
          target_team_agent_ids: ['pm_agent', 'brand_agent', 'legal_agent', 'commercial_agent'],
        });
        showToast('✓ Agents settled ticket & updated both initial creator and tagged user(s)!');
      }
    } else if (nid === '64:8' || nid === '64:12') {
      e.preventDefault();
      await handleApiAction('login-submit', e.target);
    }
  }
});

// Live Agent Binding Preview on Sign-Up Screen (65:391) — real <input>/<select> controls
function updateBindingPreview() {
  const rawName = getNodeText('66:14').trim() || 'Your Name';
  const agentInput = document.getElementById('signup-input-agent-name');
  const autoAgentName = `${rawName.split(' ')[0]}'s Personal Agent`;
  if (agentInput && !document.body.dataset.signupAgentNameTouched) {
    agentInput.value = rawName === 'Your Name' ? '' : autoAgentName;
  }
  const pa = getNodeText('66:78').trim() || autoAgentName;
  const teamSel = document.getElementById('signup-select-team-agent');
  const ta = teamSel && teamSel.selectedIndex >= 0 ? teamSel.options[teamSel.selectedIndex].text : 'Cloud PM Team Agent';
  setNodeText('66:85', `${rawName} → ${pa} → ${ta} → HUB-AG`);
}

document.querySelectorAll('#screen-signup [data-bind]').forEach((el) => {
  el.addEventListener('input', updateBindingPreview);
  el.addEventListener('change', updateBindingPreview);
});
const signupAgentNameEl = document.getElementById('signup-input-agent-name');
if (signupAgentNameEl) {
  signupAgentNameEl.addEventListener('input', () => {
    if (signupAgentNameEl.value.trim()) document.body.dataset.signupAgentNameTouched = '1';
    else delete document.body.dataset.signupAgentNameTouched;
  });
}
document.querySelectorAll('#screen-signup .murph-signup-input, #screen-signup .murph-signup-select').forEach((el) => {
  el.addEventListener('input', () => {
    const wrap = el.closest('[data-node-name="Input"]');
    if (wrap) wrap.classList.remove('murph-signup-field-error');
  });
  el.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') {
      e.preventDefault();
      await handleApiAction('register-submit', el);
    }
  });
});
updateBindingPreview();

// Clear placeholder text on focus for console & login inputs
[
  ['64:8', 'Email address'],
  ['64:12', 'Password'],
  ['183:477', 'murph > Ask your Personal Agent to negotiate or query across all 4 teams...'],
  ['152:9', 'Enter folder name'],
  ['152:13', 'Add up to 5 words'],
  ['154:136', 'Add specific instructions or constraints for the agents...'],
  ['163:11', 'Enter a folder name...'],
  ['163:14', 'Add a short description...'],
].forEach(([nid, placeholder]) => {
  document.querySelectorAll(`[data-node-id="${nid}"]`).forEach((el) => {
    el.addEventListener('focus', () => {
      const val = el.textContent.trim();
      if (val === placeholder || (nid === '64:12' && val === LOCK_DEMO_MASKED_PASSWORD)) {
        el.textContent = '';
        el.classList.remove('is-filled');
        if (nid === '64:12') {
          delete el.dataset.demoRealPassword;
          document.body.dataset.lockCredentialsEdited = '1';
        }
      }
    });
    el.addEventListener('input', () => {
      if (nid === '64:8' || nid === '64:12') {
        document.body.dataset.lockCredentialsEdited = '1';
        if (nid === '64:12') {
          delete el.dataset.demoRealPassword;
        } else if (nid === '64:8') {
          const typedEmail = normalizeBuiltinAccountEmail(el.textContent.trim().toLowerCase());
          const isDemo = typedEmail === CLOUD_ACCOUNT_EMAIL || typedEmail === DM_ACCOUNT_EMAIL;
          document.querySelectorAll('[data-node-id="64:12"]').forEach((pwdNode) => {
            if (isDemo) {
              const curPwd = pwdNode.textContent.trim();
              if (!curPwd || curPwd === 'Password') {
                pwdNode.dataset.demoRealPassword = DEMO_ACCOUNT_PASSWORD;
                pwdNode.textContent = LOCK_DEMO_MASKED_PASSWORD;
              }
            } else if (pwdNode.dataset.demoRealPassword || pwdNode.textContent.trim() === LOCK_DEMO_MASKED_PASSWORD) {
              delete pwdNode.dataset.demoRealPassword;
              pwdNode.textContent = 'Password';
            }
          });
        }
        refreshLockFieldFilledStyle();
      }
    });
    el.addEventListener('blur', () => {
      if (!el.textContent.trim()) {
        el.textContent = placeholder;
        if (nid === '64:12') {
          delete el.dataset.demoRealPassword;
        }
      }
      if (nid === '64:8' || nid === '64:12') refreshLockFieldFilledStyle();
    });
  });
});

// Multi-format file reader for Sign-Up reference file & Upload popup (supports PDF, images, CSV, JSON, TXT, DOCX, MD, etc.)
async function readUploadedBrowserFile(f) {
  const fmt =
    typeof getFileFormatMeta === 'function'
      ? getFileFormatMeta(f.name)
      : { ext: 'txt', badge: 'WORKSPACE FILE', mimeType: f.type || 'text/plain' };
  const isTextLike =
    ['txt', 'csv', 'tsv', 'json', 'md', 'log', 'py', 'js', 'ts', 'sql', 'yaml', 'yml', 'html', 'xml', 'svg', 'css', 'sh'].includes(fmt.ext) ||
    (f.type && (f.type.startsWith('text/') || f.type.includes('json') || f.type.includes('csv') || f.type.includes('xml')));
  let dataUrl = '';
  if ((fmt.isImage || fmt.ext === 'pdf') && f.size <= 4 * 1024 * 1024) {
    dataUrl = await new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(f);
      } catch (_) {
        resolve('');
      }
    });
  }
  let content = '';
  if (isTextLike) {
    try {
      content = await f.text();
    } catch (_) {}
  }
  if (!content) {
    const sizeKb = Math.max(0.1, f.size / 1024).toFixed(1);
    content = [
      `FILE: ${f.name}`,
      `Format: ${fmt.badge} (.${fmt.ext.toUpperCase()}) · Size: ${sizeKb} KB`,
      `MIME Type: ${f.type || fmt.mimeType}`,
      '',
      `Uploaded ${fmt.badge.toLowerCase()} indexed in your Murph Workspace and ready to view, download, or reference from your Personal Agent.`,
    ].join('\n');
  }
  return {
    name: f.name,
    filename: f.name,
    content,
    dataUrl,
    fileType: fmt.ext,
    mimeType: f.type || fmt.mimeType,
  };
}

async function stageBrowserFilesForUpload(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  pendingUploadedFiles = [];
  for (const f of files) {
    pendingUploadedFiles.push(await readUploadedBrowserFile(f));
  }
  const curNameField = getNodeText('152:9').replace(/^Enter folder name/i, '').trim();
  if (!curNameField && files[0]) {
    setNodeText('152:9', files[0].name);
  }
  setNodeText('152:24', `${files.length} file(s) ready: ${files.map((f) => f.name).join(', ')}`);
  setNodeText('152:27', 'FILES STAGED · CLICK UPLOAD TO OPEN');
}

if (filePicker) {
  filePicker.removeAttribute('accept');
  filePicker.addEventListener('change', async () => {
    const files = Array.from(filePicker.files || []);
    if (!files.length) return;
    if (filePicker.dataset.mode === 'upload-ref-file') {
      const parsed = await readUploadedBrowserFile(files[0]);
      signupUploadedFile = parsed;
      setNodeText('66:107', parsed.name);
      const refNameInput = document.getElementById('signup-ref-filename');
      const refContentInput = document.getElementById('signup-ref-content');
      if (refNameInput) refNameInput.value = parsed.name;
      if (refContentInput) refContentInput.value = parsed.content.slice(0, 4000);
      setNodeText('66:113', parsed.content.slice(0, 4000));
      setNodeText('66:110', `${parsed.fileType.toUpperCase()} STAGED · OPTIONAL`);
      const lineCount = Math.min(Math.max(parsed.content.split('\n').length, 1), 12);
      const nums = Array.from({ length: lineCount }, (_, i) => String(i + 1).padStart(2, '0')).join('\n');
      setNodeText('66:112', nums);
    } else {
      await stageBrowserFilesForUpload(files);
    }
  });
}

document.querySelectorAll('[data-node-id="152:21"], [data-node-id="152:14"]').forEach((dropEl) => {
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  dropEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await stageBrowserFilesForUpload(e.dataTransfer.files);
    }
  });
});

// Hydrate user auth state from cookie and enforce Home page authentication guard on startup
const startupCookieSession = typeof getAuthCookieSession === 'function' ? getAuthCookieSession() : null;
if (startupCookieSession) {
  activeEnvironment = startupCookieSession.accountKey;
  activeLockTrack = startupCookieSession.accountKey === 'dm' ? 'dm' : 'cloud';
  lockAuthState[startupCookieSession.accountKey] = {
    email: startupCookieSession.email,
    name: startupCookieSession.name,
    authenticated: true,
  };
  saveDualAuthState();
} else {
  Object.keys(lockAuthState || {}).forEach((k) => {
    if (lockAuthState[k]) lockAuthState[k].authenticated = false;
  });
  saveDualAuthState();
  if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(false);
}

applyGeminiModelToDOM(activeGeminiModel);
if (typeof applyDockThemeModeToDOM === 'function') {
  applyDockThemeModeToDOM(typeof getDockThemeMode === 'function' ? getDockThemeMode() : 'light');
}
updateLockScreenUI();
mountStickyBarUserPill();
updateStickyBarUserIdentity(appState);
initTerminalChatAgent();
mountTrashBinIcons();
ensureWorkflowUserPickerMounted();
refreshWorkflowTagSelectionUI();
applySelectedWorkflowTypeUI(activeWorkflowType);
renderDynamicDesktopItems(appState);
updateDynamicFileAndFolderBadges(appState);
renderTrashBinWindow();

const startupPath = (window.location && window.location.pathname ? window.location.pathname : '').replace(/\/+$/, '');
const savedScreenCookie = typeof getActiveScreenCookie === 'function' ? getActiveScreenCookie() : '';
if (startupPath === '/login') {
  switchScreen('lock');
} else if (startupPath === '/signup') {
  switchScreen('signup');
} else if (startupPath === '/home' || startupPath === '/workspace' || savedScreenCookie === 'home') {
  switchScreen('home');
} else {
  // The Intro screen starts active in the HTML, so no switchScreen() runs here: fit
  // it now, or windows narrower than 1440 px crop the Figma frame until a resize.
  fitHomeScreenToViewport();
}

const MOBILE_GUARD_DISMISSED_KEY = 'murph_mobile_guard_dismissed_v1';
function syncMobileGuardOverlay() {
  const overlayEl = document.getElementById('murph-mobile-guard-overlay');
  if (!overlayEl) return;
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(MOBILE_GUARD_DISMISSED_KEY) === '1'; } catch (_) {}
  const vw = window.innerWidth || 1440;
  const vh = window.innerHeight || 900;
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');
  const isCoarseTouch = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const shouldWarn = vw <= 900 || (vw <= 1024 && (isMobileUa || isCoarseTouch));
  const readoutEl = document.getElementById('murph-mobile-viewport-readout');
  if (readoutEl) readoutEl.textContent = `Current: ${vw}×${vh}px`;
  overlayEl.classList.toggle('is-dismissed', dismissed);
  overlayEl.classList.toggle('is-active', shouldWarn && !dismissed);
  overlayEl.setAttribute('aria-hidden', (!shouldWarn || dismissed) ? 'true' : 'false');
}
document.getElementById('murph-mobile-dismiss-btn')?.addEventListener('click', () => {
  try { sessionStorage.setItem(MOBILE_GUARD_DISMISSED_KEY, '1'); } catch (_) {}
  syncMobileGuardOverlay();
});
document.getElementById('murph-mobile-copy-link-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try { await navigator.clipboard.writeText(window.location.href); } catch (_) {}
  btn.textContent = '✓ Link Copied!';
  setTimeout(() => { btn.textContent = '📋 Copy Link for Desktop'; }, 2400);
});
syncMobileGuardOverlay();
window.addEventListener('resize', syncMobileGuardOverlay);

apiCall('/api/state', 'GET');
