/**
 * Time & leave — the hours and leave behind this pay.
 *
 *  - Hours summary: regular / overtime / premium / leave / holiday / total paid
 *    from calc.js timeSummary (ctx.doc.computed.time), each linked to the pay
 *    lines that carry those minutes ("Shown in pay as").
 *  - Read-only pay-period calendar (Monday-first) whose days are toggle buttons:
 *    activating a day selects its entries (ctx.actions.toggleSelectEntry) and
 *    shows them in a detail panel with start–end, break, worked, regular,
 *    overtime and the "Paid on line" link back to the statement.
 *  - "Calendar as a list": a selectable table (desktop) / cards (narrow) of the
 *    same entries. Low-data mode and the table emphasis preference show the list.
 *  - Navigation from a line ("View the shifts": store.nav.entryIds / entryDate)
 *    highlights the entries and scrolls to them; it never selects on the user's behalf.
 *  - Leave balances with "How this balance moved": governed explanation and the
 *    period's movements linked to their calendar day or pay line.
 *  - Upcoming pay dates, visibly scheduled rather than issued, with the neutral
 *    calendar export when the calendar module is enabled.
 *
 * Numbers only come from the record, calc.js and ctx.fmt; governed text only
 * from ctx.content. Nothing here changes the issued record.
 *
 * Contract: export function render(ctx) -> HTMLElement
 */
import { h, icon, announce, uid } from '../../app/dom.js';
import { registerStrings, has } from '../../app/i18n.js';
import { sectionHeader, kpi, emptyState, isNarrow } from '../components/common.js';
import { entryLabel, entryHours, selectedEntries } from '../tray.js';

registerStrings({
  'time.view_toggle': 'Calendar view',
  'time.view_calendar': 'Calendar',
  'time.view_list': 'List',
  'time.pick_day': 'Choose a day to see its entries. Activating a day also selects its entries so you can query them.',
  'time.a11y_calendar_keys': 'Use the arrow keys to move between days with entries, Home and End for the first and last. Activate a day to select its entries.',
  'time.a11y_day': '{date}: {type}, {hours}',
  'time.a11y_day_ot': '{date}: {type}, {hours}, of which {overtime} overtime',
  'time.a11y_day_multi': '{date}: {count} entries, {hours}',
  'time.a11y_day_empty': '{date}: no entry',
  'time.outside_period': 'Outside this pay period',
  'time.legend_overtime': 'Includes overtime',
  'time.day_selected': 'Entries for {date} selected',
  'time.day_deselected': 'Entries for {date} removed from selection',
  'time.entry_selected': '{entry} selected',
  'time.entry_deselected': '{entry} removed from selection',
  'time.clear_entries': 'Clear selected entries',
  'time.entries_cleared': 'Time entry selection cleared.',
  'time.linked_entries_title': 'Entries behind the line you came from',
  'time.linked_entries_count.one': '{count} time entry highlighted',
  'time.linked_entries_count.other': '{count} time entries highlighted',
  'time.col_time': 'Time',
  'time.col_break': 'Break',
  'time.paid_hours': 'Paid',
  'time.no_lines_for_entry': 'Not linked to a pay line',
  'time.show_in_calendar': 'Show in calendar',
  'time.show_in_list': 'Show in list',
  'time.scheduled': 'Scheduled',
  'time.no_movements': 'No movements were recorded for this balance in this period.',
  'time.balance_closing_note': 'Closing balance',
  'time.entries_in_period.one': '{count} entry in this period',
  'time.entries_in_period.other': '{count} entries in this period',
  'time.month_first': '{month}',
});

// ---------------------------------------------------------------------------
// Module state (survives the shell's re-renders; reset when the document changes)
// ---------------------------------------------------------------------------

const state = {
  docId: null,
  view: null,            // 'calendar' | 'list' | null (follow preferences)
  openDay: null,         // ISO date whose entries are shown in the detail panel
  rovingDay: null,       // ISO date of the calendar button that carries tabindex=0
  expanded: new Set(),   // leave balance types with "How this balance moved" open
  highlightKey: null,    // nav.entryIds key already scrolled to
};

/** Lists replace the many-column table below 900px (narrow mobile plus the tablet band). */
const CARDS_QUERY = '(max-width: 899px)';
function useCards() { return isNarrow() || (window.matchMedia && window.matchMedia(CARDS_QUERY).matches); }

let liveCtx = null;
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia(CARDS_QUERY);
  const onChange = () => { if (liveCtx && liveCtx.store.get().nav.section === 'time-leave') liveCtx.store.update('nav', (n) => ({ ...n })); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}

// ---------------------------------------------------------------------------
// Dates (calendar dates only; never shifted by time zone)
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
function toUtc(iso) { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); }
function toIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDays(iso, n) { return toIso(toUtc(iso) + n * DAY_MS); }
/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(iso) { return (new Date(toUtc(iso)).getUTCDay() + 6) % 7; }
function dayNumber(iso) { return Number(iso.slice(8, 10)); }

