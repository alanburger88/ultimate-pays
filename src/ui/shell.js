/** Shell chrome: masthead, section navigation (tabs / mobile selector), footer, Lumi launcher. */
import { h, icon, announce, replaceChildren } from '../app/dom.js';
import { openSheet } from './components/overlay.js';
import { LANGUAGE_NAMES } from '../app/i18n.js';

export function renderMasthead(ctx) {
  const { record, content } = ctx.doc;
  const t = ctx.t;
  const branding = ctx.store.get().prefs.presentation.branding || {};
  const employeeNumberLabel = (() => { const v = content.employeeField('employeeNumber'); return v && v !== 'employeeNumber' ? v : t('record.field_employee_number'); })();
  const factsId = 'pl-mh-facts';
  const facts = h('div', { class: 'pl-masthead-facts', id: factsId, role: 'list', aria: { label: t('record.document_particulars') } },
    fact(t('masthead.employer'), record.employer.legalName),
    fact(t('masthead.recipient'), record.employee.displayName),
    record.employee.employeeNumber ? fact(employeeNumberLabel, record.employee.employeeNumber) : null,
    fact(t('masthead.period'), ctx.fmt.period(record.document.period)),
    fact(t('masthead.pay_date'), ctx.fmt.date(record.document.payDate)),
  );
  const header = h('header', { class: 'pl-masthead', role: 'banner', dataset: { expanded: 'false' } });
  // Phone summary: who and which period, with the remaining particulars one tap away.
  const detailsBtn = h('button', { class: 'pl-btn-link small pl-mh-details', type: 'button', aria: { expanded: 'false', controls: factsId }, on: { click: () => {
    const open = header.dataset.expanded !== 'true';
    header.dataset.expanded = String(open);
    detailsBtn.setAttribute('aria-expanded', String(open));
  } } }, t('masthead.details'), icon('down', { size: 14 }));
  const summary = h('div', { class: 'pl-masthead-summary' },
    h('span', { class: 'who' }, h('b', null, record.employee.displayName)),
    h('span', { class: 'when muted' }, ctx.fmt.period(record.document.period)),
    detailsBtn,
  );
  const tools = h('div', { class: 'pl-masthead-tools' },
    ctx.config.modules.story ? toolButton(ctx, { iconName: 'play', label: t('story.title'), cls: 'pl-tool-story pl-phone-only', onClick: () => ctx.actions.openStory() }) : null,
    toolButton(ctx, { iconName: 'print', label: t('record.print'), cls: 'pl-tool-print pl-phone-only', onClick: () => ctx.actions.print() }),
    languageControl(ctx),
    languageButton(ctx),
    themeToggle(ctx),
  );
  header.appendChild(h('div', { class: 'pl-wrap' },
    h('a', { class: 'pl-brand', href: '#', on: { click: (e) => { e.preventDefault(); ctx.actions.go(ctx.config.homeSection || ctx.config.startSection, { push: true }); } } },
      h('span', { class: 'pl-brand-mark', aria: { hidden: 'true' } }, (branding.name || 'Paylight').slice(0, 1)),
      h('span', { class: 'pl-brand-text' }, branding.name || t('app.name'), h('small', null, content.document('title'))),
    ),
    summary, facts, tools,
  ));
  return header;
  function fact(label, value) { return h('span', { role: 'listitem' }, `${label}: `, h('b', null, value)); }
}

/** Header action: icon plus label; the label hides on narrow screens and stays the accessible name. */
function toolButton(ctx, { iconName, label, cls, onClick }) {
  return h('button', { class: `pl-btn pl-btn-quiet pl-tool ${cls || ''}`, type: 'button', aria: { label }, title: label, on: { click: onClick } }, icon(iconName, { size: 18 }), h('span', { class: 'txt', aria: { hidden: 'true' } }, label));
}

