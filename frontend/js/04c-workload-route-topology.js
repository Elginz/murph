// 04c-workload-route-topology.js — Real Workload Routing Topology (Person -> HUB-AG -> Team -> Recipient)

const TOPO_TEAM_META = {
  brand_agent: { shortName: 'Brand & PMM Team', agentLabel: 'via Brand & Comms Team Agent', color: '#38BDF8', lightColor: '#0284C7', fill: '#0A1E36', lightFill: '#E0F2FE' },
  pm_agent: { shortName: 'Cloud PM Team', agentLabel: 'via Cloud PM Team Agent', color: '#818CF8', lightColor: '#4F46E5', fill: '#131638', lightFill: '#EEF2FF' },
  legal_agent: { shortName: 'Legal & NDA Team', agentLabel: 'via Legal & NDA Team Agent', color: '#F59E0B', lightColor: '#D97706', fill: '#261A07', lightFill: '#FEF3C7' },
  commercial_agent: { shortName: 'Commercial & PSO Team', agentLabel: 'via Commercial & PSO Team Agent', color: '#10B981', lightColor: '#059669', fill: '#07221B', lightFill: '#ECFDF5' },
};

function escTopo(str) {
  if (typeof escapeHtmlSafe === 'function') return escapeHtmlSafe(str);
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getTopoTeamMeta(teamAgentId, fallbackTeamName) {
  const isLight = typeof getDockThemeMode === 'function' && getDockThemeMode() === 'light';
  const base = TOPO_TEAM_META[teamAgentId];
  if (base) return { shortName: base.shortName, agentLabel: base.agentLabel, color: isLight ? base.lightColor : base.color, fill: isLight ? base.lightFill : base.fill };
  const short = (fallbackTeamName || 'Cross-Functional Team').replace(/^Google Cloud\s+/i, '');
  return { shortName: short, agentLabel: `via ${short} Agent`, color: isLight ? '#0284C7' : '#38BDF8', fill: isLight ? '#E0F2FE' : '#0A1E36' };
}

function parsePersonHandleAndRole(userObj, allUsers) {
  const ldap = String(userObj.ldap || userObj.email || '').trim();
  const rawName = String(userObj.name || userObj.displayName || '').trim();
  const handlePrefix = ldap ? `${ldap.split('@')[0]}@` : (rawName.split(' ')[0] || 'user@');
  const isBuiltIn = typeof isBuiltInDemoEmail === 'function' && ldap && isBuiltInDemoEmail(ldap);
  const parenMatch = rawName.match(/\(([^)]+)\)/);
  const registryMatch = (allUsers || []).find((u) => (ldap && u.ldap === ldap) || (userObj.user_id && u.id === userObj.user_id));
  const roleFromReg = registryMatch && registryMatch.role ? registryMatch.role : '';
  const cleanRole = (userObj.role && userObj.role !== 'Requester' && userObj.role !== 'Cross-Team Reviewer')
    ? userObj.role
    : (parenMatch ? parenMatch[1] : (roleFromReg || userObj.role || 'Team Member'));
  const displayName = !isBuiltIn && rawName && !rawName.includes('@') ? rawName.replace(/\s*\([^)]*\)/, '').trim() : handlePrefix;
  const personalAgent = userObj.personal_agent_name || userObj.agentName || `${handlePrefix}'s Personal Agent`;
  return { handle: displayName, ldap: ldap || handlePrefix, fullName: rawName || displayName, role: cleanRole, personalAgent };
}

function isTopoPersonActiveUser(userObj, activeUser) {
  if (!userObj || !activeUser) return false;
  const uLdap = String(userObj.ldap || userObj.email || '').trim().toLowerCase();
  const aLdap = String(activeUser.ldap || activeUser.email || '').trim().toLowerCase();
  if (uLdap && aLdap && uLdap === aLdap) return true;
  return Boolean(userObj.user_id && activeUser.id && userObj.user_id === activeUser.id);
}

