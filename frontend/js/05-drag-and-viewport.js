/**
 * ============================================================================
 * 05-drag-and-viewport.js — Viewport Scaling, Desktop Drag-and-Drop & Trash Drop
 * ============================================================================
 *
 * Handles:
 *   1. Zero-scroll fullscreen viewport scaling (`fitHomeScreenToViewport`) for
 *      the Home Page (`#screen-home`).
 *   2. Persistent drag-and-drop positioning for desktop files, folders, and
 *      the Agent Terminal (`saveDesktopPositions`, `restoreDesktopPositions`).
 *   3. Drag-to-Trash hit detection & floating drag pill (`getTrashDropTargetAtPoint`,
 *      `updateFileDragGhost`) so dragging any file onto the Trash Bin dumps it.
 *   4. Floating OS window dragging and 8-direction Agent Terminal resizing.
 */

let homeScale = 1;
let topDesktopZIndex = 60;
let suppressDesktopClick = false;
const DESKTOP_POS_STORAGE_KEY = 'murph_desktop_icon_positions_v2';

// Fit all Murph desktop screens seamlessly across 100vw x 100vh with zero black borders
function fitHomeScreenToViewport() {
  const vw = window.innerWidth || 1440;
  const vh = window.innerHeight || 900;

  const lockFrame = document.querySelector('#screen-lock > [data-node-id="61:334"]');
  if (lockFrame) {
    const lockScale = Math.min(vw / 1440, vh / 900);
    lockFrame.dataset.currentScale = String(lockScale);
    lockFrame.style.transformOrigin = 'top center';
    lockFrame.style.width = `${Math.max(1440, Math.ceil(vw / lockScale))}px`;
    lockFrame.style.height = `${Math.max(900, Math.ceil(vh / lockScale))}px`;
    lockFrame.style.transform = `scale(${lockScale})`;
  }

  const signupFrame = document.querySelector('#screen-signup > [data-node-id="65:391"]');
  if (signupFrame) {
    const signupScale = vw < 1440 ? vw / 1440 : 1;
    signupFrame.dataset.currentScale = String(signupScale);
    signupFrame.style.transformOrigin = 'top center';
    signupFrame.style.width = `${Math.max(1440, Math.ceil(vw / signupScale))}px`;
    signupFrame.style.transform = signupScale < 1 ? `scale(${signupScale})` : '';
    signupFrame.style.marginBottom = signupScale < 1 ? `${Math.round(1399 * (signupScale - 1))}px` : '';
  }

  const introFrame = document.querySelector('#screen-intro > [data-node-id="102:3234"]');
  if (introFrame) {
    const introScale = vw < 1440 ? vw / 1440 : 1;
    introFrame.style.transformOrigin = 'top center';
    introFrame.style.width = `${Math.max(1440, Math.ceil(vw / introScale))}px`;
    introFrame.style.transform = introScale < 1 ? `scale(${introScale})` : '';
    const introH = introFrame.offsetHeight || 2800;
    introFrame.style.marginBottom = introScale < 1 ? `${Math.round(introH * (introScale - 1))}px` : '';
  }

  const homeFrame = document.querySelector('#screen-home > [data-node-id="99:3"]');
  if (!homeFrame) return;
  if (!document.body.classList.contains('home-screen-active')) {
    homeFrame.style.transform = '';
    homeFrame.style.width = '1440px';
    homeFrame.style.height = '900px';
    homeScale = 1;
    return;
  }
  homeScale = Math.min(vw / 1440, vh / 860);
  homeFrame.style.transformOrigin = 'top center';
  homeFrame.style.width = `${Math.max(1440, Math.ceil(vw / homeScale))}px`;
  homeFrame.style.height = `${Math.max(860, Math.round(vh / homeScale))}px`;
  homeFrame.style.transform = `scale(${homeScale})`;
  const dockEl = homeFrame.querySelector('[data-node-id="99:300"]');
  if (dockEl) {
    const visibleGapPx = Math.max(22, Math.min(32, Math.round(vh * 0.032)));
    const unscaledGapPx = Math.round(visibleGapPx / homeScale);
    const dockExtraScale = vh < 780 ? Math.max(0.88, Number((vh / 780).toFixed(3))) : 1;
    dockEl.style.setProperty('--dock-bottom-gap', `${unscaledGapPx}px`);
    dockEl.style.setProperty('--dock-responsive-scale', String(dockExtraScale));
    // Short viewports: lift the terminal's default spot so the dock never covers it.
    // Layout offsets (not rects) ignore drag transforms and the unlock animation.
    const termEl = homeFrame.querySelector('[data-node-id="99:235"]');
    if (termEl) {
      termEl.style.setProperty('--term-dock-lift', '0px');
      const abs = (el, k) => { let v = 0; for (; el; el = el.offsetParent) v += el[k]; return v; };
      const termTop = abs(termEl, 'offsetTop') - abs(homeFrame, 'offsetTop');
      const termLeft = abs(termEl, 'offsetLeft') - abs(homeFrame, 'offsetLeft');
      const frameW = Math.max(1440, Math.ceil(vw / homeScale));
      const dockW = dockEl.offsetWidth * dockExtraScale;
      const dockTop = Math.max(860, Math.round(vh / homeScale)) - unscaledGapPx - dockEl.offsetHeight * dockExtraScale;
      const overlapsX = termLeft + termEl.offsetWidth > (frameW - dockW) / 2 - 12 && termLeft < (frameW + dockW) / 2 + 12;
      const lift = overlapsX ? Math.max(0, Math.ceil(termTop + termEl.offsetHeight - (dockTop - 12))) : 0;
      termEl.style.setProperty('--term-dock-lift', `${lift}px`);
    }
  }
  getAllFloatingWindows().forEach((fw) => {
    if (fw.classList.contains('active')) applyFloatingWindowTransform(fw);
  });
  if (modelMenuEl && modelMenuEl.classList.contains('open') && typeof positionGeminiModelDropdown === 'function') {
    positionGeminiModelDropdown();
  }
}

