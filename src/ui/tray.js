/** PLACEHOLDER selection tray — to be implemented. Contract: export function renderTray(ctx) -> HTMLElement|null (null when nothing selected) */
import { h } from '../app/dom.js';
export function renderTray(ctx) {
  const sel = ctx.store.get().selection;
  const n = sel.lineIds.length + sel.entryIds.length;
  if (!n) return null;
  return h('div', { class: 'pl-tray', role: 'region', aria: { label: ctx.t('select.tray_label') } }, h('span', { class: 'count' }, ctx.t('select.count', { count: n })));
}
