/** PLACEHOLDER query composer — to be implemented. Contract: export function openQuery(ctx, { lineIds, entryIds, draftId } = {}) */
import { h } from '../app/dom.js';
import { openDialog } from './components/overlay.js';
export function openQuery(ctx, opts = {}) {
  openDialog({ title: ctx.t('query.title'), body: h('p', null, 'Query composer implementation pending.') });
}
