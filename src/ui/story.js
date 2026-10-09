/**
 * The personal pay story (PRD §6.2). A short, chaptered explanation of this
 * statement that plays like a video: greeting, money paid, what changed,
 * benefits beyond take-home, and a useful next step.
 *
 * Every figure comes from ctx.doc (the issued record and calc.js results) and
 * is formatted by ctx.fmt through amount()/delta(); captions use interface
 * strings with governed labels from ctx.content. Nothing is computed here.
 *
 * Modes
 *  - timeline  requestAnimationFrame-driven playback with play/pause, replay,
 *              seek, chapter buttons, captions and a transcript. Visuals start
 *              on open; audio never does.
 *  - stepped   reduced motion: no auto-advance, Previous/Next, final values
 *              shown instantly.
 *  - transcript low-data mode: the captions list only.
 *
 * Contract: export function openStory(ctx, { chapter } = {})
 *   chapter: a chapter id ('greeting' | 'money' | 'changes' | 'benefits' | 'next')
 *   or a zero-based index.
 */
import { h, icon, announce, clear } from '../app/dom.js';
import { registerStrings } from '../app/i18n.js';
import { openDialog } from './components/overlay.js';
import { amount, delta, notice } from './components/common.js';

registerStrings({
  'story.controls': 'Story controls',
  'story.chapters': 'Chapters',
  'story.stage_label': 'Story stage. Press Space to play or pause, and the arrow keys to move through the story.',
  'story.stage_label_stepped': 'Story stage. Use the Previous and Next buttons or the arrow keys to move between chapters.',
  'story.ended': 'The story has ended. Choose Replay to watch it again.',
  'story.audio_stop': 'Stop narration',
  'story.audio_speaking': 'Narration is playing',
  'story.narration_voice': 'Narration uses a voice from this device, read on demand only.',
  'story.step_label': 'Step {current} of {total}: {title}',
  'story.net_change_label': 'Change in {total}',
  'story.prior_pay': 'Last pay',
  'story.this_pay': 'This pay',
  'story.employer_total': 'Employer contributions this period',
  'story.first_statement': 'First statement included',
  'story.transcript_intro': 'Every caption from the story, in order.',
  'story.no_leave': 'No leave balance is recorded on this statement.',
});

/* Chapter durations in seconds (restrained: 5–7 s each). */
const DURATIONS = { greeting: 5, money: 7, changes: 6, benefits: 5, next: 5 };
const CHAPTER_IDS = ['greeting', 'money', 'changes', 'benefits', 'next'];

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function easeOut(x) { return 1 - Math.pow(1 - clamp01(x), 3); }
/** Progress of a sub-phase [a, b] of a chapter's local progress p. Reaches exactly 1 at p >= b. */
function phase(p, a, b) { return easeOut((p - a) / (b - a)); }

/**
 * Interface sentence with embedded money. Params whose value is { minor } (or
 * { minor, delta: true }) become amount()/delta() elements so presentation
 * privacy still applies; everything else is plain text.
 */
function sentence(ctx, key, params = {}, tag = 'span') {
  const sentinel = '\u0000';
  const text = {};
  const slots = [];
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === 'object' && 'minor' in v) { text[k] = `${sentinel}${slots.length}${sentinel}`; slots.push(v); } else text[k] = v;
  }
  const el = h(tag, null);
  const parts = ctx.t(key, text).split(sentinel);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { const slot = slots[Number(parts[i])]; el.appendChild(slot.delta ? delta(ctx, slot.minor) : amount(ctx, slot.minor)); }
    else if (parts[i]) el.appendChild(document.createTextNode(parts[i]));
  }
  return el;
}

/** Plain-text version of the same sentence (for speech and aria text). */
function sentenceText(ctx, key, params = {}) {
  const text = {};
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === 'object' && 'minor' in v) text[k] = ctx.fmt.money(v.minor, { signDisplay: v.delta ? 'exceptZero' : 'auto' });
    else text[k] = v;
  }
  return ctx.t(key, text);
}

