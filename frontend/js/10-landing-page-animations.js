/**
 * 10-landing-page-animations.js — Interactive Story Mode & Motion on #screen-intro
 * Hero Console scenario chips, All-to-All Agent Mesh explorer, expandable
 * Principle & Stage story drawers, and staggered scroll-reveal animations.
 */

const INTRO_CONSOLE_SCENARIOS = [
  {
    id: 'harmonize',
    chipLabel: '⚡ Harmonize Launch',
    prompt: 'murph harmonize --launch "Gemini 3.8 Cloud Launch" --agents all',
    pills: ['8 / 8 Agents Synced', '0 Scope Conflicts', 'NDA Gate: Tier-2 Verified'],
    lines: [
      { ts: '10:42:01', tag: 'efch://hub-ag', tagColor: '#7DD3FC', msg: 'Personal Agent (EFCH) published Q3 Cloud Launch scope & pricing claims.' },
      { ts: '10:42:02', tag: 'sarah://brand', tagColor: '#C4B5FD', msg: 'Personal Agent (Sarah) synced Brand & Comms narrative tone with PM Agent.' },
      { ts: '10:42:03', tag: 'legal://nda-2', tagColor: '#6EE7B7', msg: 'Legal Team Agent verified Tier-2 mutual NDA clearance for Marcus & Elena.' },
      { ts: '10:42:04', tag: 'hub://merge', tagColor: '#FCD34D', msg: 'Resolved 1 terminology drift ("Vertex Agent Builder" → "Murph Harmonizer").' },
      { ts: '10:42:05', tag: 'ready://4-docs', tagColor: '#61E6B0', msg: 'Harmonized PRD, GTM Brief, Legal Rider & Press FAQ staged for 1-click sign-off.' },
    ],
  },
  {
    id: 'nda-gate',
    chipLabel: '🛡 Verify NDA Gate',
    prompt: 'murph policy-check --nda-tier TIER-2 --audit-cross-org',
    pills: ['NDA Gate: Enforced', '4 / 4 Orgs Cleared', 'Redaction: Automatic'],
    lines: [
      { ts: '10:44:10', tag: 'legal://hub-ag', tagColor: '#6EE7B7', msg: 'Inspecting cross-department claim graph against Mutual NDA Tier-2 floor.' },
      { ts: '10:44:11', tag: 'efch://marcus', tagColor: '#7DD3FC', msg: 'Cloud PM & Solutions Arch personal agents cleared for benchmark latency tables.' },
      { ts: '10:44:12', tag: 'elena://legal', tagColor: '#FCD34D', msg: 'Partner GTM rider flagged 1 unredacted customer logo in draft slide 4.' },
      { ts: '10:44:13', tag: 'hub://redact', tagColor: '#C4B5FD', msg: 'Auto-masked embargoed customer identifier for Tier-1 external distribution.' },
      { ts: '10:44:14', tag: 'pass://0-leaks', tagColor: '#61E6B0', msg: 'Cryptographic policy attestation attached to Launch Folder #04.' },
    ],
  },
  {
    id: 'brand-audit',
    chipLabel: '🎨 Brand & Legal Audit',
    prompt: 'murph diff-claims --compare pm_agent,brand_agent,legal_agent',
    pills: ['14 Claims Audited', '2 Drift Fixes Applied', 'Brand Voice: 99.4%'],
    lines: [
      { ts: '10:46:01', tag: 'brand://hub-ag', tagColor: '#C4B5FD', msg: 'Scanning hero messaging across Cloud Blog, Keynote Deck, and Sales Battlecard.' },
      { ts: '10:46:02', tag: 'pm://brand-ag', tagColor: '#7DD3FC', msg: 'Aligned availability claim: "GA in 6 regions" matched to live capacity table.' },
      { ts: '10:46:03', tag: 'legal://sarah', tagColor: '#6EE7B7', msg: 'Inserted mandatory forward-looking SLA disclaimer on enterprise tier sheet.' },
      { ts: '10:46:04', tag: 'hub://a2a-sync', tagColor: '#FCD34D', msg: 'Propagated approved product naming to all 4 personal agents in 18ms.' },
      { ts: '10:46:05', tag: 'audit://signed', tagColor: '#61E6B0', msg: 'All 3 Team Agents signed off on unified launch narrative v2.4.' },
    ],
  },
  {
    id: 'ship-brief',
    chipLabel: '🚀 Ship Launch Brief',
    prompt: 'murph ship --folder "Gemini_Cloud_Launch" --export gdocs,pdf',
    pills: ['4 Approvals Locked', 'Bundle: #MURPH-88', 'Export: Live Sync'],
    lines: [
      { ts: '10:48:19', tag: 'hub://lock-all', tagColor: '#7DD3FC', msg: 'Locking final approval hashes from EFCH, Sarah, Marcus, and Elena.' },
      { ts: '10:48:20', tag: 'pm://snapshot', tagColor: '#C4B5FD', msg: 'Compiled Executive Launch Brief + Architecture Topology SVG snapshot.' },
      { ts: '10:48:21', tag: 'legal://stamp', tagColor: '#6EE7B7', msg: 'Attached Compliance & NDA Clearance Certificate (#CL-9042).' },
      { ts: '10:48:22', tag: 'brand://drive', tagColor: '#FCD34D', msg: 'Synced press kit & partner announcement deck to shared Workspace Drive.' },
      { ts: '10:48:23', tag: 'ship://live-os', tagColor: '#61E6B0', msg: 'Launch package live! Click "Try now!" below to open it on the Murph OS desktop.' },
    ],
  },
];

