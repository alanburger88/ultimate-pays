/**
 * Overlay primitives: modal dialog, right drawer (desktop) / full sheet (mobile),
 * bottom sheet, popover and toasts. All manage focus, Escape, and scroll lock.
 */
import { h, clear, trapFocus, focusFirst, focusables, icon, uid } from '../../app/dom.js';

const open = [];
let currentPopover = null;

function lockScroll() {
  document.documentElement.style.overflow = open.length ? 'hidden' : '';
  // The page behind an open dialog is inert: no focus, no clicks, hidden from assistive technology.
  const app = document.getElementById('app');
  if (app) app.inert = open.length > 0;
}

/**
 * openOverlay({ title, body, actions, size:'md'|'lg', align:'center'|'right'|'bottom', onClose, labelledBy, role })
 * body may be a Node or a function(close) => Node. Returns { close, el, body }.
 */
export function openOverlay({ title, body, actions = null, size = 'md', align = 'center', onClose = null, role = 'dialog', className = '', closeLabel = 'Close', describedBy = null, initialFocus = null }) {
  const previouslyFocused = document.activeElement;
  const id = uid('dlg');
  const titleId = `${id}-title`;
  let closed = false;

  const closeBtn = h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: closeLabel }, on: { click: () => close('button') } }, icon('close'));
  const head = h('div', { class: 'pl-dialog-head' }, h('h2', { id: titleId }, title), closeBtn);
  const bodyEl = h('div', { class: 'pl-dialog-body' });
  const dialog = h('div', {
    class: ['pl-dialog', size === 'lg' && 'pl-dialog-lg', align === 'right' && 'pl-drawer', align === 'bottom' && 'pl-sheet', className],
    role, aria: { modal: 'true', labelledby: titleId, describedby: describedBy },
    tabindex: '-1',
  }, head, bodyEl);
  const scrim = h('div', { class: 'pl-scrim', dataset: { align }, on: { mousedown: (e) => { if (e.target === scrim) close('scrim'); } } }, dialog);

  function close(reason) {
    if (closed) return;
    closed = true;
    untrap();
    document.removeEventListener('keydown', onKey);
    scrim.remove();
    const i = open.indexOf(api); if (i >= 0) open.splice(i, 1);
    lockScroll();
    if (onClose) onClose(reason);
    if (previouslyFocused && document.contains(previouslyFocused) && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
  }
  function onKey(e) {
    // A definition popover above the overlay takes the Escape first (its own handler closes it).
    if (e.key === 'Escape' && !currentPopover && open[open.length - 1] === api) { e.preventDefault(); close('escape'); }
  }
  const api = { close, el: dialog, body: bodyEl, setTitle: (t) => { head.querySelector('h2').textContent = t; } };
  const content = typeof body === 'function' ? body(api) : body;
  if (content) bodyEl.appendChild(content);
  if (actions) {
    const foot = h('div', { class: 'pl-dialog-foot' });
    for (const a of (typeof actions === 'function' ? actions(api) : actions)) foot.appendChild(a);
    dialog.appendChild(foot);
  }
  document.body.appendChild(scrim);
  open.push(api);
  lockScroll();
  const untrap = trapFocus(dialog);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    if (initialFocus && dialog.contains(initialFocus)) initialFocus.focus();
    else if (!focusFirst(bodyEl)) { const foot = dialog.querySelector('.pl-dialog-foot'); if (!(foot && focusFirst(foot))) dialog.focus(); }
  });
  return api;
}

export function openDialog(opts) { return openOverlay({ ...opts, align: 'center' }); }
export function openDrawer(opts) { return openOverlay({ ...opts, align: 'right' }); }
export function openSheet(opts) { return openOverlay({ ...opts, align: 'bottom' }); }
export function closeAll() { for (const o of open.slice()) o.close('all'); }
export function anyOpen() { return open.length > 0; }

/** Confirm dialog. Resolves true/false. */
export function confirmDialog({ title, body, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const api = openDialog({
      title,
      body: typeof body === 'string' ? h('p', null, body) : body,
      actions: (dlg) => [
        h('button', { class: 'pl-btn', type: 'button', on: { click: () => dlg.close('cancel') } }, cancelLabel),
        h('button', { class: ['pl-btn', danger ? 'pl-btn-danger' : 'pl-btn-primary'], type: 'button', on: { click: () => { result = true; dlg.close('confirm'); } } }, confirmLabel),
      ],
      onClose: () => resolve(result),
    });
    return api;
  });
}

/** Anchored popover (definitions). Closes on Escape, outside click, or scroll away. */
export function openPopover({ anchor, title, body, closeLabel = 'Close' }) {
  closePopover();
  const id = uid('pop');
  const pop = h('div', { class: 'pl-popover', id, role: 'dialog', aria: { labelledby: `${id}-t` }, tabindex: '-1' },
    h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: closeLabel }, on: { click: () => closePopover() } }, icon('close')),
    h('h4', { id: `${id}-t`, style: { paddingRight: '36px' } }, title),
    body,
  );
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth; const hgt = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + window.innerWidth - w - 8);
  let top = r.bottom + window.scrollY + 6;
  if (r.bottom + hgt + 12 > window.innerHeight && r.top - hgt - 6 > 0) top = r.top + window.scrollY - hgt - 6;
  pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  let self = null;
  function onDoc(e) { if (currentPopover === self && !pop.contains(e.target) && e.target !== anchor) closePopover(); }
  function onKey(e) {
    if (currentPopover !== self) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePopover(); anchor.focus(); }
  }
  // Disclosure pattern: Tab out of the definition closes it and returns to its trigger, so focus never
  // leaves a modal it was opened from.
  function onTab(e) {
    if (e.key !== 'Tab') return;
    const items = focusables(pop);
    const first = items[0]; const last = items[items.length - 1];
    const leaving = !items.length || (e.shiftKey && (document.activeElement === first || document.activeElement === pop)) || (!e.shiftKey && document.activeElement === last);
    if (leaving) { e.preventDefault(); closePopover(); anchor.focus(); }
  }
  pop.addEventListener('keydown', onTab);
  document.addEventListener('mousedown', onDoc, true);
  document.addEventListener('keydown', onKey, true);
  self = currentPopover = { el: pop, anchor, cleanup: () => { document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('keydown', onKey, true); pop.removeEventListener('keydown', onTab); } };
  anchor.setAttribute('aria-expanded', 'true');
  pop.focus();
  return currentPopover;
}
export function closePopover() {
  if (!currentPopover) return;
  currentPopover.cleanup();
  currentPopover.anchor.setAttribute('aria-expanded', 'false');
  currentPopover.el.remove();
  currentPopover = null;
}

/** Toasts: short, polite, auto-dismiss. */
let toastHost = null;
export function toast(message, { kind = 'info', action = null, duration = 5000 } = {}) {
  if (!toastHost) { toastHost = h('div', { class: 'pl-toasts', role: 'status', aria: { live: 'polite' } }); document.body.appendChild(toastHost); }
  const el = h('div', { class: 'pl-toast', dataset: { kind } }, h('span', { style: { flex: 1 } }, message), action ? h('button', { class: 'pl-btn-link', type: 'button', on: { click: () => { action.onClick(); el.remove(); } } }, action.label) : null);
  toastHost.appendChild(el);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  window.setTimeout(() => el.remove(), duration);
  return el;
}
