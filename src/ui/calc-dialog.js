/** PLACEHOLDER calculation disclosure — to be implemented. Contract: export function openCalc(ctx, lineId) */
import { h } from '../app/dom.js';
import { openDialog } from './components/overlay.js';
export function openCalc(ctx, lineId) {
  openDialog({ title: ctx.t('common.calculation'), body: h('p', null, `Calculation disclosure pending for ${lineId}.`) });
}