const INTRO_MESH_NODES = {
  '102:3388': {
    name: 'EFCH · Personal Agent',
    tier: 'PERSONAL AGENT · CLOUD LEAD',
    peers: ['102:3408', '102:3398', '102:3413'],
    edges: ['102:3379', '102:3383', '102:3386'],
    desc: 'Owns Cloud Launch scope, SKU pricing table, and latency benchmarks; streams live diffs to Murph Hub & Cloud PM Agent.',
  },
  '102:3393': {
    name: 'Sarah · Personal Agent',
    tier: 'PERSONAL AGENT · PRODUCT MARKETING',
    peers: ['102:3408', '102:3403', '102:3418'],
    edges: ['102:3380', '102:3384', '102:3387'],
    desc: 'Drafts GTM narrative, customer keynote copy, and press FAQ; auto-reconciles claims with Brand & Elena.',
  },
  '102:3398': {
    name: 'Marcus · Personal Agent',
    tier: 'PERSONAL AGENT · SOLUTIONS ARCH',
    peers: ['102:3408', '102:3388', '102:3423'],
    edges: ['102:3381', '102:3383', '102:3385'],
    desc: 'Validates multi-region deployment topology, SLO tables, and security architecture against Legal & Cloud PM specs.',
  },
  '102:3403': {
    name: 'Elena · Personal Agent',
    tier: 'PERSONAL AGENT · PARTNER GTM',
    peers: ['102:3408', '102:3393', '102:3423'],
    edges: ['102:3382', '102:3384', '102:3385'],
    desc: 'Coordinates co-sell partner enablement and Tier-2 NDA riders with Sarah and Legal Team Agent.',
  },
  '102:3408': {
    name: 'MURPH HUB (HUB-AG) · Central A2A Router',
    tier: 'ALL-TO-ALL HARMONIZER CORE',
    peers: ['102:3388', '102:3393', '102:3398', '102:3403', '102:3413', '102:3418', '102:3423'],
    edges: ['102:3379', '102:3380', '102:3381', '102:3382', '102:3383', '102:3384', '102:3385', '102:3386', '102:3387'],
    desc: 'Continuous all-to-all claim graph engine: detects cross-team contradictions in real time and enforces NDA clearance.',
  },
  '102:3413': {
    name: 'Cloud PM · Team Agent',
    tier: 'TEAM AGENT · PRODUCT & ROADMAP',
    peers: ['102:3408', '102:3388', '102:3418'],
    edges: ['102:3379', '102:3386', '102:3387'],
    desc: 'Governs official GA feature matrix, regional rollout dates, and technical readiness gates across engineering.',
  },
  '102:3418': {
    name: 'Brand & Comms · Team Agent',
    tier: 'TEAM AGENT · GLOBAL MESSAGING',
    peers: ['102:3408', '102:3393', '102:3413'],
    edges: ['102:3380', '102:3386', '102:3387'],
    desc: 'Enforces approved naming taxonomy, tone-of-voice guardrails, and executive comms sign-off.',
  },
  '102:3423': {
    name: 'Legal & NDA · Team Agent',
    tier: 'TEAM AGENT · COMPLIANCE & IP',
    peers: ['102:3408', '102:3398', '102:3403'],
    edges: ['102:3381', '102:3382', '102:3385'],
    desc: 'Verifies Tier-1/2/3 NDA clearance, redacts embargoed partner data, and stamps cryptographic policy approvals.',
  },
};

