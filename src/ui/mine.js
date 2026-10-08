/** PLACEHOLDER Make it mine — to be implemented. Contract: export function openMine(ctx) */
import { h } from '../app/dom.js';
import { openDialog } from './components/overlay.js';
export function openMine(ctx) {
  openDialog({ title: ctx.t('mine.title'), body: h('p', null, 'Personalisation implementation pending.') });
}
