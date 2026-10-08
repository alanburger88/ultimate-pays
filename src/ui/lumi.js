/** PLACEHOLDER Lumi panel — to be implemented. Contract: export function openLumi(ctx, { question, contextLineIds } = {}) */
import { h } from '../app/dom.js';
import { openDrawer } from './components/overlay.js';
export function openLumi(ctx, opts = {}) {
  openDrawer({ title: ctx.t('lumi.title'), body: h('p', null, 'Lumi implementation pending.'), onClose: () => ctx.actions.lumiClosed() });
}