const nameCache = new Map();
function weekdayNames(locale, style) {
  const key = `${locale}|${style}`;
  if (nameCache.has(key)) return nameCache.get(key);
  const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
  const monday = Date.UTC(2024, 0, 1);
  const names = Array.from({ length: 7 }, (_, i) => f.format(new Date(monday + i * DAY_MS)));
  nameCache.set(key, names);
  return names;
}
function monthShort(locale, iso) {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(toUtc(iso)));
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Minutes an entry is paid for (paidMinutes, else worked/leave minutes). Same rule as the tray. */
function entryMinutes(e) {
  return typeof e.paidMinutes === 'number' ? e.paidMinutes : (e.type === 'work' ? e.workedMinutes : e.minutes) || 0;
}

function resetIfNewDocument(ctx) {
  const id = `${ctx.doc.record.document.id}|${ctx.doc.record.document.version}`;
  if (state.docId === id) return;
  state.docId = id;
  state.view = null;
  state.openDay = null;
  state.rovingDay = null;
  state.expanded.clear();
  state.highlightKey = null;
}

function buildModel(ctx) {
  const { record } = ctx.doc;
  const time = record.time || {};
  const period = record.document.period;
  const nav = ctx.store.get().nav;
  const sel = ctx.store.get().selection;
  const entries = (time.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.start || '').localeCompare(String(b.start || '')) || String(a.id).localeCompare(String(b.id)));
  const highlightIds = Array.isArray(nav.entryIds) ? nav.entryIds.filter((id) => entries.some((e) => e.id === id)) : [];
  const selectedIds = sel.entryIds || [];

  const lineIndex = {};
  const bucketLines = {};
  for (const line of record.lines) {
    if (!line.timeEntryIds || !line.timeEntryIds.length) continue;
    const bucket = line.timeBucket || 'workedMinutes';
    (bucketLines[bucket] || (bucketLines[bucket] = [])).push(line);
    for (const id of line.timeEntryIds) (lineIndex[id] || (lineIndex[id] = [])).push(line);
  }

  const byDate = {};
  for (const e of entries) (byDate[e.date] || (byDate[e.date] = [])).push(e);

  // The grid covers the pay period and any entry dated outside it (never hide an entry).
  const first = entries.length && entries[0].date < period.start ? entries[0].date : period.start;
  const last = entries.length && entries[entries.length - 1].date > period.end ? entries[entries.length - 1].date : period.end;
  const gridStart = addDays(first, -weekdayIndex(first));
  const gridEnd = addDays(last, 6 - weekdayIndex(last));
  const weeks = [];
  const days = {};
  for (let w = gridStart; w <= gridEnd; w = addDays(w, 7)) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDays(w, i);
      const list = byDate[iso] || [];
      const day = {
        iso,
        entries: list,
        outside: iso < period.start || iso > period.end,
        minutes: list.reduce((s, e) => s + entryMinutes(e), 0),
        overtime: list.reduce((s, e) => s + (e.overtimeMinutes || 0), 0),
        type: list.length ? (list.some((e) => e.type === 'work') ? 'work' : list[0].type || 'none') : 'none',
        allSelected: list.length > 0 && list.every((e) => selectedIds.includes(e.id)),
        someSelected: list.some((e) => selectedIds.includes(e.id)),
        highlighted: list.some((e) => highlightIds.includes(e.id)),
        showMonth: iso === first || dayNumber(iso) === 1,
      };
      days[iso] = day;
      row.push(day);
    }
    weeks.push({ start: w, days: row });
  }

  return {
    period, entries, highlightIds, selectedIds, lineIndex, bucketLines, weeks, days,
    selectedEntries: selectedEntries(ctx, selectedIds),
    highlightedEntries: entries.filter((e) => highlightIds.includes(e.id)),
    paidMinutes: entries.reduce((s, e) => s + entryMinutes(e), 0),
    hasPremium: entries.some((e) => (e.premiumMinutes || 0) > 0),
    typesPresent: Array.from(new Set(entries.map((e) => e.type))),
    hasOvertime: entries.some((e) => (e.overtimeMinutes || 0) > 0),
    balances: (time.leave && time.leave.balances) || [],
    movements: (time.leave && time.leave.movements) || [],
    upcoming: time.upcomingPayDates || [],
    scheduleNote: time.scheduleNote || null,
  };
}

function entryName(ctx, e) {
  return `${ctx.fmt.date(e.date, 'weekday')}, ${entryLabel(ctx, e)}`;
}

/** Interface sentence with one node inserted where {name} would be (keeps word order translatable). */
function textWithNode(ctx, key, name, node, params = {}) {
  const sentinel = '\u0000';
  const parts = ctx.t(key, { ...params, [name]: sentinel }).split(sentinel);
  const el = h('span', { class: 'pl-tl-sentence' });
  parts.forEach((part, i) => { if (part) el.appendChild(document.createTextNode(part)); if (i < parts.length - 1) el.appendChild(node); });
  return el;
}

function unitValue(ctx, unit, hundredths) {
  return unit === 'hours' ? ctx.fmt.hours(hundredths) : ctx.fmt.days(hundredths);
}

