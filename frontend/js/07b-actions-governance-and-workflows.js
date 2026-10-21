/* ============================================================================
 * 07b. Governance, Escalation & Workflow API Actions
 *      (`07b-actions-governance-and-workflows.js`)
 * ----------------------------------------------------------------------------
 * Handles Stage 1/2/3 governance actions delegated from `handleApiAction`:
 *   - Hard-stop escalation option selection & resolution (`select-escalation-opt`,
 *     `resolve-escalation-single`, `resolve-escalation`, `resolve-all-hard-stops`)
 *   - Stage 1 Claim Scrub & Auto-Fix (`autofix-single`, `autofix-all`, `rescrub-brief`)
 *   - Bilateral Tickets & H2H escalation (`escalate-claim-to-ticket`, `request-h2h`,
 *     `approve-ticket`, `approve-all-tickets`)
 *   - Stage 3 Deliverables & Exports (`switch-deliverable-tab`, `copy-deliverable-md`,
 *     `promote-policy-pack`, `export-deliverables-md`, `export-project-json`, `export-zip`)
 *   - What-If Budget Simulator, Policy Rules, Rate Card & Custom Workflow Launch
 *   - Full SQLite + localStorage workspace reset (`reset-workspace`)
 * ============================================================================ */

function applySelectedWorkflowTypeUI(selectedType) {
  const wfType = selectedType || activeWorkflowType || 'scrub';
  activeWorkflowType = wfType;
  const wfFileMap = {
    scrub: 'Q4_KEYNOTE_CLAIM_SCRUB.wf',
    tickets: 'BILATERAL_TICKETS.wf',
    escalations: 'HARD_STOP_ESCALATION.wf',
    policies: 'POLICY_SIMULATOR.wf',
    deliverables: 'LAUNCH_DELIVERABLES.wf',
  };
  setNodeText('154:131', wfFileMap[wfType] || 'Q4_KEYNOTE_CLAIM_SCRUB.wf');

  const cardSpec = [
    { cardId: '154:23', type: 'scrub', badgeId: '154:27', badgeTextId: '154:28', inactiveLabel: 'CLAIM FIXES' },
    { cardId: '154:38', type: 'tickets', badgeId: '154:42', badgeTextId: '154:43', inactiveLabel: 'CROSS-TEAM AGREEMENT' },
    { cardId: '154:53', type: 'escalations', badgeId: '154:57', badgeTextId: '154:58', inactiveLabel: 'BLOCKER ALERTS' },
    { cardId: '154:68', type: 'policies', badgeId: '154:72', badgeTextId: '154:73', inactiveLabel: 'POLICY & RATES SYNC' },
    { cardId: '154:83', type: 'deliverables', badgeId: '154:87', badgeTextId: '154:88', inactiveLabel: 'DELIVERABLES' },
  ];

  const isLight = typeof getDockThemeMode === 'function' && getDockThemeMode() === 'light';
  cardSpec.forEach(({ cardId, type, badgeId, badgeTextId, inactiveLabel }) => {
    const isSel = type === wfType;
    document.querySelectorAll(`[data-node-id="${cardId}"]`).forEach((cardEl) => {
      cardEl.classList.toggle('wf-type-selected', isSel);
      cardEl.style.backgroundColor = isSel ? (isLight ? '#FFFBEB' : 'rgb(26, 16, 0)') : (isLight ? '#F8FAFC' : 'rgb(11, 16, 36)');
      cardEl.style.borderColor = isSel ? (isLight ? '#D97706' : 'rgb(245, 158, 11)') : (isLight ? '#CBD5E1' : 'rgb(30, 44, 80)');
      cardEl.style.borderWidth = isSel ? '1.5px' : '1.2px';
      cardEl.style.outline = 'none';
    });
    document.querySelectorAll(`[data-node-id="${badgeId}"]`).forEach((bEl) => {
      bEl.style.backgroundColor = isSel ? (isLight ? '#FEF3C7' : 'rgb(59, 36, 6)') : (isLight ? '#E2E8F0' : 'rgb(20, 32, 64)');
    });
    document.querySelectorAll(`[data-node-id="${badgeTextId}"]`).forEach((tEl) => {
      tEl.textContent = isSel ? `${inactiveLabel} · SELECTED ✓` : inactiveLabel;
      tEl.style.color = isSel ? (isLight ? '#0F172A' : '#F8FAFC') : (isLight ? '#334155' : '#CBD5E1');
    });
  });
  if (typeof renderWorkloadTopologyIntoModal === 'function') renderWorkloadTopologyIntoModal('145:1045', appState);
}

