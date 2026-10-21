/* ============================================================================
 * 04b. Workload Topology DAG, Deliverable Tabs & Popup Window Manager
 *      (`04b-workload-topology-and-deliverables.js`)
 * ----------------------------------------------------------------------------
 * Responsible for:
 *   - Workload-only SVG Topology Diagram rendering (`renderWorkloadTopologyIntoModal`,
 *     `refreshAllOpenWorkloadTopologies`)
 *   - Stage 3 Deliverable tab switcher (`switchDeliverableTabInPopup`)
 *   - Floating & overlay popup orchestration (`openPopup`, `closePopups`,
 *     `closeOverlayPopups`, `applyFloatingWindowTransform`)
 * ============================================================================ */

const WORKLOAD_ONLY_POPUP_IDS = new Set([
  '136:468', // CLAIM SCRUB Workload
  '136:579', // POLICIES Simulation Workload
  '136:417', // HARD-STOP ESCALATIONS Workload
  '136:521', // DELIVERABLES Synthesis Workload
  '145:1045', // Create Agent Workflow Workload
  '155:1214', // Claim Scrubs Dock Workload
  '136:836', // Hard Stops Dock Workload
  '136:890', // Policy & Rates Dock Workload
  '136:942', // Deliverables Dock Workload
  '136:730', // My Agent Bilateral Ticket Workload
]);
const NON_WORKLOAD_POPUP_IDS = new Set([
  '136:341', // Blue Shared File Editor (Document — NOT a workload)
  '145:1122', // DRIVE / Upload Folder (File Browser — NOT a workload)
  'trash:bin', 'guide:welcome', // Trash Bin / Welcome Guide apps (OS Utilities — NOT workloads)
]);

function refreshAllOpenWorkloadTopologies(state) {
  getAllFloatingWindows().forEach((fw) => {
    if (!fw.classList.contains('active')) return;
    const baseId = fw.dataset.popupBaseId || fw.id.replace(/^popup-/, '').replace('-', ':');
    if (WORKLOAD_ONLY_POPUP_IDS.has(baseId)) {
      renderWorkloadTopologyIntoModal(baseId, state || appState, fw);
    }
  });
  WORKLOAD_ONLY_POPUP_IDS.forEach((pid) => {
    const safeId = 'popup-' + pid.replace(':', '-');
    const el = document.getElementById(safeId);
    if (el && el.classList.contains('active')) {
      renderWorkloadTopologyIntoModal(pid, state || appState, el);
    }
  });
}

function ensureTopoTooltipMounted() {
  let tip = document.getElementById('workload-topo-floating-tooltip');
  if (tip) return;
  tip = document.createElement('div');
  tip.id = 'workload-topo-floating-tooltip';
  tip.className = 'workload-topo-tooltip';
  document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const node = e.target && e.target.closest ? e.target.closest('[data-topo-tooltip]') : null;
    if (!node) {
      tip.classList.remove('visible');
      return;
    }
    const parts = (node.getAttribute('data-topo-tooltip') || '').split(' · ');
    const hint = node.getAttribute('data-topo-hint') || '';
    tip.innerHTML = `<div class="workload-topo-tooltip-title">${escapeHtmlSafe(parts[0] || '')}</div><div class="workload-topo-tooltip-sub">${escapeHtmlSafe(parts.slice(1).join(' · '))}</div>${hint ? `<div class="workload-topo-tooltip-hint">↗ ${escapeHtmlSafe(hint)}</div>` : ''}`;
    tip.classList.add('visible');
  });
  document.addEventListener('mousemove', (e) => {
    if (!tip.classList.contains('visible')) return;
    tip.style.left = `${Math.min(window.innerWidth - 350, e.clientX + 14)}px`;
    tip.style.top = `${Math.min(window.innerHeight - 110, e.clientY + 14)}px`;
  });
}

function handleTopologyNodeClick(actionEl) {
  const ticketId = actionEl.getAttribute('data-ticket-id') || '';
  if (!ticketId || ticketId === 'PREVIEW') {
    return;
  }
  openPopup('136:730');
  setTimeout(() => {
    const popup730 = document.getElementById('popup-136-730');
    if (!popup730) return;
    const card =
      popup730.querySelector(`[data-ticket-card-id="${ticketId}"]`) ||
      Array.from(popup730.querySelectorAll('div')).find((d) => (d.textContent || '').includes(ticketId) && d.style && d.style.border);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origOutline = card.style.outline;
      card.style.outline = '2px solid #38BDF8';
      setTimeout(() => { card.style.outline = origOutline; }, 1800);
    }
  }, 60);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTopoTooltipMounted);
  } else {
    ensureTopoTooltipMounted();
  }
}