window.addEventListener('resize', fitHomeScreenToViewport);

function getActiveDesktopLayoutKey(explicitAccountKey) {
  const raw = explicitAccountKey || (typeof activeEnvironment !== 'undefined' ? activeEnvironment : 'cloud');
  return typeof normalizeAccountKey === 'function' ? normalizeAccountKey(raw) : String(raw || 'cloud').toLowerCase();
}

function readAllDesktopPositionMaps() {
  try {
    const raw = localStorage.getItem(DESKTOP_POS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function resetDesktopDomElementsToDefault() {
  document.querySelectorAll('#screen-home [data-desktop-draggable="true"]').forEach((el) => {
    el.dataset.dx = '0';
    el.dataset.dy = '0';
    el.dataset.z = '50';
    el.style.transform = '';
    el.style.zIndex = '50';
  });
  const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
  if (consoleEl) {
    consoleEl.dataset.dx = '0';
    consoleEl.dataset.dy = '0';
    delete consoleEl.dataset.w;
    delete consoleEl.dataset.h;
    consoleEl.dataset.z = '10';
    consoleEl.classList.remove('is-expanded');
    consoleEl.style.transform = '';
    consoleEl.style.width = '560px';
    consoleEl.style.height = '310px';
    consoleEl.style.zIndex = '10';
  }
}

function saveDesktopPositions(explicitAccountKey) {
  try {
    const acctKey = getActiveDesktopLayoutKey(explicitAccountKey);
    const allMaps = readAllDesktopPositionMaps();
    const saved = {};
    document.querySelectorAll('#screen-home [data-desktop-draggable="true"]').forEach((el) => {
      const nid = el.getAttribute('data-node-id');
      const dx = parseFloat(el.dataset.dx || '0');
      const dy = parseFloat(el.dataset.dy || '0');
      if (nid && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        saved[nid] = { dx, dy, z: Math.max(parseInt(el.dataset.z || '60', 10), 60) };
      }
    });
    const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
    if (consoleEl) {
      const dx = parseFloat(consoleEl.dataset.dx || '0');
      const dy = parseFloat(consoleEl.dataset.dy || '0');
      const w = parseFloat(consoleEl.dataset.w || '0');
      const h = parseFloat(consoleEl.dataset.h || '0');
      const expanded = consoleEl.classList.contains('is-expanded');
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || w > 0 || h > 0 || expanded) {
        saved['99:235'] = { dx, dy, w: w || undefined, h: h || undefined, expanded: expanded || undefined, z: 10 };
      }
    }
    allMaps[acctKey] = saved;
    localStorage.setItem(DESKTOP_POS_STORAGE_KEY, JSON.stringify(allMaps));
  } catch (_) {}
}

function restoreDesktopPositions(explicitAccountKey) {
  try {
    resetDesktopDomElementsToDefault();
    const acctKey = getActiveDesktopLayoutKey(explicitAccountKey);
    const allMaps = readAllDesktopPositionMaps();
    const saved = allMaps[acctKey];
    if (!saved || typeof saved !== 'object') return;
    const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
    Object.entries(saved).forEach(([nid, pos]) => {
      if (!pos || typeof pos !== 'object') return;
      if (nid === '99:235') {
        if (consoleEl) {
          const dx = typeof pos.dx === 'number' ? pos.dx : 0;
          const dy = typeof pos.dy === 'number' ? pos.dy : 0;
          consoleEl.dataset.dx = String(dx);
          consoleEl.dataset.dy = String(dy);
          consoleEl.dataset.z = '10';
          consoleEl.style.zIndex = '10';
          consoleEl.style.transform = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 ? `translate3d(${dx}px, ${dy}px, 0)` : '';
          if (pos.expanded) consoleEl.classList.add('is-expanded');
          if (typeof pos.w === 'number' && pos.w >= 320) {
            consoleEl.dataset.w = String(pos.w);
            consoleEl.style.width = `${pos.w}px`;
          }
          if (typeof pos.h === 'number' && pos.h >= 140) {
            consoleEl.dataset.h = String(pos.h);
            consoleEl.style.height = `${pos.h}px`;
          }
        }
        return;
      }
      const el = document.querySelector(`#screen-home [data-desktop-draggable="true"][data-node-id="${nid}"]`);
      if (el && typeof pos.dx === 'number' && typeof pos.dy === 'number') {
        el.dataset.dx = String(pos.dx);
        el.dataset.dy = String(pos.dy);
        const z = Math.max(pos.z || ++topDesktopZIndex, 60);
        el.dataset.z = String(z);
        el.style.zIndex = String(z);
        el.style.transform = `translate3d(${pos.dx}px, ${pos.dy}px, 0)`;
        if (z > topDesktopZIndex) topDesktopZIndex = z;
      }
    });
  } catch (_) {}
}

function clearAccountDesktopPositions(accountKey) {
  try {
    const acctKey = getActiveDesktopLayoutKey(accountKey);
    const allMaps = readAllDesktopPositionMaps();
    delete allMaps[acctKey];
    localStorage.setItem(DESKTOP_POS_STORAGE_KEY, JSON.stringify(allMaps));
  } catch (_) {}
  if (getActiveDesktopLayoutKey() === getActiveDesktopLayoutKey(accountKey)) {
    resetDesktopDomElementsToDefault();
  }
}

function resetDesktopPositions() {
  try {
    localStorage.removeItem(DESKTOP_POS_STORAGE_KEY);
  } catch (_) {}
  resetDesktopDomElementsToDefault();
  getAllFloatingWindows().forEach((fw) => {
    fw.dataset.dx = '0';
    fw.dataset.dy = '0';
    delete fw.dataset.userDragged;
    applyFloatingWindowTransform(fw);
  });
}

function findDesktopItemAtPoint(target, clientX, clientY) {
  if (
    target &&
    target.closest &&
    target.closest('.os-floating-window, .os-popup-wrapper, .flow-hud, .gemini-model-menu, .user-settings-dropdown')
  ) {
    return null;
  }
  const direct = target && target.closest ? target.closest('#screen-home [data-desktop-draggable="true"]') : null;
  if (direct && !direct.classList.contains('is-desktop-hidden') && direct.style.display !== 'none') return direct;
  if (!document.body.classList.contains('home-screen-active')) return null;
  if (popupBackdrop && popupBackdrop.classList.contains('open')) return null;

  const items = Array.from(document.querySelectorAll('#screen-home [data-desktop-draggable="true"]')).filter(
    (item) => !item.classList.contains('is-desktop-hidden') && item.style.display !== 'none'
  );
  items.sort((a, b) => parseInt(b.dataset.z || b.style.zIndex || '50', 10) - parseInt(a.dataset.z || a.style.zIndex || '50', 10));
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return item;
    }
  }
  return null;
}

