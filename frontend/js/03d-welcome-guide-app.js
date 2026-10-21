/* ============================================================================
 * 03d. Welcome Guide App (`03d-welcome-guide-app.js`)
 * ----------------------------------------------------------------------------
 * The empty-workspace Welcome card disappears once the onboarding tour closes;
 * its content lives on as a desktop application every account can re-open:
 *   - Row-1 desktop tile `#desktop-welcome-guide` (`guide:desktop-icon`)
 *   - Floating window `#popup-guide-welcome` (popup id `guide:welcome`)
 * Also owns the shared Workflow Type naming structure (`MURPH_WORKFLOW_TYPES`)
 * and the Bottom Dock app summaries (`MURPH_DOCK_APPS`) used by the tour.
 * ============================================================================ */

/** Workflow Types designed to eliminate "fake work" during a product launch. */
const MURPH_WORKFLOW_TYPES = [
  { key: 'scrub', name: 'Claim Fixes', legacy: 'Claim Scrub', popup: '136:468',
    desc: 'Automatically audits technical claims and generates 1-click auto-fixes to prevent brand/technical errors.' },
  { key: 'tickets', name: 'Cross-Team Agreement', legacy: 'Requests & Tickets', popup: '136:730',
    desc: 'Uses AI agents to negotiate cross-team compromises on shared files automatically.' },
  { key: 'escalations', name: 'Blocker Alerts', legacy: 'Hard-Stop Escalations', popup: '136:417',
    desc: 'Checks budgets, staffing, and timelines, routing quick decision cards for blockers without stopping the rest of the project.' },
  { key: 'policies', name: 'Policy & Rates Sync', legacy: 'Policy Studio & Rates', popup: '136:579',
    desc: 'Keeps policy packs and pricing rates synchronized and runs what-if scenarios.' },
  { key: 'deliverables', name: 'Deliverables', legacy: 'Deliverables & Export', popup: '136:521',
    desc: 'Auto-generates synchronized final assets (blogs, trackers, FAQs, and audit receipts) to prevent version drift.' },
];

/** Bottom Dock apps = live summaries of every workflow, agent and ticket in the group. */
const MURPH_DOCK_APPS = [
  { popup: '136:730', name: 'Cross-Team', blurb: 'Your Personal Agent, the peer agents it talks to, and every Cross-Team Agreement ticket.' },
  { popup: '155:1214', name: 'Claim Fixes', blurb: 'Claim Fixes across all projects — what was verified, auto-fixed or flagged.' },
  { popup: '136:836', name: 'Blocker Alerts', blurb: 'Hard-stop escalations waiting for a 30-second human decision.' },
  { popup: '136:890', name: 'Policy & Sync', blurb: 'Policy packs + PSO rate card the agents enforce, with what-if scenarios.' },
  { popup: '136:942', name: 'Deliverables', blurb: 'The release packet — blog, tracker, FAQ and audit receipt rebuilt together.' },
  { popup: 'trash:bin', name: 'Trash Bin', blurb: 'Deleted files and folders — restore them or delete forever.' },
];

function escapeGuideText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Ordered list of the 5 workflow types ("Name (Legacy name): description"). */
function renderWorkflowTypesHtml(options = {}) {
  const compact = Boolean(options.compact);
  const items = MURPH_WORKFLOW_TYPES.map((t, i) => {
    const inner =
      `<span class="murph-wf-type-icon">${buildMurphIconHtml('yellow', compact ? 0.3 : 0.38)}</span>` +
      `<span class="murph-wf-type-text"><span class="murph-wf-type-name">${i + 1}. ${escapeGuideText(t.name)} ` +
      `<em class="murph-wf-type-legacy">(${escapeGuideText(t.legacy)})</em></span>` +
      `<span class="murph-wf-type-desc">${escapeGuideText(t.desc)}</span></span>`;
    return options.clickable
      ? `<li><button type="button" class="murph-wf-type-item f-interactive" data-open-popup="${t.popup}" title="Open ${escapeGuideText(t.name)}">${inner}</button></li>`
      : `<li><div class="murph-wf-type-item">${inner}</div></li>`;
  });
  return `<ol class="murph-wf-types${compact ? ' compact' : ''}">${items.join('')}</ol>`;
}