const INTRO_CARD_STORIES = {
  '102:3439': {
    kicker: 'LIVE EXAMPLE · PERSONAL ↔ TEAM',
    hint: 'Click to inspect live Personal-to-Team claim handshake ▾',
    meshFilter: ['102:3388', '102:3393', '102:3398', '102:3403'],
    body: 'When EFCH updates a latency metric in a private draft, EFCH’s Personal Agent translates it into a structured claim and negotiates directly with the Cloud PM & Brand Team Agents—no manual status meetings needed.',
  },
  '102:3449': {
    kicker: 'LIVE EXAMPLE · CONTINUOUS RECONCILIATION',
    hint: 'Click to preview real-time contradiction resolution ▾',
    meshFilter: ['102:3408', '102:3413', '102:3418'],
    body: 'If Marketing drafts "Global GA in 12 regions" while Engineering’s table lists "6 regions at launch", Murph Hub flags the exact line diff and proposes a single click reconciliation patch.',
  },
  '102:3459': {
    kicker: 'LIVE EXAMPLE · ZERO-TRUST NDA GUARDRAILS',
    hint: 'Click to see automatic NDA tier redaction in action ▾',
    meshFilter: ['102:3423', '102:3398', '102:3403'],
    body: 'Every outbound claim carries an NDA clearance tag (Tier-1/2/3). Recipients without matching clearance automatically receive a policy-redacted summary while preserving audit provenance.',
  },
  '102:3484': {
    kicker: 'STAGE 01 PREVIEW · DESKTOP WORKSPACE',
    hint: 'Click to preview Stage 01 interactive folder trace ▾',
    cliNote: '$ murph mount --folder "01_Launch_Workspace" --files 6 --status mounted',
    body: 'Drop Google Docs, PDFs, architecture diagrams, or YAML specs into a yellow workflow folder on the Murph OS desktop. Your Personal Agent indexes every table and claim in < 25ms.',
  },
  '102:3502': {
    kicker: 'STAGE 02 PREVIEW · A2A CLAIM ROUTING',
    hint: 'Click to preview Stage 02 multi-agent negotiation ▾',
    cliNote: '$ murph route --mesh all-to-all --active-channels 9 --latency 18ms',
    body: 'Murph spins up parallel A2A channels across Cloud PM, Brand, and Legal Team Agents. Watch live SVG route beams pulse as each domain agent verifies your folder’s claims.',
  },
  '102:3521': {
    kicker: 'STAGE 03 PREVIEW · DIFF & POLICY GATES',
    hint: 'Click to preview Stage 03 inline approval & unapprove loop ▾',
    cliNote: '$ murph verify --policy nda-tier-2 --conflicts 0 --approvals 4/4',
    body: 'Inspect side-by-side red/green wording diffs and click Approve (or Unapprove at any time) directly inside the popup window with live progress badges.',
  },
  '102:3539': {
    kicker: 'STAGE 04 PREVIEW · HARMONIZED DELIVERY',
    hint: 'Click to preview Stage 04 signed launch bundle ▾',
    cliNote: '$ murph ship --bundle "Gemini_Launch_v2.4" --attestation verified',
    body: 'Export a cryptographically attested Launch Brief with synchronized executive summary, architecture topology, and full cross-team sign-off history.',
  },
};

let introTypewriterTimer = null;
let introLineTimers = [];

