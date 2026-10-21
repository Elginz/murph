// 04d-topology-svg-builder.js — Workload Routing Topology SVG (Person -> HUB-AG -> Team -> Recipient).
// Builds the per-ticket route diagram used by renderWorkloadTopologyIntoModal (04c).
// Text wraps inside each node (measured with canvas measureText, never sliced) and
// every node grows to fit its lines; lanes are spaced from the tallest content.
// The 880-unit viewBox renders 790px wide at the 1440x900 design viewport
// (~0.9px per unit), so these unit sizes clear the type floor:
// titles >= 12px, captions >= 11px, tags >= 10px.

const TOPO_FONT = 'Manrope, Poppins, sans-serif';
const TOPO_TYPE = {
  title: { size: 13.5, line: 17 },
  caption: { size: 12.5, line: 16 },
  tag: { size: 11.5, pillH: 18 },
};
const TOPO_COLS = {
  req: { x: 10, w: 190 },
  hub: { x: 232, w: 148 },
  team: { x: 410, w: 190 },
  rec: { x: 630, w: 240 },
};
const TOPO_PAD_X = 10;
const TOPO_PAD_Y = 9;
const TOPO_ROW_GAP = 3;
const TOPO_NODE_GAP = 10;
const TOPO_TOP_PAD = 14;

let topoMeasureCtx = null;

function topoTextWidth(text, size, weight) {
  const str = String(text || '');
  if (!topoMeasureCtx) {
    const canvas = document.createElement('canvas');
    topoMeasureCtx = canvas.getContext ? canvas.getContext('2d') : null;
  }
  if (!topoMeasureCtx) return str.length * size * 0.64;
  topoMeasureCtx.font = `${weight} ${size}px ${TOPO_FONT}`;
  // Wider safety margin while the Manrope web font is still loading.
  const fontReady = !document.fonts || document.fonts.check(`${weight} ${size}px Manrope`);
  return topoMeasureCtx.measureText(str).width * (fontReady ? 1.04 : 1.12);
}

