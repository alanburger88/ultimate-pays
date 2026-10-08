/** PLACEHOLDER pay story — to be implemented. Contract: export function openStory(ctx, { chapter } = {}) */
import { h } from '../app/dom.js';
import { openDialog } from './components/overlay.js';
export function openStory(ctx, opts = {}) {
  openDialog({ title: ctx.t('story.title'), size: 'lg', body: h('p', null, 'Story implementation pending.') });
}
