/**
 * "Make it mine" — employee personalisation (PRD §6.5).
 * Reorders permitted sections (never removes them), chooses the starting section,
 * pins summaries, and sets density, emphasis, appearance, language, presentation
 * privacy, low-data and animation. Preferences only change how the record is
 * explored: no amount, statutory term, disclosure or export is touched here.
 *
 * Contract: export function openMine(ctx)
 */
import { h, announce, icon, uid, prefersReducedMotion } from '../app/dom.js';
import { openDialog, toast } from './components/overlay.js';
import { registerStrings, LANGUAGE_NAMES } from '../app/i18n.js';
import { DEFAULT_PRESENTATION, SECTION_IDS, orderSections } from '../app/config.js';
import { PRESETS } from '../app/presets.js';
import { loadPrefs, savePrefs, loadStudioSettings } from '../app/persist.js';

registerStrings({
  'mine.group_sections': 'Sections',
  'mine.group_display': 'Display',
  'mine.group_privacy': 'Privacy and data',
  'mine.required': 'Required',
  'mine.position': 'Position {position} of {count}',
  'mine.drag_handle': 'Reorder {section}',
  'mine.drag_hint': 'Drag a section by its handle to reorder. With a keyboard, focus the handle, press Space, use the arrow keys, then press Space again.',
  'mine.picked_up': '{section} picked up, position {position} of {count}. Use the arrow keys to move it, Space to drop, Escape to cancel.',
  'mine.dropped': '{section} dropped at position {position} of {count}.',
  'mine.drag_cancelled': 'Reorder cancelled. {section} is back at position {position}.',
  'mine.moved': '{section} is now position {position} of {count}.',
  'mine.start_section_hint': 'The section shown first the next time this statement opens.',
  'mine.language_hint': 'Applied when you save. The statement reopens in the chosen language.',
  'mine.language_only': 'This statement is issued in {lang} only.',
  'mine.previewing': 'Preview applied. Save to keep these preferences, or cancel to go back.',
  'mine.not_previewed': 'Changes are not applied until you preview or save.',
  'mine.animation_low_data': 'Animation is off while low-data mode is on.',
  'mine.animation_reduced': 'Your device asks for reduced motion, so animation stays minimal.',
  'mine.privacy_preview_note': 'Preferences never change any amount, statutory term, disclosure or export.',
});

const KEYS = ['sectionOrder', 'startSection', 'pins', 'density', 'emphasis', 'theme', 'privacyMode', 'lowData', 'animation'];
const PIN_IDS = ['net_change', 'hours', 'leave', 'employer', 'ytd'];

function readForm(ctx) {
  const p = ctx.store.get().prefs.presentation || {};
  const order = ctx.sections().map((s) => s.id);
  const start = order.includes(p.startSection) ? p.startSection : (order.includes(ctx.config.startSection) ? ctx.config.startSection : order[0]);
  return {
    order,
    startSection: start,
    pins: Array.isArray(p.pins) ? p.pins.filter((x) => PIN_IDS.includes(x)) : [],
    density: p.density === 'compact' ? 'compact' : 'comfortable',
    emphasis: ['table', 'chart', 'balanced'].includes(p.emphasis) ? p.emphasis : 'balanced',
    theme: ['light', 'dark', 'system'].includes(p.theme) ? p.theme : 'system',
    lang: ctx.locale,
    privacyMode: Boolean(p.privacyMode),
    lowData: Boolean(p.lowData),
    animation: p.animation !== false,
  };
}

function partialOf(form) {
  return {
    sectionOrder: form.order.slice(),
    startSection: form.startSection,
    pins: form.pins.slice(),
    density: form.density,
    emphasis: form.emphasis,
    theme: form.theme,
    privacyMode: form.privacyMode,
    lowData: form.lowData,
    animation: form.animation,
  };
}

function snapshotOf(ctx) {
  const p = ctx.store.get().prefs.presentation || {};
  const snap = {};
  for (const k of KEYS) snap[k] = Array.isArray(p[k]) ? p[k].slice() : p[k];
  return snap;
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a || null) === JSON.stringify(b || null);
  return a === b;
}

