/** Presentation-only access screen. It authenticates nobody and says so. */
import { h, icon } from '../app/dom.js';
export function renderGate(ctx, onContinue) {
  const t = ctx.t;
  return h('main', { class: 'pl-wrap', style: { padding: '48px 16px' } },
    h('div', { class: 'pl-card pl-card-lg stack', style: { maxWidth: '480px', margin: '0 auto' } },
      h('h1', null, t('gate.title')),
      h('div', { class: 'pl-notice', dataset: { kind: 'warn' } }, icon('warn'), h('div', null, t('gate.intro'))),
      h('p', { class: 'muted small' }, t('gate.identity_note')),
      h('button', { class: 'pl-btn pl-btn-primary pl-btn-block', type: 'button', on: { click: onContinue } }, t('gate.continue')),
    ));
}