/**
 * Build the chapters from the document. Each chapter: { id, title, section,
 * lineId, captions: [{ key, params }], scene(ctx) -> { el, update(p) } }.
 */
export function buildChapters(ctx) {
  const { record, profile, computed } = ctx.doc;
  const totals = computed.totals || {};
  const rewardDef = profile.reward || {};
  const grossId = rewardDef.grossTotal || 'gross';
  const dedId = rewardDef.deductionsTotal || 'employeeDeductions';
  const netId = profile.primaryTotal || 'net';
  const payableId = profile.payableTotal || 'payable';
  // Figures come from the exact gross-to-net flow, so the caption's arithmetic always holds.
  const flow = computed.flow || { gross: totals[grossId] || 0, deductionsTotal: totals[dedId] || 0, additionsTotal: 0, net: totals[netId] || 0 };
  const gross = flow.gross;
  const deductions = flow.deductionsTotal;
  const additions = flow.additionsTotal || 0;
  const net = flow.net;
  const deductionsLabel = totals[dedId] === deductions ? ctx.content.total(dedId) : ctx.t('mypay.deductions');
  const payable = totals[payableId];
  const period = ctx.fmt.period(record.document.period);
  const chapters = [];

  // 1 — greeting
  chapters.push({
    id: 'greeting',
    title: ctx.t('story.chapter_greeting', { period }),
    section: 'my-pay', lineId: null,
    captions: [{ key: 'story.cap_greeting', params: { name: record.employee.displayName, period, date: ctx.fmt.date(record.document.payDate, 'long') } }],
    scene() {
      const name = h('div', { class: 'big pl-story-reveal' }, record.employee.displayName);
      const sub = h('div', { class: 'lbl pl-story-reveal' }, `${period} · ${ctx.fmt.date(record.document.payDate, 'long')}`);
      const el = h('div', { class: 'pl-story-scene-inner' }, h('div', { class: 'lbl' }, ctx.content.document('title')), name, sub);
      return { el, update(p) { name.style.opacity = String(phase(p, 0.05, 0.4)); sub.style.opacity = String(phase(p, 0.3, 0.7)); } };
    },
  });

  // 2 — money paid
  const moneyCaptions = [additions
    ? { key: 'story.cap_money_additions', params: { gross: { minor: gross }, deductions: { minor: deductions }, additions: { minor: additions }, net: { minor: net } } }
    : { key: 'story.cap_money', params: { gross: { minor: gross }, deductions: { minor: deductions }, net: { minor: net } } }];
  if (payable !== undefined && payable !== net) moneyCaptions.push({ key: 'story.cap_paid', params: { payable: { minor: payable } } });
  chapters.push({
    id: 'money',
    title: ctx.t('story.chapter_money'),
    section: 'pay-details', lineId: null,
    captions: moneyCaptions,
    scene() {
      const max = Math.max(Math.abs(gross), Math.abs(deductions), Math.abs(additions), Math.abs(net), 1);
      const bars = [
        { label: ctx.content.total(grossId), target: gross, cls: 'is-gross', window: [0.05, 0.3] },
        { label: deductionsLabel, target: deductions, cls: 'is-deductions', window: [0.3, 0.55] },
        additions ? { label: ctx.t('story.other_items'), target: additions, cls: 'is-additions', window: [0.45, 0.65] } : null,
        { label: ctx.content.total(netId), target: net, cls: 'is-net', window: [0.62, 0.9] },
      ].filter(Boolean).map((b) => {
        const bar = h('div', { class: ['b', b.cls] });
        const val = amount(ctx, b.target);
        const col = h('div', { class: 'pl-story-bar' }, h('div', { class: 'pl-story-bar-track' }, bar), val, h('span', { class: 'lbl' }, b.label));
        return { ...b, bar, val, col };
      });
      const el = h('div', { class: 'pl-story-scene-inner' },
        h('div', { class: 'lbl' }, ctx.t('story.chapter_money')),
        h('div', { class: 'pl-story-bars', role: 'img', aria: { label: sentenceText(ctx, moneyCaptions[0].key, moneyCaptions[0].params) } }, bars.map((b) => b.col)),
        payable !== undefined && payable !== net ? h('div', { class: 'pl-story-sub' }, sentence(ctx, 'story.cap_paid', { payable: { minor: payable } })) : null,
      );
      return {
        el,
        update(p) {
          for (const b of bars) {
            const k = phase(p, b.window[0], b.window[1]);
            const shown = k >= 1 ? b.target : Math.round(b.target * k);
            b.bar.style.height = `${(Math.abs(shown) / max) * 100}%`;
            b.val.textContent = ctx.fmt.money(shown);
            b.col.classList.toggle('is-done', k >= 1);
          }
        },
      };
    },
  });

  // 3 — what changed
  const bridge = computed.bridge || null;
  const changeCaptions = [];
  let driver = null;
  if (!bridge) changeCaptions.push({ key: 'story.cap_changes_no_history', params: {} });
  else {
    if (bridge.change > 0) changeCaptions.push({ key: 'story.cap_changes_up', params: { amount: { minor: Math.abs(bridge.change) } } });
    else if (bridge.change < 0) changeCaptions.push({ key: 'story.cap_changes_down', params: { amount: { minor: Math.abs(bridge.change) } } });
    else changeCaptions.push({ key: 'story.cap_changes_none', params: {} });
    driver = bridge.steps[0] || null;
    if (driver) {
      const line = ctx.line(driver.lineId) || { key: driver.key };
      changeCaptions.push({ key: 'story.cap_changes_driver', params: { line: ctx.content.lineLabel(line), effect: { minor: driver.effect, delta: true } } });
    }
  }
  chapters.push({
    id: 'changes',
    title: ctx.t('story.chapter_changes'),
    section: 'what-changed', lineId: driver ? driver.lineId : null,
    captions: changeCaptions,
    scene() {
      if (!bridge) {
        const el = h('div', { class: 'pl-story-scene-inner' }, h('div', { class: 'lbl' }, ctx.t('story.chapter_changes')), h('div', { class: 'big' }, ctx.t('story.first_statement')), h('div', { class: 'pl-story-sub' }, ctx.t('story.cap_changes_no_history')));
        return { el, update() { /* static */ } };
      }
      const max = Math.max(Math.abs(bridge.from), Math.abs(bridge.to), 1);
      const fromBar = h('div', { class: 'b is-prior' });
      const toBar = h('div', { class: 'b is-net' });
      const fromVal = amount(ctx, bridge.from);
      const toVal = amount(ctx, bridge.to);
      const change = delta(ctx, bridge.change, { cls: 'big' });
      const driverEl = driver ? h('div', { class: 'pl-story-sub pl-story-reveal' }, sentence(ctx, 'story.cap_changes_driver', changeCaptions[1].params)) : null;
      const el = h('div', { class: 'pl-story-scene-inner' },
        h('div', { class: 'lbl' }, ctx.t('story.net_change_label', { total: ctx.content.total(bridge.totalId) })),
        h('div', { class: 'pl-story-bars pl-story-bars-compare', role: 'img', aria: { label: sentenceText(ctx, changeCaptions[0].key, changeCaptions[0].params) } },
          h('div', { class: 'pl-story-bar' }, h('div', { class: 'pl-story-bar-track' }, fromBar), fromVal, h('span', { class: 'lbl' }, `${ctx.t('story.prior_pay')} · ${ctx.fmt.period(bridge.periodFrom)}`)),
          h('div', { class: 'pl-story-bar' }, h('div', { class: 'pl-story-bar-track' }, toBar), toVal, h('span', { class: 'lbl' }, `${ctx.t('story.this_pay')} · ${ctx.fmt.period(bridge.periodTo)}`)),
        ),
        change, driverEl,
      );
      return {
        el,
        update(p) {
          fromBar.style.height = `${(Math.abs(bridge.from) / max) * 100}%`;
          const k = phase(p, 0.1, 0.5);
          const shown = k >= 1 ? bridge.to : bridge.from + Math.round((bridge.to - bridge.from) * k);
          toBar.style.height = `${(Math.abs(shown) / max) * 100}%`;
          toVal.textContent = ctx.fmt.money(shown);
          const kc = phase(p, 0.3, 0.6);
          const shownChange = kc >= 1 ? bridge.change : Math.round(bridge.change * kc);
          change.textContent = ctx.fmt.money(shownChange, { signDisplay: 'exceptZero' });
          change.style.opacity = String(phase(p, 0.3, 0.45));
          if (driverEl) driverEl.style.opacity = String(phase(p, 0.55, 0.8));
        },
      };
    },
  });

  // 4 — beyond take-home
  const reward = computed.reward || { employer: 0 };
  const employer = reward.employer || 0;
  // Only items whose lines are part of the headline employer figure (employer-category lines) are listed under it.
  const benefitItems = (record.benefits || [])
    .map((b) => ({ b, lineId: (b.lineIds || []).find((id) => { const l = ctx.line(id); return l && l.category === 'employer' && !(l.flags || []).includes('exclude_from_reward'); }) || null }))
    .filter((x) => x.lineId && (x.b.employerAmountMinor || 0) > 0)
    .map((x) => ({ label: ctx.content.benefit(x.b.key).label, minor: ctx.line(x.lineId).amountMinor, lineId: x.lineId }));
  const employerLines = record.lines.filter((l) => l.category === 'employer' && !(l.flags || []).includes('exclude_from_reward'));
  const items = (benefitItems.length ? benefitItems : employerLines.map((l) => ({ label: ctx.content.lineLabel(l), minor: l.amountMinor, lineId: l.id })))
    .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor)).slice(0, 3);
  chapters.push({
    id: 'benefits',
    title: ctx.t('story.chapter_benefits'),
    section: 'total-reward', lineId: items[0] ? items[0].lineId : null,
    captions: [employer > 0 ? { key: 'story.cap_benefits', params: { employer: { minor: employer } } } : { key: 'story.cap_benefits_none', params: {} }],
    scene() {
      const big = amount(ctx, employer, { cls: 'big' });
      const list = h('ul', { class: 'pl-story-list' }, items.map((it) => h('li', { class: 'pl-story-reveal' }, h('span', null, it.label), amount(ctx, it.minor))));
      const el = h('div', { class: 'pl-story-scene-inner' },
        h('div', { class: 'lbl' }, ctx.t('story.employer_total')),
        employer > 0 ? big : h('div', { class: 'pl-story-sub' }, ctx.t('story.cap_benefits_none')),
        items.length ? list : null,
      );
      const lis = Array.from(list.children);
      return {
        el,
        update(p) {
          const k = phase(p, 0.05, 0.45);
          const shown = k >= 1 ? employer : Math.round(employer * k);
          big.textContent = ctx.fmt.money(shown);
          lis.forEach((li, i) => { li.style.opacity = String(phase(p, 0.35 + i * 0.15, 0.5 + i * 0.15)); });
        },
      };
    },
  });

  // 5 — what next
  const leave = record.time && record.time.leave && record.time.leave.balances && record.time.leave.balances[0];
  const leaveText = leave ? (leave.unit === 'hours' ? ctx.fmt.hours(leave.closing) : ctx.fmt.days(leave.closing)) : null;
  const nextCaptions = [{ key: 'story.cap_next', params: {} }];
  if (leave) nextCaptions.push({ key: 'story.cap_next_leave', params: { type: ctx.content.leaveType(leave.type).label, balance: leaveText } });
  chapters.push({
    id: 'next',
    title: ctx.t('story.chapter_next'),
    section: 'record-actions', lineId: null,
    captions: nextCaptions,
    scene() {
      const balance = leave ? h('div', { class: 'big pl-story-reveal tabular' }, leaveText) : null;
      const nextText = h('div', { class: 'pl-story-sub pl-story-reveal' }, ctx.t('story.cap_next'));
      const el = h('div', { class: 'pl-story-scene-inner' },
        h('div', { class: 'lbl' }, leave ? ctx.content.leaveType(leave.type).label : ctx.t('story.chapter_next')),
        balance || h('div', { class: 'pl-story-sub' }, ctx.t('story.no_leave')),
        nextText,
      );
      return { el, update(p) { if (balance) balance.style.opacity = String(phase(p, 0.05, 0.4)); nextText.style.opacity = String(phase(p, 0.3, 0.7)); } };
    },
  });

  let offset = 0;
  for (const c of chapters) { c.duration = DURATIONS[c.id] || 5; c.start = offset; offset += c.duration; }
  return { chapters, total: offset };
}

