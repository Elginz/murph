/**
 * ============================================================================
 * 05b-pointer-drag-events.js — Pointer Drag/Resize & Screen HUD Controllers
 * ============================================================================
 *
 * Handles:
 *   1. `mousedown` / `mousemove` / `mouseup` dragging for Floating & Overlay OS
 *      Popup Windows, Desktop Files/Folders (with Trash Bin hit-detection),
 *      and the Agent Command Console / Terminal (99:235 move & 8-edge resize).
 *   2. Initial restoration of desktop item & terminal coordinates.
 *   3. Bottom-right HUD screen switcher and Figma Board zoom buttons.
 */

// Make all Floating & Overlay OS Popup Windows freely draggable, all Home Page Desktop Files/Folders freely draggable, AND the Terminal (99:235) movable & resizable
let dragState = null;
let desktopDragState = null;

function isPopupScrollbarZone(popupWin, rect, clientX, clientY) {
  if (!popupWin || popupWin.scrollHeight <= popupWin.clientHeight + 2) return false;
  const distRight = rect.right - clientX;
  return distRight > 4 && distRight <= 18 && clientY > rect.top + 48 && clientY < rect.bottom - 18;
}

function getPopupResizeEdge(popupWin, clientX, clientY) {
  if (!popupWin) return null;
  const rect = popupWin.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }
  if (isPopupScrollbarZone(popupWin, rect, clientX, clientY)) return null;
  const edge = 9;
  const corner = 16;
  const nearLeft = clientX - rect.left <= edge;
  const nearRight = rect.right - clientX <= edge;
  const nearBottom = rect.bottom - clientY <= edge;
  const nearTop = clientY - rect.top <= 7;
  const nearCornerRight = rect.right - clientX <= corner;
  const nearCornerBottom = rect.bottom - clientY <= corner;
  const nearCornerLeft = clientX - rect.left <= corner;
  const nearCornerTop = clientY - rect.top <= corner;

  if (nearCornerRight && nearCornerBottom) return 'se';
  if (nearCornerLeft && nearCornerBottom) return 'sw';
  if (nearCornerRight && nearCornerTop && (nearRight || nearTop)) return 'ne';
  if (nearCornerLeft && nearCornerTop && (nearLeft || nearTop)) return 'nw';
  if (nearRight) return 'e';
  if (nearLeft) return 'w';
  if (nearBottom) return 's';
  if (nearTop) return 'n';
  return null;
}

function getPopupWinScale(popupWin) {
  if (!popupWin || !popupWin.classList.contains('os-floating-window')) return 1;
  const cssScale = parseFloat(popupWin.style.getPropertyValue('--win-scale') || '');
  if (cssScale > 0) return cssScale;
  return Math.min(1, Math.max(0.88, typeof homeScale !== 'undefined' && homeScale ? homeScale : 1));
}

function applyPopupWindowSizeAndPos(popupWin, w, h, dx, dy, isFloating) {
  if (!popupWin) return;
  if (typeof w === 'number' && w > 0) {
    popupWin.dataset.w = String(w);
    popupWin.style.setProperty('--popup-w', `${w}px`);
    popupWin.style.width = `${w}px`;
    popupWin.classList.add('is-popup-resized');
  }
  if (typeof h === 'number' && h > 0) {
    popupWin.dataset.h = String(h);
    popupWin.style.setProperty('--popup-h', `${h}px`);
    popupWin.style.height = `${h}px`;
    popupWin.classList.add('is-popup-resized');
  }
  if (typeof dx === 'number') popupWin.dataset.dx = String(dx);
  if (typeof dy === 'number') popupWin.dataset.dy = String(dy);
  const finalDx = parseFloat(popupWin.dataset.dx || '0');
  const finalDy = parseFloat(popupWin.dataset.dy || '0');
  if (isFloating) {
    applyFloatingWindowTransform(popupWin);
  } else {
    popupWin.style.transform = '';
    popupWin.style.setProperty('--dx', `${finalDx}px`);
    popupWin.style.setProperty('--dy', `${finalDy}px`);
  }
}