function switchDeliverableTabInPopup(tabKey) {
  activeDeliverableTab = tabKey || 'blog';
  const tabNodes = {
    blog: '183:140',
    tracker: '183:142',
    faq: '183:144',
    receipt: '183:146',
  };
  Object.entries(tabNodes).forEach(([k, nid]) => {
    document.querySelectorAll(`[data-node-id="${nid}"]`).forEach((el) => {
      if (k === activeDeliverableTab) {
        el.style.background = 'rgba(67, 217, 230, 0.18)';
        el.style.borderColor = '#43D9E6';
      } else {
        el.style.background = 'transparent';
        el.style.borderColor = 'transparent';
      }
    });
  });

  const deliv = (appState && appState.deliverables) || {};
  if (activeDeliverableTab === 'blog') {
    setNodeText('183:149', 'GENERATED FILE: 📄 Launch Blog.md · Synced from 📄 DEMO LAUNCH BRIEF.md');
    setNodeText('183:162', '# Introducing Google Cloud Vertex AI Agent Builder v2.4');
    setNodeText(
      '183:163',
      'Google Cloud Vertex AI Agent Builder v2.4 is now available, delivering 3.2x faster response times for enterprise teams.'
    );
    setNodeText('183:168', '## Where It Is Available');
    setNodeText(
      '183:169',
      'Live today in the US (Iowa) and Europe (Netherlands). Singapore and voice encryption are available in Public Preview starting today, with full release on November 15, 2026.'
    );
    setNodeText('183:174', '## Customer Results');
    setNodeText(
      '183:175',
      'A leading Tier-1 Global Investment Bank cut compliance review times by 68% in just 14 days using our $54k Standard SAP Demo package.'
    );
    setNodeText('183:184', 'Export Launch Blog.md →');
  } else if (activeDeliverableTab === 'tracker') {
    setNodeText('183:149', 'GENERATED FILE: 📄 Exec Tracker.json · Synced from 📄 PSO RATE CARD.csv');
    setNodeText('183:162', '# Launch Budget & Schedule Summary');
    const feas = (appState && appState.feasibility) || {};
    setNodeText(
      '183:163',
      `Approved Spend: $${Number(feas.projected_spend || 54000).toLocaleString()} / $60,000 Budget · Team: ${feas.projected_fte || 3.5} / 4 Engineers · Timeline: ${feas.critical_path_days || 14} / 18 Days.`
    );
    setNodeText('183:168', '## What Is Included in Wave 1 vs. Wave 2');
    setNodeText('183:169', 'Wave 1 (Oct 18 Launch): Standard SAP Demo ($54,000, 3.5 engineers, 14 days). Wave 2 (Follow-Up): Custom Mainframe Add-On (+$28,000).');
    setNodeText('183:174', '## Team Alignment');
    setNodeText('183:175', 'Product, Brand, Legal, and Commercial teams are 100% aligned with zero open blockers.');
    setNodeText('183:184', 'Export Exec Tracker.json →');
  } else if (activeDeliverableTab === 'faq') {
    setNodeText('183:149', 'GENERATED FILE: 📄 Sales FAQ.md · Synced from 📄 DEMO NDA VAULT.md & 📄 DEMO PRODUCT PRD.md');
    setNodeText('183:162', '# Sales & Customer FAQ');
    setNodeText('183:163', 'Q1: Can we name Apex Global Bank in customer pitches? A: No — customer NDA requires saying "a leading Tier-1 Global Investment Bank" with the approved 68% faster compliance review stat.');
    setNodeText('183:168', '## Q2: Are Singapore and Voice Encryption live today?');
    setNodeText('183:169', 'The US and Europe are live today. Singapore and voice encryption are in Public Preview until November 15, 2026.');
    setNodeText('183:174', '## Q3: Which demo package should Sales quote for launch?');
    setNodeText('183:175', 'Quote the Standard SAP Demo ($54,000 · 3.5 engineers · 14 business days). The Custom Mainframe Add-On (+$28k) is scheduled for Wave 2.');
    setNodeText('183:184', 'Export Sales FAQ.md →');
  } else if (activeDeliverableTab === 'receipt') {
    setNodeText('183:149', 'GENERATED FILE: 📄 Audit Receipt.json · Approved by All 4 Teams');
    setNodeText('183:162', '# Final Team Sign-Off Checklist');
    setNodeText('183:163', (deliv.governance_receipt || 'Verified Sign-Off · Approved by Product (maya.lin@), Brand (marketing_demo@), Legal (priya.nair@), and Commercial (marcus.vance@).').slice(0, 240));
    setNodeText('183:168', '## Approved Team Agreements');
    setNodeText('183:169', 'TKT-101 (Customer Name & Singapore Wording) + TKT-102 ($54k Launch Budget & Wave 2 Add-On): Agreed across all 5 shared team files.');
    setNodeText('183:174', '## Final Status');
    setNodeText('183:175', '0 unresolved claims · Within $60k budget · Ready to publish.');
    setNodeText('183:184', 'Download Audit Receipt.json →');
  }
}