function signed(ctx, unit, hundredths, sign) {
  const text = unitValue(ctx, unit, Math.abs(hundredths));
  if (hundredths === 0 || !sign) return text;
  const negative = sign === '-' ? hundredths > 0 : hundredths < 0;
  return `${negative ? '−' : '+'}${text}`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx) {
  liveCtx = ctx;
  resetIfNewDocument(ctx);
  const t = ctx.t;
  const nav = ctx.store.get().nav;
  const m = buildModel(ctx);

  // A new "View the shifts" request: show its entries in the panel and scroll to them once.
  const highlightKey = m.highlightIds.length ? m.highlightIds.join(',') : null;
  const highlightChanged = Boolean(highlightKey) && highlightKey !== state.highlightKey;
  if (highlightChanged) { state.openDay = nav.entryDate && m.days[nav.entryDate] ? nav.entryDate : null; state.rovingDay = null; }
  if (!highlightKey) state.highlightKey = null;
  if (state.openDay && !(m.days[state.openDay] && m.days[state.openDay].entries.length)) state.openDay = null;

  const el = h('div', { class: 'stack-lg pl-tl' }, sectionHeader(ctx, t('time.title'), t('time.intro')));
  let calendar = null;
  if (!m.entries.length) {
    el.appendChild(emptyState(t('time.no_time')));
  } else {
    el.appendChild(hoursCard(ctx, m));
    calendar = calendarCard(ctx, m);
    el.appendChild(calendar.el);
  }
  const balances = balancesSection(ctx, m, calendar ? calendar.api : null);
  if (balances) el.appendChild(balances);
  const upcoming = upcomingCard(ctx, m);
  if (upcoming) el.appendChild(upcoming);

  if (highlightChanged) {
    state.highlightKey = highlightKey;
    announce(t('time.linked_entries_count', { count: m.highlightedEntries.length }));
    // Two frames: the shell focuses the section and scrolls to the top in its own frame after mounting.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const target = el.querySelector('button.pl-cal-day.is-selected') || el.querySelector('.pl-tl-listview:not([hidden]) .is-focus');
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: ctx.reducedMotion() ? 'auto' : 'smooth' });
      const focusEl = target.matches('button, input') ? target : target.querySelector('input, button');
      if (focusEl) focusEl.focus({ preventScroll: true });
    }));
  }
  return el;
}

// --- hours summary ------------------------------------------------------------

function hoursCard(ctx, m) {
  const t = ctx.t;
  const s = ctx.doc.computed.time;
  const hid = uid('tlh');
  const noteKey = m.scheduleNote ? `time.schedule_note_${m.scheduleNote}` : null;
  const items = [
    { id: 'regular', label: t('time.regular_hours'), minutes: s.regularMinutes, buckets: ['regularMinutes'] },
    { id: 'overtime', label: t('time.overtime_hours'), minutes: s.overtimeMinutes, buckets: ['overtimeMinutes'] },
    s.premiumMinutes > 0 ? { id: 'premium', label: t('time.premium_hours'), minutes: s.premiumMinutes, buckets: ['premiumMinutes'] } : null,
    { id: 'leave', label: t('time.leave_hours'), minutes: s.leaveMinutes, buckets: [] },
    s.holidayMinutes > 0 ? { id: 'holiday', label: t('time.holiday'), minutes: s.holidayMinutes, buckets: [] } : null,
    { id: 'paid', label: t('time.total_paid_hours'), minutes: m.paidMinutes, buckets: ['paidMinutes', 'workedMinutes'], primary: true },
  ].filter(Boolean);
  return h('section', { class: 'pl-card pl-tl-hours', aria: { labelledby: hid } },
    h('h2', { id: hid }, t('time.hours_summary')),
    noteKey && has(noteKey) ? h('p', { class: 'muted small pl-tl-note' }, t(noteKey)) : null,
    h('p', { class: 'muted small pl-tl-note' }, t('time.entries_in_period', { count: m.entries.length })),
    h('div', { class: 'pl-tl-kpis' }, items.map((it) => {
      const lines = it.buckets.flatMap((b) => m.bucketLines[b] || []);
      const sub = lines.length ? h('span', { class: 'pl-tl-links' }, `${t('time.shows_in_pay')}:`, lines.map((line) => h('button', {
        class: 'pl-btn-link xs', type: 'button', dataset: { focusKey: `tl-kpi-${it.id}-${line.id}` }, on: { click: () => ctx.actions.focusLine(line.id) },
      }, ctx.content.lineLabel(line)))) : null;
      return kpi(ctx, { label: it.label, value: ctx.fmt.minutesAsHours(it.minutes), sub, size: 'sm', cls: ['pl-tl-kpi', it.primary && 'pl-tl-kpi-paid'].filter(Boolean).join(' ') });
    })),
  );
}

// --- calendar card ----------------------------------------------------------------