function resetPopupWindowSize(popupWin) {
  if (!popupWin) return;
  ['w', 'h', 'prevW', 'prevH', 'prevDx', 'prevDy'].forEach((k) => delete popupWin.dataset[k]);
  popupWin.classList.remove('is-popup-resized', 'is-popup-maximized', 'is-popup-resizing');
  popupWin.style.removeProperty('--popup-w');
  popupWin.style.removeProperty('--popup-h');
  popupWin.style.width = '';
  popupWin.style.height = '';
}

function togglePopupMaximize(popupWin) {
  if (!popupWin) return;
  const isFloating = popupWin.classList.contains('os-floating-window');
  const winScale = getPopupWinScale(popupWin);
  if (popupWin.classList.contains('is-popup-maximized')) {
    popupWin.classList.remove('is-popup-maximized');
    const prevW = parseFloat(popupWin.dataset.prevW || '0');
    const prevH = parseFloat(popupWin.dataset.prevH || '0');
    const prevDx = parseFloat(popupWin.dataset.prevDx || '0');
    const prevDy = parseFloat(popupWin.dataset.prevDy || '0');
    ['prevW', 'prevH', 'prevDx', 'prevDy'].forEach((k) => delete popupWin.dataset[k]);
    if (prevW > 0 || prevH > 0) {
      applyPopupWindowSizeAndPos(popupWin, prevW || 900, prevH || 0, prevDx, prevDy, isFloating);
      if (!prevH) {
        delete popupWin.dataset.h;
        popupWin.style.removeProperty('--popup-h');
        popupWin.style.height = '';
      }
    } else {
      resetPopupWindowSize(popupWin);
      applyPopupWindowSizeAndPos(popupWin, 0, 0, prevDx, prevDy, isFloating);
    }
    return;
  }
  popupWin.dataset.prevW = popupWin.dataset.w || '';
  popupWin.dataset.prevH = popupWin.dataset.h || '';
  popupWin.dataset.prevDx = popupWin.dataset.dx || '0';
  popupWin.dataset.prevDy = popupWin.dataset.dy || '0';
  popupWin.classList.add('is-popup-maximized', 'is-popup-resized');
  const maxW = Math.round(((window.innerWidth || 1440) * 0.94) / winScale);
  const maxH = Math.round(((window.innerHeight || 900) * 0.86) / winScale);
  applyPopupWindowSizeAndPos(popupWin, maxW, maxH, 0, 0, isFloating);
}

