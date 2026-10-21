/* ============================================================================
 * 02c. Desktop Icon Templates (`02c-desktop-icon-templates.js`)
 * ----------------------------------------------------------------------------
 * 1:1 HTML copies of the real Home-desktop artwork so pop-ups (onboarding tour,
 * empty-workspace Welcome card, buttons) show the SAME logos as the desktop
 * instead of emoji placeholders:
 *   - 'blue'   Blue file   = Figma "App icon" folder shape (`99:109`)
 *   - 'yellow' Yellow folder = Figma "App icon" folder shape (`99:178`)
 *   - 'agent'  Personal Agent = Bottom-dock "My Agent" bot icon (`99:302`)
 *   - 'trash'  Trash Bin tile icon (`#desktop-trash-bin`)
 * All colors come from the exported Figma CSS variables, so theme edits in
 * `01-figma-tokens-and-core.css` flow through automatically.
 * ============================================================================ */

const MURPH_AGENT_BOT_PATH_D =
  'M7.484 3.333C7.484 3.80244 7.86456 4.183 8.334 4.183C8.80344 4.183 9.184 3.80244 9.184 3.333L8.334 3.333L7.484 3.333ZM8.334 0L9.184 0L9.184 -0.85L8.334 -0.85L8.334 0ZM5.0004 -0.85C4.53096 -0.85 4.1504 -0.469442 4.1504 0C4.1504 0.469442 4.53096 0.85 5.0004 0.85L5.0004 0L5.0004 -0.85ZM0 7.4825C-0.469442 7.4825 -0.85 7.86306 -0.85 8.3325C-0.85 8.80194 -0.469442 9.1825 0 9.1825L0 8.3325L0 7.4825ZM1.6668 9.1825C2.13624 9.1825 2.5168 8.80194 2.5168 8.3325C2.5168 7.86306 2.13624 7.4825 1.6668 7.4825L1.6668 8.3325L1.6668 9.1825ZM15.0012 7.4825C14.5318 7.4825 14.1512 7.86306 14.1512 8.3325C14.1512 8.80194 14.5318 9.1825 15.0012 9.1825L15.0012 8.3325L15.0012 7.4825ZM16.668 9.1825C17.1374 9.1825 17.518 8.80194 17.518 8.3325C17.518 7.86306 17.1374 7.4825 16.668 7.4825L16.668 8.3325L16.668 9.1825ZM11.6842 7.49925C11.6842 7.02981 11.3036 6.64925 10.8342 6.64925C10.3648 6.64925 9.9842 7.02981 9.9842 7.49925L10.8342 7.49925L11.6842 7.49925ZM9.9842 9.16575C9.9842 9.63519 10.3648 10.0157 10.8342 10.0157C11.3036 10.0157 11.6842 9.63519 11.6842 9.16575L10.8342 9.16575L9.9842 9.16575ZM6.6838 7.49925C6.6838 7.02981 6.30324 6.64925 5.8338 6.64925C5.36436 6.64925 4.9838 7.02981 4.9838 7.49925L5.8338 7.49925L6.6838 7.49925ZM4.9838 9.16575C4.9838 9.63519 5.36436 10.0157 5.8338 10.0157C6.30324 10.0157 6.6838 9.63519 6.6838 9.16575L5.8338 9.16575L4.9838 9.16575ZM8.334 3.333L9.184 3.333L9.184 0L8.334 0L7.484 0L7.484 3.333L8.334 3.333ZM8.334 0L8.334 -0.85L5.0004 -0.85L5.0004 0L5.0004 0.85L8.334 0.85L8.334 0ZM0 8.3325L0 9.1825L1.6668 9.1825L1.6668 8.3325L1.6668 7.4825L0 7.4825L0 8.3325ZM15.0012 8.3325L15.0012 9.1825L16.668 9.1825L16.668 8.3325L16.668 7.4825L15.0012 7.4825L15.0012 8.3325ZM10.8342 7.49925L9.9842 7.49925L9.9842 9.16575L10.8342 9.16575L11.6842 9.16575L11.6842 7.49925L10.8342 7.49925ZM5.8338 7.49925L4.9838 7.49925L4.9838 9.16575L5.8338 9.16575L6.6838 9.16575L6.6838 7.49925L5.8338 7.49925ZM3.3336 3.333L3.3336 4.183L13.3344 4.183L13.3344 3.333L13.3344 2.483L3.3336 2.483L3.3336 3.333ZM13.3344 3.333L13.3344 4.183C13.7857 4.183 14.1512 4.5487 14.1512 4.9995L15.0012 4.9995L15.8512 4.9995C15.8512 3.60953 14.7242 2.483 13.3344 2.483L13.3344 3.333ZM15.0012 4.9995L14.1512 4.9995L14.1512 11.6655L15.0012 11.6655L15.8512 11.6655L15.8512 4.9995L15.0012 4.9995ZM15.0012 11.6655L14.1512 11.6655C14.1512 12.1163 13.7856 12.482 13.3344 12.482L13.3344 13.332L13.3344 14.182C14.7242 14.182 15.8512 13.0555 15.8512 11.6655L15.0012 11.6655ZM13.3344 13.332L13.3344 12.482L3.3336 12.482L3.3336 13.332L3.3336 14.182L13.3344 14.182L13.3344 13.332ZM3.3336 13.332L3.3336 12.482C2.88235 12.482 2.5168 12.1163 2.5168 11.6655L1.6668 11.6655L0.8168 11.6655C0.8168 13.0555 1.94375 14.182 3.3336 14.182L3.3336 13.332ZM1.6668 11.6655L2.5168 11.6655L2.5168 4.9995L1.6668 4.9995L0.8168 4.9995L0.8168 11.6655L1.6668 11.6655ZM1.6668 4.9995L2.5168 4.9995C2.5168 4.5487 2.88235 4.183 3.3336 4.183L3.3336 3.333L3.3336 2.483C1.94375 2.483 0.8168 3.60953 0.8168 4.9995L1.6668 4.9995Z';