function getTerminalResizeEdge(consoleEl, clientX, clientY) {
  if (!consoleEl) return null;
  const rect = consoleEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }
  const edge = 8;
  const corner = 14;
  const nearLeft = clientX - rect.left <= edge;
  const nearRight = rect.right - clientX <= edge;
  const nearBottom = rect.bottom - clientY <= edge;
  const nearTop = clientY - rect.top <= 5;
  if (rect.right - clientX <= corner && rect.bottom - clientY <= corner) return 'se';
  if (clientX - rect.left <= corner && rect.bottom - clientY <= corner) return 'sw';
  if (nearRight && nearTop) return 'ne';
  if (nearLeft && nearTop) return 'nw';
  if (nearRight) return 'e';
  if (nearLeft) return 'w';
  if (nearBottom) return 's';
  if (nearTop) return 'n';
  return null;
}

function edgeToCursor(edge) {
  if (edge === 'se' || edge === 'nw') return 'nwse-resize';
  if (edge === 'sw' || edge === 'ne') return 'nesw-resize';
  if (edge === 'e' || edge === 'w') return 'ew-resize';
  if (edge === 's' || edge === 'n') return 'ns-resize';
  return '';
}

function switchScreen(target, options) {
  let blockedHomeRedirect = false;
  if (target === 'home' && typeof isUserAuthenticatedByCookie === 'function' && !isUserAuthenticatedByCookie()) {
    target = 'lock';
    blockedHomeRedirect = true;
  }
  const prevAuthScreenEl =
    (screens.lock && screens.lock.classList.contains('active') && screens.lock) ||
    (screens.signup && screens.signup.classList.contains('active') && screens.signup) ||
    null;

  if (typeof setActiveScreenCookie === 'function') setActiveScreenCookie(target);
  closePopups();
  hudButtons.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-switch-screen') === target));

  const isHome = target === 'home';
  const isLock = target === 'lock';
  const shouldAnimateUnlock = isHome && !blockedHomeRedirect && Boolean(prevAuthScreenEl || (options && options.animateUnlock));

  if (window._murphUnlockAnimTimer) {
    clearTimeout(window._murphUnlockAnimTimer);
    window._murphUnlockAnimTimer = null;
  }
  [screens.lock, screens.signup, screens.home].forEach((el) => {
    if (el) el.classList.remove('is-unlocking-exit', 'is-unlocking-enter');
  });

  document.documentElement.classList.toggle('home-screen-active', isHome);
  document.body.classList.toggle('home-screen-active', isHome);
  document.documentElement.classList.toggle('lock-screen-active', isLock);
  document.body.classList.toggle('lock-screen-active', isLock);

  if (target === 'board') {
    document.body.classList.add('board-mode');
    fitHomeScreenToViewport();
    return;
  }

  document.body.classList.remove('board-mode');
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.classList.toggle('active', key === target);
  });
  if (typeof updateStickyBarUserIdentity === 'function') updateStickyBarUserIdentity(appState);
  if (isHome) {
    if (typeof setDockLoginSessionActive === 'function') setDockLoginSessionActive(true);
    if (typeof syncBottomDockAndPopups === 'function') syncBottomDockAndPopups(appState);
    window.scrollTo(0, 0);
    fitHomeScreenToViewport();
    if (shouldAnimateUnlock && screens.home) {
      if (typeof playMurphLoginSound === 'function') playMurphLoginSound();
      const exitScreen = prevAuthScreenEl || screens.lock;
      if (exitScreen) {
        const innerFrame = exitScreen.querySelector('[data-node-id="61:334"], [data-node-id="65:391"]');
        if (innerFrame) {
          const baseScale = innerFrame.dataset.currentScale || String(homeScale || 1);
          innerFrame.style.setProperty('--unlock-base-scale', baseScale);
        }
        exitScreen.classList.add('is-unlocking-exit');
      }
      void screens.home.offsetWidth;
      screens.home.classList.add('is-unlocking-enter');
      window._murphUnlockAnimTimer = setTimeout(() => {
        if (exitScreen) exitScreen.classList.remove('is-unlocking-exit');
        if (screens.home) screens.home.classList.remove('is-unlocking-enter');
        window._murphUnlockAnimTimer = null;
      }, 1480);
    }
  } else {
    fitHomeScreenToViewport();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (blockedHomeRedirect && typeof showToast === 'function') {
    showToast('🔒 Please sign in first to access the Murph Home Workspace.');
  }
}

