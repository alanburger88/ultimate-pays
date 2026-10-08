/** PLACEHOLDER section module — to be implemented. Contract: export function render(ctx) -> HTMLElement */
import { h } from '../../app/dom.js';
import { sectionHeader } from '../components/common.js';

export function render(ctx) {
  const t = ctx.t;
  return h('div', { class: 'stack-lg' },
    sectionHeader(ctx, t('nav.total_reward'), null),
    h('div', { class: 'pl-card' }, h('p', { class: 'muted' }, 'Section implementation pending.')),
  );
}