// Greedy word wrap; words longer than a line are broken by character.
function topoWrap(text, maxW, size, weight) {
  const fits = (s) => topoTextWidth(s, size, weight) <= maxW;
  const lines = [];
  let cur = '';
  String(text || '').split(/\s+/).filter(Boolean).forEach((word) => {
    const joined = cur ? `${cur} ${word}` : word;
    if (fits(joined)) {
      cur = joined;
      return;
    }
    if (cur) lines.push(cur);
    cur = '';
    if (fits(word)) {
      cur = word;
      return;
    }
    Array.from(word).forEach((ch) => {
      if (cur && !fits(cur + ch)) {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    });
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function topoPillWidth(label) {
  return Math.ceil(topoTextWidth(label, TOPO_TYPE.tag.size, 800)) + 12;
}

function topoPillSvg(label, x, y, stroke, fill, txt) {
  const w = topoPillWidth(label);
  return `<rect x="${x}" y="${y}" width="${w}" height="${TOPO_TYPE.tag.pillH}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/><text x="${x + w / 2}" y="${y + 13}" text-anchor="middle" fill="${txt}" font-family="${TOPO_FONT}" font-size="${TOPO_TYPE.tag.size}" font-weight="800">${escTopo(label)}</text>`;
}

function topoArrow(x, y, color) {
  return `<polygon points="${x},${y} ${x - 7},${y - 4} ${x - 7},${y + 4}" fill="${color}"/>`;
}

// rows: { kind: 'title'|'caption', text, weight, fill, pill?: { label, stroke } } or { pills: [{ label, stroke }] }
function topoLayoutNode(col, rows, centered) {
  const innerW = col.w - TOPO_PAD_X * 2;
  const parts = [];
  let h = TOPO_PAD_Y;
  rows.forEach((row, idx) => {
    if (idx > 0) h += TOPO_ROW_GAP;
    if (row.pills) {
      let px = 0;
      let py = 0;
      const placed = row.pills.map((p) => {
        const w = topoPillWidth(p.label);
        if (px > 0 && px + w > innerW) {
          px = 0;
          py += TOPO_TYPE.tag.pillH + 4;
        }
        const item = { label: p.label, stroke: p.stroke, dx: px, dy: py };
        px += w + 6;
        return item;
      });
      parts.push({ pills: placed, dy: h + 2 });
      h += 2 + py + TOPO_TYPE.tag.pillH;
      return;
    }
    const type = TOPO_TYPE[row.kind];
    const pillW = row.pill ? topoPillWidth(row.pill.label) : 0;
    const lines = topoWrap(row.text, innerW - (pillW ? pillW + 6 : 0), type.size, row.weight);
    parts.push({ kind: row.kind, weight: row.weight, fill: row.fill, pill: row.pill || null, pillW, lines, dy: h });
    h += lines.length * type.line;
  });
  return { col, parts, centered: Boolean(centered), h: h + TOPO_PAD_Y };
}

function topoRenderNode(layout, y, box) {
  const { col, parts, centered, h } = layout;
  const x0 = col.x + TOPO_PAD_X;
  const textX = centered ? col.x + col.w / 2 : x0;
  const anchor = centered ? ' text-anchor="middle"' : '';
  let svg = `<rect class="topo-node-box" x="${col.x}" y="${y}" width="${col.w}" height="${h}" rx="6" fill="${box.fill}" stroke="${box.stroke}" stroke-width="1.5"/>`;
  parts.forEach((p) => {
    if (p.pills) {
      p.pills.forEach((pl) => { svg += topoPillSvg(pl.label, x0 + pl.dx, y + p.dy + pl.dy, pl.stroke, box.pillBg, box.txt); });
      return;
    }
    const type = TOPO_TYPE[p.kind];
    p.lines.forEach((ln, i) => {
      const baseline = y + p.dy + i * type.line + Math.round(type.line / 2 + type.size * 0.36);
      svg += `<text x="${textX}" y="${baseline}"${anchor} fill="${p.fill}" font-family="${TOPO_FONT}" font-size="${type.size}" font-weight="${p.weight}">${escTopo(ln)}</text>`;
    });
    if (p.pill) {
      const pillX = col.x + col.w - TOPO_PAD_X - p.pillW;
      const pillY = y + p.dy + Math.floor((type.line - TOPO_TYPE.tag.pillH) / 2);
      svg += topoPillSvg(p.pill.label, pillX, pillY, p.pill.stroke, box.pillBg, box.txt);
    }
  });
  return svg;
}

function buildRouteSvgHtml(ticket, state, showClaimCounts) {
  const isLight = typeof getDockThemeMode === 'function' && getDockThemeMode() === 'light';
  const txtPri = isLight ? '#0F172A' : '#F8FAFC';
  const txtSec = isLight ? '#334155' : '#CBD5E1';
  const txtMut = isLight ? '#475569' : '#94A3B8';
  const pillBg = isLight ? '#FFFFFF' : '#131F36';
  const accentSky = isLight ? '#0284C7' : '#38BDF8';
  const allUsers = ((state && state.agent_architecture) || {}).user_registry || [];
  const activeUser = typeof getActiveLoggedInUserProfile === 'function' ? getActiveLoggedInUserProfile(state) : null;
  const pUsers = Array.isArray(ticket.participating_users) ? ticket.participating_users : [];
  const reqRaw = pUsers[0] || {
    user_id: ticket.requester_user_id || 'persona_creator', name: ticket.requester_user_name || 'cloud_demo@', ldap: ticket.requester_ldap || 'cloud_demo@google.com',
    role: 'Requester', team_agent_id: ticket.requester_team_agent_id || 'brand_agent', team_name: ticket.requester_team_name || 'Brand & PMM Governance',
    personal_agent_name: ticket.requester_personal_agent_name || "cloud_demo@'s Personal Agent",
  };
  const reqInfo = parsePersonHandleAndRole(reqRaw, allUsers);
  const reqIsYou = isTopoPersonActiveUser(reqRaw, activeUser);

  const rawRecipients = pUsers.slice(1);
  const cappedRecipients = rawRecipients.slice(0, 6);
  const overflowCount = Math.max(0, rawRecipients.length - 6);
  if (overflowCount > 0) {
    const last = cappedRecipients[cappedRecipients.length - 1];
    cappedRecipients.push({
      user_id: 'overflow_more', name: `+${overflowCount} more`, ldap: `+${overflowCount} more`, role: `${overflowCount} additional recipients`,
      routing_mode: 'tagged', team_agent_id: last.team_agent_id || 'pm_agent', team_name: last.team_name || 'Cross-Functional Team', personal_agent_name: 'Multiple Personal Agents',
    });
  }
  const teamGroups = [];
  const teamMap = {};
  cappedRecipients.forEach((rec) => {
    const tid = rec.team_agent_id || 'pm_agent';
    if (!teamMap[tid]) {
      teamMap[tid] = { teamAgentId: tid, teamName: rec.team_name || '', recipients: [] };
      teamGroups.push(teamMap[tid]);
    }
    teamMap[tid].recipients.push(rec);
  });
  if (teamGroups.length === 0) {
    teamGroups.push({
      teamAgentId: 'pm_agent', teamName: 'Vertex AI & Cloud Product Management',
      recipients: [{ user_id: 'persona_pm', name: 'maya.lin@ (Staff Cloud PM)', ldap: 'maya.lin@google.com', role: 'Product & Technical Reviewer', routing_mode: 'auto_routed', team_agent_id: 'pm_agent', personal_agent_name: "maya.lin@'s Personal Agent" }],
    });
  }
  const openClaimsByTeam = {};
  if (showClaimCounts && Array.isArray(state && state.claims)) {
    state.claims.forEach((c) => {
      if (c.status !== 'resolved' && c.status !== 'remediated') {
        const aid = c.agent || c.agent_id || 'pm_agent';
        openClaimsByTeam[aid] = (openClaimsByTeam[aid] || 0) + 1;
      }
    });
  }
  const sharedFiles = Array.isArray(ticket.shared_files) ? ticket.shared_files : [];
  const fileNamesStr = sharedFiles.map((f) => f.filename).join(', ') || 'No shared files attached';
  const ticketId = ticket.id || 'TKT-AUTO';
  const { req, hub, team, rec: recCol } = TOPO_COLS;

  const reqLayout = topoLayoutNode(req, [
    { kind: 'title', weight: 800, fill: txtPri, text: reqInfo.handle, pill: { label: reqIsYou ? 'YOU' : 'SENDER', stroke: accentSky } },
    { kind: 'caption', weight: 600, fill: txtSec, text: reqInfo.role },
    { kind: 'caption', weight: 700, fill: txtSec, text: `via ${reqInfo.personalAgent}` },
  ]);
  const hubStatusText = ticket.isPreview ? 'LIVE PREVIEW' : (ticket.status === 'resolved' ? 'RESOLVED' : (ticket.status === 'compromise_reached' ? 'SETTLED' : (ticket.status === 'h2h_requested' ? 'H2H SYNC' : 'NEEDS ASSIST')));
  const hubColor = ticket.isPreview ? accentSky : (ticket.status === 'needs_assistance' || ticket.status === 'h2h_requested' ? (isLight ? '#D97706' : '#F59E0B') : (isLight ? '#059669' : '#10B981'));
  const hubLayout = topoLayoutNode(hub, [
    { kind: 'title', weight: 800, fill: txtPri, text: `HUB-AG · ${ticketId}` },
    { kind: 'caption', weight: 800, fill: txtPri, text: hubStatusText },
    { kind: 'caption', weight: 600, fill: txtMut, text: `${sharedFiles.length} shared file${sharedFiles.length === 1 ? '' : 's'}` },
  ], true);

  teamGroups.forEach((tg) => {
    tg.meta = getTopoTeamMeta(tg.teamAgentId, tg.teamName);
    tg.claimCount = openClaimsByTeam[tg.teamAgentId] || 0;
    tg.layout = topoLayoutNode(team, [
      { kind: 'title', weight: 800, fill: txtPri, text: tg.meta.shortName, pill: showClaimCounts ? { label: `${tg.claimCount} CLAIMS`, stroke: tg.meta.color } : null },
      { kind: 'caption', weight: 700, fill: txtSec, text: tg.meta.agentLabel },
      { kind: 'caption', weight: 600, fill: txtMut, text: `${tg.recipients.length} recipient${tg.recipients.length === 1 ? '' : 's'} linked` },
    ]);
    tg.recs = tg.recipients.map((rec) => {
      const pInfo = parsePersonHandleAndRole(rec, allUsers);
      const appState = getRecipientApprovalState(ticket, rec);
      const isTagged = rec.routing_mode !== 'auto_routed';
      const modeLabel = isTagged ? 'TAGGED' : 'AUTO-ROUTED';
      const layout = topoLayoutNode(recCol, [
        { kind: 'title', weight: 800, fill: txtPri, text: pInfo.handle, pill: isTopoPersonActiveUser(rec, activeUser) ? { label: 'YOU', stroke: accentSky } : null },
        { kind: 'caption', weight: 600, fill: txtSec, text: pInfo.role },
        { kind: 'caption', weight: 700, fill: txtMut, text: `via ${pInfo.personalAgent}` },
        { pills: [{ label: appState.badge, stroke: appState.stroke }, { label: modeLabel, stroke: isTagged ? accentSky : (isLight ? '#7C3AED' : '#A855F7') }] },
      ]);
      return { pInfo, appState, modeLabel, layout };
    });
  });

  // Stack each team block (its recipients, or the team node if taller), then center REQ/HUB.
  let cursor = 0;
  teamGroups.forEach((tg, gi) => {
    const recBlockH = tg.recs.reduce((acc, r) => acc + r.layout.h, 0) + TOPO_NODE_GAP * (tg.recs.length - 1);
    const blockH = Math.max(recBlockH, tg.layout.h);
    let ry = cursor + (blockH - recBlockH) / 2;
    tg.recs.forEach((r) => {
      r.y = ry;
      ry += r.layout.h + TOPO_NODE_GAP;
    });
    tg.y = cursor + (blockH - tg.layout.h) / 2;
    cursor += blockH + (gi < teamGroups.length - 1 ? TOPO_NODE_GAP + 4 : 0);
  });
  const totalH = Math.max(cursor, reqLayout.h, hubLayout.h);
  const offsetY = TOPO_TOP_PAD + (totalH - cursor) / 2;
  const svgH = Math.ceil(totalH + TOPO_TOP_PAD * 2);
  const midY = Math.round(TOPO_TOP_PAD + totalH / 2);
  const reqY = Math.round(midY - reqLayout.h / 2);
  const hubY = Math.round(midY - hubLayout.h / 2);
  const hubR = hub.x + hub.w;
  const teamR = team.x + team.w;

  const edgesSvg = [`<path d="M ${req.x + req.w} ${midY} L ${hub.x} ${midY}" stroke="${accentSky}" stroke-width="2" fill="none"/>${topoArrow(hub.x, midY, accentSky)}`];
  const nodesSvg = [];
  const reqTooltip = `${reqInfo.fullName} (${reqInfo.ldap}) · ${reqInfo.role} · ${reqInfo.personalAgent} · Shared: ${fileNamesStr}`;
  nodesSvg.push(`<g class="topo-node-interactive" data-api-action="topo-open-ticket" data-ticket-id="${escTopo(ticketId)}" data-topo-tooltip="${escTopo(reqTooltip)}" data-topo-hint="Click to inspect Ticket ${escTopo(ticketId)} in Cross-Team">${topoRenderNode(reqLayout, reqY, { fill: isLight ? '#F0F9FF' : '#0B192C', stroke: accentSky, pillBg, txt: txtPri })}</g>`);
  const hubTooltip = `Central Workspace Agent (HUB-AG) · Ticket ${ticketId} (${hubStatusText}) · Negotiating across ${sharedFiles.length} shared file(s): ${fileNamesStr}`;
  nodesSvg.push(`<g class="topo-node-interactive" data-api-action="topo-open-ticket-log" data-ticket-id="${escTopo(ticketId)}" data-topo-tooltip="${escTopo(hubTooltip)}" data-topo-hint="Click to open ${escTopo(ticketId)} Routing Log &amp; Agent Debate">${topoRenderNode(hubLayout, hubY, { fill: isLight ? '#F8FAFC' : '#0D1628', stroke: hubColor, pillBg, txt: txtPri })}</g>`);

  teamGroups.forEach((tg) => {
    const tY = Math.round(offsetY + tg.y);
    const tCy = Math.round(tY + tg.layout.h / 2);
    const teamAllApproved = tg.recs.every((r) => r.appState.isSolid);
    const teamEdgeColor = teamAllApproved ? (isLight ? '#059669' : '#10B981') : tg.meta.color;
    const hx = Math.round((hubR + team.x) / 2);
    edgesSvg.push(`<path class="${teamAllApproved ? '' : 'topo-edge-inflight'}" d="M ${hubR} ${midY} C ${hx} ${midY}, ${hx} ${tCy}, ${team.x} ${tCy}" stroke="${teamEdgeColor}" stroke-width="2" fill="none"/>${topoArrow(team.x, tCy, teamEdgeColor)}`);
    const teamTooltip = `${tg.teamName || tg.meta.shortName} (${tg.meta.agentLabel}) · Routing to ${tg.recipients.length} team member(s)${showClaimCounts ? ` · ${tg.claimCount} open claim(s)` : ''}`;
    nodesSvg.push(`<g class="topo-node-interactive" data-api-action="topo-open-ticket" data-ticket-id="${escTopo(ticketId)}" data-topo-tooltip="${escTopo(teamTooltip)}" data-topo-hint="Click to view ${escTopo(tg.meta.shortName)} alignment in Ticket ${escTopo(ticketId)}">${topoRenderNode(tg.layout, tY, { fill: tg.meta.fill, stroke: tg.meta.color, pillBg, txt: txtPri })}</g>`);

    tg.recs.forEach((r) => {
      const rY = Math.round(offsetY + r.y);
      const rCy = Math.round(rY + r.layout.h / 2);
      const rx = Math.round((teamR + recCol.x) / 2);
      edgesSvg.push(`<path class="${r.appState.isSolid ? '' : 'topo-edge-inflight'}" d="M ${teamR} ${tCy} C ${rx} ${tCy}, ${rx} ${rCy}, ${recCol.x} ${rCy}" stroke="${r.appState.stroke}" stroke-width="2" fill="none"/>${topoArrow(recCol.x, rCy, r.appState.stroke)}`);
      const recTooltip = `${r.pInfo.fullName} (${r.pInfo.ldap}) · ${r.pInfo.role} · ${r.pInfo.personalAgent} · [${r.modeLabel}] · Status: ${r.appState.badge} — ${r.appState.comment}`;
      nodesSvg.push(`<g class="topo-node-interactive" data-api-action="topo-open-ticket" data-ticket-id="${escTopo(ticketId)}" data-recipient-ldap="${escTopo(r.pInfo.ldap)}" data-topo-tooltip="${escTopo(recTooltip)}" data-topo-hint="Click to open Ticket ${escTopo(ticketId)} sign-off card">${topoRenderNode(r.layout, rY, { fill: r.appState.fill, stroke: r.appState.stroke, pillBg, txt: txtPri })}</g>`);
    });
  });

  return `<svg class="workload-topology-svg" viewBox="0 0 880 ${svgH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Workload Routing Topology">${edgesSvg.join('')}${nodesSvg.join('')}</svg>`;
}