function ensureWorkflowUserPickerMounted() {
  const step3Node = document.querySelector('#popup-145-1045 [data-node-id="154:125"]');
  if (step3Node && !document.getElementById('wf-tag-user-section')) {
    const section = document.createElement('div');
    section.id = 'wf-tag-user-section';
    section.setAttribute('data-node-id', '154:124-tags');
    section.className = 'f-node f-frame';
    section.style.cssText = 'width: 100%; max-width: 100%; box-sizing: border-box; position: relative; flex-shrink: 0; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; gap: 6px; padding: 10px 14px 10px 14px; background-color: rgb(13, 21, 44); border: 1.2px solid rgb(245, 158, 11); border-radius: 10px;';
    section.innerHTML = `
      <div class="f-node f-text" style="position: relative; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; line-height: 14px; text-align: left; white-space: pre-wrap;">STEP 2B · PICK USER(S) FOR AUTOMATED AGENT SETTLEMENT (BILATERAL A2A TICKET)</div>
      <div class="wf-user-picker-row">
        <label class="wf-user-picker-label" for="wf-settlement-user-select">Pick User for Settlement:</label>
        <select id="wf-settlement-user-select" class="wf-user-select-dropdown">
          <option value="marketing_demo@google.com" selected>👤 DM User (marketing_demo@google.com) — Digital Marketing / Brand Agent</option>
          <option value="priya.nair@google.com">👤 Priya Nair (priya.nair@google.com) — Legal &amp; NDA Agent</option>
          <option value="maya.lin@google.com">👤 Maya Lin (maya.lin@google.com) — Cloud PM Agent</option>
          <option value="marcus.vance@google.com">👤 Marcus Vance (marcus.vance@google.com) — Commercial &amp; PSO Agent</option>
          <option value="cloud_demo@google.com">👤 Cloud User (cloud_demo@google.com) — Cloud Launch Lead Agent</option>
          <option value="__all__">👥 All 4 Counterpart Stakeholders (DM User, Priya, Maya, Marcus)</option>
        </select>
      </div>
      <div id="wf-tag-user-pills" style="width: 100%; display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px;">
        <button type="button" class="wf-tag-pill active" data-api-action="toggle-wf-tag-user" data-user-ldap="marketing_demo@google.com" data-user-id="user_brand"><span class="wf-tag-dot"></span>@marketing_demo · Brand Lead</button>
        <button type="button" class="wf-tag-pill active" data-api-action="toggle-wf-tag-user" data-user-ldap="priya.nair@google.com" data-user-id="user_legal"><span class="wf-tag-dot"></span>@priya.nair · Legal Counsel</button>
        <button type="button" class="wf-tag-pill" data-api-action="toggle-wf-tag-user" data-user-ldap="maya.lin@google.com" data-user-id="user_pm"><span class="wf-tag-dot"></span>@maya.lin · Cloud PM</button>
        <button type="button" class="wf-tag-pill" data-api-action="toggle-wf-tag-user" data-user-ldap="marcus.vance@google.com" data-user-id="user_deal"><span class="wf-tag-dot"></span>@marcus.vance · Commercial Ops</button>
        <button type="button" class="wf-tag-pill" data-api-action="toggle-wf-tag-user" data-user-ldap="cloud_demo@google.com" data-user-id="user_owner"><span class="wf-tag-dot"></span>@cloud_demo · Cloud Launch Lead</button>
      </div>
      <div style="width: 100%; display: flex; flex-direction: row; align-items: center; gap: 8px; margin-top: 2px;">
        <input id="wf-tag-users-input" class="wf-tag-custom-input" type="text" placeholder="Or type additional @ldap / email to tag (e.g. @marketing_demo, @priya.nair) — agents will settle &amp; update both sides..." autocomplete="off" />
      </div>
      <div id="wf-settlement-route-preview" class="wf-settlement-preview-bar">⚡ Automated Settlement Route: Creator's Personal Agent ⇄ Tagged User's Personal Agent → Compromises settled → Updates both Initial Creator &amp; Tagged User(s)</div>`;
    step3Node.parentNode.insertBefore(section, step3Node);
    const customTagInput = document.getElementById('wf-tag-users-input');
    if (customTagInput && !customTagInput.dataset.boundTopo) {
      customTagInput.dataset.boundTopo = 'true';
      customTagInput.addEventListener('input', () => {
        if (typeof renderWorkloadTopologyIntoModal === 'function') renderWorkloadTopologyIntoModal('145:1045', appState);
      });
    }
  }

  const footerNode = document.querySelector('#popup-145-1045 [data-node-id="154:140"]');
  const cancelBtn = document.querySelector('#popup-145-1045 [data-node-id="154:146"]');
  if (footerNode && cancelBtn && !document.getElementById('wf-footer-user-select')) {
    const wrap = document.createElement('div');
    wrap.className = 'wf-footer-user-picker-wrap';
    wrap.innerHTML = `<label class="wf-footer-user-label" for="wf-footer-user-select">👤 Settle With:</label><select id="wf-footer-user-select" class="wf-footer-user-select"><option value="marketing_demo@google.com" selected>@marketing_demo (DM / Brand)</option><option value="priya.nair@google.com">@priya.nair (Legal)</option><option value="maya.lin@google.com">@maya.lin (Cloud PM)</option><option value="marcus.vance@google.com">@marcus.vance (Commercial)</option><option value="cloud_demo@google.com">@cloud_demo (Cloud Lead)</option><option value="__all__">All 4 Stakeholders</option></select>`;
    footerNode.insertBefore(wrap, cancelBtn);
  }

  const primarySelect = document.getElementById('wf-settlement-user-select');
  const footerSelect = document.getElementById('wf-footer-user-select');
  const handleSelectChange = (val) => {
    if (!val) return;
    if (val === '__all__') selectedWorkflowTaggedUsers = new Set(['marketing_demo@google.com', 'priya.nair@google.com', 'maya.lin@google.com', 'marcus.vance@google.com']);
    else selectedWorkflowTaggedUsers.add(val);
    if (primarySelect && primarySelect.value !== val) primarySelect.value = val;
    if (footerSelect && footerSelect.value !== val) footerSelect.value = val;
    refreshWorkflowTagSelectionUI();
  };
  if (primarySelect && !primarySelect.dataset.bound) {
    primarySelect.dataset.bound = 'true';
    primarySelect.addEventListener('change', (e) => handleSelectChange(e.target.value));
  }
  if (footerSelect && !footerSelect.dataset.bound) {
    footerSelect.dataset.bound = 'true';
    footerSelect.addEventListener('change', (e) => handleSelectChange(e.target.value));
  }
}