// Hit-detection for throwing (dragging & dropping) desktop files/folders into the Trash Bin
function getDraggedFileDisplayLabel(el) {
  if (!el) return 'File';
  const titleNode = el.querySelector ? el.querySelector('[data-node-name="Title"]') : null;
  return (
    el.getAttribute('data-file-title') ||
    el.getAttribute('data-custom-wf-title') ||
    (titleNode && titleNode.textContent ? titleNode.textContent.trim() : '') ||
    'File'
  );
}

function ensureFileDragGhost() {
  let ghost = document.getElementById('murph-file-drag-ghost');
  if (!ghost && document.body) {
    ghost = document.createElement('div');
    ghost.id = 'murph-file-drag-ghost';
    ghost.className = 'murph-file-drag-ghost';
    document.body.appendChild(ghost);
  }
  return ghost;
}

function updateFileDragGhost(clientX, clientY, draggedEl, isOverTrash) {
  if (!draggedEl || draggedEl.id === 'desktop-trash-bin') return;
  const nid = draggedEl.getAttribute('data-node-id') || '';
  if (nid === 'trash:desktop-icon' || nid === 'guide:desktop-icon') return;
  const ghost = ensureFileDragGhost();
  if (!ghost) return;
  const label = getDraggedFileDisplayLabel(draggedEl);
  const isWf =
    Boolean(SEED_WORKFLOW_NODE_MAP[nid]) ||
    draggedEl.getAttribute('data-custom-desktop-item') === 'workflow';
  const icon = isWf ? '📁' : '📄';
  const perm =
    typeof canCurrentUserDeleteDesktopItem === 'function'
      ? canCurrentUserDeleteDesktopItem(draggedEl)
      : { allowed: true };
  ghost.style.display = 'inline-flex';
  ghost.style.transform = `translate3d(${Math.round(clientX + 14)}px, ${Math.round(clientY + 14)}px, 0)`;
  ghost.classList.toggle('is-trash-ready', Boolean(isOverTrash && perm.allowed));
  if (isOverTrash) {
    ghost.textContent = perm.allowed
      ? `🗑️ Release to Dump "${label}" into Trash Bin!`
      : `🔒 Only creator (${perm.creatorLdap || 'owner'}) can delete "${label}"`;
  } else {
    ghost.textContent = perm.allowed
      ? `${icon} ${label} · Drag into 🗑️ Trash Bin to dump`
      : `${icon} ${label} · Shared by ${perm.creatorLdap || 'creator'} (creator-only delete)`;
  }
}