function resolvePopupOriginIconBox(popupId, fileTitle, triggerEl) {
  if (triggerEl && triggerEl.closest && triggerEl.closest('#screen-home') && !triggerEl.closest('#murph-desktop-context-menu, .os-floating-window, .os-popup-wrapper')) {
    const iconBox = triggerEl.querySelector ? triggerEl.querySelector('[data-node-name="App icon"], [data-node-name="Dock icon"]') || triggerEl : triggerEl;
    const rect = iconBox.getBoundingClientRect ? iconBox.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) return iconBox;
  }
  const homeEl = document.getElementById('screen-home');
  if (!homeEl) return null;

  let matchTile = null;
  if (popupId === '136:341' && fileTitle) {
    const normTarget = (typeof normalizeSeedFilename === 'function' ? normalizeSeedFilename(fileTitle) : fileTitle).toLowerCase();
    matchTile = Array.from(homeEl.querySelectorAll('[data-open-popup="136:341"]')).find((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const raw = el.getAttribute('data-file-title') || '';
      const normRaw = (typeof normalizeSeedFilename === 'function' ? normalizeSeedFilename(raw) : raw).toLowerCase();
      return normRaw === normTarget || raw.toLowerCase() === String(fileTitle).toLowerCase();
    });
  }
  if (!matchTile && popupId) {
    const candidates = Array.from(homeEl.querySelectorAll(`[data-open-popup="${popupId}"]`));
    matchTile =
      candidates.find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (!fileTitle || !el.getAttribute('data-custom-wf-title') || el.getAttribute('data-custom-wf-title') === fileTitle);
      }) || candidates.find((el) => el.getBoundingClientRect().width > 0);
  }
  if (!matchTile && triggerEl && triggerEl.getBoundingClientRect && triggerEl.getBoundingClientRect().width > 0) {
    return triggerEl;
  }
  return matchTile ? matchTile.querySelector('[data-node-name="App icon"], [data-node-name="Dock icon"]') || matchTile : null;
}

function pulsePopupOriginIcon(iconBox) {
  if (!iconBox || !iconBox.classList || iconBox.hasAttribute('data-desktop-draggable')) return;
  iconBox.classList.remove('is-popup-origin-pulse');
  void iconBox.offsetWidth;
  iconBox.classList.add('is-popup-origin-pulse');
  if (iconBox._pulseTimer) clearTimeout(iconBox._pulseTimer);
  iconBox._pulseTimer = setTimeout(() => {
    iconBox.classList.remove('is-popup-origin-pulse');
    iconBox._pulseTimer = null;
  }, 500);
}

function applyPopupOriginVars(winEl, iconBox) {
  if (!winEl || !winEl.getBoundingClientRect) return false;
  const winRect = winEl.getBoundingClientRect();
  if (iconBox && iconBox.getBoundingClientRect && winRect.width > 0 && winRect.height > 0) {
    const iconRect = iconBox.getBoundingClientRect();
    if (iconRect.width > 0 && iconRect.height > 0) {
      const dx = Math.round(iconRect.left + iconRect.width / 2 - (winRect.left + winRect.width / 2));
      const dy = Math.round(iconRect.top + iconRect.height / 2 - (winRect.top + winRect.height / 2));
      const ratio = Math.min(iconRect.width / Math.max(winRect.width, 320), iconRect.height / Math.max(winRect.height, 240));
      const originScale = Math.max(0.09, Math.min(0.22, Number(ratio.toFixed(3)) || 0.14));
      winEl.style.setProperty('--origin-dx', `${dx}px`);
      winEl.style.setProperty('--origin-dy', `${dy}px`);
      winEl.style.setProperty('--origin-scale', String(originScale));
      return true;
    }
  }
  winEl.style.setProperty('--origin-dx', '0px');
  winEl.style.setProperty('--origin-dy', '16px');
  winEl.style.setProperty('--origin-scale', '0.92');
  return false;
}