function calendarCard(ctx, m) {
  const t = ctx.t;
  const hid = uid('tlc');
  const panelId = uid('tlp');
  const keysId = uid('tlk');
  const lowData = ctx.lowData();
  const emphasis = ctx.store.get().prefs.presentation.emphasis || 'balanced';
  let view = lowData ? 'list' : (state.view || (emphasis === 'table' ? 'list' : 'calendar'));

  const panel = h('div', { class: 'pl-tl-daypanel', id: panelId });
  const api = {
    showDay(iso, { focus = true } = {}) {
      const day = m.days[iso];
      if (!day || !day.entries.length) return;
      state.openDay = iso;
      if (!lowData && view !== 'calendar') setView('calendar');
      renderPanel();
      const target = view === 'calendar' ? calView.querySelector(`button.pl-cal-day[data-date="${iso}"]`) : listView.querySelector(`[data-entry-id="${day.entries[0].id}"]`);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: ctx.reducedMotion() ? 'auto' : 'smooth' });
      if (!focus) return;
      const f = target.matches('button') ? target : target.querySelector('input, button');
      if (f) f.focus({ preventScroll: true });
    },
    toggleDay(day) {
      state.openDay = day.iso;
      state.rovingDay = day.iso;
      const selectAll = !day.allSelected;
      for (const e of day.entries) {
        const isSelected = m.selectedIds.includes(e.id);
        if (isSelected !== selectAll) ctx.actions.toggleSelectEntry(e.id);
      }
      announce(t(selectAll ? 'time.day_selected' : 'time.day_deselected', { date: ctx.fmt.date(day.iso, 'weekday') }));
    },
  };

  const grid = calendarGrid(ctx, m, api, panelId, keysId);
  const calView = h('div', { class: 'pl-tl-calview' },
    h('p', { class: 'sr-only', id: keysId }, t('time.a11y_calendar_keys')),
    grid, legend(ctx, m), panel);
  const listView = h('div', { class: 'pl-tl-listview' }, entryList(ctx, m));

  const btnCal = h('button', { type: 'button', dataset: { focusKey: 'tl-view-calendar' }, aria: { pressed: 'false' }, on: { click: () => setView('calendar') } }, icon('calendar', { size: 16 }), t('time.view_calendar'));
  const btnList = h('button', { type: 'button', dataset: { focusKey: 'tl-view-list' }, aria: { pressed: 'false' }, on: { click: () => setView('list') } }, icon('list', { size: 16 }), t('time.view_list'));
  const toggle = lowData
    ? h('p', { class: 'muted xs pl-tl-lowdata' }, t('chart.low_data'))
    : h('div', { class: 'pl-seg pl-tl-viewtoggle', role: 'group', aria: { label: t('time.view_toggle') } }, btnCal, btnList);

  function setView(v) {
    view = v;
    if (!lowData) state.view = v;
    calView.hidden = v !== 'calendar';
    listView.hidden = v !== 'list';
    btnCal.setAttribute('aria-pressed', String(v === 'calendar'));
    btnList.setAttribute('aria-pressed', String(v === 'list'));
  }

  function renderPanel() {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const day = state.openDay ? m.days[state.openDay] : null;
    if (day && day.entries.length) {
      panel.append(
        h('h3', null, t('time.day_detail', { date: ctx.fmt.date(day.iso, 'long') })),
        day.outside ? h('p', { class: 'muted small' }, t('time.outside_period')) : null,
        h('ul', { class: 'pl-tl-entries' }, day.entries.map((e) => entryItem(ctx, m, e, { withDate: false }))),
      );
    } else if (m.highlightedEntries.length) {
      panel.append(
        h('h3', null, t('time.linked_entries_title')),
        h('p', { class: 'muted small' }, t('time.linked_entries_count', { count: m.highlightedEntries.length })),
        h('ul', { class: 'pl-tl-entries' }, m.highlightedEntries.map((e) => entryItem(ctx, m, e, { withDate: true }))),
      );
    } else {
      panel.append(h('p', { class: 'muted small pl-tl-hint' }, icon('info', { size: 16 }), t('time.pick_day')));
    }
  }

  renderPanel();
  setView(view);

  const el = h('section', { class: 'pl-card pl-tl-calcard', aria: { labelledby: hid } },
    h('div', { class: 'row-between pl-tl-calhead' },
      h('div', { class: 'pl-tl-calhead-text' }, h('h2', { id: hid }, t('time.calendar_title')), h('p', { class: 'muted small' }, t('time.calendar_desc', { period: ctx.fmt.period(m.period) }))),
      toggle,
    ),
    selectionBar(ctx, m),
    calView,
    listView,
  );
  return { el, api };
}

function selectionBar(ctx, m) {
  const t = ctx.t;
  const count = m.selectedEntries.length;
  if (!count) return h('p', { class: 'muted small pl-tl-selhint' }, t('time.select_disputed'));
  return h('div', { class: 'pl-tl-selbar' },
    h('span', { class: 'strong' }, icon('check', { size: 16 }), t('select.entries_count', { count })),
    h('div', { class: 'pl-btn-group' },
      ctx.modules().queries ? h('button', { class: 'pl-btn pl-btn-sm pl-btn-primary', type: 'button', dataset: { focusKey: 'tl-query' }, aria: { haspopup: 'dialog' }, on: { click: () => ctx.actions.openQuery({ entryIds: m.selectedIds.slice() }) } }, icon('send', { size: 16 }), t('time.query_entries')) : null,
      h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: 'tl-clear' }, on: { click: () => clearEntries(ctx) } }, t('time.clear_entries')),
    ),
  );
}

function clearEntries(ctx) {
  const sel = ctx.store.get().selection;
  ctx.store.set({ selection: { ...sel, entryIds: [] } });
  announce(ctx.t('time.entries_cleared'));
}