function hideFileDragGhost() {
  const ghost = document.getElementById('murph-file-drag-ghost');
  if (ghost) {
    ghost.style.display = 'none';
    ghost.classList.remove('is-trash-ready');
  }
}

function getTrashDropTargetAtPoint(clientX, clientY, draggedEl) {
  if (!document.getElementById('desktop-trash-bin') && typeof mountTrashBinIcons === 'function') {
    mountTrashBinIcons();
  }
  if (draggedEl) {
    const draggedNid = draggedEl.getAttribute('data-node-id') || '';
    if (draggedEl.id === 'desktop-trash-bin' || draggedNid === 'trash:desktop-icon' || draggedNid === 'guide:desktop-icon') {
      return null;
    }
  }
  const dragRect =
    draggedEl && draggedEl.getBoundingClientRect ? draggedEl.getBoundingClientRect() : null;
  const candidates = [
    document.getElementById('popup-trash-bin'),
    document.getElementById('desktop-trash-bin'),
  ];
  for (const el of candidates) {
    if (!el || el === draggedEl) continue;
    if (el.id === 'popup-trash-bin' && !el.classList.contains('active')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    // 1. Direct pointer hit with generous 24px drop halo
    const pointerHit =
      clientX >= rect.left - 24 &&
      clientX <= rect.right + 24 &&
      clientY >= rect.top - 24 &&
      clientY <= rect.bottom + 24;
    if (pointerHit) return el;

    // 2. Bounding-box intersection between dragged file tile and Trash Bin icon/window
    if (dragRect && dragRect.width > 0 && dragRect.height > 0) {
      const insetX = Math.min(8, dragRect.width * 0.1);
      const insetY = Math.min(8, dragRect.height * 0.1);
      const dLeft = dragRect.left + insetX;
      const dRight = dragRect.right - insetX;
      const dTop = dragRect.top + insetY;
      const dBottom = dragRect.bottom - insetY;
      const boxOverlap =
        dLeft <= rect.right + 8 &&
        dRight >= rect.left - 8 &&
        dTop <= rect.bottom + 8 &&
        dBottom >= rect.top - 8;
      if (boxOverlap) return el;
    }
  }
  return null;
}

function clearTrashDropHighlights() {
  ['desktop-trash-bin', 'popup-trash-bin', 'trash-win-dropzone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('trash-drop-target-hover');
  });
  document.querySelectorAll('#screen-home .f-desktop-item.is-over-trash').forEach((el) => {
    el.classList.remove('is-over-trash');
  });
}