function runIntroConsoleScenario(scenario, chipButtons) {
  if (!scenario) return;
  const introEl = document.getElementById('screen-intro');
  if (!introEl) return;

  if (introTypewriterTimer) clearInterval(introTypewriterTimer);
  introLineTimers.forEach((t) => clearTimeout(t));
  introLineTimers = [];

  chipButtons.forEach((btn) => {
    btn.classList.toggle('is-active-demo-chip', btn.dataset.scenarioId === scenario.id);
  });

  const cmdTextEl = introEl.querySelector('[data-node-id="102:3343"]');
  const runBtnEl = introEl.querySelector('[data-node-id="102:3344"]');
  if (runBtnEl) {
    runBtnEl.classList.remove('is-launching');
    void runBtnEl.offsetWidth;
    runBtnEl.classList.add('is-launching');
  }

  if (cmdTextEl) {
    const full = scenario.prompt;
    let idx = 0;
    cmdTextEl.textContent = '';
    introTypewriterTimer = setInterval(() => {
      idx += 2;
      cmdTextEl.textContent = full.slice(0, idx);
      if (idx >= full.length) {
        clearInterval(introTypewriterTimer);
        introTypewriterTimer = null;
      }
    }, 28);
  }

  const pillIds = ['102:3334', '102:3336', '102:3339'];
  pillIds.forEach((pid, i) => {
    const el = introEl.querySelector(`[data-node-id="${pid}"]`);
    if (el && scenario.pills[i]) el.textContent = scenario.pills[i];
  });

  const rowConfig = [
    { row: '102:3311', ts: '102:3312', tag: '102:3313', msg: '102:3314' },
    { row: '102:3315', ts: '102:3316', tag: '102:3317', msg: '102:3318' },
    { row: '102:3319', ts: '102:3320', tag: '102:3321', msg: '102:3322' },
    { row: '102:3323', ts: '102:3324', tag: '102:3325', msg: '102:3326' },
    { row: '102:3327', ts: '102:3328', tag: '102:3329', msg: '102:3330' },
  ];

  rowConfig.forEach((rc, idx) => {
    const timer = setTimeout(() => {
      const rowEl = introEl.querySelector(`[data-node-id="${rc.row}"]`);
      const tsEl = introEl.querySelector(`[data-node-id="${rc.ts}"]`);
      const tagEl = introEl.querySelector(`[data-node-id="${rc.tag}"]`);
      const msgEl = introEl.querySelector(`[data-node-id="${rc.msg}"]`);
      const item = scenario.lines[idx];
      if (!rowEl || !item) return;
      rowEl.classList.remove('is-console-line-fresh');
      void rowEl.offsetWidth;
      if (tsEl) tsEl.textContent = item.ts;
      if (tagEl) {
        tagEl.textContent = item.tag;
        tagEl.style.color = item.tagColor;
      }
      if (msgEl) msgEl.textContent = item.msg;
      rowEl.classList.add('is-console-line-fresh');
    }, 180 + idx * 240);
    introLineTimers.push(timer);
  });
}

function initLandingPageHeroConsoleDemo() {
  const introEl = document.getElementById('screen-intro');
  if (!introEl) return;
  const consoleBody = introEl.querySelector('[data-node-id="102:3310"]');
  const statusRow = introEl.querySelector('[data-node-id="102:3331"]');
  if (!consoleBody || !statusRow || consoleBody.querySelector('.intro-console-demo-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'intro-console-demo-bar';
  const label = document.createElement('span');
  label.className = 'intro-console-demo-label';
  label.textContent = 'Interactive Live Trace:';
  bar.appendChild(label);

  const chipButtons = [];
  INTRO_CONSOLE_SCENARIOS.forEach((sc, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'intro-console-demo-chip' + (idx === 0 ? ' is-active-demo-chip' : '');
    btn.dataset.scenarioId = sc.id;
    btn.textContent = sc.chipLabel;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runIntroConsoleScenario(sc, chipButtons);
      if (typeof fitHomeScreenToViewport === 'function') fitHomeScreenToViewport();
    });
    chipButtons.push(btn);
    bar.appendChild(btn);
  });

  consoleBody.insertBefore(bar, statusRow);
}

