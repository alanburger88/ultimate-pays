/** Shell chrome: masthead, section navigation (tabs / mobile selector), footer, Lumi launcher. */
import { h, icon, announce, replaceChildren } from '../app/dom.js';
import { amount } from './components/common.js';
import { openSheet } from './components/overlay.js';
import { LANGUAGE_NAMES } from '../app/i18n.js';

export function renderMasthead(ctx) {
  const { record, profile } = ctx.doc;
  const t = ctx.t;
  const totals = ctx.doc.computed.totals;
  const payable = totals[profile.payableTotal || profile.primaryTotal];
  const net = totals[profile.primaryTotal];
  const branding = ctx.store.get().prefs.presentation.branding || {};
  const facts = h('div', { class: 'pl-masthead-facts', role: 'list', aria: { label: t('record.document_particulars') } },
    fact(t('masthead.employer'), record.employer.legalName),
    fact(t('masthead.recipient'), record.employee.displayName),
    fact(t('masthead.period'), ctx.fmt.period(record.document.period)),
    fact(t('masthead.pay_date'), ctx.fmt.date(record.document.payDate)),
    fact(t('masthead.currency'), record.document.currency),
    fact(t('masthead.reference'), `${record.document.id} · ${t('masthead.version', { version: record.document.version })}`),
  );
  const netBlock = h('div', { class: 'pl-masthead-net' },
    h('span', { class: 'lbl' }, payable !== net ? t('masthead.amount_paid') : t('masthead.net_pay')),
    amount(ctx, payable, { cls: 'val', tag: 'span' }),
  );
  const tools = h('div', { class: 'pl-masthead-tools' },
    languageControl(ctx),
    h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: t('theme.toggle') }, title: t('theme.toggle'), on: { click: () => ctx.actions.cycleTheme() } }, icon(ctx.theme() === 'dark' ? 'moon' : 'sun')),
  );
  return h('header', { class: 'pl-masthead', role: 'banner' },
    h('div', { class: 'pl-wrap' },
      h('a', { class: 'pl-brand', href: '#', on: { click: (e) => { e.preventDefault(); ctx.actions.go(ctx.config.homeSection || ctx.config.startSection, { push: true }); } } },
        h('span', { class: 'pl-brand-mark', aria: { hidden: 'true' } }, (branding.name || 'Paylight').slice(0, 1)),
        h('span', null, branding.name || t('app.name'), h('small', null, ctx.content.document('title'))),
      ),
      facts, netBlock, tools,
    ),
  );
  function fact(label, value) { return h('span', { role: 'listitem' }, `${label}: `, h('b', null, value)); }
}

function languageControl(ctx) {
  const t = ctx.t;
  const locales = ctx.config.approvedLocales.filter((l) => ctx.doc.registry.languages[l]);
  if (locales.length < 2) return null;
  const select = h('select', { class: 'pl-select', aria: { label: t('app.language') }, on: { change: (e) => ctx.actions.setLocale(e.target.value) } },
    locales.map((l) => h('option', { value: l, lang: l, selected: l === ctx.locale ? true : null }, LANGUAGE_NAMES[l] || l)),
  );
  return select;
}

export function renderNav(ctx) {
  const t = ctx.t;
  const sections = ctx.sections();
  const current = ctx.store.get().nav.section;
  const tabs = h('ul', { class: 'pl-tabs', role: 'tablist', aria: { label: t('nav.sections') } },
    sections.map((s) => h('li', { role: 'presentation' },
      h('button', { class: 'pl-tab', type: 'button', role: 'tab', id: `tab-${s.id}`, aria: { selected: String(s.id === current), controls: `section-${s.id}` }, tabindex: s.id === current ? '0' : '-1', dataset: { section: s.id },
        on: { click: () => ctx.actions.go(s.id, { push: true }), keydown: (e) => onTabKey(e, sections, s.id, ctx) } }, t(s.titleKey)),
    )),
  );
  const currentSection = sections.find((s) => s.id === current) || sections[0];
  // The visible text ("Sections: Time & leave") is the accessible name, so speech users can say what they see.
  const mobileBtn = h('button', { class: 'pl-btn', type: 'button', title: t('nav.open_menu'), aria: { haspopup: 'dialog' }, on: { click: () => openSectionSheet(ctx) } },
    h('span', null, h('span', { class: 'muted small' }, `${t('nav.sections')}: `), h('b', null, t(currentSection.titleKey))), icon('down'));
  const mobile = h('div', { class: 'pl-nav-mobile' }, mobileBtn);
  return h('nav', { class: 'pl-nav', id: 'pl-nav', aria: { label: t('nav.sections') } }, h('div', { class: 'pl-wrap' }, tabs, mobile));
}