/** Only the keys whose value differs from the current store, so a no-op revert never re-renders or toasts. */
function diffAgainstStore(ctx, values) {
  const p = ctx.store.get().prefs.presentation || {};
  const out = {};
  for (const k of Object.keys(values)) if (!sameValue(p[k], values[k])) out[k] = values[k];
  return out;
}

function availablePins(ctx) {
  const record = ctx.doc.record;
  const hasTime = Boolean(record.time && (record.time.entries || []).length);
  const hasBalances = Boolean(record.time && record.time.leave && (record.time.leave.balances || []).length);
  return PIN_IDS.filter((id) => (id === 'hours' ? hasTime : id === 'leave' ? hasBalances : true));
}

/* ----------------------------------------------------------------------------
 * Controls
 * ------------------------------------------------------------------------- */

function group(title, ...children) {
  const id = uid('mine-g');
  return h('section', { class: 'pl-mine-group', aria: { labelledby: id } }, h('h3', { id, class: 'pl-mine-group-title' }, title), ...children);
}

/** Segmented radio group (roving tabindex, arrow keys). */
function seg(ctx, { label, options, value, onChange, focusKey, hint = null }) {
  const groupEl = h('div', { class: 'pl-seg pl-mine-seg', role: 'radiogroup', aria: { label } });
  options.forEach((o, i) => {
    groupEl.appendChild(h('button', {
      type: 'button', role: 'radio', aria: { checked: String(o.value === value) }, tabindex: o.value === value ? '0' : '-1', dataset: { focusKey: `${focusKey}-${o.value}`, value: o.value },
      on: {
        click: () => { onChange(o.value); Array.from(groupEl.children).forEach((b, j) => { b.setAttribute('aria-checked', String(j === i)); b.tabIndex = j === i ? 0 : -1; }); },
        keydown: (e) => {
          const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const next = (i + dir + options.length) % options.length;
          groupEl.children[next].click();
          groupEl.children[next].focus();
        },
      },
    }, o.label));
  });
  return h('div', { class: 'pl-field pl-mine-field' }, h('span', { class: 'pl-label' }, label), groupEl, hint ? h('span', { class: 'pl-hint' }, hint) : null);
}

function switchRow({ label, desc = null, checked, onChange, disabled = false, note = null, focusKey }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: checked ? true : null, disabled: disabled ? true : null, dataset: { focusKey }, on: { change: (e) => onChange(e.target.checked) } });
  const descId = desc || note ? uid('mine-sd') : null;
  if (descId) input.setAttribute('aria-describedby', descId);
  return h('div', { class: ['pl-mine-switch', disabled && 'is-disabled'] },
    h('label', { class: 'pl-switch' }, input, h('span', { class: 'track', aria: { hidden: 'true' } }), h('span', { class: 'pl-mine-switch-label' }, label)),
    descId ? h('span', { class: 'pl-hint pl-mine-switch-desc', id: descId }, [desc, note].filter(Boolean).join(' ')) : null,
  );
}

/* ----------------------------------------------------------------------------
 * Dialog
 * ------------------------------------------------------------------------- */