function highlightIntroMeshNode(nodeId) {
  const introEl = document.getElementById('screen-intro');
  if (!introEl) return;
  const canvas = introEl.querySelector('[data-node-id="102:3378"]');
  const inspector = document.getElementById('intro-mesh-inspector');
  const statusText = introEl.querySelector('[data-node-id="102:3377"]');
  if (!canvas) return;

  const allNodes = canvas.querySelectorAll('[data-node-name="Agent node"]');
  const allEdges = canvas.querySelectorAll('svg.f-svg');

  if (!nodeId || !INTRO_MESH_NODES[nodeId]) {
    allNodes.forEach((n) => n.classList.remove('is-mesh-node-active', 'is-mesh-node-peer', 'is-mesh-dimmed'));
    allEdges.forEach((e) => e.classList.remove('is-mesh-edge-active', 'is-mesh-dimmed'));
    if (inspector) {
      inspector.classList.remove('is-active');
      inspector.querySelector('.intro-mesh-inspector-name').textContent = 'ALL-TO-ALL AGENT MESH · 8 NODES ONLINE';
      inspector.querySelector('.intro-mesh-inspector-badge').textContent = 'HOVER OR CLICK ANY NODE';
      inspector.querySelector('.intro-mesh-inspector-desc').textContent =
        'Hover or click any Personal Agent, Team Agent, or MURPH HUB node to inspect its live A2A routes and active claims.';
    }
    if (statusText) statusText.textContent = '9 ACTIVE CHANNELS · ZERO BLOCKERS';
    return;
  }

  const info = INTRO_MESH_NODES[nodeId];
  allNodes.forEach((n) => {
    const id = n.getAttribute('data-node-id');
    const isSelf = id === nodeId;
    const isPeer = info.peers.includes(id);
    n.classList.toggle('is-mesh-node-active', isSelf);
    n.classList.toggle('is-mesh-node-peer', !isSelf && isPeer);
    n.classList.toggle('is-mesh-dimmed', !isSelf && !isPeer);
  });
  allEdges.forEach((e) => {
    const id = e.getAttribute('data-node-id');
    const isEdge = info.edges.includes(id);
    e.classList.toggle('is-mesh-edge-active', isEdge);
    e.classList.toggle('is-mesh-dimmed', !isEdge);
  });

  if (inspector) {
    inspector.classList.add('is-active');
    inspector.querySelector('.intro-mesh-inspector-name').textContent = info.name;
    inspector.querySelector('.intro-mesh-inspector-badge').textContent = info.tier;
    inspector.querySelector('.intro-mesh-inspector-desc').textContent = info.desc;
  }
  if (statusText) statusText.textContent = `${info.edges.length} ROUTES ACTIVE · ${info.peers.length} CONNECTED PEERS`;
}

function initLandingPageAgentMeshExplorer() {
  const introEl = document.getElementById('screen-intro');
  if (!introEl) return;
  const meshWindow = introEl.querySelector('[data-node-id="102:3369"]');
  const canvas = introEl.querySelector('[data-node-id="102:3378"]');
  if (!canvas || document.getElementById('intro-mesh-inspector')) return;

  const inspector = document.createElement('div');
  inspector.id = 'intro-mesh-inspector';
  inspector.className = 'intro-mesh-inspector';
  inspector.innerHTML =
    '<div class="intro-mesh-inspector-top">' +
    '<span class="intro-mesh-inspector-name">ALL-TO-ALL AGENT MESH · 8 NODES ONLINE</span>' +
    '<span class="intro-mesh-inspector-badge">HOVER OR CLICK ANY NODE</span>' +
    '</div>' +
    '<div class="intro-mesh-inspector-desc">Hover or click any Personal Agent, Team Agent, or MURPH HUB node to inspect its live A2A routes and active claims.</div>';
  (meshWindow || canvas).appendChild(inspector);

  let pinnedNodeId = null;
  Object.keys(INTRO_MESH_NODES).forEach((nodeId) => {
    const el = canvas.querySelector(`[data-node-id="${nodeId}"]`);
    if (!el) return;
    el.addEventListener('mouseenter', () => highlightIntroMeshNode(nodeId));
    el.addEventListener('mouseleave', () => highlightIntroMeshNode(pinnedNodeId));
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      pinnedNodeId = pinnedNodeId === nodeId ? null : nodeId;
      highlightIntroMeshNode(pinnedNodeId);
    });
  });

  const legendMap = { '102:3429': '102:3388', '102:3432': '102:3413', '102:3435': '102:3408' };
  Object.keys(legendMap).forEach((legId) => {
    const legEl = canvas.querySelector(`[data-node-id="${legId}"]`);
    if (!legEl) return;
    legEl.addEventListener('mouseenter', () => highlightIntroMeshNode(legendMap[legId]));
    legEl.addEventListener('mouseleave', () => highlightIntroMeshNode(pinnedNodeId));
    legEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = legendMap[legId];
      pinnedNodeId = pinnedNodeId === targetId ? null : targetId;
      highlightIntroMeshNode(pinnedNodeId);
    });
  });
}