document.addEventListener('dblclick', (e) => {
  const titlebar = e.target?.closest?.(
    '.os-floating-window [data-node-name="Window titlebar"], .os-floating-window [data-node-name="macOS dark titlebar"], .os-floating-window .trash-win-titlebar, .os-floating-window .murph-guide-titlebar, .os-popup-wrapper [data-node-name="Window titlebar"]'
  );
  if (!titlebar || e.target.closest('[data-close-popup], .murph-guide-close, .f-interactive, button')) return;
  const popupWin = titlebar.closest('.os-floating-window, .os-popup-wrapper');
  if (popupWin) {
    e.preventDefault();
    togglePopupMaximize(popupWin);
  }
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;

  // 1. Check if resizing or dragging an open Floating Desktop Popup Window or Overlay Popup Window
  const popupWin = e.target.closest('.os-floating-window, .os-popup-wrapper');
  if (popupWin) {
    const isFloating = popupWin.classList.contains('os-floating-window');
    if (isFloating) {
      popupWin.style.zIndex = String(++topFloatingZIndex);
    }
    const rect = popupWin.getBoundingClientRect();
    if (isPopupScrollbarZone(popupWin, rect, e.clientX, e.clientY)) return;
    const resizeEdge = !e.target.closest('[data-close-popup], .murph-guide-close')
      ? getPopupResizeEdge(popupWin, e.clientX, e.clientY)
      : null;
    const startX = e.clientX;
    const startY = e.clientY;
    const origDx = parseFloat(popupWin.dataset.dx || '0');
    const origDy = parseFloat(popupWin.dataset.dy || '0');
    if (resizeEdge) {
      const winScale = getPopupWinScale(popupWin);
      const origW = Math.max(480, Math.round(rect.width / winScale));
      const origH = Math.max(280, Math.round(rect.height / winScale));
      popupWin.classList.remove('is-popup-maximized');
      dragState = {
        wrapper: popupWin,
        isFloating,
        mode: 'resize',
        edge: resizeEdge,
        winScale,
        startX,
        startY,
        origDx,
        origDy,
        origW,
        origH,
        moved: false,
      };
      e.preventDefault();
      return;
    }
    if (
      e.target.closest(
        '[data-close-popup], .murph-guide-close, .f-interactive, [contenteditable="true"], textarea, input, select, button, .doc-viewer-drawer, .drive-docs-browser, .workload-topology-container, .trash-win-list, .trash-quick-chips'
      )
    ) {
      return;
    }
    dragState = {
      wrapper: popupWin,
      isFloating,
      mode: 'move',
      startX,
      startY,
      origDx,
      origDy,
      moved: false,
    };
    return;
  }

  // 2. Priority 1 on Home Page: Desktop File / Folder (always wins over the terminal even when overlapping)
  const targetFileEl = findDesktopItemAtPoint(e.target, e.clientX, e.clientY);
  if (targetFileEl) {
    const newZ = ++topDesktopZIndex;
    targetFileEl.dataset.z = String(newZ);
    targetFileEl.style.zIndex = String(newZ);

    desktopDragState = {
      el: targetFileEl,
      mode: 'file',
      startX: e.clientX,
      startY: e.clientY,
      origDx: parseFloat(targetFileEl.dataset.dx || '0'),
      origDy: parseFloat(targetFileEl.dataset.dy || '0'),
      moved: false,
      lastTrashHit: null,
    };
    e.preventDefault();
    return;
  }

  // 3. Priority 2 on Home Page: Adjust (Move or Resize) the Agent Command Console / Terminal (99:235)
  const consoleEl = e.target.closest('#screen-home [data-node-id="99:235"]');
  if (
    consoleEl &&
    !e.target.closest(
      '[data-open-popup], [data-api-action], [contenteditable="true"], textarea, input, button, .murph-term-composer, #home-terminal-input, .murph-terminal-log, .murph-term-quick-bar'
    )
  ) {
    const resizeEdge = getTerminalResizeEdge(consoleEl, e.clientX, e.clientY);
    consoleEl.dataset.z = '10';
    consoleEl.style.zIndex = '10';
    desktopDragState = {
      el: consoleEl,
      mode: resizeEdge ? 'terminal-resize' : 'terminal-move',
      edge: resizeEdge,
      startX: e.clientX,
      startY: e.clientY,
      origDx: parseFloat(consoleEl.dataset.dx || '0'),
      origDy: parseFloat(consoleEl.dataset.dy || '0'),
      origW: parseFloat(consoleEl.dataset.w || String(consoleEl.offsetWidth || 560)),
      origH: parseFloat(consoleEl.dataset.h || String(consoleEl.offsetHeight || 310)),
      moved: false,
    };
    e.preventDefault();
  }
});

