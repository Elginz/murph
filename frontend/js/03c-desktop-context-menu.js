/* ============================================================================
 * 03c. Desktop Right-Click Context Menu (`03c-desktop-context-menu.js`)
 * ----------------------------------------------------------------------------
 * Replaces the removed Left Sidebar (Figma 99:59). Right-click anywhere on the
 * Home desktop (99:3) to create things:
 *   - New Workflow   -> Create Workflow wizard (145:1045) — a yellow folder
 *   - New Blue File  -> CREATE FOLDER / DRIVE upload & import window (145:1122)
 * plus quick links (Trash Bin, Guide, Tour). New accounts are created from the
 * user pill (➕ Create Account → Sign-Up page), not from this menu.
 * Right-clicking a desktop tile adds "Open" and "Move to Trash" (creator-only
 * rule enforced by `moveDesktopElementToTrash`). Popup/action items reuse the
 * document-level `[data-open-popup]` / `[data-api-action]` click delegation
 * (08-events-and-init).
 * ============================================================================ */

const DESKTOP_CONTEXT_MENU_ID = 'murph-desktop-context-menu';
const DESKTOP_CONTEXT_HINT_SEEN_KEY = 'murph_desktop_context_hint_seen_v1';

/** Surfaces that keep their own interactions (no desktop menu there). */
const DESKTOP_CONTEXT_MENU_BLOCKLIST = [
  '.os-floating-window', '.os-popup-wrapper', '.trash-bin-floating-window',
  '#user-settings-dropdown', '#gemini-model-menu', '#murph-onboarding-tour', '.flow-hud',
  '[data-node-id="99:235"]', '[data-node-id="99:300"]', '[data-node-id="99:271"]',
  'input', 'textarea', 'select', '[contenteditable="true"]', 'a[href]',
].join(', ');

const DESKTOP_CONTEXT_CREATE_ITEMS = [
  { icon: 'yellow', label: 'New Workflow', hint: 'Yellow folder · multi-agent workflow (Workflow Wizard)', popup: '145:1045' },
  // 152:3 is only the Figma id of the upload FORM inside the DRIVE window — it is not a popup of its own.
  { icon: 'blue', label: 'New Blue File', hint: 'Upload a document or import from Drive (CREATE FOLDER window)', popup: '145:1122' },
];

const DESKTOP_CONTEXT_QUICK_ITEMS = [
  { icon: 'trash', label: 'Open Trash Bin', popup: 'trash:bin' },
  { icon: 'agent', label: 'Open Guide', hint: 'Welcome card, workflow types, dock apps', popup: 'guide:welcome' },
  { glyph: '?', label: 'Take the tour', action: 'open-onboarding-tour' },
];

let desktopContextMenuTargetEl = null;

function renderDesktopContextMenuItem(item) {
  const iconHtml = item.icon
    ? `<span class="murph-ctx-icon">${buildMurphIconHtml(item.icon, item.icon === 'agent' ? 0.46 : 0.4)}</span>`
    : `<span class="murph-ctx-glyph">${item.glyph || '•'}</span>`;
  const attrs = [
    item.popup ? `data-open-popup="${item.popup}"` : '',
    item.action ? `data-api-action="${item.action}"` : '',
    item.ctx ? `data-ctx-action="${item.ctx}"` : '',
  ].join(' ');
  return (
    `<button type="button" class="murph-ctx-item${item.danger ? ' danger' : ''}" role="menuitem" ${attrs}>` +
    `${iconHtml}<span class="murph-ctx-text"><span class="murph-ctx-label">${item.label}</span>` +
    `${item.hint ? `<span class="murph-ctx-hint">${item.hint}</span>` : ''}</span></button>`
  );
}

function getDesktopItemDisplayTitle(el) {
  const titleNode = el.querySelector('[data-node-name="Title"]');
  return (
    el.getAttribute('data-file-title') ||
    el.getAttribute('data-custom-wf-title') ||
    (titleNode ? titleNode.textContent.trim() : '') ||
    'Desktop item'
  );
}