function refreshWorkflowTagSelectionUI() {
  ensureWorkflowUserPickerMounted();
  const creatorProfile = getActiveLoggedInUserProfile(appState);
  const creatorLdap = creatorProfile.email || 'cloud_demo@google.com';
  document.querySelectorAll('#wf-tag-user-pills .wf-tag-pill').forEach((btn) => {
    btn.classList.toggle('active', selectedWorkflowTaggedUsers.has(btn.getAttribute('data-user-ldap')));
  });
  const taggedArr = Array.from(selectedWorkflowTaggedUsers);
  const previewEl = document.getElementById('wf-settlement-route-preview');
  if (previewEl) {
    const shortTags = taggedArr.map((u) => `@${u.split('@')[0]}`).join(', ');
    previewEl.textContent = taggedArr.length === 0
      ? `⚡ Pick at least 1 user above (or type @ldap) so your Personal Agent (${creatorLdap}) can negotiate & update both sides automatically.`
      : `⚡ Auto-Settlement Route: ${creatorLdap} (Creator Agent) ⇄ ${shortTags} (Tagged Agent${taggedArr.length > 1 ? 's' : ''}) → Negotiates compromise & updates BOTH ${creatorLdap.split('@')[0]}@ and ${shortTags}`;
  }
  const firstTagged = taggedArr[0] || '';
  const primarySelect = document.getElementById('wf-settlement-user-select');
  const footerSelect = document.getElementById('wf-footer-user-select');
  if (firstTagged) {
    if (primarySelect && primarySelect.value !== '__all__') primarySelect.value = firstTagged;
    if (footerSelect && footerSelect.value !== '__all__') footerSelect.value = firstTagged;
  }
  setNodeText('154:144', `${selectedWorkflowFiles.size} files · ${taggedArr.length} tagged user(s) · 1 workflow`);
  if (typeof renderWorkloadTopologyIntoModal === 'function') renderWorkloadTopologyIntoModal('145:1045', appState);
}