const MURPH_FOLDER_ICON_THEMES = {
  blue: { tab: 'var(--_fill-XA5C6L)', body: 'var(--_fill-AG32SW)', border: 'var(--_fill-M2CXJS)', lip: 'var(--_fill-XA5C6L)' },
  yellow: { tab: 'var(--_fill-AQODJ5)', body: 'var(--_fill-AQODJ5)', border: 'var(--_fill-KMO3SI)', lip: 'var(--_fill-Y6N5JS)' },
};

/** Native icon box sizes (px) — identical to the desktop so scaling stays crisp. */
const MURPH_ICON_NATIVE_SIZE = { blue: [66, 66], yellow: [66, 66], agent: [58, 54], trash: [60, 60] };

function buildMurphFolderIconInner(theme) {
  const t = MURPH_FOLDER_ICON_THEMES[theme] || MURPH_FOLDER_ICON_THEMES.blue;
  return (
    `<span data-node-name="Folder shape · tab" style="position:absolute;left:5px;top:7px;width:27px;height:15px;border-radius:5px;background:${t.tab};border:1px solid ${t.border}"></span>` +
    `<span data-node-name="Folder shape · body" style="position:absolute;left:4px;top:16px;width:58px;height:45px;border-radius:7px;background:${t.body};border:1px solid ${t.border};box-shadow:var(--_effect-R26P7V-shadow)"></span>` +
    `<span data-node-name="Folder shape · lip" style="position:absolute;left:6px;top:17px;width:54px;height:5px;border-radius:2.5px;background:${t.lip}"></span>` +
    `<span data-node-name="App indicator" style="position:absolute;left:11px;top:56px;width:18px;height:2px;border-radius:2px;background:${t.tab}"></span>`
  );
}

function buildMurphAgentIconInner() {
  return (
    `<span data-node-name="Dock backdrop · Ellipse" style="position:absolute;left:4px;top:2px;width:50px;height:50px;border-radius:50%;background:var(--_fill-DKB7VK);border:1.5px solid var(--_fill-AMLSMY);box-shadow:var(--_effect-S4BDPW-shadow)"></span>` +
    `<svg data-node-name="bot" width="16.67" height="13.33" viewBox="0 0 16.668 13.332" style="position:absolute;left:20.67px;top:20.33px;width:16.67px;height:13.33px;overflow:visible;display:block;pointer-events:none" aria-hidden="true">` +
    `<path d="${MURPH_AGENT_BOT_PATH_D}" fill="rgb(244,247,255)" fill-rule="nonzero"/></svg>`
  );
}

function buildMurphTrashIconInner() {
  return (
    `<span style="position:absolute;inset:0;border-radius:16px;background:linear-gradient(180deg, rgba(30, 41, 59, 0.94) 0%, rgba(15, 23, 42, 0.98) 100%);border:1.5px solid rgba(248, 113, 113, 0.45);box-shadow:0 10px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)"></span>` +
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="position:absolute;left:16px;top:16px" aria-hidden="true">` +
    `<path d="M3 6H5H21" stroke="#F87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#F87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="rgba(239, 68, 68, 0.14)"/>` +
    `<path d="M10 11V17" stroke="#FCA5A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M14 11V17" stroke="#FCA5A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/**
 * Returns inline HTML for a real Murph icon.
 *   kind  : 'blue' | 'yellow' | 'agent' | 'trash'
 *   scale : multiplier on the native desktop size (1 = exactly the desktop icon)
 */
function buildMurphIconHtml(kind, scale = 1) {
  const k = MURPH_ICON_NATIVE_SIZE[kind] ? kind : 'blue';
  const [w, h] = MURPH_ICON_NATIVE_SIZE[k];
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const inner =
    k === 'agent' ? buildMurphAgentIconInner() : k === 'trash' ? buildMurphTrashIconInner() : buildMurphFolderIconInner(k);
  return (
    `<span class="murph-icon murph-icon-${k}" aria-hidden="true" style="display:inline-block;position:relative;width:${w * s}px;height:${h * s}px;flex-shrink:0;vertical-align:middle">` +
    `<span data-node-name="App icon" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:scale(${s});transform-origin:0 0">${inner}</span>` +
    `</span>`
  );
}