function renderDesktopContextMenuHtml(targetEl) {
  let html = '';
  if (targetEl) {
    const title = getDesktopItemDisplayTitle(targetEl).replace(/</g, '&lt;');
    html += `<div class="murph-ctx-header" title="${title}">${title}</div>`;
    html += renderDesktopContextMenuItem({ glyph: '↗', label: 'Open', ctx: 'open-item' });
    if (targetEl.id !== 'desktop-trash-bin' && targetEl.id !== 'desktop-welcome-guide') {
      html += renderDesktopContextMenuItem({ icon: 'trash', label: 'Move to Trash', ctx: 'trash-item', danger: true });
    }
    html += '<div class="murph-ctx-divider"></div>';
  }
  html += '<div class="murph-ctx-header">Create</div>';
  html += DESKTOP_CONTEXT_CREATE_ITEMS.map(renderDesktopContextMenuItem).join('');
  html += '<div class="murph-ctx-divider"></div>';
  html += DESKTOP_CONTEXT_QUICK_ITEMS.map(renderDesktopContextMenuItem).join('');
  return html;
}

function getDesktopContextMenuEl() {
  let el = document.getElementById(DESKTOP_CONTEXT_MENU_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = DESKTOP_CONTEXT_MENU_ID;
  el.className = 'murph-desktop-context-menu';
  el.setAttribute('role', 'menu');
  document.body.appendChild(el);
  el.addEventListener('click', onDesktopContextMenuItemClick);
  return el;
}

function closeDesktopContextMenu() {
  const el = document.getElementById(DESKTOP_CONTEXT_MENU_ID);
  if (el) el.classList.remove('open');
  desktopContextMenuTargetEl = null;
}

function openDesktopContextMenuAt(clientX, clientY, targetEl) {
  const el = getDesktopContextMenuEl();
  desktopContextMenuTargetEl = targetEl || null;
  el.innerHTML = renderDesktopContextMenuHtml(desktopContextMenuTargetEl);
  el.classList.add('open');
  const pad = 8;
  const left = Math.max(pad, Math.min(clientX, window.innerWidth - el.offsetWidth - pad));
  const top = Math.max(pad, Math.min(clientY, window.innerHeight - el.offsetHeight - pad));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  const first = el.querySelector('.murph-ctx-item');
  if (first) first.focus({ preventScroll: true });
}

function onDesktopContextMenuItemClick(e) {
  const item = e.target.closest('.murph-ctx-item');
  if (!item) return;
  const ctxAction = item.getAttribute('data-ctx-action');
  const targetEl = desktopContextMenuTargetEl;
  closeDesktopContextMenu();
  if (!ctxAction) return; // popup / api-action items are handled by 08-events-and-init delegation
  e.stopPropagation();
  if (!targetEl) return;
  if (ctxAction === 'open-item') {
    targetEl.click();
  } else if (ctxAction === 'trash-item' && typeof moveDesktopElementToTrash === 'function') {
    moveDesktopElementToTrash(targetEl, null);
  }
}

function onDesktopContextMenu(e) {
  const menuEl = document.getElementById(DESKTOP_CONTEXT_MENU_ID);
  if (menuEl && menuEl.contains(e.target)) {
    e.preventDefault();
    return;
  }
  if (!document.body.classList.contains('home-screen-active')) return;
  const home = document.getElementById('screen-home');
  if (!home || !home.contains(e.target)) return;
  if (e.target.closest(DESKTOP_CONTEXT_MENU_BLOCKLIST)) return;
  e.preventDefault();
  const tile = e.target.closest('[data-desktop-draggable="true"]');
  openDesktopContextMenuAt(e.clientX, e.clientY, tile && !tile.classList.contains('empty-account-state-card') ? tile : null);
}

function maybeShowDesktopContextMenuHint() {
  try {
    localStorage.setItem(DESKTOP_CONTEXT_HINT_SEEN_KEY, '1');
  } catch (_err) {
    /* storage unavailable */
  }
}

function initDesktopContextMenu() {
  document.addEventListener('contextmenu', onDesktopContextMenu);
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.target.closest(`#${DESKTOP_CONTEXT_MENU_ID}`)) closeDesktopContextMenu();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDesktopContextMenu();
  });
  window.addEventListener('resize', closeDesktopContextMenu);
  window.addEventListener('blur', closeDesktopContextMenu);

  // Home screen activation → one-time hint (switchScreen toggles `home-screen-active` on <body>).
  let wasHome = document.body.classList.contains('home-screen-active');
  new MutationObserver(() => {
    const isHome = document.body.classList.contains('home-screen-active');
    if (isHome && !wasHome) maybeShowDesktopContextMenuHint();
    if (!isHome) closeDesktopContextMenu();
    wasHome = isHome;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if (wasHome) maybeShowDesktopContextMenuHint();
}

// Spatial Hover Wave Controller for Desktop Files/Folders, Bottom Dock Apps & Popup File Chips/Cards
function clearHoverWaveClasses() {
  document
    .querySelectorAll('.is-hover-target, .is-hover-neighbor-1, .is-hover-neighbor-2')
    .forEach((el) => el.classList.remove('is-hover-target', 'is-hover-neighbor-1', 'is-hover-neighbor-2'));
}

function initHoverWaveController() {
  document.addEventListener('mouseover', (e) => {
    if (!e.target || !e.target.closest) return;
    const desktopTile = e.target.closest('#screen-home .f-desktop-item');
    if (desktopTile && !desktopTile.classList.contains('is-dragging') && !(typeof desktopDragState !== 'undefined' && desktopDragState)) {
      clearHoverWaveClasses();
      desktopTile.classList.add('is-hover-target');
      const r = desktopTile.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const s = typeof homeScale !== 'undefined' && homeScale > 0 ? homeScale : 1;
      document.querySelectorAll('#screen-home .f-desktop-item:not(.is-desktop-hidden)').forEach((other) => {
        if (other === desktopTile || other.style.display === 'none') return;
        const or = other.getBoundingClientRect();
        if (or.width <= 0 || or.height <= 0) return;
        const dist = Math.hypot(or.left + or.width / 2 - cx, or.top + or.height / 2 - cy) / s;
        if (dist <= 178) other.classList.add('is-hover-neighbor-1');
        else if (dist <= 295) other.classList.add('is-hover-neighbor-2');
      });
      return;
    }
    const dockApp = e.target.closest('#screen-home [data-node-id="99:300"] [data-node-name="Dock app"]');
    if (dockApp) {
      clearHoverWaveClasses();
      dockApp.classList.add('is-hover-target');
      const apps = Array.from(dockApp.parentElement.querySelectorAll('[data-node-name="Dock app"]')).filter((a) => a.style.display !== 'none');
      const idx = apps.indexOf(dockApp);
      apps.forEach((a, i) => {
        const d = Math.abs(i - idx);
        if (d === 1) a.classList.add('is-hover-neighbor-1');
        else if (d === 2) a.classList.add('is-hover-neighbor-2');
      });
      return;
    }
    const popItem = e.target.closest(
      '.murph-term-chip, .dock-wf-banner-file-chip, .trash-quick-chip, .wf-custom-file-pill, .drive-doc-row, .trash-item-row, .workload-route-card, .murph-wf-type-item, .murph-dock-app, [data-node-id="183:34"], [data-node-id="183:37"], [data-node-id="183:40"], [data-node-id="183:64"], [data-node-id="183:67"], [data-node-id="183:91"], [data-node-id="183:94"], [data-node-id="183:118"], [data-node-id="155:1233"], [data-node-id="155:1236"], [data-node-id="155:1239"], [data-node-id="154:104"], [data-node-id="154:108"], [data-node-id="154:112"], [data-node-id="154:116"], [data-node-id="154:120"]'
    );
    clearHoverWaveClasses();
    if (popItem) {
      popItem.classList.add('is-hover-target');
      const host = popItem.tagName === 'BUTTON' && popItem.parentElement?.tagName === 'LI' ? popItem.parentElement : popItem;
      [host.previousElementSibling, host.nextElementSibling].forEach((sib) => {
        if (!sib) return;
        const targetSib = sib.tagName === 'LI' ? sib.firstElementChild || sib : sib;
        targetSib.classList.add('is-hover-neighbor-1');
      });
    }
  });
  document.addEventListener('mouseleave', clearHoverWaveClasses);
  window.addEventListener('blur', clearHoverWaveClasses);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDesktopContextMenu();
    initHoverWaveController();
  });
} else {
  initDesktopContextMenu();
  initHoverWaveController();
}