function buildWizardLivePreviewRoute(state) {
  const activeUser = typeof getActiveLoggedInUserProfile === 'function' ? getActiveLoggedInUserProfile(state) : null;
  const allUsers = ((state && state.agent_architecture) || {}).user_registry || [];
  const wfType = (typeof activeWorkflowType !== 'undefined' && activeWorkflowType) ? activeWorkflowType : 'scrub';
  const rawFolder = typeof getNodeText === 'function' ? getNodeText('163:11').replace(/^Enter a folder name.*/i, '').trim() : '';
  const folderName = rawFolder ? rawFolder.toUpperCase() : `LIVE ${wfType.toUpperCase()} WORKLOAD`;
  const selectedFiles = (typeof selectedWorkflowFiles !== 'undefined' && selectedWorkflowFiles.size) ? Array.from(selectedWorkflowFiles) : ['DEMO LAUNCH BRIEF.md'];

  const taggedHandleSet = new Set(typeof selectedWorkflowTaggedUsers !== 'undefined' ? Array.from(selectedWorkflowTaggedUsers) : []);
  const tagInput = document.getElementById('wf-tag-users-input');
  if (tagInput && tagInput.value.trim()) {
    tagInput.value.split(/[\s,]+/).forEach((tok) => {
      const clean = tok.trim().replace(/^@/, '').toLowerCase();
      if (clean) taggedHandleSet.add(clean);
    });
  }

  const reqLdap = (activeUser && (activeUser.email || activeUser.ldap)) || 'cloud_demo@google.com';
  const reqObj = {
    user_id: (activeUser && activeUser.id) || 'persona_creator', name: (activeUser && (activeUser.displayName || activeUser.name)) || 'cloud_demo@ (Cloud Launch & PMM Lead)',
    ldap: reqLdap, role: (activeUser && activeUser.role) || 'Workflow Requester', team_agent_id: (activeUser && activeUser.team_agent_id) || 'brand_agent',
    team_name: (activeUser && (activeUser.teamName || activeUser.team_name)) || 'Google Cloud Brand & PMM Governance',
    personal_agent_name: (activeUser && (activeUser.agentName || activeUser.personal_agent_name)) || `${reqLdap.split('@')[0]}@'s Personal Agent`,
  };

  const recipients = [];
  taggedHandleSet.forEach((h) => {
    const hLow = String(h).toLowerCase();
    const matched = allUsers.find((u) => {
      const uLdap = String(u.ldap || '').toLowerCase();
      return uLdap === hLow || uLdap.startsWith(hLow) || String(u.id || '').toLowerCase() === hLow;
    });
    if (matched && String(matched.ldap || '').toLowerCase() !== reqLdap.toLowerCase()) {
      recipients.push({ user_id: matched.id, name: matched.name, ldap: matched.ldap, role: matched.role || 'Tagged Reviewer', routing_mode: 'tagged', team_agent_id: matched.team_agent_id || 'pm_agent', team_name: matched.team_name || 'Cross-Functional Team', personal_agent_name: `${matched.ldap.split('@')[0]}@'s Personal Agent` });
    } else if (!matched && hLow !== reqLdap.toLowerCase()) {
      const cleanEmail = hLow.includes('@') ? hLow : `${hLow}@google.com`;
      const inferTeam = cleanEmail.startsWith('priya') ? 'legal_agent' : (cleanEmail.startsWith('maya') ? 'pm_agent' : (cleanEmail.startsWith('marcus') ? 'commercial_agent' : 'brand_agent'));
      recipients.push({ user_id: `preview_${hLow}`, name: `${cleanEmail.split('@')[0]}@`, ldap: cleanEmail, role: 'Tagged Counterpart', routing_mode: 'tagged', team_agent_id: inferTeam, team_name: getTopoTeamMeta(inferTeam).shortName, personal_agent_name: `${cleanEmail.split('@')[0]}@'s Personal Agent` });
    }
  });

  if (recipients.length === 0) {
    const defaultTeamsByType = { scrub: ['legal_agent', 'pm_agent'], tickets: ['legal_agent', 'pm_agent', 'commercial_agent'], escalations: ['legal_agent', 'commercial_agent'], policies: ['commercial_agent'], deliverables: ['pm_agent', 'commercial_agent'] };
    (defaultTeamsByType[wfType] || ['legal_agent', 'pm_agent']).forEach((tid) => {
      const peer = allUsers.find((u) => u.team_agent_id === tid && String(u.ldap || '').toLowerCase() !== reqLdap.toLowerCase());
      if (peer) recipients.push({ user_id: peer.id, name: peer.name, ldap: peer.ldap, role: peer.role || 'Auto-Routed Reviewer', routing_mode: 'auto_routed', team_agent_id: peer.team_agent_id, team_name: peer.team_name, personal_agent_name: `${peer.ldap.split('@')[0]}@'s Personal Agent` });
    });
  }

  return {
    id: 'PREVIEW', isPreview: true, status: 'live_preview', title: `${folderName} · ${wfType.toUpperCase()} ROUTE`,
    requester_user_id: reqObj.user_id, requester_user_name: reqObj.name, requester_ldap: reqObj.ldap, requester_personal_agent_name: reqObj.personal_agent_name,
    requester_team_agent_id: reqObj.team_agent_id, requester_team_name: reqObj.team_name, participating_users: [reqObj, ...recipients], shared_files: selectedFiles.map((fn) => ({ filename: fn })), approvals: {},
  };
}

