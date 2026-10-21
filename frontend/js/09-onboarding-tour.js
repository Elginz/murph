/* ============================================================================
 * 09. First-Run Onboarding Tour (`09-onboarding-tour.js`)
 * ----------------------------------------------------------------------------
 * A 7-step guided tour pop-up (`#murph-onboarding-tour`) that opens right after
 * an account is created (and the first time a self-registered account lands on
 * its Home page); re-openable any time via `data-api-action="open-onboarding-tour"`.
 * Steps: Welcome → Blue files → Yellow folders (5 Workflow Types) → Create with
 * right-click → Agent Terminal → Dock apps → Trash, GUIDE app & switching.
 * Visuals reuse real artwork: `buildMurphIconHtml` (02c), the context-menu items
 * (03c) and the Workflow Types / Dock app renderers (03d).
 * Closing the tour dismisses the empty-workspace Welcome card (03d).
 * ============================================================================ */

const ONBOARDING_TOUR_STEPS = [
  {
    kicker: 'STEP 1 · WELCOME',
    icon: 'agent',
    title: (p) => `Welcome aboard, ${p.displayName.split(' ')[0]}`,
    body: (p) =>
      `This is <strong>your own workspace</strong> — nothing from the Cloud or DM accounts is shared into it. ` +
      `We spawned <strong>${escapeHtmlSafe(p.personalAgentName)}</strong> and bound it to the ` +
      `<strong>${escapeHtmlSafe(getTeamAgentLabel(p.teamAgentId))}</strong>, which reports into the central HUB-AG mesh.`,
    bullets: [
      'Your identity, role, and clearance live in the top-right user pill',
      'Switch between accounts any time from that pill → “Switch User Account”',
      'This tour takes about a minute — use → / ← on your keyboard to move around',
    ],
  },
  {
    kicker: 'STEP 2 · BLUE FILES',
    icon: 'blue',
    title: () => 'Blue files are documents your agent reads',
    body: () =>
      `Blue tiles on the desktop are <strong>knowledge sources</strong> — briefs, PRDs, rate cards, NDA notes. ` +
      `Your Personal Agent grounds every answer in them and <strong>fact-checks claims</strong> against them.`,
    bullets: [
      'Right-click the desktop → <strong>New Blue File</strong> to upload from device or Google Drive (or open the DRIVE folder)',
      'Open a Blue file to read the rendered Markdown, edit the raw source, then “Save & Scrub”',
      'Drag any Blue file you created onto the Trash Bin to delete it (creator-only)',
    ],
  },
  {
    kicker: 'STEP 3 · WORKFLOWS (YELLOW FOLDERS)',
    icon: 'yellow',
    title: () => 'Five workflow types that eliminate “fake work”',
    body: () =>
      `Yellow folders are <strong>Workflows — multi-agent processes that run across teams</strong>. ` +
      `Right-click the desktop → <strong>New Workflow</strong> to create one; every Workflow is one of these five types:`,
    bullets: [],
    visual: () => renderWorkflowTypesHtml({ compact: true }),
  },
  {
    kicker: 'STEP 4 · CREATE WITH RIGHT-CLICK',
    icon: ['blue', 'yellow'],
    title: () => 'Right-click anywhere on the desktop to create',
    body: () =>
      `There is no sidebar. <strong>Right-click the empty desktop</strong> and pick <strong>New Workflow</strong> or <strong>New Blue File</strong> — ` +
      `the Workflow Wizard then lets you choose one of the five types and which Blue files it may read.`,
    bullets: [
      'Right-click a <strong>tile</strong> instead for “Open” and “Move to Trash”',
    ],
    visual: () =>
      `<div class="murph-tour-menu-preview" aria-hidden="true"><div class="murph-ctx-header">Create</div>` +
      `${DESKTOP_CONTEXT_CREATE_ITEMS.map(renderDesktopContextMenuItem).join('')}</div>`,
  },
  {
    kicker: 'STEP 5 · THE TERMINAL IS YOUR AGENT',
    icon: 'agent',
    title: () => 'The Agent Terminal is how you talk to your Personal Agent',
    body: () =>
      `The console at the bottom of the desktop is <strong>not a shell — it is your Personal Agent</strong>. ` +
      `Ask it anything in plain English: it answers from your Blue files, consults the Team Agents, and reports what the workflows did.`,
    bullets: [
      '<code>/status</code> live counts · <code>/scrub</code> run Claim Fixes · <code>/autofix</code> apply 1-click fixes',
      '<code>/resolve</code> settle Blocker Alerts &amp; Cross-Team tickets · <code>/files</code> list Blue files · <code>/trash</code> · <code>/help</code>',
      'Drag the console anywhere, resize it from the corner, or expand it with ⤢',
    ],
    visual: (p) =>
      `<div class="murph-tour-terminal" aria-hidden="true">` +
      `<div class="murph-tour-terminal-bar"><span class="dots"><i></i><i></i><i></i></span>${escapeHtmlSafe((p && p.personalAgentName) || 'Personal Agent')} · <b>AGENT READY</b></div>` +
      `<div class="murph-tour-terminal-line"><span class="src">murph://boot</span> Murph A2A Terminal Agent online. Ask a question or run a command.</div>` +
      `<div class="murph-tour-terminal-line you"><span class="src">you ›</span> which claims in DEMO LAUNCH BRIEF.md still need a fix?</div>` +
      `<div class="murph-tour-terminal-chips"><span>/status</span><span>/scrub</span><span>/autofix</span><span>/resolve</span><span>/files</span><span>/trash</span><span>/help</span></div></div>`,
  },
  {
    kicker: 'STEP 6 · DOCK APPS = GROUP SUMMARIES',
    icon: 'agent',
    title: () => 'The bottom dock summarises everything in your group',
    body: () =>
      `Each dock app is a <strong>live summary across all workflows, agents and tickets</strong> — not a single file. ` +
      `Open one to see where the whole launch stands.`,
    bullets: [],
    visual: () => renderDockAppsHtml(),
  },
  {
    kicker: 'STEP 7 · TRASH, GUIDE & SWITCHING',
    icon: 'trash',
    title: () => 'Clean up, come back to this guide, switch accounts',
    body: () =>
      `Everything from this tour lives on in the <strong>GUIDE</strong> app on your desktop — open it any time for quick actions, workflow types, and dock summaries.`,
    bullets: [
      'Trash Bin keeps deleted files/folders — Restore or Delete Forever from its window',
      'Switch accounts or sign out from the top-right user pill; sign back in on the Lock Screen with your email + password or Google Account',
      'Re-open this tour any time with “? Tour” or from the GUIDE app',
    ],
  },
];

