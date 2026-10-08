/** PLACEHOLDER Presenter Studio — to be implemented. Contract: export const hasStudio = true; export function openStudio(ctx) */
import { h } from '../app/dom.js';
import { openDialog } from './components/overlay.js';
export const hasStudio = true;
export function openStudio(ctx) {
  openDialog({ title: ctx.t('studio.title'), body: h('p', null, 'Studio implementation pending.') });
}