// --- calendar grid ----------------------------------------------------------------

function calendarGrid(ctx, m, api, panelId, keysId) {
  const t = ctx.t;
  const shortNames = weekdayNames(ctx.locale, 'short');
  const longNames = weekdayNames(ctx.locale, 'long');
  const buttonDays = m.weeks.flatMap((w) => w.days).filter((d) => d.entries.length);
  const roving = (state.rovingDay && m.days[state.rovingDay] && m.days[state.rovingDay].entries.length ? state.rovingDay : null)
    || (buttonDays.find((d) => d.highlighted) || buttonDays[0] || {}).iso || null;

  const grid = h('div', { class: 'pl-cal pl-tl-cal', role: 'grid', aria: { label: t('time.calendar_title'), describedby: keysId } },
    h('div', { class: 'pl-tl-cal-row', role: 'row' }, shortNames.map((n, i) => h('div', { class: 'dow', role: 'columnheader' }, h('span', { aria: { hidden: 'true' } }, n), h('span', { class: 'sr-only' }, longNames[i])))),
    m.weeks.map((w) => h('div', { class: 'pl-tl-cal-row', role: 'row', aria: { label: t('time.week', { date: ctx.fmt.date(w.start) }) } }, w.days.map((d) => dayCell(ctx, m, d, api, panelId, roving)))),
  );

  grid.addEventListener('keydown', (e) => {
    const btn = e.target.closest('button.pl-cal-day');
    if (!btn) return;
    const buttons = Array.from(grid.querySelectorAll('button.pl-cal-day'));
    const i = buttons.indexOf(btn);
    const date = btn.dataset.date;
    let next = null;
    const weekOf = (iso) => addDays(iso, -weekdayIndex(iso));
    const inWeek = (monday) => buttons.filter((b) => b.dataset.date >= monday && b.dataset.date <= addDays(monday, 6));
    const closest = (list) => list.length ? list.reduce((best, b) => (Math.abs(weekdayIndex(b.dataset.date) - weekdayIndex(date)) < Math.abs(weekdayIndex(best.dataset.date) - weekdayIndex(date)) ? b : best), list[0]) : null;
    switch (e.key) {
      case 'ArrowRight': next = buttons[i + 1] || null; break;
      case 'ArrowLeft': next = buttons[i - 1] || null; break;
      case 'ArrowDown': next = closest(inWeek(addDays(weekOf(date), 7))) || buttons.find((b) => b.dataset.date > addDays(weekOf(date), 6)) || null; break;
      case 'ArrowUp': next = closest(inWeek(addDays(weekOf(date), -7))) || buttons.slice().reverse().find((b) => b.dataset.date < weekOf(date)) || null; break;
      case 'Home': next = buttons[0]; break;
      case 'End': next = buttons[buttons.length - 1]; break;
      default: return;
    }
    e.preventDefault();
    if (!next || next === btn) return;
    btn.tabIndex = -1;
    next.tabIndex = 0;
    state.rovingDay = next.dataset.date;
    next.focus();
  });
  return grid;
}

function dayCell(ctx, m, day, api, panelId, roving) {
  const t = ctx.t;
  const n = dayNumber(day.iso);
  const dateText = ctx.fmt.date(day.iso, 'weekday');
  const number = h('span', { class: 'd', aria: { hidden: 'true' } }, day.showMonth ? h('span', { class: 'm' }, `${monthShort(ctx.locale, day.iso)} `) : null, String(n));
  if (!day.entries.length) {
    return h('div', { role: 'gridcell', class: 'pl-cal-cell' },
      h('div', { class: 'pl-cal-day', dataset: { type: 'none', outside: day.outside ? 'true' : null } },
        number,
        h('span', { class: 'sr-only' }, day.outside ? `${dateText}: ${t('time.outside_period')}` : t('time.a11y_day_empty', { date: dateText })),
      ));
  }
  const hours = ctx.fmt.minutesAsHours(day.minutes);
  const typeText = day.entries.length === 1 ? entryLabel(ctx, day.entries[0]) : null;
  const label = day.entries.length > 1
    ? t('time.a11y_day_multi', { date: dateText, count: day.entries.length, hours })
    : day.overtime > 0
      ? t('time.a11y_day_ot', { date: dateText, type: typeText, hours, overtime: ctx.fmt.minutesAsHours(day.overtime) })
      : t('time.a11y_day', { date: dateText, type: typeText, hours });
  const btn = h('button', {
    type: 'button',
    class: ['pl-cal-day', day.highlighted && 'is-selected'],
    dataset: { type: day.type, ot: day.overtime > 0 ? 'true' : null, outside: day.outside ? 'true' : null, date: day.iso, focusKey: `tl-day-${day.iso}` },
    aria: { pressed: day.allSelected ? 'true' : day.someSelected ? 'mixed' : 'false', label: `${label}${day.outside ? `. ${t('time.outside_period')}` : ''}`, controls: panelId },
    tabindex: day.iso === roving ? '0' : '-1',
    on: { click: () => api.toggleDay(day), focus: () => { state.rovingDay = day.iso; } },
  },
    number,
    h('span', { class: 'h', aria: { hidden: 'true' } }, h('span', { class: 'h-full' }, hours), h('span', { class: 'h-short' }, ctx.fmt.number(day.minutes / 60, 2))),
    h('span', { class: 'ty', aria: { hidden: 'true' } }, typeText || t('common.items', { count: day.entries.length })),
    day.allSelected ? h('span', { class: 'chk', aria: { hidden: 'true' } }, icon('check', { size: 12 })) : null,
  );
  return h('div', { role: 'gridcell', class: 'pl-cal-cell' }, btn);
}

