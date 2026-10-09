/** Small DOM construction helpers. No framework; every element is real DOM. */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * h(tag, attrs, ...children)
 *  - attrs: { class, id, dataset:{}, style:{}|string, on:{event:handler}, aria:{}, ...attributes }
 *  - children: string | Node | null | false | array
 *  - tag may be 'svg:rect' for SVG elements.
 */
export function h(tag, attrs, ...children) {
  let el;
  if (tag.startsWith('svg:')) el = document.createElementNS(SVG_NS, tag.slice(4));
  else el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
      else if (key === 'dataset') for (const [k, v] of Object.entries(value)) { if (v !== undefined && v !== null) el.dataset[k] = String(v); }
      else if (key === 'style') { if (typeof value === 'string') el.setAttribute('style', value); else Object.assign(el.style, value); }
      else if (key === 'on') for (const [evt, fn] of Object.entries(value)) el.addEventListener(evt, fn);
      else if (key === 'aria') for (const [k, v] of Object.entries(value)) { if (v !== undefined && v !== null) el.setAttribute(`aria-${k}`, String(v)); }
      else if (key === 'html') el.innerHTML = value; // only ever used with trusted, locally generated markup
      else if (key === 'ref') value(el);
      else if (key in el && !(el instanceof SVGElement) && typeof value !== 'string' && key !== 'list') el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
  return el;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replaceChildren(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function on(el, event, selectorOrFn, fn) {
  if (typeof selectorOrFn === 'function') { el.addEventListener(event, selectorOrFn); return; }
  el.addEventListener(event, (e) => {
    const target = e.target.closest(selectorOrFn);
    if (target && el.contains(target)) fn(e, target);
  });
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

export function focusables(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function focusFirst(container) {
  const first = focusables(container)[0];
  if (first) { first.focus(); return true; }
  if (container.tabIndex < 0) container.tabIndex = -1;
  container.focus();
  return false;
}

/** Keep Tab/Shift+Tab inside container while it is open. Returns a cleanup function. */
export function trapFocus(container) {
  function onKey(e) {
    if (e.key !== 'Tab') return;
    const items = focusables(container);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    // Focus on the container itself, or anywhere outside the item list, wraps instead of escaping.
    if (active === container || !items.includes(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

let liveRegion = null;
export function announce(message, { assertive = false } = {}) {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', id: 'pl-live', aria: { live: 'polite', atomic: 'true' } });
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  liveRegion.textContent = '';
  window.setTimeout(() => { liveRegion.textContent = message; }, 30);
}

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function uid(prefix = 'id') {
  uid.counter = (uid.counter || 0) + 1;
  return `${prefix}-${uid.counter.toString(36)}`;
}

export function debounce(fn, ms = 150) {
  let timer = null;
  return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), ms); };
}

export function icon(name, { size = 18, label = null } = {}) {
  const paths = ICONS[name] || ICONS.dot;
  const svg = h('svg:svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'pl-icon', 'aria-hidden': label ? null : 'true', role: label ? 'img' : null, focusable: 'false' });
  if (label) svg.appendChild(h('svg:title', null, label));
  for (const d of paths) svg.appendChild(h('svg:path', { d }));
  return svg;
}

const ICONS = {
  dot: ['M12 12h.01'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  back: ['M15 18l-6-6 6-6'],
  forward: ['M9 18l6-6-6-6'],
  up: ['M18 15l-6-6-6 6'],
  down: ['M6 9l6 6 6-6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  info: ['M12 16v-4', 'M12 8h.01', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
  help: ['M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
  play: ['M8 5v14l11-7Z'],
  pause: ['M7 5h3v14H7Z', 'M14 5h3v14h-3Z'],
  replay: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
  print: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6Z'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
  table: ['M3 5h18v14H3Z', 'M3 10h18', 'M3 15h18', 'M9 5v14'],
  chat: ['M21 12a8 8 0 0 1-8 8H8l-5 3 1.4-4.2A8 8 0 1 1 21 12Z'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z', 'M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8Z'],
  tag: ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z', 'M7.5 7.5h.01'],
  check: ['M20 6 9 17l-5-5'],
  calendar: ['M3 5h18v16H3Z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 7v5l3 2'],
  wallet: ['M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z', 'M3 7V5a2 2 0 0 1 2-2h11v4', 'M16 13h5'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  eyeOff: ['M3 3l18 18', 'M10.6 10.6a3 3 0 0 0 4.2 4.2', 'M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2', 'M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.9'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M21 21l-4.3-4.3'],
  trend: ['M3 17l6-6 4 4 8-8', 'M14 7h7v7'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4Z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  pin: ['M12 17v5', 'M8 3h8l-1 7 3 3H6l3-3Z'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  layout: ['M3 3h18v18H3Z', 'M3 9h18', 'M9 21V9'],
  grid: ['M3 3h8v8H3Z', 'M13 3h8v8h-8Z', 'M3 13h8v8H3Z', 'M13 13h8v8h-8Z'],
  user: ['M20 21a8 8 0 1 0-16 0', 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  building: ['M3 21h18', 'M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16', 'M9 7h2', 'M13 7h2', 'M9 11h2', 'M13 11h2', 'M9 15h2', 'M13 15h2'],
  filter: ['M22 3H2l8 9.5V19l4 2v-8.5Z'],
  sort: ['M11 5h10', 'M11 9h7', 'M11 13h4', 'M3 17l3 3 3-3', 'M6 20V4'],
  warn: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  gift: ['M20 12v10H4V12', 'M2 7h20v5H2Z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  lock: ['M5 11h14v10H5Z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  volume: ['M11 5 6 9H2v6h4l5 4V5Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  caption: ['M3 5h18v14H3Z', 'M7 12h4', 'M13 12h4', 'M7 15h2', 'M11 15h6'],
  text: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
  reset: ['M3 12a9 9 0 1 1 2.6 6.4', 'M3 21v-5h5'],
  copy: ['M8 8h12v12H8Z', 'M4 16V4h12'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8Z'],
  story: ['M4 5h16v12H4Z', 'M10 9l5 2.5L10 14Z', 'M8 21h8'],
};