function initLandingPageStoryCards() {
  const introEl = document.getElementById('screen-intro');
  if (!introEl) return;

  Object.keys(INTRO_CARD_STORIES).forEach((cardId) => {
    const cardEl = introEl.querySelector(`[data-node-id="${cardId}"]`);
    if (!cardEl || cardEl.querySelector('.intro-card-story-drawer')) return;
    const story = INTRO_CARD_STORIES[cardId];
    const contentHost = cardEl.querySelector('[data-node-name="Stage content"]') || cardEl;

    const hintEl = document.createElement('div');
    hintEl.className = 'intro-story-hint';
    hintEl.textContent = story.hint;

    const drawerEl = document.createElement('div');
    drawerEl.className = 'intro-card-story-drawer';
    drawerEl.innerHTML = `<div class="intro-story-kicker">${story.kicker}</div><div>${story.body}</div>`;

    contentHost.appendChild(hintEl);
    contentHost.appendChild(drawerEl);

    cardEl.addEventListener('mousemove', (e) => {
      const rect = cardEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      cardEl.style.setProperty('--tilt-rx', `${((y / rect.height - 0.5) * -5.5).toFixed(2)}deg`);
      cardEl.style.setProperty('--tilt-ry', `${((x / rect.width - 0.5) * 6.5).toFixed(2)}deg`);
      cardEl.style.setProperty('--spot-x', `${Math.round(x)}px`);
      cardEl.style.setProperty('--spot-y', `${Math.round(y)}px`);
    });
    cardEl.addEventListener('mouseleave', () => {
      cardEl.style.setProperty('--tilt-rx', '0deg');
      cardEl.style.setProperty('--tilt-ry', '0deg');
    });
    cardEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = cardEl.classList.toggle('is-story-card-expanded');
      hintEl.textContent = isExpanded ? 'Click to collapse live preview ▴' : story.hint;
      if (story.cliNote && isExpanded) {
        const cliEl = introEl.querySelector('[data-node-id="102:3558"]');
        if (cliEl) cliEl.textContent = story.cliNote;
      }
      if (story.meshFilter && story.meshFilter.length) {
        highlightIntroMeshNode(isExpanded ? story.meshFilter[0] : null);
      }
      if (typeof fitHomeScreenToViewport === 'function') {
        fitHomeScreenToViewport();
        setTimeout(fitHomeScreenToViewport, 580);
      }
    });
  });
}

function initLandingPageScrollReveal() {
  const introEl = document.getElementById('screen-intro');
  if (!introEl) return;

  const revealTargets = [
    ['102:3290', 0], ['102:3294', 90], ['102:3295', 160], ['102:3296', 240],
    ['102:3359', 0], ['102:3369', 110], ['102:3439', 140], ['102:3449', 240], ['102:3459', 340],
    ['102:3470', 0], ['102:3484', 90], ['102:3502', 190], ['102:3521', 290], ['102:3539', 390],
    ['102:3557', 180], ['102:3563', 120],
  ];

  const elements = [];
  revealTargets.forEach(([id, delay]) => {
    const el = introEl.querySelector(`[data-node-id="${id}"]`);
    if (!el) return;
    el.classList.add('intro-reveal-item');
    el.style.setProperty('--reveal-delay', `${delay}ms`);
    elements.push(el);
  });

  if (typeof IntersectionObserver !== 'function') {
    elements.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-revealed'); }),
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  elements.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add('is-revealed');
    observer.observe(el);
  });

  const navMap = [
    { secId: '102:3357', pillId: '102:3239' },
    { secId: '102:3469', pillId: '102:3241' },
  ];
  const secObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const activeSecId = entry.target.getAttribute('data-node-id');
        navMap.forEach((nm) => {
          const pill = introEl.querySelector(`[data-node-id="${nm.pillId}"]`);
          if (pill) pill.classList.toggle('is-route-active', nm.secId === activeSecId);
        });
      });
    },
    { threshold: 0.35 }
  );
  navMap.forEach((nm) => {
    const secEl = introEl.querySelector(`[data-node-id="${nm.secId}"]`);
    if (secEl) secObserver.observe(secEl);
  });
}

function initLandingPageInteractiveAnimations() {
  initLandingPageHeroConsoleDemo();
  initLandingPageAgentMeshExplorer();
  initLandingPageStoryCards();
  initLandingPageScrollReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLandingPageInteractiveAnimations);
} else {
  initLandingPageInteractiveAnimations();
}