function legend(ctx, m) {
  const t = ctx.t;
  const items = m.typesPresent.filter((ty) => ty !== 'none').map((ty) => h('span', { class: 'pl-tl-legend-item' }, h('span', { class: 'sw', dataset: { type: ty } }), ctx.content.entryType(ty).label));
  if (m.hasOvertime) items.push(h('span', { class: 'pl-tl-legend-item' }, h('span', { class: 'sw sw-ot' }, '+'), t('time.legend_overtime')));
  items.push(h('span', { class: 'pl-tl-legend-item' }, h('span', { class: 'sw sw-sel' }, icon('check', { size: 10 })), t('common.selected')));
  return h('div', { class: 'pl-chart-legend pl-tl-legend', role: 'list', aria: { label: t('chart.legend') } }, items.map((it) => { it.setAttribute('role', 'listitem'); return it; }));
}

// --- entry presentation ----------------------------------------------------------------

function entryCheckbox(ctx, m, e) {
  const t = ctx.t;
  const name = entryName(ctx, e);
  return h('input', {
    type: 'checkbox', class: 'pl-rowcheck', checked: m.selectedIds.includes(e.id),
    dataset: { focusKey: `tl-entry-${e.id}` }, aria: { label: `${t('time.entry_select')}: ${name}` },
    on: { change: (ev) => { ctx.actions.toggleSelectEntry(e.id); announce(t(ev.target.checked ? 'time.entry_selected' : 'time.entry_deselected', { entry: name })); } },
  });
}

function lineLinks(ctx, m, e) {
  const t = ctx.t;
  const lines = m.lineIndex[e.id] || [];
  if (!lines.length) return h('span', { class: 'muted xs' }, t('time.no_lines_for_entry'));
  return lines.map((line) => textWithNode(ctx, 'time.linked_line', 'line', h('button', {
    class: 'pl-btn-link', type: 'button', dataset: { focusKey: `tl-line-${e.id}-${line.id}` }, on: { click: () => ctx.actions.focusLine(line.id) },
  }, ctx.content.lineLabel(line))));
}

function fact(label, value) {
  return h('div', { class: 'pl-tl-fact' }, h('dt', null, label), h('dd', { class: 'tabular' }, value));
}

function entryFacts(ctx, e) {
  const t = ctx.t;
  const f = ctx.fmt.minutesAsHours;
  if (e.type === 'work') {
    return h('dl', { class: 'pl-tl-facts' },
      fact(t('time.worked'), f(e.workedMinutes || 0)),
      fact(t('time.regular_hours'), f(e.regularMinutes || 0)),
      (e.overtimeMinutes || 0) > 0 ? fact(t('time.overtime_hours'), f(e.overtimeMinutes)) : null,
      (e.premiumMinutes || 0) > 0 ? fact(t('time.premium_hours'), f(e.premiumMinutes)) : null,
      fact(t('time.paid_hours'), entryHours(ctx, e)),
    );
  }
  return h('dl', { class: 'pl-tl-facts' }, fact(t('time.paid_hours'), entryHours(ctx, e)));
}

function entryHead(ctx, e, { withDate }) {
  const t = ctx.t;
  return h('div', { class: 'pl-tl-entry-head' },
    withDate ? h('span', { class: 'strong' }, ctx.fmt.date(e.date, 'weekday')) : null,
    h('span', { class: ['pl-chip', e.type === 'leave' && 'pl-chip-warn', e.type === 'holiday' && 'pl-chip-info', e.type === 'work' && 'pl-chip-accent'] }, entryLabel(ctx, e)),
    e.type === 'leave' && e.leaveType ? h('span', { class: 'muted small' }, ctx.content.entryType('leave').label) : null,
    e.start && e.end ? h('span', { class: 'tabular' }, t('time.entry_detail', { start: e.start, end: e.end })) : null,
    typeof e.breakMinutes === 'number' ? h('span', { class: 'muted small' }, t('time.entry_break', { minutes: ctx.fmt.number(e.breakMinutes) })) : null,
  );
}

function entryItem(ctx, m, e, { withDate }) {
  const selected = m.selectedIds.includes(e.id);
  const highlighted = m.highlightIds.includes(e.id);
  return h('li', { class: ['pl-tl-entry', selected && 'is-selected', highlighted && 'is-focus'], dataset: { entryId: e.id } },
    h('div', { class: 'sel' }, entryCheckbox(ctx, m, e)),
    h('div', { class: 'pl-tl-entry-main' }, entryHead(ctx, e, { withDate }), entryFacts(ctx, e), h('div', { class: 'pl-tl-lines' }, lineLinks(ctx, m, e))),
  );
}

// --- calendar as a list ---------------------------------------------------------------------

