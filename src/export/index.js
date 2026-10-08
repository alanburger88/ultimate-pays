/** PLACEHOLDER export entry points — to be implemented in pdf.js / xlsx.js / print.js / ics.js. */
export async function exportPdf(ctx) { ctx.actions.toast('PDF export pending'); }
export async function exportXlsx(ctx, { selectedOnly = false } = {}) { ctx.actions.toast('Excel export pending'); }
export function exportIcs(ctx) { ctx.actions.toast('Calendar export pending'); }
export function buildPrintView(ctx) { return null; }