/** The theme actually showing: an explicit choice, or the device setting when the choice is "system". */
export function effectiveTheme() {
  const pref = document.documentElement.dataset.theme || 'system';
  if (pref === 'dark' || pref === 'light') return pref;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function themeToggle(ctx) {
  const t = ctx.t;
  const btn = h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon pl-theme-toggle', type: 'button', dataset: { themeToggle: '', labelDark: t('theme.switch_to_dark'), labelLight: t('theme.switch_to_light') },
    on: { click: () => ctx.actions.setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark') } });
  syncThemeToggle(btn);
  return btn;
}

/** Keep every theme toggle's icon and name in step with what is showing (called on any appearance change). */
export function syncThemeToggle(only) {
  const showing = effectiveTheme();
  const buttons = only ? [only] : Array.from(document.querySelectorAll('[data-theme-toggle]'));
  for (const btn of buttons) {
    const label = showing === 'dark' ? btn.dataset.labelLight : btn.dataset.labelDark;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    replaceChildren(btn, icon(showing === 'dark' ? 'moon' : 'sun'));
    btn.dataset.showing = showing;
  }
}

function availableLocales(ctx) {
  return ctx.config.approvedLocales.filter((l) => ctx.doc.registry.languages[l]);
}

function languageControl(ctx) {
  const t = ctx.t;
  const locales = availableLocales(ctx);
  if (locales.length < 2) return null;
  const select = h('select', { class: 'pl-select pl-lang-select', aria: { label: t('app.language') }, on: { change: (e) => ctx.actions.setLocale(e.target.value) } },
    locales.map((l) => h('option', { value: l, lang: l, selected: l === ctx.locale ? true : null }, LANGUAGE_NAMES[l] || l)),
  );
  return select;
}

/** Phones: a compact globe button that opens the same choice as a sheet. */
function languageButton(ctx) {
  const t = ctx.t;
  const locales = availableLocales(ctx);
  if (locales.length < 2) return null;
  const label = `${t('app.language')}: ${LANGUAGE_NAMES[ctx.locale] || ctx.locale}`;
  return h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon pl-lang-btn', type: 'button', aria: { label, haspopup: 'dialog' }, title: label, on: { click: () => openSheet({
    title: t('app.language'),
    closeLabel: t('nav.close_menu'),
    body: (dlg) => h('ul', { class: 'pl-menu-list' }, locales.map((l) => h('li', null,
      h('button', { type: 'button', lang: l, aria: { current: String(l === ctx.locale) }, on: { click: () => { dlg.close(); if (l !== ctx.locale) ctx.actions.setLocale(l); } } }, icon(l === ctx.locale ? 'check' : 'globe'), LANGUAGE_NAMES[l] || l),
    ))),
  }) } }, icon('globe'));
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
  // Wide screens: the two most-used actions sit at the end of the tab row (phones have them in the header).
  const actions = h('div', { class: 'pl-nav-actions' },
    ctx.config.modules.story ? toolButton(ctx, { iconName: 'play', label: t('story.title'), cls: 'pl-tool-story', onClick: () => ctx.actions.openStory() }) : null,
    toolButton(ctx, { iconName: 'print', label: t('record.print'), cls: 'pl-tool-print', onClick: () => ctx.actions.print() }),
  );
  return h('nav', { class: 'pl-nav', id: 'pl-nav', aria: { label: t('nav.sections') } }, h('div', { class: 'pl-wrap' }, tabs, actions, mobile));
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
  // Presenter builds keep a quiet way into Studio; employee packages have no footer content at all.
  if (ctx.config.packageKind === 'employee') return null;
  return h('footer', { class: 'pl-footer', role: 'contentinfo' },
    h('div', { class: 'pl-wrap' },
      h('button', { class: 'pl-btn-link xs', type: 'button', on: { click: () => ctx.actions.openStudio() } }, t('app.presenter')),
    ),
  );
}

export function renderLauncher(ctx) {
  const t = ctx.t;
  return h('button', { class: 'pl-launcher', type: 'button', id: 'pl-lumi-launcher', aria: { label: t('lumi.open'), expanded: 'false', haspopup: 'dialog' }, on: { click: () => ctx.actions.openLumi() } },
    icon('sparkle', { size: 22 }), h('span', { class: 'txt' }, t('lumi.name')));
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