function buildAllActiveRoutes(state, tickets, customWfs, byId) {
  const allUsers = ((state && state.agent_architecture) || {}).user_registry || [];
  const wfByTicket = {};
  customWfs.forEach((w) => { if (w && w.ticket_id) wfByTicket[w.ticket_id] = w; });
  const routes = tickets.map((t) => {
    const wf = wfByTicket[t.id];
    if (!wf) return t;
    const explicitSet = new Set(((wf.explicit_tagged_ldaps || wf.tagged_users) || []).map((x) => String(x).toLowerCase().replace(/^@/, '')));
    return Object.assign({}, t, {
      customWfFolder: wf.folder_name,
      participating_users: (t.participating_users || []).map((pu, idx) => {
        if (idx === 0 || pu.routing_mode) return pu;
        const puLdap = String(pu.ldap || '').toLowerCase();
        const isExplicit = explicitSet.size > 0 && (explicitSet.has(puLdap) || explicitSet.has(puLdap.split('@')[0]));
        return Object.assign({}, pu, { routing_mode: isExplicit ? 'tagged' : 'auto_routed' });
      }),
    });
  });
  customWfs.forEach((wf, idx) => {
    if (!wf || (wf.ticket_id && byId[wf.ticket_id])) return;
    const reqLdap = wf.creator_ldap || 'cloud_demo@google.com';
    const reqUser = allUsers.find((u) => String(u.ldap || '').toLowerCase() === reqLdap.toLowerCase()) || {};
    const reqObj = { user_id: wf.creator_user_id || reqUser.id || 'persona_creator', name: reqUser.name || reqLdap, ldap: reqLdap, role: reqUser.role || 'Workflow Requester', routing_mode: 'requester', team_agent_id: reqUser.team_agent_id || 'brand_agent', team_name: reqUser.team_name || 'Brand & PMM Governance' };
    const recs = (Array.isArray(wf.tagged_users) ? wf.tagged_users : []).map((rawTag) => {
      const clean = String(rawTag).toLowerCase().replace(/^@/, '');
      const m = allUsers.find((u) => String(u.ldap || '').toLowerCase() === clean || String(u.ldap || '').toLowerCase().startsWith(clean));
      return m ? { user_id: m.id, name: m.name, ldap: m.ldap, role: m.role, routing_mode: 'tagged', team_agent_id: m.team_agent_id || 'pm_agent', team_name: m.team_name } : { user_id: `tag_${clean}`, name: `${clean.split('@')[0]}@`, ldap: clean.includes('@') ? clean : `${clean}@google.com`, role: 'Tagged Counterpart', routing_mode: 'tagged', team_agent_id: 'pm_agent', team_name: 'Cloud PM Team' };
    });
    routes.push({
      id: wf.ticket_id || `TKT-WF-${idx + 1}`,
      status: 'compromise_reached',
      title: `${String(wf.folder_name || 'CUSTOM WORKFLOW').toUpperCase()} — ${wf.description || 'Custom Agent Workflow'}`,
      customWfFolder: wf.folder_name,
      participating_users: [reqObj, ...recs],
      shared_files: (wf.selected_files || []).map((fn) => ({ filename: fn })),
      approvals: {},
    });
  });
  return routes;
}