let onboardingTourStep = 0;
let onboardingTourAccountKey = 'cloud';

function getTeamAgentLabel(teamAgentId) {
  const found = (typeof TEAM_AGENTS_CYCLE !== 'undefined' ? TEAM_AGENTS_CYCLE : []).find((t) => t.id === teamAgentId);
  return found ? found.name : 'Cloud PM Team Agent';
}

function ensureOnboardingTourMounted() {
  let el = document.getElementById('murph-onboarding-tour');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'murph-onboarding-tour';
  el.className = 'murph-onboarding-tour';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Murph onboarding tour');
  el.innerHTML = `
    <div class="murph-onboarding-card">
      <div class="murph-onboarding-titlebar">
        <span class="murph-onboarding-kicker" id="murph-onboarding-kicker">STEP 1</span>
        <button type="button" class="murph-onboarding-close" data-tour-action="skip" title="Skip tour">✕</button>
      </div>
      <div class="murph-onboarding-body">
        <div class="murph-onboarding-icon" id="murph-onboarding-icon"></div>
        <div class="murph-onboarding-text">
          <h2 class="murph-onboarding-title" id="murph-onboarding-title"></h2>
          <p class="murph-onboarding-copy" id="murph-onboarding-copy"></p>
          <ul class="murph-onboarding-bullets" id="murph-onboarding-bullets"></ul>
          <div class="murph-onboarding-visual" id="murph-onboarding-visual"></div>
        </div>
      </div>
      <div class="murph-onboarding-footer">
        <div class="murph-onboarding-dots" id="murph-onboarding-dots"></div>
        <div class="murph-onboarding-actions">
          <button type="button" class="murph-onboarding-btn ghost" data-tour-action="skip">Skip</button>
          <button type="button" class="murph-onboarding-btn ghost" data-tour-action="back" id="murph-onboarding-back">← Back</button>
          <button type="button" class="murph-onboarding-btn primary" data-tour-action="next" id="murph-onboarding-next">Next →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tour-action]');
    if (!btn) return;
    const act = btn.getAttribute('data-tour-action');
    if (act === 'skip') closeOnboardingTour();
    else if (act === 'back') renderOnboardingTourStep(onboardingTourStep - 1);
    else if (act === 'next') {
      if (onboardingTourStep >= ONBOARDING_TOUR_STEPS.length - 1) closeOnboardingTour();
      else renderOnboardingTourStep(onboardingTourStep + 1);
    }
  });
  return el;
}

function renderOnboardingTourStep(idx) {
  const el = ensureOnboardingTourMounted();
  onboardingTourStep = Math.max(0, Math.min(ONBOARDING_TOUR_STEPS.length - 1, idx));
  const step = ONBOARDING_TOUR_STEPS[onboardingTourStep];
  const profile = getAccountProfileByKey(onboardingTourAccountKey);
  el.querySelector('#murph-onboarding-kicker').textContent = step.kicker;
  // Real desktop artwork (02c-desktop-icon-templates.js), never an emoji stand-in
  const icons = Array.isArray(step.icon) ? step.icon : [step.icon];
  el.querySelector('#murph-onboarding-icon').innerHTML = icons
    .map((k) => buildMurphIconHtml(k, icons.length > 1 ? 0.72 : 1.2))
    .join('');
  el.querySelector('#murph-onboarding-title').textContent = step.title(profile);
  el.querySelector('#murph-onboarding-copy').innerHTML = step.body(profile);
  const bulletsEl = el.querySelector('#murph-onboarding-bullets');
  bulletsEl.innerHTML = (step.bullets || []).map((b) => `<li>${b}</li>`).join('');
  bulletsEl.style.display = step.bullets && step.bullets.length ? '' : 'none';
  const visualEl = el.querySelector('#murph-onboarding-visual');
  visualEl.innerHTML = typeof step.visual === 'function' ? step.visual(profile) : '';
  visualEl.style.display = visualEl.innerHTML ? '' : 'none';
  el.querySelector('#murph-onboarding-dots').innerHTML = ONBOARDING_TOUR_STEPS.map(
    (_, i) => `<span class="murph-onboarding-dot ${i === onboardingTourStep ? 'active' : ''}"></span>`
  ).join('');
  el.querySelector('#murph-onboarding-back').style.visibility = onboardingTourStep === 0 ? 'hidden' : 'visible';
  el.querySelector('#murph-onboarding-next').textContent =
    onboardingTourStep === ONBOARDING_TOUR_STEPS.length - 1 ? '✓ Start working' : 'Next →';
  const bodyEl = el.querySelector('.murph-onboarding-body');
  if (bodyEl) bodyEl.scrollTop = 0;
}

function openOnboardingTour(accountKey, force) {
  const key = normalizeAccountKey(accountKey || activeEnvironment);
  if (!force && hasSeenOnboardingTour(key)) return;
  onboardingTourAccountKey = key;
  const el = ensureOnboardingTourMounted();
  renderOnboardingTourStep(0);
  el.classList.add('open');
  markOnboardingTourSeen(key);
}

function closeOnboardingTour() {
  const el = document.getElementById('murph-onboarding-tour');
  if (el) el.classList.remove('open');
  if (typeof dismissEmptyAccountStateCard === 'function') {
    dismissEmptyAccountStateCard(onboardingTourAccountKey);
  }
  if (typeof maybeShowDesktopContextMenuHint === 'function') maybeShowDesktopContextMenuHint(3200);
}

document.addEventListener('keydown', (e) => {
  const el = document.getElementById('murph-onboarding-tour');
  if (!el || !el.classList.contains('open')) return;
  if (e.key === 'Escape') closeOnboardingTour();
  if (e.key === 'ArrowRight') renderOnboardingTourStep(onboardingTourStep + 1);
  if (e.key === 'ArrowLeft') renderOnboardingTourStep(onboardingTourStep - 1);
});

// Auto-open for a self-registered account that reloads straight onto its fresh Home page
window.addEventListener('load', () => {
  const key = getActiveAccountKey();
  const homeActive = document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('active');
  if (isCustomAccountKey(key) && homeActive && !hasSeenOnboardingTour(key)) {
    setTimeout(() => openOnboardingTour(key), 1600);
  }
});