/** Clone the real Bottom Dock artwork for a dock app (ids/badges stripped). */
function cloneDockIconHtml(popupId) {
  if (popupId === 'trash:bin') return buildMurphIconHtml('trash', 0.52);
  const iconEl = document.querySelector(
    `#screen-home [data-node-id="99:300"] [data-open-popup="${popupId}"] [data-node-name="Dock icon"]`
  );
  if (!iconEl) return buildMurphIconHtml('agent', 0.55);
  const clone = iconEl.cloneNode(true);
  clone.querySelectorAll('[data-node-name="Dock alert"], .dock-badge, .dynamic-badge').forEach((b) => b.remove());
  [clone, ...clone.querySelectorAll('*')].forEach((n) => {
    n.removeAttribute('id');
    n.removeAttribute('data-node-id');
    n.classList.remove('f-interactive');
  });
  return `<span class="murph-dock-clone" aria-hidden="true">${clone.outerHTML}</span>`;
}

/** Row of dock apps with their real icons + one-line summaries. */
function renderDockAppsHtml(options = {}) {
  const items = MURPH_DOCK_APPS.map(
    (a) =>
      `<li><button type="button" class="murph-dock-app f-interactive" data-open-popup="${a.popup}" title="Open ${escapeGuideText(a.name)}">` +
      `<span class="murph-dock-app-icon">${cloneDockIconHtml(a.popup)}</span>` +
      `<span class="murph-dock-app-text"><span class="murph-dock-app-name">${escapeGuideText(a.name)}</span>` +
      `${options.withBlurb === false ? '' : `<span class="murph-dock-app-blurb">${escapeGuideText(a.blurb)}</span>`}</span></button></li>`
  );
  return `<ul class="murph-dock-apps${options.withBlurb === false ? ' icons-only' : ''}">${items.join('')}</ul>`;
}

function buildWelcomeGuideBodyHtml(accountKey) {
  const key = normalizeAccountKey(accountKey || activeEnvironment);
  const p = getAccountProfileByKey(key);
  const firstName = escapeGuideText((p.displayName || 'there').split(' ')[0]);
  return `
    <div class="murph-guide-hero">
      <div class="murph-guide-kicker">${buildMurphIconHtml('agent', 0.34)} YOUR MURPH WORKSPACE · ${escapeGuideText(getAccountShortTag(key))}</div>
      <h2 class="murph-guide-title">Welcome, ${firstName}</h2>
      <p class="murph-guide-copy">
        ${buildMurphIconHtml('blue', 0.27)} <strong>Blue files</strong> are documents your Personal Agent reads &amp; fact-checks.
        ${buildMurphIconHtml('yellow', 0.27)} <strong>Workflows (yellow folders)</strong> are multi-agent processes that run across teams.
        <strong>Right-click</strong> the desktop any time → <strong>New Workflow</strong> or <strong>New Blue File</strong>.
      </p>
      <div class="murph-guide-actions">
        <button type="button" class="empty-state-btn primary f-interactive" data-open-popup="145:1122">${buildMurphIconHtml('blue', 0.27)} Upload a file</button>
        <button type="button" class="empty-state-btn f-interactive" data-open-popup="145:1045">${buildMurphIconHtml('yellow', 0.27)} Create a workflow</button>
        <button type="button" class="empty-state-btn f-interactive" data-api-action="open-onboarding-tour">? Replay the tour</button>
      </div>
    </div>
    <div class="murph-guide-section">
      <div class="murph-guide-section-title">Workflow types — built to eliminate “fake work” during a product launch</div>
      ${renderWorkflowTypesHtml({ clickable: true })}
    </div>
    <div class="murph-guide-section">
      <div class="murph-guide-section-title">Bottom dock — live summaries of every workflow, agent &amp; ticket in the group</div>
      ${renderDockAppsHtml()}
    </div>
    <div class="murph-guide-section murph-guide-terminal-note">
      <div class="murph-guide-section-title">Agent Terminal</div>
      <p class="murph-guide-copy">The console at the bottom <strong>is your Personal Agent</strong>: ask it anything about your Blue files, or run
      <code>/status</code> <code>/scrub</code> <code>/autofix</code> <code>/resolve</code> <code>/files</code> <code>/trash</code> <code>/help</code>.</p>
    </div>`;
}