function resolveRoutesForPopup(popupId, state, popupEl) {
  const tickets = Array.isArray(state && state.agent_tickets) ? state.agent_tickets : [];
  const stateWfs = Array.isArray(state && state.custom_workflows) ? state.custom_workflows : [];
  const localWfs = typeof getStoredCustomWorkflows === 'function' ? getStoredCustomWorkflows() : [];
  const seenWfKeys = new Set();
  const customWfs = [...stateWfs, ...localWfs].filter((w) => {
    const key = w ? String(w.ticket_id || w.folder_name || '').toUpperCase() : '';
    if (!key || seenWfKeys.has(key)) return false;
    seenWfKeys.add(key);
    return true;
  });
  const byId = {};
  tickets.forEach((t) => { if (t && t.id) byId[t.id] = t; });

  if (popupId === '145:1045') {
    return { scopeLabel: 'LIVE WIZARD ROUTE PREVIEW', routes: [buildWizardLivePreviewRoute(state)], showClaimCounts: false };
  }

  const allRoutes = buildAllActiveRoutes(state, tickets, customWfs, byId);
  const setup = typeof getActiveUserDesktopSetup === 'function' ? getActiveUserDesktopSetup(state) : null;
  const hasSeedScrub = setup ? (!setup.isCustom && (setup.byType.scrub || []).some((w) => w.isSeed)) : true;
  const hasSeedPol = setup ? (!setup.isCustom && (setup.byType.policies || []).some((w) => w.isSeed)) : true;
  const userCustomSet = new Set(setup ? setup.workflows.filter((w) => !w.isSeed).map((w) => String(w.name || '').toUpperCase()) : []);
  const userRoutes = setup ? allRoutes.filter((r) => {
    if (r.customWfFolder) return userCustomSet.has(String(r.customWfFolder).toUpperCase());
    if (r.id === 'TKT-101') return hasSeedScrub;
    if (r.id === 'TKT-102') return hasSeedPol;
    return !setup.isCustom;
  }) : allRoutes;

  const customTitle = popupEl && popupEl.dataset ? (popupEl.dataset.customWfTitle || '').trim() : '';
  const customTicketId = popupEl && popupEl.dataset ? (popupEl.dataset.customWfTicketId || '').trim() : '';
  const matchCustomRoute = (r) => (customTicketId && r.id === customTicketId) || (customTitle && String(r.customWfFolder || '').toUpperCase() === customTitle.toUpperCase());

  if (popupId === '136:730') {
    if (setup && setup.workflows.length === 0) return { scopeLabel: '0 ACTIVE WORKFLOWS', routes: [], showClaimCounts: false };
    if (customTitle || customTicketId) {
      const focused = userRoutes.filter(matchCustomRoute).map((r) => Object.assign({}, r, { isHighlighted: true }));
      const rest = userRoutes.filter((r) => !matchCustomRoute(r));
      const ordered = [...focused, ...rest];
      return { scopeLabel: `FOCUSED: ${(customTitle || customTicketId).toUpperCase()} · ALL ACTIVE WORKLOAD ROUTES (${ordered.length})`, routes: ordered, showClaimCounts: false };
    }
    return { scopeLabel: `ALL ACTIVE WORKLOAD ROUTES (${userRoutes.length})`, routes: userRoutes, showClaimCounts: false };
  }

  if (customTitle || customTicketId) {
    const matched = userRoutes.find(matchCustomRoute) || allRoutes.find(matchCustomRoute);
    if (matched) {
      const label = matched.customWfFolder ? `CUSTOM WORKLOAD · ${matched.customWfFolder} (${matched.id})` : `WORKLOAD ROUTE · ${matched.id}`;
      return { scopeLabel: label, routes: [Object.assign({}, matched, { isHighlighted: true })], showClaimCounts: popupId === '136:468' };
    }
  }

  const routesForCategory = (catKey, seedIds) => {
    const catWfs = setup ? (setup.byType[catKey] || []) : null;
    if (catWfs && catWfs.length === 0) return [];
    const catCustomSet = new Set((catWfs || []).filter((w) => !w.isSeed).map((w) => String(w.name || '').toUpperCase()));
    const customCatRoutes = userRoutes.filter((r) => r.customWfFolder && catCustomSet.has(String(r.customWfFolder).toUpperCase()));
    const hasSeedInCat = !setup || (!setup.isCustom && catWfs.some((w) => w.isSeed));
    const seedCatRoutes = hasSeedInCat ? seedIds.map((id) => byId[id]).filter(Boolean) : [];
    return [...customCatRoutes, ...seedCatRoutes];
  };

  if (popupId === '136:468' || popupId === '155:1214') {
    return { scopeLabel: 'CLAIM SCRUB ROUTING · ACTIVE WORKFLOWS', routes: routesForCategory('scrub', ['TKT-101']), showClaimCounts: true };
  }
  if (popupId === '136:579' || popupId === '136:890') {
    return { scopeLabel: 'COMMERCIAL & POLICY ROUTING · ACTIVE WORKFLOWS', routes: routesForCategory('policies', ['TKT-102']), showClaimCounts: false };
  }
  if (popupId === '136:417' || popupId === '136:836' || popupId === '136:521' || popupId === '136:942') {
    const isBlocker = popupId === '136:417' || popupId === '136:836';
    const catKey = isBlocker ? 'escalations' : 'deliverables';
    return { scopeLabel: isBlocker ? 'HARD-STOP ESCALATION ROUTES' : 'DELIVERABLE SIGN-OFF ROUTES', routes: routesForCategory(catKey, ['TKT-101', 'TKT-102']), showClaimCounts: false };
  }
  return { scopeLabel: 'ACTIVE WORKLOAD ROUTE', routes: userRoutes.slice(0, 1), showClaimCounts: false };
}