function entryList(ctx, m) {
  const t = ctx.t;
  if (useCards()) return h('div', { class: 'pl-cards pl-tl-cards' }, m.entries.map((e) => entryCard(ctx, m, e)));
  const f = ctx.fmt.minutesAsHours;
  const num = (v) => (v === null ? '—' : f(v));
  return h('div', { class: 'pl-table-wrap' },
    h('table', { class: 'pl-table pl-table-compact pl-tl-table' },
      h('caption', { class: 'sr-only' }, t('time.calendar_list')),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'col-check' }, h('span', { class: 'sr-only' }, t('time.entry_select'))),
        h('th', { scope: 'col' }, t('common.date')),
        h('th', { scope: 'col' }, t('common.type')),
        h('th', { scope: 'col' }, t('time.col_time')),
        h('th', { scope: 'col', class: 'num' }, t('time.col_break')),
        h('th', { scope: 'col', class: 'num' }, t('time.worked')),
        h('th', { scope: 'col', class: 'num' }, t('time.regular_hours')),
        h('th', { scope: 'col', class: 'num' }, t('time.overtime_hours')),
        m.hasPremium ? h('th', { scope: 'col', class: 'num' }, t('time.premium_hours')) : null,
        h('th', { scope: 'col', class: 'num' }, t('time.paid_hours')),
        h('th', { scope: 'col' }, t('time.shows_in_pay')),
      )),
      h('tbody', null, m.entries.map((e) => {
        const selected = m.selectedIds.includes(e.id);
        const highlighted = m.highlightIds.includes(e.id);
        const work = e.type === 'work';
        return h('tr', { dataset: { entryId: e.id }, class: [selected && 'is-selected', highlighted && 'is-focus'], aria: { selected: String(selected) } },
          h('td', { class: 'col-check' }, entryCheckbox(ctx, m, e)),
          h('td', null, h('span', { class: 'cell-main nowrap' }, ctx.fmt.date(e.date, 'weekday')), (e.date < m.period.start || e.date > m.period.end) ? h('span', { class: 'cell-sub' }, t('time.outside_period')) : null),
          h('td', null, entryLabel(ctx, e)),
          h('td', { class: 'col-time' }, e.start && e.end ? h('span', { class: 'tabular nowrap' }, t('time.entry_detail', { start: e.start, end: e.end })) : '—'),
          h('td', { class: 'num' }, typeof e.breakMinutes === 'number' ? `${ctx.fmt.number(e.breakMinutes)} ${t('common.minutes')}` : '—'),
          h('td', { class: 'num' }, num(work ? e.workedMinutes || 0 : null)),
          h('td', { class: 'num' }, num(work ? e.regularMinutes || 0 : null)),
          h('td', { class: 'num' }, num(work ? e.overtimeMinutes || 0 : null)),
          m.hasPremium ? h('td', { class: 'num' }, num(work ? e.premiumMinutes || 0 : null)) : null,
          h('td', { class: 'num' }, entryHours(ctx, e)),
          h('td', { class: 'col-lines' }, h('div', { class: 'pl-tl-lines' }, lineLinks(ctx, m, e))),
        );
      })),
    ));
}

function entryCard(ctx, m, e) {
  const selected = m.selectedIds.includes(e.id);
  const highlighted = m.highlightIds.includes(e.id);
  return h('article', { class: ['pl-line-card', 'pl-tl-card', selected && 'is-selected', highlighted && 'is-focus'], dataset: { entryId: e.id } },
    h('div', { class: 'sel' }, entryCheckbox(ctx, m, e)),
    h('div', { class: 'body' },
      h('span', { class: 'title' }, ctx.fmt.date(e.date, 'weekday')),
      (e.date < m.period.start || e.date > m.period.end) ? h('span', { class: 'muted xs' }, ctx.t('time.outside_period')) : null,
      entryHead(ctx, e, { withDate: false }),
    ),
    h('div', { class: 'hours' }, h('span', { class: 'amt' }, entryHours(ctx, e)), h('span', { class: 'ytd' }, ctx.t('time.paid_hours'))),
    h('div', { class: 'facts' }, entryFacts(ctx, e)),
    h('div', { class: 'lines pl-tl-lines' }, lineLinks(ctx, m, e)),
  );
}

// --- leave balances ------------------------------------------------------------------------------

function balancesSection(ctx, m, calApi) {
  const t = ctx.t;
  if (!m.balances.length) return null;
  const hid = uid('tlb');
  return h('section', { class: 'pl-tl-balances', aria: { labelledby: hid } },
    h('h2', { id: hid }, t('time.balances_title')),
    h('div', { class: 'pl-tl-balgrid' }, m.balances.map((b) => balanceCard(ctx, m, b, calApi))),
  );
}