function onTabKey(e, sections, id, ctx) {
  const idx = sections.findIndex((s) => s.id === id);
  let next = null;
  if (e.key === 'ArrowRight') next = sections[(idx + 1) % sections.length];
  else if (e.key === 'ArrowLeft') next = sections[(idx - 1 + sections.length) % sections.length];
  else if (e.key === 'Home') next = sections[0];
  else if (e.key === 'End') next = sections[sections.length - 1];
  if (!next) return;
  e.preventDefault();
  ctx.actions.go(next.id, { push: true, focus: false });
  const btn = document.getElementById(`tab-${next.id}`);
  if (btn) btn.focus();
}

export function openSectionSheet(ctx) {
  const t = ctx.t;
  const sections = ctx.sections();
  const current = ctx.store.get().nav.section;
  openSheet({
    title: t('nav.choose_section'),
    closeLabel: t('nav.close_menu'),
    body: (dlg) => h('ul', { class: 'pl-menu-list' }, sections.map((s) => h('li', null,
      h('button', { type: 'button', aria: { current: String(s.id === current) }, on: { click: () => { dlg.close(); ctx.actions.go(s.id, { push: true }); } } }, icon(s.icon || 'dot'), t(s.titleKey), s.id === current ? h('span', { class: 'sr-only' }, ` (${t('common.selected')})`) : null),
    ))),
  });
}

export function renderFooter(ctx) {
  const t = ctx.t;
  const { record } = ctx.doc;
  return h('footer', { class: 'pl-footer', role: 'contentinfo' },
    h('div', { class: 'pl-wrap' },
      h('span', null, t('app.footer_provenance', { id: record.document.id, version: record.document.version, issued: ctx.fmt.dateTime(record.document.issuedAt) })),
      h('span', null, t('record.provenance_constructed')),
      h('span', { class: 'pl-chip pl-chip-warn' }, t('app.not_proof')),
      ctx.config.packageKind !== 'employee' ? h('button', { class: 'pl-btn-link xs', type: 'button', on: { click: () => ctx.actions.openStudio() } }, t('app.presenter')) : null,
    ),
  );
}

export function renderLauncher(ctx) {
  const t = ctx.t;
  return h('button', { class: 'pl-launcher', type: 'button', id: 'pl-lumi-launcher', aria: { label: t('lumi.open'), expanded: 'false', haspopup: 'dialog' }, on: { click: () => ctx.actions.openLumi() } },
    icon('sparkle', { size: 22 }), h('span', { class: 'txt' }, t('lumi.name')));
}

export function renderBanner(ctx) {
  const t = ctx.t;
  return h('div', { class: 'pl-banner', id: 'pl-banner', dataset: { kind: 'constructed' } }, h('div', { class: 'pl-wrap' }, icon('info', { size: 14 }), h('span', null, t('app.constructed_banner'))));
}

export function setOfflineBanner(ctx, host, offline) {
  const t = ctx.t;
  const existing = host.querySelector('#pl-offline');
  if (offline && !existing) {
    const el = h('div', { class: 'pl-banner', id: 'pl-offline', dataset: { kind: 'offline' }, role: 'status' }, h('div', { class: 'pl-wrap' }, icon('warn', { size: 14 }), h('span', null, t('app.offline'))));
    host.insertBefore(el, host.querySelector('.pl-masthead'));
    announce(t('app.offline'));
  } else if (!offline && existing) {
    existing.remove();
    announce(t('app.online_again'));
  }
}