function getRecipientApprovalState(ticket, recipientUser) {
  const isLight = typeof getDockThemeMode === 'function' && getDockThemeMode() === 'light';
  if (ticket.isPreview) {
    return { code: 'preview', badge: '◎ PREVIEW', stroke: isLight ? '#0284C7' : '#38BDF8', fill: isLight ? '#E0F2FE' : '#0B192C', isSolid: false, comment: 'Live wizard preview — click Create Workflow to dispatch.' };
  }
  const approvals = ticket.approvals || {};
  const recLdap = String(recipientUser.ldap || '').toLowerCase();
  const entry = approvals[recipientUser.user_id] || Object.values(approvals).find((a) => String(a.ldap || '').toLowerCase() === recLdap);
  const rawStatus = entry ? String(entry.status || '').toLowerCase() : '';
  const comment = (entry && entry.comment) ? entry.comment : '';
  if (ticket.status === 'h2h_requested' || rawStatus === 'h2h') {
    return { code: 'h2h', badge: '⚠ H2H SYNC', stroke: isLight ? '#DC2626' : '#EF4444', fill: isLight ? '#FEF2F2' : '#220C10', isSolid: false, comment: comment || 'Escalated to Human-to-Human sync.' };
  }
  if (rawStatus === 'approved' || ticket.status === 'resolved') {
    return { code: 'approved', badge: '✓ APPROVED', stroke: isLight ? '#059669' : '#10B981', fill: isLight ? '#ECFDF5' : '#07221B', isSolid: true, comment: comment || 'Approved shared file compromise.' };
  }
  if (ticket.status === 'needs_assistance') {
    return { code: 'assist', badge: '⚠ NEEDS ASSIST', stroke: isLight ? '#DC2626' : '#EF4444', fill: isLight ? '#FEF2F2' : '#220C10', isSolid: false, comment: comment || 'Requires human decision on compromise options.' };
  }
  return { code: 'pending', badge: '⏳ PENDING', stroke: isLight ? '#D97706' : '#F59E0B', fill: isLight ? '#FFFBEB' : '#231908', isSolid: false, comment: comment || 'Awaiting recipient sign-off.' };
}

// buildRouteSvgHtml (the per-ticket route SVG) lives in 04d-topology-svg-builder.js.