document.addEventListener('mousemove', (e) => {
  if (dragState) {
    const rawDx = e.clientX - dragState.startX;
    const rawDy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(rawDx, rawDy) > 2) {
      dragState.moved = true;
      dragState.wrapper.classList.add('is-dragging');
      if (dragState.mode === 'resize') {
        dragState.wrapper.classList.add('is-popup-resizing');
      } else {
        dragState.wrapper.dataset.userDragged = 'true';
      }
    }
    if (dragState.moved) {
      if (dragState.mode === 'resize') {
        const S = dragState.winScale || 1;
        const dX = rawDx / S;
        const dY = rawDy / S;
        const edge = dragState.edge || 'se';
        const minW = 480;
        const maxW = Math.max(minW, Math.round(((window.innerWidth || 1440) * 0.96) / S));
        const minH = 280;
        const maxH = Math.max(minH, Math.round(((window.innerHeight || 900) * 0.92) / S));
        let newW = dragState.origW;
        let newH = dragState.origH;
        let newDx = dragState.origDx;
        let newDy = dragState.origDy;

        if (edge.includes('e')) {
          newW = Math.min(maxW, Math.max(minW, Math.round(dragState.origW + dX)));
          newDx = Math.round(dragState.origDx + ((newW - dragState.origW) * S) / 2);
        }
        if (edge.includes('w')) {
          newW = Math.min(maxW, Math.max(minW, Math.round(dragState.origW - dX)));
          newDx = Math.round(dragState.origDx - ((newW - dragState.origW) * S) / 2);
        }
        if (edge.includes('s')) {
          newH = Math.min(maxH, Math.max(minH, Math.round(dragState.origH + dY)));
          newDy = Math.round(dragState.origDy + ((newH - dragState.origH) * S) / 2);
        }
        if (edge.includes('n')) {
          newH = Math.min(maxH, Math.max(minH, Math.round(dragState.origH - dY)));
          newDy = Math.round(dragState.origDy - ((newH - dragState.origH) * S) / 2);
        }
        const halfViewH = (window.innerHeight || 900) / 2;
        const maxOffsetDy = Math.max(0, Math.round(halfViewH - (newH * S) / 2 - 10));
        newDy = Math.max(-maxOffsetDy, Math.min(maxOffsetDy, newDy));
        applyPopupWindowSizeAndPos(dragState.wrapper, newW, newH, newDx, newDy, dragState.isFloating);
      } else {
        const nx = Math.round(dragState.origDx + rawDx);
        const halfViewH = (window.innerHeight || 900) / 2;
        const winH = dragState.wrapper.getBoundingClientRect().height || 400;
        const maxMoveDy = Math.max(60, Math.round(halfViewH - Math.min(winH / 2, halfViewH - 24)));
        const ny = Math.max(-maxMoveDy, Math.min(maxMoveDy, Math.round(dragState.origDy + rawDy)));
        dragState.wrapper.dataset.dx = String(nx);
        dragState.wrapper.dataset.dy = String(ny);
        if (dragState.isFloating) {
          applyFloatingWindowTransform(dragState.wrapper);
        } else {
          dragState.wrapper.style.transform = '';
          dragState.wrapper.style.setProperty('--dx', `${nx}px`);
          dragState.wrapper.style.setProperty('--dy', `${ny}px`);
        }
      }
    }
    return;
  }

  if (desktopDragState) {
    const rawDx = e.clientX - desktopDragState.startX;
    const rawDy = e.clientY - desktopDragState.startY;
    if (!desktopDragState.moved && Math.hypot(rawDx, rawDy) > 3) {
      desktopDragState.moved = true;
      desktopDragState.el.classList.add('is-dragging');
    }
    if (desktopDragState.moved) {
      const scaleFactor = homeScale || 1;
      const dX = rawDx / scaleFactor;
      const dY = rawDy / scaleFactor;
      if (desktopDragState.mode === 'terminal-resize') {
        const edge = desktopDragState.edge || 'se';
        let newW = desktopDragState.origW;
        let newH = desktopDragState.origH;
        let newDx = desktopDragState.origDx;
        let newDy = desktopDragState.origDy;
        const minW = 340;
        const minH = 145;

        if (edge.includes('e')) {
          newW = Math.max(minW, Math.round(desktopDragState.origW + dX));
        }
        if (edge.includes('w')) {
          const proposedW = Math.round(desktopDragState.origW - dX);
          if (proposedW >= minW) {
            newW = proposedW;
            newDx = Math.round(desktopDragState.origDx + dX);
          }
        }
        if (edge.includes('s')) {
          newH = Math.max(minH, Math.round(desktopDragState.origH + dY));
        }
        if (edge.includes('n')) {
          const proposedH = Math.round(desktopDragState.origH - dY);
          if (proposedH >= minH) {
            newH = proposedH;
            newDy = Math.round(desktopDragState.origDy + dY);
          }
        }

        desktopDragState.el.dataset.w = String(newW);
        desktopDragState.el.dataset.h = String(newH);
        desktopDragState.el.dataset.dx = String(newDx);
        desktopDragState.el.dataset.dy = String(newDy);
        desktopDragState.el.style.width = `${newW}px`;
        desktopDragState.el.style.height = `${newH}px`;
        desktopDragState.el.style.transform = `translate3d(${newDx}px, ${newDy}px, 0)`;
      } else {
        const nx = Math.round(desktopDragState.origDx + dX);
        const ny = Math.round(desktopDragState.origDy + dY);
        desktopDragState.el.dataset.dx = String(nx);
        desktopDragState.el.dataset.dy = String(ny);
        desktopDragState.el.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
        if (desktopDragState.mode === 'file') {
          clearTrashDropHighlights();
          const trashHit = getTrashDropTargetAtPoint(e.clientX, e.clientY, desktopDragState.el);
          desktopDragState.lastTrashHit = trashHit || null;
          updateFileDragGhost(e.clientX, e.clientY, desktopDragState.el, Boolean(trashHit));
          if (trashHit) {
            trashHit.classList.add('trash-drop-target-hover');
            const dz = document.getElementById('trash-win-dropzone');
            if (dz && trashHit.id === 'popup-trash-bin') {
              dz.classList.add('trash-drop-target-hover');
            }
            desktopDragState.el.classList.add('is-over-trash');
          }
        }
      }
    }
    return;
  }

  // Update resize/move cursor feedback when hovering an open popup window or the terminal
  const hoverPopup = e.target?.closest?.('.os-floating-window.active, .os-popup-wrapper.active');
  if (hoverPopup) {
    const pEdge = getPopupResizeEdge(hoverPopup, e.clientX, e.clientY);
    hoverPopup.style.cursor = pEdge ? edgeToCursor(pEdge) : '';
    return;
  }

  const consoleEl = document.querySelector('#screen-home [data-node-id="99:235"]');
  if (consoleEl && document.body.classList.contains('home-screen-active')) {
    const overFile = findDesktopItemAtPoint(e.target, e.clientX, e.clientY);
    if (overFile) {
      consoleEl.style.cursor = '';
    } else {
      const edge = getTerminalResizeEdge(consoleEl, e.clientX, e.clientY);
      consoleEl.style.cursor = edge ? edgeToCursor(edge) : 'grab';
    }
  }
});