export function openMine(ctx) {
  const t = ctx.t;
  const sectionsById = Object.fromEntries(ctx.sections().map((s) => [s.id, s]));
  const title = (id) => t((sectionsById[id] || {}).titleKey || id);
  let form = readForm(ctx);
  let snapshot = snapshotOf(ctx);
  let previewed = false;   // something was applied live and could need reverting
  let committed = false;   // Save pressed: closing must not revert
  let dlg = null;

  const introId = uid('mine-intro');
  const statusEl = h('p', { class: 'pl-mine-status muted small', role: 'status', id: uid('mine-status') }, t('mine.not_previewed'));
  const bodyHost = h('div', { class: 'pl-mine' });

  function setStatus(text) { statusEl.textContent = text; }

  function applyPreview() {
    const partial = diffAgainstStore(ctx, partialOf(form));
    if (Object.keys(partial).length) ctx.actions.setPrefs(partial);
    previewed = true;
    setStatus(t('mine.previewing'));
    announce(t('mine.previewing'));
  }

  function revert() {
    if (!previewed) return;
    const partial = diffAgainstStore(ctx, snapshot);
    if (Object.keys(partial).length) ctx.actions.setPrefs(partial);
    previewed = false;
  }

  function save() {
    committed = true;
    const partial = diffAgainstStore(ctx, partialOf(form));
    if (Object.keys(partial).length) ctx.actions.setPrefs(partial);
    const approved = ctx.config.approvedLocales.filter((l) => ctx.doc.registry.languages[l]);
    const changeLang = form.lang !== ctx.locale && approved.includes(form.lang);
    if (dlg) dlg.close('save');
    toast(t('mine.saved'));
    // Language last: it reboots the application, so everything else must already be stored.
    if (changeLang) ctx.actions.setLocale(form.lang);
  }

  /** The value a key has when no preference is stored: presenter (Studio) settings, then the preset, then bundled defaults. */
  function defaultFor(key) {
    const studio = (ctx.registry && ctx.registry.packageKind === 'employee') ? null : (loadStudioSettings() || null);
    const preset = PRESETS.find((p) => p.id === ctx.config.preset) || {};
    if (key === 'sectionOrder') return orderSections((studio && studio.sectionOrder) || preset.sectionOrder || SECTION_IDS, ctx.config.modules);
    if (key === 'startSection') return (studio && studio.startSection) || preset.startSection || 'my-pay';
    if (key === 'pins') return undefined;
    if (studio && studio[key] !== undefined) return studio[key];
    return DEFAULT_PRESENTATION[key];
  }

  function reset() {
    // resetPrefs() clears storage and returns the store to the launch-time presentation, but that
    // presentation was resolved with the preferences saved at launch. Each key that was stored is
    // therefore set back to its real default here so the reset is visible now, and storage is
    // cleared again afterwards so nothing personal remains on the device.
    const stored = (loadPrefs().presentation) || {};
    ctx.actions.resetPrefs();
    const fix = {};
    for (const k of KEYS) if (k in stored) fix[k] = defaultFor(k);
    const partial = diffAgainstStore(ctx, fix);
    if (Object.keys(partial).length) ctx.actions.setPrefs(partial);
    savePrefs({ presentation: {}, acknowledged: (ctx.store.get().prefs || {}).acknowledged || {} });
    snapshot = snapshotOf(ctx);
    previewed = false;
    form = readForm(ctx);
    renderBody();
    setStatus(t('mine.not_previewed'));
    toast(t('mine.reset_done'));
    announce(t('mine.reset_done'));
  }

  function cancel() { if (dlg) dlg.close('cancel'); }

  /* ---- Section order ----------------------------------------------------- */
  const orderList = h('ol', { class: 'pl-mine-order', aria: { label: t('mine.section_order') } });
  const startSelect = h('select', { class: 'pl-select', id: uid('mine-start'), dataset: { focusKey: 'mine-start' }, on: { change: (e) => { form.startSection = e.target.value; } } });

  function renderStartOptions() {
    while (startSelect.firstChild) startSelect.removeChild(startSelect.firstChild);
    for (const id of form.order) startSelect.appendChild(h('option', { value: id, selected: id === form.startSection ? true : null }, title(id)));
    startSelect.value = form.startSection;
  }

  // Reordering: drag a row by its handle (mouse, pen or touch), or use the handle from the keyboard
  // (Space to pick up, arrow keys to move, Space or Enter to drop, Escape to cancel).
  const hintId = uid('mine-order-hint');
  let grabbed = null; // { id, from: order before the keyboard pick-up }
  let rerendering = false; // re-rendering removes the focused handle; that blur is not the user leaving

  function commitOrder(next, focusId) {
    form.order = next;
    rerendering = true;
    try {
      renderOrder();
      renderStartOptions();
      const handle = orderList.querySelector(`[data-id="${CSS.escape(focusId)}"] .pl-mine-grip`);
      if (handle) handle.focus();
    } finally { rerendering = false; }
  }

  function moveBy(id, dir) {
    const i = form.order.indexOf(id);
    const j = Math.max(0, Math.min(form.order.length - 1, i + dir));
    if (i < 0 || i === j) return;
    const next = form.order.slice();
    next.splice(j, 0, next.splice(i, 1)[0]);
    commitOrder(next, id);
    if (grabbed) orderList.querySelector(`[data-id="${CSS.escape(id)}"]`).classList.add('is-grabbed');
    announce(t('mine.moved', { section: title(id), position: j + 1, count: form.order.length }));
  }

  function onHandleKey(e, id) {
    const key = e.key;
    if (key === ' ' || key === 'Enter') {
      e.preventDefault();
      if (grabbed && grabbed.id === id) {
        grabbed = null;
        commitOrder(form.order.slice(), id);
        announce(t('mine.dropped', { section: title(id), position: form.order.indexOf(id) + 1, count: form.order.length }));
      } else {
        grabbed = { id, from: form.order.slice() };
        e.currentTarget.closest('li').classList.add('is-grabbed');
        e.currentTarget.setAttribute('aria-pressed', 'true');
        announce(t('mine.picked_up', { section: title(id), position: form.order.indexOf(id) + 1, count: form.order.length }));
      }
    } else if (grabbed && grabbed.id === id && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End')) {
      e.preventDefault();
      const i = form.order.indexOf(id);
      moveBy(id, key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : key === 'Home' ? -i : form.order.length - 1 - i);
      const handle = orderList.querySelector(`[data-id="${CSS.escape(id)}"] .pl-mine-grip`);
      if (handle) handle.setAttribute('aria-pressed', 'true');
    } else if (key === 'Escape' && grabbed && grabbed.id === id) {
      e.preventDefault();
      e.stopPropagation(); // cancel the move, not the dialog
      const from = grabbed.from;
      grabbed = null;
      commitOrder(from, id);
      announce(t('mine.drag_cancelled', { section: title(id), position: from.indexOf(id) + 1 }));
    }
  }

  function onHandleBlur(id) {
    // Leaving the handle while carrying a section drops it where it is.
    if (rerendering) return;
    if (grabbed && grabbed.id === id) {
      grabbed = null;
      const row = orderList.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (row) { row.classList.remove('is-grabbed'); const hd = row.querySelector('.pl-mine-grip'); if (hd) hd.setAttribute('aria-pressed', 'false'); }
    }
  }

  function startPointerDrag(e, id) {
    if (e.button !== undefined && e.button !== 0) return;
    const row = e.currentTarget.closest('li');
    const handle = e.currentTarget;
    e.preventDefault();
    handle.focus({ preventScroll: true });
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* capture is best effort */ }
    const startOrder = form.order.slice();
    const grabOffset = e.clientY - row.getBoundingClientRect().top;
    row.classList.add('is-dragging');
    orderList.classList.add('is-sorting');
    const place = (clientY) => {
      // Move the row in the DOM when the pointer passes a neighbour's midpoint; translate it to follow the pointer.
      let prev = row.previousElementSibling;
      while (prev && clientY < prev.getBoundingClientRect().top + prev.offsetHeight / 2) { orderList.insertBefore(row, prev); prev = row.previousElementSibling; }
      let next = row.nextElementSibling;
      while (next && clientY > next.getBoundingClientRect().top + next.offsetHeight / 2) { orderList.insertBefore(next, row); next = row.nextElementSibling; }
      row.style.transform = 'none';
      const natural = row.getBoundingClientRect().top;
      row.style.transform = `translateY(${clientY - grabOffset - natural}px)`;
    };
    const onMove = (ev) => { ev.preventDefault(); place(ev.clientY); };
    const finish = (cancelled) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      row.style.transform = '';
      row.classList.remove('is-dragging');
      orderList.classList.remove('is-sorting');
      const next = cancelled ? startOrder : Array.from(orderList.children).map((li) => li.dataset.id);
      commitOrder(next, id);
      const pos = next.indexOf(id);
      if (!cancelled && pos !== startOrder.indexOf(id)) announce(t('mine.dropped', { section: title(id), position: pos + 1, count: next.length }));
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  }

  function renderOrder() {
    while (orderList.firstChild) orderList.removeChild(orderList.firstChild);
    form.order.forEach((id, i) => {
      const def = sectionsById[id] || {};
      const name = title(id);
      const required = Boolean(def.required);
      orderList.appendChild(h('li', { class: 'pl-mine-order-row', dataset: { id } },
        h('button', { class: 'pl-mine-grip', type: 'button', dataset: { focusKey: `mine-grip-${id}` }, aria: { label: t('mine.drag_handle', { section: name }), describedby: hintId, pressed: 'false' }, title: t('mine.drag_handle', { section: name }),
          on: { keydown: (e) => onHandleKey(e, id), blur: () => onHandleBlur(id), pointerdown: (e) => startPointerDrag(e, id) } }, icon('grip', { size: 20 })),
        h('span', { class: 'pl-mine-order-num tabular', aria: { hidden: 'true' } }, String(i + 1)),
        h('span', { class: 'pl-mine-order-text' },
          h('span', { class: 'sr-only' }, `${t('mine.position', { position: i + 1, count: form.order.length })}: `),
          icon(def.icon || 'dot', { size: 16 }),
          h('b', null, name),
          required ? h('span', { class: 'pl-chip pl-chip-outline xs pl-mine-required', title: t('mine.cannot_hide') }, icon('lock', { size: 12 }), t('mine.required'), h('span', { class: 'sr-only' }, `. ${t('mine.cannot_hide')}`)) : null,
        ),
      ));
    });
  }

  /* ---- Pins -------------------------------------------------------------- */
  function renderPins() {
    const pinsDescId = uid('mine-pins');
    const boxes = availablePins(ctx).map((pin) => {
      const input = h('input', { type: 'checkbox', value: pin, checked: form.pins.includes(pin) ? true : null, dataset: { focusKey: `mine-pin-${pin}` }, on: { change: (e) => {
        form.pins = e.target.checked ? Array.from(new Set([...form.pins, pin])) : form.pins.filter((x) => x !== pin);
        // keep the order stable (same as the My pay display order)
        form.pins = PIN_IDS.filter((x) => form.pins.includes(x));
      } } });
      return h('label', { class: 'pl-check pl-mine-pin' }, input, h('span', null, t(`mine.pin_${pin}`)));
    });
    return h('fieldset', { class: 'pl-fieldset pl-mine-pins', aria: { describedby: pinsDescId } },
      h('legend', null, t('mine.pins')),
      h('p', { class: 'pl-hint', id: pinsDescId }, t('mine.pins_desc')),
      h('div', { class: 'pl-mine-pins-grid' }, boxes),
    );
  }

  /* ---- Language ---------------------------------------------------------- */
  function renderLanguage() {
    const locales = ctx.config.approvedLocales.filter((l) => ctx.doc.registry.languages[l]);
    const id = uid('mine-lang');
    if (locales.length < 2) {
      return h('div', { class: 'pl-field pl-mine-field' },
        h('span', { class: 'pl-label', id }, t('mine.language')),
        h('span', { class: 'pl-mine-readonly', aria: { labelledby: id } }, LANGUAGE_NAMES[ctx.locale] || ctx.locale),
        h('span', { class: 'pl-hint' }, t('mine.language_only', { lang: LANGUAGE_NAMES[ctx.locale] || ctx.locale })),
      );
    }
    const hintId = uid('mine-lang-hint');
    const select = h('select', { class: 'pl-select', id, dataset: { focusKey: 'mine-lang' }, aria: { describedby: hintId }, on: { change: (e) => { form.lang = e.target.value; } } },
      locales.map((l) => h('option', { value: l, lang: l, selected: l === form.lang ? true : null }, LANGUAGE_NAMES[l] || l)));
    return h('div', { class: 'pl-field pl-mine-field' }, h('label', { for: id }, t('mine.language')), select, h('span', { class: 'pl-hint', id: hintId }, t('mine.language_hint')));
  }

  /* ---- Switches ---------------------------------------------------------- */
  function renderSwitches() {
    const host = h('div', { class: 'pl-mine-switches' });
    const reduced = prefersReducedMotion();
    let animationRow = null;
    const buildAnimation = () => switchRow({
      label: t('mine.animation'), checked: form.animation && !form.lowData, disabled: form.lowData, focusKey: 'mine-animation',
      note: form.lowData ? t('mine.animation_low_data') : (reduced ? t('mine.animation_reduced') : null),
      onChange: (on) => { form.animation = on; },
    });
    host.append(
      switchRow({ label: t('mine.privacy_mode'), desc: t('mine.privacy_mode_desc'), checked: form.privacyMode, focusKey: 'mine-privacy', onChange: (on) => { form.privacyMode = on; } }),
      switchRow({ label: t('mine.low_data'), desc: t('mine.low_data_desc'), checked: form.lowData, focusKey: 'mine-lowdata', onChange: (on) => {
        form.lowData = on;
        const fresh = buildAnimation();
        animationRow.replaceWith(fresh);
        animationRow = fresh;
      } }),
      (animationRow = buildAnimation()),
    );
    return host;
  }

  /* ---- Body -------------------------------------------------------------- */
  function renderBody() {
    while (bodyHost.firstChild) bodyHost.removeChild(bodyHost.firstChild);
    renderOrder();
    renderStartOptions();
    const startField = h('div', { class: 'pl-field pl-mine-field' }, h('label', { for: startSelect.id }, t('mine.start_section')), startSelect, h('span', { class: 'pl-hint' }, t('mine.start_section_hint')));
    bodyHost.append(
      h('p', { id: introId, class: 'pl-mine-intro' }, t('mine.intro')),
      group(t('mine.group_sections'),
        h('div', { class: 'pl-field pl-mine-field' },
          h('span', { class: 'pl-label' }, t('mine.section_order')),
          h('span', { class: 'pl-hint' }, t('mine.required_note')),
          h('span', { class: 'pl-hint', id: hintId }, t('mine.drag_hint')),
          orderList),
        startField,
        renderPins(),
      ),
      group(t('mine.group_display'),
        h('div', { class: 'pl-mine-grid' },
          seg(ctx, { label: t('mine.density'), focusKey: 'mine-density', value: form.density, onChange: (v) => { form.density = v; }, options: [
            { value: 'comfortable', label: t('mine.density_comfortable') }, { value: 'compact', label: t('mine.density_compact') }] }),
          seg(ctx, { label: t('mine.emphasis'), focusKey: 'mine-emphasis', value: form.emphasis, onChange: (v) => { form.emphasis = v; }, options: [
            { value: 'balanced', label: t('mine.emphasis_balanced') }, { value: 'table', label: t('mine.emphasis_table') }, { value: 'chart', label: t('mine.emphasis_chart') }] }),
          seg(ctx, { label: t('mine.theme'), focusKey: 'mine-theme', value: form.theme, onChange: (v) => { form.theme = v; }, options: [
            { value: 'light', label: t('mine.theme_light') }, { value: 'dark', label: t('mine.theme_dark') }, { value: 'system', label: t('mine.theme_system') }] }),
          renderLanguage(),
        ),
      ),
      group(t('mine.group_privacy'), renderSwitches()),
      h('div', { class: 'pl-mine-notes' },
        h('p', { class: 'muted small' }, icon('shield', { size: 14 }), ' ', t('mine.stored_note')),
        h('p', { class: 'muted small' }, icon('lock', { size: 14 }), ' ', t('mine.privacy_preview_note')),
      ),
    );
  }

  renderBody();

  dlg = openDialog({
    title: t('mine.title'),
    size: 'lg',
    className: 'pl-mine-dialog',
    closeLabel: t('common.close'),
    describedBy: introId,
    body: bodyHost,
    actions: () => [
      statusEl,
      h('button', { class: 'pl-btn pl-btn-quiet pl-mine-btn-reset', type: 'button', dataset: { focusKey: 'mine-reset' }, on: { click: reset } }, icon('reset', { size: 16 }), t('mine.reset')),
      h('button', { class: 'pl-btn pl-mine-btn-cancel', type: 'button', dataset: { focusKey: 'mine-cancel' }, on: { click: cancel } }, t('common.cancel')),
      h('button', { class: 'pl-btn pl-mine-btn-preview', type: 'button', dataset: { focusKey: 'mine-preview' }, on: { click: applyPreview } }, icon('eye', { size: 16 }), t('mine.preview')),
      h('button', { class: 'pl-btn pl-btn-primary pl-mine-btn-save', type: 'button', dataset: { focusKey: 'mine-save' }, on: { click: save } }, icon('check', { size: 16 }), t('mine.save')),
    ],
    onClose: () => { if (!committed) revert(); },
  });
  return dlg;
}