function toggleWorkflowTaggedUser(ldap) {
  if (!ldap) return;
  if (selectedWorkflowTaggedUsers.has(ldap)) selectedWorkflowTaggedUsers.delete(ldap);
  else selectedWorkflowTaggedUsers.add(ldap);
  refreshWorkflowTagSelectionUI();
}

const _isBtnAlreadyDone = (el) => Boolean(el && el.dataset && el.dataset.btnDone === 'true');

async function _unapproveClaimWithFeedback(triggerEl, claimIds, apiClaimId, toastMsg) {
  await runButtonWithFeedback(triggerEl, '⏳ Reverting...', '', async () => {
    if (typeof unmarkClaimOptimisticallyResolved === 'function') claimIds.forEach((id) => unmarkClaimOptimisticallyResolved(id));
    await apiCall('/api/escalate/decide', 'POST', { claim_id: apiClaimId, action: 'unapprove' });
    syncStateToFigmaDOM(appState);
  }, 'idle');
  showToast(toastMsg);
}

async function handleGovernanceAndWorkflowAction(action, triggerEl) {
  if (action === 'select-escalation-opt') {
    activeEscalationOpt = triggerEl.getAttribute('data-opt') || 'approve_compromise';
    const optMap = { approve_compromise: '183:310', sign_waiver: '183:319', reject_halt: '183:327' };
    Object.entries(optMap).forEach(([k, nid]) => {
      const el = document.querySelector(`[data-node-id="${nid}"]`);
      if (el) el.style.outline = k === activeEscalationOpt ? '2px solid #43D9E6' : 'none';
    });
    const labelMap = {
      approve_compromise: '✓ Approve Option A & Unblock Legal Track →',
      sign_waiver: '✓ Sign Option B VP Waiver & Unblock Legal Track →',
      reject_halt: '✓ Apply Option C Fallback & Unblock Legal Track →',
    };
    setNodeText('183:343', labelMap[activeEscalationOpt] || labelMap.approve_compromise);
    return;
  }

  if (action === 'resolve-escalation-single') {
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, ['CLM-04'], 'CLM-04', '↩ Unapproved Legal NDA Blocker — reopened for review.');
      return;
    }
    const doneMap = { approve_compromise: '✓ Option A Approved · Legal Unblocked', sign_waiver: '✓ Option B Waiver Signed · Legal Unblocked', reject_halt: '✓ Option C Applied · Legal Unblocked' };
    const doneLbl = doneMap[activeEscalationOpt] || doneMap.approve_compromise;
    const statusVal = activeEscalationOpt === 'sign_waiver' ? 'approved_override' : 'resolved';
    await runButtonWithFeedback(triggerEl, '⏳ Approving & Unblocking...', doneLbl, async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') markClaimOptimisticallyResolved('CLM-04', statusVal);
      await apiCall('/api/escalate/decide', 'POST', { claim_id: 'CLM-04', action: activeEscalationOpt, comment: 'Approved via Hard-Stop Escalation OS Popup', promote_to_rule: true });
      syncStateToFigmaDOM(appState);
    });
    setNodeText('183:343', doneLbl);
    showToast('Legal NDA Blocker resolved · Popup & badges updated!');
    return;
  }

  if (action === 'resolve-escalation') {
    const cid = triggerEl.getAttribute('data-claim-id') || 'CLM-04';
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, [cid], cid, `↩ Unapproved ${cid} — reopened for review.`);
      return;
    }
    const opt = triggerEl.getAttribute('data-opt') || 'approve_compromise';
    const nid = triggerEl.getAttribute('data-node-id') || '';
    const doneLbl = nid === '155:1322' ? '✓ Anonymized' : (cid === 'CLM-05' || cid === 'CLM-105') ? (opt === 'sign_waiver' ? '✓ Waiver Approved (+$22k)' : '✓ Option A Approved ($54k · 14d)') : (opt === 'sign_waiver' ? '✓ Waiver Approved' : '✓ Option A Approved');
    const statusVal = opt === 'sign_waiver' ? 'approved_override' : 'resolved';
    await runButtonWithFeedback(triggerEl, '⏳ Approving...', doneLbl, async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') markClaimOptimisticallyResolved(cid, statusVal);
      if ((cid === 'CLM-05' || cid === 'CLM-105') && opt === 'approve_compromise') await apiCall('/api/whatif', 'POST', { preset_id: 'phase_mainframe' });
      await apiCall('/api/escalate/decide', 'POST', { claim_id: cid, action: opt, comment: 'Approved via Stakeholder Decision Card', promote_to_rule: true });
      syncStateToFigmaDOM(appState);
    });
    showToast(`Approved ${cid} (${opt.replace('_', ' ')}) · Popup & badges updated!`);
    return;
  }

  if (action === 'resolve-all-hard-stops') {
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, ['CLM-04', 'CLM-05'], 'ALL_HARD_STOPS', '↩ Unapproved all Hard Stop Blockers — reopened for review.');
      return;
    }
    await runButtonWithFeedback(triggerEl, '⏳ Resolving All Blockers...', '✓ All Blockers Resolved', async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') ['CLM-01', 'CLM-02', 'CLM-03', 'CLM-04', 'CLM-05'].forEach((id) => markClaimOptimisticallyResolved(id, 'resolved'));
      await apiCall('/api/whatif', 'POST', { preset_id: 'resolve_all' });
      syncStateToFigmaDOM(appState);
    });
    showToast('Resolved all Hard Stops with Option A · All badges cleared!');
    return;
  }

  if (action === 'request-h2h') {
    await runButtonWithFeedback(triggerEl, '⏳ Asking priya.nair@...', '✓ Sent to priya.nair@', async () => {
      await apiCall('/api/tickets/action', 'POST', { ticket_id: 'TKT-101', action: 'request_h2h', h2h_message: 'Requesting direct H2H review with priya.nair@ (Product Counsel) on #REF-2091.' });
    });
    setNodeText('183:341', '✓ Sent to priya.nair@');
    showToast('Sent direct review request to priya.nair@ on TKT-101!');
    return;
  }

  if (action === 'autofix-single') {
    const cid = triggerEl.getAttribute('data-claim-id') || 'CLM-02';
    const relatedIds = [cid, ...(cid === 'CLM-01' || cid === 'CLM-101' ? ['CLM-03'] : [])];
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, relatedIds, cid, `↩ Reverted fix for ${cid} — claim reopened.`);
      return;
    }
    const doneLbl = triggerEl.getAttribute('data-node-id') === '174:7' ? '✓ Fix Applied to Launch Brief' : '✓ Fix Applied';
    await runButtonWithFeedback(triggerEl, '⏳ Applying Fix...', doneLbl, async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') relatedIds.forEach((id) => markClaimOptimisticallyResolved(id, 'resolved'));
      await apiCall('/api/autofix', 'POST', { claim_id: cid });
      syncStateToFigmaDOM(appState);
    });
    showToast(`Applied compliant fix for ${cid} · Popup & badges updated!`);
    return;
  }

  if (action === 'autofix-all') {
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, ['CLM-01', 'CLM-02', 'CLM-03'], 'ALL_AUTO_FIX', '↩ Reverted all easy fixes — claims reopened for review.');
      return;
    }
    await runButtonWithFeedback(triggerEl, '⏳ Applying All Fixes...', '✓ All Easy Fixes Applied', async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') ['CLM-01', 'CLM-02', 'CLM-03'].forEach((id) => markClaimOptimisticallyResolved(id, 'resolved'));
      await apiCall('/api/autofix', 'POST', {});
      syncStateToFigmaDOM(appState);
    });
    showToast('Applied all easy fixes to DEMO LAUNCH BRIEF.md · Claim badges updated!');
    return;
  }

  if (action === 'rescrub-brief') {
    const briefText = (BLUE_FILE_FALLBACKS['DEMO LAUNCH BRIEF.md'] || []).join('\n');
    await runButtonWithFeedback(triggerEl, '⏳ Re-checking All Files...', '✓ All 5 Files Checked', async () => {
      await apiCall('/api/analyze', 'POST', { document_text: briefText });
    });
    showToast('Claim Fixes complete — cross-checked all 5 Blue Team Files!');
    return;
  }

  if (action === 'edit-claim-wording') {
    const el = document.querySelector('[data-node-id="171:43"]');
    if (el) el.focus();
    setNodeText('174:4', '✎ Editing Text Above');
    return;
  }

  if (action === 'escalate-claim-to-ticket') {
    const rewriteText = getNodeText('171:43');
    await runButtonWithFeedback(triggerEl, '⏳ Sending to Team Ticket...', '✓ Sent to Team Ticket', async () => {
      await apiCall('/api/tickets/create', 'POST', {
        title: 'CLAIM 01 · Regional GA vs. Public Preview Scope',
        request_summary: `Confirm Public Preview wording for Singapore & voice CMEK: "${rewriteText}"`,
        reference_file_ids: ['FILE-PM-101', 'FILE-OWNER-105'],
        target_team_agent_ids: ['pm_agent', 'legal_agent'],
      });
    });
    setNodeText('174:6', '✓ Sent to Team Ticket');
    showToast('Sent to Cross-Team Agreement Ticket & negotiated compromise!');
    return;
  }

  if (action === 'switch-deliverable-tab') {
    switchDeliverableTabInPopup(triggerEl.getAttribute('data-deliv-tab') || 'blog');
    return;
  }

  if (action === 'copy-deliverable-md') {
    await runButtonWithFeedback(triggerEl, '⏳ Copying...', '✓ Copied!', async () => {
      const md = [getNodeText('183:162'), getNodeText('183:163'), `${getNodeText('183:168')}\n${getNodeText('183:169')}`, `${getNodeText('183:174')}\n${getNodeText('183:175')}`].join('\n\n');
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(md).catch(() => {});
    });
    setNodeText('183:180', '✓ Copied!');
    showToast('Copied synchronized deliverable Markdown to clipboard!');
    return;
  }

  if (action === 'promote-policy-pack') {
    await runButtonWithFeedback(triggerEl, '⏳ Saving Rules...', '✓ Rules Saved for Next Launch', async () => {
      await apiCall('/api/memory/promote', 'POST', { memory_id: 'MEM-01' });
    });
    setNodeText('183:182', '✓ Rules Saved for Next Launch');
    showToast('Saved approved wording as permanent team rules for future launches!');
    return;
  }

  if (action === 'export-deliverables-md') {
    await runButtonWithFeedback(triggerEl, '⏳ Exporting...', '✓ Exported Launch Blog.md', async () => { window.open('/api/export/deliverables.md', '_blank'); });
    return;
  }
  if (action === 'export-project-json') {
    await runButtonWithFeedback(triggerEl, '⏳ Exporting JSON...', '✓ Exported JSON', async () => { window.open('/api/export/project.json', '_blank'); });
    return;
  }
  if (action === 'export-zip') {
    await runButtonWithFeedback(triggerEl, '⏳ Exporting ZIP...', '✓ Exported .ZIP', async () => { window.open('/download/murph.zip', '_blank'); });
    return;
  }

  if (action === 'whatif-preset') {
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, ['CLM-05'], 'CLM-05', '↩ Reverted budget option — reopened for selection.');
      return;
    }
    const preset = triggerEl.getAttribute('data-preset') || 'phase_mainframe';
    const nid = triggerEl.getAttribute('data-node-id') || '';
    const isMoveWave2 = nid === '187:54' || nid === '181:89';
    const doneLbl = preset === 'executive_waiver' ? '✓ Budget Waiver Active (+$22k)' : isMoveWave2 ? '✓ Moved to Wave 2' : '✓ Wave 1 Selected ($54k · 14d)';
    await runButtonWithFeedback(triggerEl, '⏳ Updating Plan...', doneLbl, async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') markClaimOptimisticallyResolved('CLM-05', preset === 'executive_waiver' ? 'approved_override' : 'resolved');
      await apiCall('/api/whatif', 'POST', { preset_id: preset });
      syncStateToFigmaDOM(appState);
    });
    if (preset === 'phase_mainframe') {
      setNodeText('187:26', '✓ WITHIN $60K BUDGET');
      setNodeText('187:30', '$82,000 → $54,000');
      setNodeText('187:34', '5.5 → 3.5 People');
      setNodeText('187:38', '28 Days → 14 Days');
      showToast('Updated to Wave 1 SAP Setup ($54k · 3.5 People · 14 Days) — Fits $60k Budget!');
    } else {
      setNodeText('187:26', '✓ WAIVER ACTIVE (+$22K)');
      setNodeText('187:30', '$82,000 (Waiver)');
      setNodeText('187:34', '5.5 People (Waiver)');
      setNodeText('187:38', '28 Days (+10d)');
      showToast('Activated Executive Budget Waiver (+$22k over cap)!');
    }
    return;
  }

  if (action === 'apply-wave1-package') {
    if (_isBtnAlreadyDone(triggerEl)) {
      await _unapproveClaimWithFeedback(triggerEl, ['CLM-05'], 'CLM-05', '↩ Unapproved Wave 1 SAP Setup — Budget Blocker reopened.');
      return;
    }
    await runButtonWithFeedback(triggerEl, '⏳ Locking $54k Setup...', '✓ $54k SAP Setup Locked for Wave 1', async () => {
      if (typeof markClaimOptimisticallyResolved === 'function') markClaimOptimisticallyResolved('CLM-05', 'resolved');
      await apiCall('/api/whatif', 'POST', { preset_id: 'phase_mainframe' });
      await apiCall('/api/escalate/decide', 'POST', {
        claim_id: 'CLM-05', action: 'approve_compromise',
        comment: 'Locked $54k Wave 1 SAP Reference Connector; phased Mainframe SKU to Q4 Wave 2.', promote_to_rule: true,
      });
      syncStateToFigmaDOM(appState);
    });
    setNodeText('187:26', '✓ WITHIN $60K BUDGET');
    setNodeText('187:30', '$82,000 → $54,000');
    setNodeText('187:34', '5.5 → 3.5 People');
    setNodeText('187:38', '28 Days → 14 Days');
    setNodeText('187:78', '✓ $54k SAP Setup Locked for Wave 1');
    showToast('Locked $54k SAP Setup for Wave 1 · Budget Blocker resolved!');
    return;
  }

  if (action === 'approve-ticket') {
    const tid = triggerEl.getAttribute('data-ticket-id') || 'TKT-101';
    const actorProfile = typeof getActiveLoggedInUserProfile === 'function' ? getActiveLoggedInUserProfile(appState) : {};
    if (_isBtnAlreadyDone(triggerEl)) {
      await runButtonWithFeedback(triggerEl, '⏳ Reverting...', '', async () => {
        if (typeof unmarkTicketOptimisticallyApproved === 'function') unmarkTicketOptimisticallyApproved(tid);
        await apiCall('/api/tickets/action', 'POST', {
          ticket_id: tid, action: 'unapprove_compromise', actor_user_id: actorProfile.id || undefined,
          actor_ldap: actorProfile.email || undefined, comment: `Reverted approval by ${actorProfile.email || 'active user'}.`,
        });
        if (tid === 'TKT-101' || tid === 'TKT-102') {
          await apiCall('/api/escalate/decide', 'POST', { claim_id: tid === 'TKT-101' ? 'CLM-04' : 'CLM-05', action: 'unapprove' });
        }
        syncStateToFigmaDOM(appState);
      }, 'idle');
      showToast(`↩ Unapproved ${tid} — Agreement reopened for sign-off.`);
      return;
    }
    await runButtonWithFeedback(triggerEl, '⏳ Approving...', '✓ Approved', async () => {
      if (typeof markTicketOptimisticallyApproved === 'function') markTicketOptimisticallyApproved(tid);
      await apiCall('/api/tickets/action', 'POST', {
        ticket_id: tid, action: 'approve_compromise', actor_user_id: actorProfile.id || undefined,
        actor_ldap: actorProfile.email || undefined, comment: `Approved bilateral compromise by ${actorProfile.email || 'active user'} from My Agent Dock.`,
      });
      syncStateToFigmaDOM(appState);
    });
    showToast(`Approved ${tid} — Agreement signed off & locked in!`);
    return;
  }

  if (action === 'approve-all-tickets') {
    const actorProfile = typeof getActiveLoggedInUserProfile === 'function' ? getActiveLoggedInUserProfile(appState) : {};
    const scoped = typeof getScopedTicketsForActiveUser === 'function' ? getScopedTicketsForActiveUser(appState) : (appState && appState.agent_tickets) || [];
    const targetIds = scoped.filter((t) => t && t.status !== 'approved').map((t) => t.id);
    if (_isBtnAlreadyDone(triggerEl) || (targetIds.length === 0 && scoped.length > 0)) {
      const allIds = scoped.length ? scoped.map((t) => t.id) : ['TKT-101', 'TKT-102'];
      await runButtonWithFeedback(triggerEl, '⏳ Reverting All Agreements...', '', async () => {
        if (typeof unmarkTicketOptimisticallyApproved === 'function') allIds.forEach((tid) => unmarkTicketOptimisticallyApproved(tid));
        for (const tid of allIds) {
          await apiCall('/api/tickets/action', 'POST', {
            ticket_id: tid, action: 'unapprove_compromise', actor_user_id: actorProfile.id || undefined, actor_ldap: actorProfile.email || undefined,
          });
        }
        await apiCall('/api/escalate/decide', 'POST', { claim_id: 'ALL_HARD_STOPS', action: 'unapprove' });
        syncStateToFigmaDOM(appState);
      }, 'idle');
      showToast(`↩ Unapproved ${allIds.length} Team Agreement(s) — reopened for sign-off.`);
      return;
    }
    const idsToApprove = targetIds.length ? targetIds : ['TKT-101', 'TKT-102'];
    await runButtonWithFeedback(triggerEl, '⏳ Approving All Agreements...', '✓ All Team Agreements Approved', async () => {
      if (typeof markTicketOptimisticallyApproved === 'function') idsToApprove.forEach((tid) => markTicketOptimisticallyApproved(tid));
      if (typeof markClaimOptimisticallyResolved === 'function') ['CLM-01', 'CLM-02', 'CLM-03', 'CLM-04', 'CLM-05'].forEach((id) => markClaimOptimisticallyResolved(id, 'resolved'));
      for (const tid of idsToApprove) {
        await apiCall('/api/tickets/action', 'POST', {
          ticket_id: tid, action: 'approve_compromise', actor_user_id: actorProfile.id || undefined, actor_ldap: actorProfile.email || undefined,
          comment: `Approved via Approve All by ${actorProfile.email || 'active user'}.`,
        });
      }
      await apiCall('/api/whatif', 'POST', { preset_id: 'resolve_all' });
      syncStateToFigmaDOM(appState);
    });
    setNodeText('183:481', '✓ All Team Agreements Approved');
    showToast(`Approved ${idsToApprove.length} Team Agreement(s) · All status badges updated!`);
    return;
  }

  if (action === 'add-policy-rule-prompt') {
    const ruleInput = window.prompt(
      'Add new live governance rule (Format: forbidden_term -> replacement_term | summary):',
      'unverified claim -> benchmark-backed claim (#BM-884) | Require benchmark citation'
    );
    if (!ruleInput) return;
    await runButtonWithFeedback(triggerEl, '⏳ Adding Rule...', '✓ Rule Added', async () => {
      await apiCall('/api/policy/import', 'POST', { agent_id: 'brand_agent', policy_text: ruleInput, default_severity: 'auto_fix' });
    });
    showToast('Added new live Policy Rule & re-checked DEMO LAUNCH BRIEF.md!');
    return;
  }

  if (action === 'edit-rate-card-prompt') {
    const newCost = window.prompt('Update SKU PSO-SAP-REF Wave 1 Cost ($ USD):', '54000');
    if (!newCost) return;
    const costNum = parseInt(newCost.replace(/[^0-9]/g, ''), 10) || 54000;
    await runButtonWithFeedback(triggerEl, '⏳ Saving Rate...', `✓ Saved ($${Math.round(costNum / 1000)}k)`, async () => {
      await apiCall('/api/rate_card/upsert', 'POST', {
        sku: 'PSO-SAP-REF', name: 'Pre-Certified SAP Cloud ERP Reference Connector + Keynote Demo',
        keywords: 'SAP,ERP,connector', cost_usd: costNum, fte_load: 3.5, duration_days: 14,
      });
    });
    setNodeText('181:75', `$${costNum.toLocaleString()}`);
    showToast(`Updated PSO-SAP-REF rate to $${costNum.toLocaleString()}!`);
    return;
  }

  await handleWorkflowWizardAndResetAction(action, triggerEl);
}