document.addEventListener('mouseup', (e) => {
  if (dragState) {
    const wasMoved = dragState.moved;
    dragState.wrapper.classList.remove('is-dragging', 'is-popup-resizing');
    dragState = null;
    if (wasMoved) {
      suppressDesktopClick = true;
      setTimeout(() => (suppressDesktopClick = false), 120);
    }
  }
  if (desktopDragState) {
    const wasMoved = desktopDragState.moved;
    const mode = desktopDragState.mode;
    const draggedEl = desktopDragState.el;
    const lastTrashHit = desktopDragState.lastTrashHit;
    draggedEl.classList.remove('is-dragging');
    if (mode === 'terminal-resize' || mode === 'terminal-move') {
      draggedEl.dataset.z = '10';
      draggedEl.style.zIndex = '10';
    }

    const preDragPos = { dx: desktopDragState.origDx || 0, dy: desktopDragState.origDy || 0 };
    const droppedOnTrash =
      wasMoved && mode === 'file'
        ? getTrashDropTargetAtPoint(e.clientX, e.clientY, draggedEl) || lastTrashHit
        : null;
    clearTrashDropHighlights();
    hideFileDragGhost();
    desktopDragState = null;

    if (droppedOnTrash) {
      suppressDesktopClick = true;
      moveDesktopElementToTrash(draggedEl, preDragPos);
      setTimeout(() => (suppressDesktopClick = false), 140);
      return;
    }

    if (wasMoved) {
      suppressDesktopClick = true;
      saveDesktopPositions();
      setTimeout(() => (suppressDesktopClick = false), 120);
    }
  }
});

// Restore any user-arranged desktop icon & terminal positions on startup
restoreDesktopPositions();

// HUD screen switcher (inside the Admin-mode panel)
hudButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchScreen(btn.getAttribute('data-switch-screen')));
});

// "Admin mode" HUD: a collapsed pill by default; clicking it expands the screen switcher + Reset.
const adminHudEl = document.getElementById('admin-hud');
const adminHudToggle = document.getElementById('hud-admin-toggle');

function setAdminHudExpanded(expanded) {
  if (!adminHudEl || !adminHudToggle) return;
  adminHudEl.classList.toggle('is-expanded', expanded);
  adminHudEl.classList.toggle('is-collapsed', !expanded);
  adminHudToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  adminHudToggle.title = expanded
    ? 'Admin mode · click to collapse'
    : 'Admin mode · jump between demo screens or reset the workspace';
}

if (adminHudEl && adminHudToggle) {
  adminHudToggle.addEventListener('click', () =>
    setAdminHudExpanded(!adminHudEl.classList.contains('is-expanded'))
  );
  document.addEventListener('click', (e) => {
    if (adminHudEl.classList.contains('is-expanded') && !adminHudEl.contains(e.target)) {
      setAdminHudExpanded(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && adminHudEl.classList.contains('is-expanded')) setAdminHudExpanded(false);
  });
}