function balanceCard(ctx, m, b, calApi) {
  const t = ctx.t;
  const label = ctx.content.leaveType(b.type).label;
  const hid = uid('tlbal');
  const moreId = uid('tlmore');
  const open = state.expanded.has(b.type);
  const unit = b.unit === 'hours' ? 'hours' : 'days';
  const row = (k, v, cls = null) => [h('dt', { class: cls }, k), h('dd', { class: ['tabular', cls] }, v)];
  const more = h('div', { class: 'pl-tl-bal-more', id: moreId, hidden: !open }, balanceDetail(ctx, m, b, calApi));
  const toggle = h('button', {
    class: 'pl-btn-link pl-tl-bal-toggle', type: 'button', dataset: { focusKey: `tl-bal-${b.type}` },
    aria: { expanded: String(open), controls: moreId },
    on: { click: () => { const now = more.hidden; more.hidden = !now; toggle.setAttribute('aria-expanded', String(now)); if (now) state.expanded.add(b.type); else state.expanded.delete(b.type); } },
  }, icon('down', { size: 14 }), t('time.balance_explain'));
  return h('article', { class: 'pl-card pl-tl-bal', aria: { labelledby: hid }, dataset: { leaveType: b.type } },
    h('h3', { id: hid }, label),
    h('p', { class: 'pl-tl-bal-closing' },
      h('span', { class: 'val' }, unitValue(ctx, unit, b.closing)),
      h('span', { class: 'lbl' }, `${t('time.balance_closing_note')} · ${t('time.balance_as_of', { date: ctx.fmt.date(b.asOf) })}`),
    ),
    h('dl', { class: 'pl-tl-bal-grid' },
      row(t('time.balance_opening'), unitValue(ctx, unit, b.opening)),
      row(t('time.balance_accrued'), signed(ctx, unit, b.accrued || 0, '+')),
      row(t('time.balance_taken'), signed(ctx, unit, b.taken || 0, '-')),
      row(t('time.balance_adjusted'), signed(ctx, unit, b.adjusted || 0, '+')),
      row(t('time.balance_closing'), unitValue(ctx, unit, b.closing), 'closing'),
    ),
    toggle,
    more,
  );
}

function balanceDetail(ctx, m, b, calApi) {
  const t = ctx.t;
  const explanation = b.explanationKey ? ctx.content.explanation(b.explanationKey) : null;
  const moves = m.movements.filter((mv) => mv.type === b.type);
  const entryOf = (id) => m.entries.find((e) => e.id === id) || null;
  return [
    explanation ? h('div', { class: 'pl-tl-bal-exp' }, h('h4', null, explanation.title), h('p', { class: 'small' }, explanation.body)) : null,
    h('h4', null, t('time.movements_title')),
    moves.length ? h('ul', { class: 'pl-tl-moves' }, moves.map((mv) => {
      const kind = ['taken', 'accrued', 'adjusted'].includes(mv.kind) ? t(`time.movement_${mv.kind}`) : mv.kind;
      const sign = mv.kind === 'taken' ? '-' : '+';
      const entry = mv.timeEntryId ? entryOf(mv.timeEntryId) : null;
      const line = mv.lineId ? ctx.line(mv.lineId) : null;
      return h('li', { dataset: { movementId: mv.id } },
        h('span', { class: 'nowrap' }, ctx.fmt.date(mv.date, 'weekday')),
        h('span', { class: ['pl-chip', mv.kind === 'taken' && 'pl-chip-warn', mv.kind === 'accrued' && 'pl-chip-positive'] }, kind),
        h('span', { class: 'tabular strong nowrap' }, signed(ctx, mv.unit === 'hours' ? 'hours' : 'days', mv.amount || 0, sign)),
        entry && calApi ? h('button', { class: 'pl-btn-link', type: 'button', dataset: { focusKey: `tl-move-${mv.id}` }, on: { click: () => calApi.showDay(entry.date) } }, icon('calendar', { size: 14 }), ctx.lowData() ? t('time.show_in_list') : t('time.show_in_calendar')) : null,
        line ? textWithNode(ctx, 'time.linked_line', 'line', h('button', { class: 'pl-btn-link', type: 'button', dataset: { focusKey: `tl-move-line-${mv.id}` }, on: { click: () => ctx.actions.focusLine(line.id) } }, ctx.content.lineLabel(line))) : null,
      );
    })) : h('p', { class: 'muted small' }, t('time.no_movements')),
  ];
}

// --- upcoming pay dates ---------------------------------------------------------------------------

function upcomingCard(ctx, m) {
  const t = ctx.t;
  if (!m.upcoming.length) return null;
  const hid = uid('tlu');
  const canExport = Boolean(ctx.modules().calendar);
  return h('section', { class: 'pl-card pl-tl-upcoming', aria: { labelledby: hid } },
    h('div', { class: 'pl-tl-upcoming-head' }, icon('calendar', { size: 20 }), h('h2', { id: hid }, t('time.upcoming_pay'))),
    h('p', { class: 'muted small' }, t('time.upcoming_note')),
    h('ul', { class: 'pl-tl-dates' }, m.upcoming.map((d) => h('li', null, h('span', { class: 'strong' }, ctx.fmt.date(d, 'long')), h('span', { class: 'pl-chip pl-chip-info' }, t('time.scheduled'))))),
    canExport ? h('div', { class: 'pl-tl-ics' },
      h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'tl-ics' }, on: { click: () => ctx.actions.exportIcs() } }, icon('download', { size: 16 }), t('time.export_calendar')),
      h('p', { class: 'muted xs' }, t('time.export_calendar_note')),
    ) : null,
  );
}