function animatePopupExpandFromOrigin(winEl, popupId, fileTitle, triggerEl) {
  if (!winEl) return;
  if (winEl._closeAnimTimer) { clearTimeout(winEl._closeAnimTimer); winEl._closeAnimTimer = null; }
  if (winEl._expandAnimTimer) { clearTimeout(winEl._expandAnimTimer); winEl._expandAnimTimer = null; }
  winEl.classList.remove('is-expanding-from-icon', 'is-collapsing-to-icon');

  const resolvedTitle =
    fileTitle ||
    (triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-title') : '') ||
    winEl.dataset.blueFileTitle ||
    winEl.dataset.customWfTitle ||
    '';
  winEl._originPopupId = popupId || winEl.dataset.popupBaseId || '';
  winEl._originFileTitle = resolvedTitle;
  winEl._originTriggerEl = triggerEl || null;

  const iconBox = resolvePopupOriginIconBox(winEl._originPopupId, winEl._originFileTitle, winEl._originTriggerEl);
  applyPopupOriginVars(winEl, iconBox);
  if (iconBox) pulsePopupOriginIcon(iconBox);

  void winEl.offsetWidth;
  winEl.classList.add('is-expanding-from-icon');
  winEl._expandAnimTimer = setTimeout(() => {
    winEl.classList.remove('is-expanding-from-icon');
    winEl._expandAnimTimer = null;
  }, 510);
}

function collapseWindowToOrigin(winEl, immediate, onDone) {
  if (!winEl || !winEl.classList.contains('active')) {
    if (onDone) onDone();
    return;
  }
  if (winEl._expandAnimTimer) { clearTimeout(winEl._expandAnimTimer); winEl._expandAnimTimer = null; }
  winEl.classList.remove('is-expanding-from-icon');

  if (immediate) {
    if (winEl._closeAnimTimer) { clearTimeout(winEl._closeAnimTimer); winEl._closeAnimTimer = null; }
    winEl.classList.remove('active', 'is-collapsing-to-icon');
    if (typeof resetPopupWindowSize === 'function') resetPopupWindowSize(winEl);
    if (onDone) onDone();
    return;
  }
  if (winEl.classList.contains('is-collapsing-to-icon')) return;

  const iconBox = resolvePopupOriginIconBox(
    winEl._originPopupId || winEl.dataset.popupBaseId,
    winEl._originFileTitle || winEl.dataset.blueFileTitle || winEl.dataset.customWfTitle,
    winEl._originTriggerEl
  );
  applyPopupOriginVars(winEl, iconBox);
  if (iconBox) pulsePopupOriginIcon(iconBox);

  void winEl.offsetWidth;
  winEl.classList.add('is-collapsing-to-icon');
  winEl._closeAnimTimer = setTimeout(() => {
    winEl.classList.remove('active', 'is-collapsing-to-icon');
    winEl._closeAnimTimer = null;
    if (typeof resetPopupWindowSize === 'function') resetPopupWindowSize(winEl);
    if (onDone) onDone();
  }, 390);
}

function resetOverlayWrapperOffset(w) {
  if (typeof resetPopupWindowSize === 'function') resetPopupWindowSize(w);
  w.style.transform = '';
  w.style.setProperty('--dx', '0px');
  w.style.setProperty('--dy', '0px');
  w.dataset.dx = '0';
  w.dataset.dy = '0';
}

function closeOverlayPopups(immediate) {
  if (!popupBackdrop) return;
  const wrapperList = Array.from(popupWrappers || []);
  const activeWrappers = wrapperList.filter((w) => w.classList.contains('active'));
  if (immediate || !activeWrappers.length || !popupBackdrop.classList.contains('open')) {
    if (popupBackdrop._closeBackdropTimer) { clearTimeout(popupBackdrop._closeBackdropTimer); popupBackdrop._closeBackdropTimer = null; }
    popupBackdrop.classList.remove('open', 'is-closing');
    popupBackdrop.setAttribute('aria-hidden', 'true');
    wrapperList.forEach((w) => { collapseWindowToOrigin(w, true); resetOverlayWrapperOffset(w); });
    return;
  }
  popupBackdrop.classList.add('is-closing');
  activeWrappers.forEach((w) => collapseWindowToOrigin(w, false, () => resetOverlayWrapperOffset(w)));
  if (popupBackdrop._closeBackdropTimer) clearTimeout(popupBackdrop._closeBackdropTimer);
  popupBackdrop._closeBackdropTimer = setTimeout(() => {
    popupBackdrop.classList.remove('open', 'is-closing');
    popupBackdrop.setAttribute('aria-hidden', 'true');
    popupBackdrop._closeBackdropTimer = null;
  }, 400);
}

function closePopups(specificWindowEl) {
  if (modelMenuEl && !specificWindowEl) {
    if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
    else modelMenuEl.classList.remove('open');
  }
  if (specificWindowEl) {
    const floatWin = specificWindowEl.closest ? specificWindowEl.closest('.os-floating-window') : null;
    if (floatWin) { collapseWindowToOrigin(floatWin, false); return; }
    const overlayWin = specificWindowEl.closest ? specificWindowEl.closest('.os-popup-wrapper') : null;
    if (overlayWin) { closeOverlayPopups(false); return; }
  }
  closeOverlayPopups(false);
  getAllFloatingWindows().forEach((fw) => collapseWindowToOrigin(fw, false));
}

function applyFloatingWindowTransform(winEl) {
  if (!winEl) return;
  const dx = parseFloat(winEl.dataset.dx || '0');
  const dy = parseFloat(winEl.dataset.dy || '0');
  const winScale = Math.min(1, Math.max(0.88, homeScale || 1));
  winEl.style.setProperty('--dx', `${dx}px`);
  winEl.style.setProperty('--dy', `${dy}px`);
  winEl.style.setProperty('--win-scale', String(winScale));
}

const DEFAULT_WORKFLOW_WINDOW_TITLES = {
  '136:468': { titleNode: '136:475', title: '📁 CLAIM FIXES — Auto-Fixes for Launch Copy', badgeNode: '136:478', badge: '7 CLAIMS · 2 AUTO-FIXES' },
  '136:417': { titleNode: '183:282', title: '📁 BLOCKER ALERTS — Decisions Waiting on Sign-Off', badgeNode: '183:285', badge: '2 OPEN BLOCKERS' },
  '136:579': { titleNode: '187:15', title: '📁 POLICY & RATES SYNC — Team Rules & Budget Simulator', badgeNode: '187:18', badge: '4 TEAMS SYNCED' },
  '136:521': { titleNode: '136:528', title: '📁 DELIVERABLES — Ready-to-Share Launch Files', badgeNode: '136:531', badge: '4 FILES READY' },
};

function openPopup(popupId, fileTitle, delivTab, triggerEl) {
  if (!popupId) return;
  if (typeof setGeminiModelMenuOpen === 'function') setGeminiModelMenuOpen(false);
  else if (modelMenuEl) modelMenuEl.classList.remove('open');

  let target = null;
  const resolvedFileTitle = fileTitle || (popupId === '136:341' ? activeBlueFileTitle || 'DEMO PRODUCT PRD.md' : null);

  if (popupId === '136:341') {
    target = getOrCreateBlueFileWindow(resolvedFileTitle);
  } else if (DEFAULT_WORKFLOW_WINDOW_TITLES[popupId]) {
    target = getOrCreateYellowWorkflowWindow(popupId, triggerEl);
  } else {
    const safeId = 'popup-' + popupId.replace(':', '-');
    target = document.getElementById(safeId);
    if (target) {
      target.dataset.popupBaseId = popupId;
    }
  }
  if (!target) return;

  const trigCustomTitle = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-title') : null;
  const trigCustomTicket = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-ticket-id') : null;
  if (trigCustomTitle) {
    target.dataset.customWfTitle = trigCustomTitle;
    if (trigCustomTicket) target.dataset.customWfTicketId = trigCustomTicket;
  } else if (popupId === '136:730') {
    delete target.dataset.customWfTitle;
    delete target.dataset.customWfTicketId;
  }

  const wfMeta = DEFAULT_WORKFLOW_WINDOW_TITLES[popupId];
  if (wfMeta) {
    const customWfTitle = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-title') : null;
    const customWfFile = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-file') : null;
    const customWfDesc = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-custom-wf-desc') : null;
    const seedWfMeta =
      triggerEl && triggerEl.getAttribute ? SEED_WORKFLOW_NODE_MAP[triggerEl.getAttribute('data-node-id')] : null;
    if (customWfTitle) {
      setWindowNodeText(
        target,
        wfMeta.titleNode,
        `📁 ${customWfTitle.toUpperCase()} — ${customWfDesc || customWfFile || 'Custom Agent Workflow'}`
      );
      if (customWfFile) {
        setWindowNodeText(target, wfMeta.badgeNode, customWfFile.toUpperCase());
      }
    } else if (seedWfMeta) {
      // Opened from a seeded desktop folder (e.g. DEMO CLAIM FIX): the window is titled after that folder
      setWindowNodeText(target, wfMeta.titleNode, `📁 ${seedWfMeta.title} — ${seedWfMeta.subtitle}`);
      updateDynamicFileAndFolderBadges(appState);
    } else {
      setWindowNodeText(target, wfMeta.titleNode, wfMeta.title);
      updateDynamicFileAndFolderBadges(appState);
    }
  }

  if (FLOATING_POPUP_SET.has(popupId)) {
    closeOverlayPopups(true);
    const wasAlreadyOpen = target.classList.contains('active') && !target.classList.contains('is-collapsing-to-icon');
    if (!wasAlreadyOpen && typeof resetPopupWindowSize === 'function') {
      resetPopupWindowSize(target);
    }
    if (!target.dataset.userDragged && !wasAlreadyOpen) {
      const otherOpenCount = getAllFloatingWindows().filter((fw) => fw !== target && fw.classList.contains('active')).length;
      const cascadeStep = otherOpenCount % 7;
      target.dataset.dx = String(cascadeStep * 34);
      target.dataset.dy = String(cascadeStep * 26);
    }
    target.classList.add('active');
    target.style.zIndex = String(++topFloatingZIndex);
    applyFloatingWindowTransform(target);
  } else {
    if (!popupBackdrop) return;
    if (popupBackdrop._closeBackdropTimer) {
      clearTimeout(popupBackdrop._closeBackdropTimer);
      popupBackdrop._closeBackdropTimer = null;
    }
    popupBackdrop.classList.remove('is-closing');
    popupWrappers.forEach((w) => {
      if (w !== target) {
        collapseWindowToOrigin(w, true);
      } else {
        if (typeof resetPopupWindowSize === 'function') resetPopupWindowSize(w);
        w.classList.add('active');
      }
      w.style.transform = '';
      w.style.setProperty('--dx', '0px');
      w.style.setProperty('--dy', '0px');
      w.dataset.dx = '0';
      w.dataset.dy = '0';
    });
    popupBackdrop.classList.add('open');
    popupBackdrop.setAttribute('aria-hidden', 'false');
  }

  if (popupId === '136:341') {
    loadBlueFileIntoPopup(resolvedFileTitle, target);
  } else if (popupId === '145:1122') {
    mountAndRefreshDriveDocsBrowser();
  } else if (popupId === 'trash:bin') {
    renderTrashBinWindow();
  } else if (popupId === '136:521' && delivTab) {
    switchDeliverableTabInPopup(delivTab);
  } else if (popupId === '145:1045') {
    ensureWorkflowUserPickerMounted();
    refreshWorkflowTagSelectionUI();
    applySelectedWorkflowTypeUI(activeWorkflowType);
  }

  if (WORKLOAD_ONLY_POPUP_IDS.has(popupId)) {
    renderWorkloadTopologyIntoModal(popupId, appState, target);
  }
  if (typeof markDesktopItemSeenFromPopup === 'function') {
    markDesktopItemSeenFromPopup(popupId, resolvedFileTitle, triggerEl);
  }
  if (typeof syncBottomDockAndPopups === 'function') {
    syncBottomDockAndPopups(appState);
  }

  animatePopupExpandFromOrigin(target, popupId, resolvedFileTitle, triggerEl);
}