function captionNodes(ctx, chapter) { return chapter.captions.map((c) => sentence(ctx, c.key, c.params, 'p')); }
function captionText(ctx, chapter) { return chapter.captions.map((c) => sentenceText(ctx, c.key, c.params)).join(' '); }

export function openStory(ctx, { chapter = null } = {}) {
  const { chapters, total } = buildChapters(ctx);
  const lowData = ctx.lowData();
  const stepped = !lowData && ctx.reducedMotion();
  const mode = lowData ? 'transcript' : stepped ? 'stepped' : 'timeline';
  const startIndex = typeof chapter === 'number' ? Math.max(0, Math.min(chapters.length - 1, chapter)) : Math.max(0, chapters.findIndex((c) => c.id === chapter));

  let dlg = null;
  let raf = null;
  let last = null;
  let utterance = null;
  const state = { t: chapters[startIndex].start, playing: false, index: startIndex };
  const cleanups = [];

  const goToSource = (c) => {
    if (dlg) dlg.close('navigate');
    ctx.actions.go(c.section, { lineId: c.lineId, push: true });
  };
  const sourceButton = (c) => h('button', { class: 'pl-btn pl-btn-sm', type: 'button', on: { click: () => goToSource(c) } }, icon('forward', { size: 16 }), ctx.t('story.go_to_source'));

  // ---- transcript (all modes) ----
  const transcriptList = h('ol', { class: 'pl-story-transcript-list' }, chapters.map((c, i) => h('li', null,
    h('h4', null, h('span', { class: 'pl-story-num', aria: { hidden: 'true' } }, String(i + 1)), h('span', { class: 'sr-only' }, `${ctx.t('story.chapter', { index: i + 1, title: '' })} `), c.title),
    captionNodes(ctx, c),
    sourceButton(c),
  )));
  const transcript = h('section', { class: 'pl-story-transcript', id: 'pl-story-transcript', aria: { labelledby: 'pl-story-transcript-h' } },
    h('h3', { id: 'pl-story-transcript-h' }, ctx.t('story.transcript')),
    h('p', { class: 'muted small' }, ctx.t('story.transcript_intro')),
    transcriptList,
  );
  const valuesNote = h('p', { class: 'pl-story-note muted small', id: 'pl-story-values' }, icon('shield', { size: 14 }), ctx.t('story.values_note'));

  if (mode === 'transcript') {
    const root = h('div', { class: 'pl-story pl-story-text', dataset: { mode } }, notice(ctx, ctx.t('story.low_data'), { kind: 'neutral' }), transcript, valuesNote);
    dlg = openDialog({ title: ctx.t('story.title'), size: 'lg', closeLabel: ctx.t('story.close'), className: 'pl-story-dialog', body: root, describedBy: 'pl-story-values',
      onClose: () => { ctx.store.update('story', (s) => ({ ...s, open: false })); } });
    ctx.store.update('story', (s) => ({ ...s, open: true }));
    return dlg;
  }

  // ---- stage ----
  const scenes = chapters.map((c) => { const s = c.scene(); const el = h('div', { class: 'pl-story-scene', dataset: { chapter: c.id } }, s.el, sourceButton(c)); return { ...s, root: el }; });
  const stage = h('div', { class: 'pl-story-stage', tabindex: '0', role: 'group', aria: { label: ctx.t(stepped ? 'story.stage_label_stepped' : 'story.stage_label'), describedby: 'pl-story-values' } }, scenes.map((s) => s.root));
  const captionBar = h('div', { class: 'pl-story-caption', aria: { live: 'polite', atomic: 'true' } });

  // ---- controls ----
  const playBtn = h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => togglePlay() } });
  const replayBtn = h('button', { class: 'pl-btn', type: 'button', on: { click: () => replay() } }, icon('replay', { size: 16 }), ctx.t('story.replay'));
  const prevBtn = h('button', { class: 'pl-btn', type: 'button', on: { click: () => step(-1) } }, icon('back', { size: 16 }), ctx.t('common.previous'));
  const nextBtn = h('button', { class: 'pl-btn', type: 'button', on: { click: () => step(1) } }, ctx.t('common.next'), icon('forward', { size: 16 }));
  const seek = h('input', { type: 'range', min: '0', max: String(total), step: '0.1', value: String(state.t), aria: { label: ctx.t('story.seek') }, class: 'pl-story-seek' });
  let seeking = false;
  seek.addEventListener('pointerdown', () => { seeking = true; });
  const endSeek = () => { seeking = false; };
  seek.addEventListener('pointerup', endSeek); seek.addEventListener('pointercancel', endSeek); seek.addEventListener('blur', endSeek);
  seek.addEventListener('input', () => { seekTo(Number(seek.value)); });
  const progress = h('span', { class: 'pl-story-progress tabular', role: 'status' });
  const chapterButtons = chapters.map((c, i) => h('button', { type: 'button', aria: { label: ctx.t('story.chapter', { index: i + 1, title: c.title }), current: 'false' }, dataset: { index: i }, on: { click: () => jumpTo(i) } }, h('span', { class: 'pl-story-num', aria: { hidden: 'true' } }, String(i + 1)), h('span', { class: 'pl-story-chapter-title' }, c.title)));
  const chapterNav = h('div', { class: 'pl-story-chapters', role: 'group', aria: { label: ctx.t('story.chapters') } }, chapterButtons);

  let captionsOn = true;
  const captionsBtn = h('button', { class: 'pl-btn', type: 'button', aria: { pressed: 'true' }, on: { click: () => { captionsOn = !captionsOn; captionsBtn.setAttribute('aria-pressed', String(captionsOn)); captionBar.hidden = !captionsOn; if (captionsOn) renderCaption(true); } } }, icon('caption', { size: 16 }), ctx.t('story.captions'));
  let transcriptOpen = false;
  transcript.hidden = true;
  const transcriptBtn = h('button', { class: 'pl-btn', type: 'button', aria: { expanded: 'false', controls: 'pl-story-transcript' }, on: { click: () => { transcriptOpen = !transcriptOpen; transcript.hidden = !transcriptOpen; transcriptBtn.setAttribute('aria-expanded', String(transcriptOpen)); transcriptBtn.lastChild.textContent = ctx.t(transcriptOpen ? 'story.transcript_hide' : 'story.transcript_show'); if (transcriptOpen) transcript.scrollIntoView({ block: 'nearest', behavior: stepped ? 'auto' : 'smooth' }); } } }, icon('text', { size: 16 }), h('span', null, ctx.t('story.transcript_show')));

  // Narration: bundled audio for this language (never autoplayed) or a truthful unavailable state.
  const audioSrc = (() => { const a = ctx.doc.record.story && ctx.doc.record.story.audio && ctx.doc.record.story.audio[ctx.locale]; if (!a) return null; return typeof a === 'string' ? a : (a.src || a.url || null); })();
  const narration = h('div', { class: 'pl-story-narration' });
  if (audioSrc) {
    const audio = h('audio', { controls: true, preload: 'none', src: audioSrc, aria: { label: ctx.t('story.audio') } });
    narration.append(h('span', { class: 'lbl' }, icon('volume', { size: 16 }), ctx.t('story.audio')), audio);
    cleanups.push(() => { try { audio.pause(); } catch (e) { /* ignore */ } });
  } else {
    narration.append(h('p', { class: 'muted small pl-story-audio-none' }, icon('volume', { size: 14 }), ctx.t('story.audio_unavailable')));
  }
  // Device voice, only when the preference asks for audio and a matching voice exists; always on demand.
  const speechHost = h('div', { class: 'pl-story-speech' });
  narration.appendChild(speechHost);
  const wantsSpeech = (ctx.store.get().prefs.presentation || {}).narration === 'audio-when-available' && typeof window !== 'undefined' && window.speechSynthesis;
  const langPrefix = String(ctx.locale).toLowerCase().split('-')[0];
  function matchingVoice() { try { return window.speechSynthesis.getVoices().find((v) => String(v.lang || '').toLowerCase().startsWith(langPrefix)) || null; } catch (e) { return null; } }
  let speakBtn = null;
  function stopSpeech() { if (utterance) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } utterance = null; } if (speakBtn) { speakBtn.lastChild.textContent = ctx.t('story.audio_play'); } }
  function speakCurrent() {
    const voice = matchingVoice();
    if (!voice) return;
    stopSpeech();
    const u = new SpeechSynthesisUtterance(captionText(ctx, chapters[state.index]));
    u.lang = ctx.locale; u.voice = voice;
    u.onend = () => { if (utterance === u) { utterance = null; speakBtn.lastChild.textContent = ctx.t('story.audio_play'); } };
    u.onerror = u.onend;
    utterance = u;
    speakBtn.lastChild.textContent = ctx.t('story.audio_stop');
    window.speechSynthesis.speak(u);
  }
  function refreshSpeech() {
    if (!wantsSpeech || speakBtn) return;
    if (!matchingVoice()) return;
    speakBtn = h('button', { class: 'pl-btn', type: 'button', on: { click: () => { if (utterance) stopSpeech(); else speakCurrent(); } } }, icon('volume', { size: 16 }), h('span', null, ctx.t('story.audio_play')));
    speechHost.append(speakBtn, h('span', { class: 'muted xs' }, ctx.t('story.narration_voice')));
  }
  if (wantsSpeech) {
    refreshSpeech();
    const onVoices = () => refreshSpeech();
    try { window.speechSynthesis.addEventListener('voiceschanged', onVoices); cleanups.push(() => window.speechSynthesis.removeEventListener('voiceschanged', onVoices)); } catch (e) { /* ignore */ }
    cleanups.push(stopSpeech);
  }

  const controls = h('div', { class: 'pl-story-controls', role: 'group', aria: { label: ctx.t('story.controls') } },
    h('div', { class: 'pl-story-row' },
      stepped ? [prevBtn, nextBtn] : [playBtn, seek],
      replayBtn, progress),
    chapterNav,
    h('div', { class: 'pl-story-row pl-story-row-options' }, captionsBtn, transcriptBtn),
    narration,
  );

  const root = h('div', { class: 'pl-story', dataset: { mode }, on: { keydown: onKey } },
    stepped ? notice(ctx, ctx.t('story.reduced_motion'), { kind: 'neutral' }) : null,
    stage, captionBar, valuesNote, controls, transcript,
  );

  // ---- engine ----
  function chapterAt(t) {
    for (let i = chapters.length - 1; i >= 0; i--) if (t >= chapters[i].start) return i;
    return 0;
  }
  function localProgress(i, t) { const c = chapters[i]; return clamp01((t - c.start) / c.duration); }

  let lastCaptionIndex = -1;
  function renderCaption(force = false) {
    if (!captionsOn) return;
    if (!force && lastCaptionIndex === state.index) return;
    lastCaptionIndex = state.index;
    clear(captionBar);
    captionBar.append(...captionNodes(ctx, chapters[state.index]));
  }

  function render() {
    const i = stepped ? state.index : chapterAt(state.t);
    const changed = i !== state.index || render.first !== true;
    state.index = i;
    render.first = true;
    scenes.forEach((s, k) => {
      const active = k === i;
      s.root.classList.toggle('is-active', active);
      s.root.setAttribute('aria-hidden', String(!active));
      s.root.inert = !active;
      if (stepped) s.update(1);
      else if (active) s.update(localProgress(k, state.t));
      else s.update(k < i ? 1 : 0);
    });
    if (changed || stepped) {
      chapterButtons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
      progress.textContent = ctx.t(stepped ? 'story.step_label' : 'story.progress', { current: i + 1, total: chapters.length, title: chapters[i].title });
      if (stepped) { prevBtn.disabled = i === 0; nextBtn.disabled = i === chapters.length - 1; }
      if (utterance && changed) stopSpeech();
    }
    if (!stepped) {
      if (!seeking) seek.value = String(state.t);
      seek.setAttribute('aria-valuetext', `${chapters[i].title}, ${ctx.t('story.progress', { current: i + 1, total: chapters.length })}`);
      clear(playBtn);
      playBtn.append(icon(state.playing ? 'pause' : 'play', { size: 16 }), ctx.t(state.playing ? 'story.pause' : 'story.play'));
      root.dataset.playing = String(state.playing);
    }
    renderCaption();
  }

  function tick(now) {
    raf = null;
    if (!state.playing) return;
    if (last !== null) {
      const dt = Math.min(0.1, (now - last) / 1000);
      state.t = Math.min(total, state.t + dt);
    }
    last = now;
    if (state.t >= total) { state.t = total; state.playing = false; last = null; render(); announce(ctx.t('story.ended')); return; }
    render();
    raf = requestAnimationFrame(tick);
  }
  function play() { if (state.t >= total) state.t = 0; state.playing = true; last = null; if (raf === null) raf = requestAnimationFrame(tick); render(); }
  function pause() { state.playing = false; last = null; if (raf !== null) { cancelAnimationFrame(raf); raf = null; } render(); }
  function togglePlay() { if (state.playing) pause(); else play(); }
  function seekTo(t) { state.t = Math.max(0, Math.min(total, t)); last = null; render(); }
  function jumpTo(i) { if (stepped) { state.index = i; render(); } else seekTo(chapters[i].start); }
  function step(dir) { const i = Math.max(0, Math.min(chapters.length - 1, state.index + dir)); jumpTo(i); }
  function replay() { if (stepped) { state.index = 0; render(); } else { state.t = 0; play(); } }

  function onKey(e) {
    const target = e.target;
    const onStage = target === stage;
    const onSeek = target === seek;
    const onGroup = target === controls || target === chapterNav;
    if (e.key === ' ' && !stepped && (onStage || onSeek || onGroup)) { e.preventDefault(); togglePlay(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') && (onStage || onSeek)) {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1;
      if (stepped) step(dir); else seekTo(state.t + dir);
      return;
    }
    if (e.key === 'Home' && (onStage || onSeek)) { e.preventDefault(); jumpTo(0); }
    if (e.key === 'End' && (onStage || onSeek)) { e.preventDefault(); if (stepped) jumpTo(chapters.length - 1); else seekTo(total); }
  }

  dlg = openDialog({
    title: ctx.t('story.title'), size: 'lg', closeLabel: ctx.t('story.close'), className: 'pl-story-dialog', body: root, describedBy: 'pl-story-values', initialFocus: stage,
    onClose: () => {
      state.playing = false;
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      for (const fn of cleanups) { try { fn(); } catch (e) { /* ignore */ } }
      ctx.store.update('story', (s) => ({ ...s, open: false }));
    },
  });
  ctx.store.update('story', (s) => ({ ...s, open: true }));

  render();
  // Visuals start on open unless motion is reduced; narration never starts by itself.
  if (!stepped) play();
  return dlg;
}