function ensureWelcomeGuideWindow() {
  let win = document.getElementById('popup-guide-welcome');
  if (win) return win;
  const trashWin = document.getElementById('popup-trash-bin');
  const layer = (trashWin && trashWin.parentElement) || document.getElementById('os-floating-layer') || document.body;
  win = document.createElement('div');
  win.id = 'popup-guide-welcome';
  win.className = 'os-floating-window welcome-guide-floating-window';
  win.setAttribute('data-popup-id', 'guide:welcome');
  win.setAttribute('data-popup-base-id', 'guide:welcome');
  win.setAttribute('data-floating-popup', 'true');
  win.innerHTML = `
    <div class="trash-win-titlebar murph-guide-titlebar" data-node-name="Window controls and title">
      <div class="trash-win-controls-wrap">
        <div class="trash-win-traffic" data-node-name="Window controls" data-close-popup="true" title="Close Welcome Guide">
          <div data-node-name="Close"></div><div data-node-name="Minimize"></div><div data-node-name="Zoom"></div>
        </div>
        <span class="trash-win-title">GUIDE — Welcome, Workflow Types &amp; Dock Apps</span>
      </div>
      <button type="button" class="murph-guide-close" data-close-popup="true" aria-label="Close">✕</button>
    </div>
    <div class="murph-guide-body" id="murph-guide-body"></div>`;
  layer.appendChild(win);
  // openPopup() only toggles `.active`; re-render for the current account whenever it opens.
  new MutationObserver(() => {
    if (win.classList.contains('active')) renderWelcomeGuideWindow();
  }).observe(win, { attributes: true, attributeFilter: ['class'] });
  return win;
}

function renderWelcomeGuideWindow() {
  const win = ensureWelcomeGuideWindow();
  const body = win.querySelector('#murph-guide-body');
  if (body) body.innerHTML = buildWelcomeGuideBodyHtml(getActiveAccountKey());
}

function ensureWelcomeGuideDesktopTile() {
  const row1 = document.querySelector('#screen-home [data-node-id="99:107"]');
  if (!row1 || document.getElementById('desktop-welcome-guide')) return;
  if (typeof mountTrashBinIcons === 'function') mountTrashBinIcons(); // keep GUIDE after TRASH BIN
  const tile = document.createElement('div');
  tile.id = 'desktop-welcome-guide';
  tile.className = 'f-frame f-interactive f-desktop-item desktop-trash-bin-tile desktop-welcome-guide-tile';
  tile.setAttribute('data-node-id', 'guide:desktop-icon');
  tile.setAttribute('data-desktop-draggable', 'true');
  tile.setAttribute('data-open-popup', 'guide:welcome');
  tile.title = 'Guide · Welcome card, the 5 workflow types, dock apps and the Agent Terminal — click to open';
  tile.innerHTML = `
    <div class="trash-app-icon-box murph-guide-icon-box" data-node-name="App icon">${buildMurphIconHtml('agent', 0.62)}</div>
    <div class="trash-tile-title" data-node-name="Title">GUIDE</div>
    <div class="trash-tile-detail" data-node-name="Detail">Welcome · workflows · dock</div>`;
  row1.appendChild(tile);
  ensureWelcomeGuideWindow();
}

/** Called when the tour closes: the Welcome card goes away for good (per account) — the GUIDE app keeps its content. */
function dismissEmptyAccountStateCard(accountKey) {
  const key = normalizeAccountKey(accountKey || activeEnvironment);
  if (typeof markWelcomeCardDismissed === 'function') markWelcomeCardDismissed(key);
  const cards = document.querySelectorAll('.empty-account-state-card');
  if (!cards.length) return false;
  cards.forEach((card) => {
    card.classList.add('is-dismissing');
    setTimeout(() => card.remove(), 780);
  });
  return true;
}

function initWelcomeGuideApp() {
  ensureWelcomeGuideDesktopTile();
  new MutationObserver(() => {
    if (document.body.classList.contains('home-screen-active')) ensureWelcomeGuideDesktopTile();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomeGuideApp);
} else {
  initWelcomeGuideApp();
}