function renderWorkloadTopologyIntoModal(popupId, state, explicitPopupEl) {
  if (!WORKLOAD_ONLY_POPUP_IDS.has(popupId) || NON_WORKLOAD_POPUP_IDS.has(popupId)) return;
  const popupEl = explicitPopupEl || document.getElementById(`popup-${popupId.replace(':', '-')}`);
  if (!popupEl) return;
  const rootFrame = popupEl.querySelector(`[data-node-id="${popupId}"]`) || popupEl;

  let container = popupEl.querySelector('.workload-topology-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'workload-topology-container';
  }
  if (popupId === '136:730') {
    const meshSection = popupEl.querySelector('[data-node-id="183:386"]');
    if (meshSection && meshSection.parentNode) {
      if (container.parentNode !== meshSection.parentNode || container.nextElementSibling !== meshSection) {
        meshSection.parentNode.insertBefore(container, meshSection);
      }
    } else if (!container.parentNode) {
      rootFrame.insertBefore(container, rootFrame.firstChild);
    }
  } else {
    const winContent = popupEl.querySelector('[data-node-name="Window content"]');
    if (winContent) {
      if (container.parentNode !== winContent || winContent.firstElementChild !== container) {
        winContent.insertBefore(container, winContent.firstChild);
      }
    } else if (!container.parentNode) {
      rootFrame.insertBefore(container, rootFrame.children[1] || rootFrame.firstChild);
    }
  }

  const wasCollapsed = container.classList.contains('collapsed');
  const resolved = resolveRoutesForPopup(popupId, state || appState, popupEl);
  const routes = resolved.routes || [];
  if (routes.length === 0) {
    container.innerHTML = '';
    container.classList.add('dock-seed-hidden');
    container.style.setProperty('display', 'none', 'important');
    return;
  }
  container.classList.remove('dock-seed-hidden');
  if (container.style.display === 'none') container.style.removeProperty('display');

  const routeCardsHtml = routes.map((ticket) => {
    const tId = ticket.id || 'TKT-AUTO';
    const tTitle = ticket.title || 'Cross-Team Workload Route';
    const sharedCount = Array.isArray(ticket.shared_files) ? ticket.shared_files.length : 0;
    const statusClass = ticket.isPreview ? 'status-preview' : (ticket.status === 'needs_assistance' || ticket.status === 'h2h_requested' ? 'status-assist' : (ticket.status === 'resolved' || ticket.status === 'compromise_reached' ? 'status-settled' : 'status-pending'));
    const statusText = ticket.isPreview ? 'LIVE WIZARD PREVIEW' : String(ticket.status || 'compromise_reached').replace(/_/g, ' ').toUpperCase();
    const highlightClass = ticket.isHighlighted ? ' is-highlighted-route' : '';
    const focusPill = ticket.isHighlighted ? '<span class="workload-route-focus-pill">★ FOCUSED WORKLOAD</span>' : '';
    return `
      <div class="workload-route-card${highlightClass}" data-route-ticket-id="${escTopo(tId)}">
        <div class="workload-route-card-head">
          <div class="workload-route-card-title">
            <span class="workload-route-ticket-badge">${escTopo(tId)}</span>
            ${focusPill}
            <span>${escTopo(tTitle)}</span>
          </div>
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <span class="workload-route-shared-count" style="font-size:11px;font-weight:700;">${sharedCount} shared file${sharedCount === 1 ? '' : 's'}</span>
            <span class="workload-route-status-badge ${statusClass}">${escTopo(statusText)}</span>
          </div>
        </div>
        ${buildRouteSvgHtml(ticket, state || appState, resolved.showClaimCounts)}
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="workload-topology-bar">
      <div class="workload-topology-title-wrap">
        <span class="workload-topology-title">WORKLOAD ROUTING TOPOLOGY (PERSON → HUB-AG → TEAM → RECIPIENT)</span>
        <span class="workload-topology-scope-pill">${escTopo(resolved.scopeLabel)}</span>
      </div>
      <button type="button" class="workload-topology-toggle-btn" data-api-action="toggle-workload-topology">
        ${wasCollapsed ? 'Expand Topology' : 'Collapse Topology'}
      </button>
    </div>
    <div class="workload-topology-panel${wasCollapsed ? ' collapsed' : ''}">
      ${routeCardsHtml}
      <div class="workload-topology-legend">
        <div class="workload-topology-legend-group">
          <span class="workload-topology-legend-item"><span class="topo-legend-swatch" style="background:#10B981;"></span>✓ Approved</span>
          <span class="workload-topology-legend-item"><span class="topo-legend-swatch" style="background:#F59E0B;"></span>⏳ Pending Sign-Off</span>
          <span class="workload-topology-legend-item"><span class="topo-legend-swatch" style="background:#EF4444;"></span>⚠ H2H / Needs Assist</span>
          <span class="workload-topology-legend-item"><span class="topo-legend-line solid"></span>Settled Route</span>
          <span class="workload-topology-legend-item"><span class="topo-legend-line dashed"></span>In-Flight / Pending</span>
        </div>
        <div class="workload-topology-legend-group">
          <span class="topo-legend-chip">TAGGED (@mention)</span>
          <span class="topo-legend-chip">AUTO-ROUTED (Hub Match)</span>
          <span class="topo-legend-chip">YOU</span>
        </div>
      </div>
    </div>`;
}
