/**
 * Money and quantity formatting. Stored values are integers in minor units
 * (cents) and hours in hundredths; formatting never changes stored values.
 */
const MINOR_DIGITS = { CAD: 2, ZAR: 2, EUR: 2 };

export function minorDigits(currency) {
  return MINOR_DIGITS[currency] ?? 2;
}

export function toMajor(amountMinor, currency = 'EUR') {
  const d = minorDigits(currency);
  return amountMinor / 10 ** d;
}

export function fromMajorString(text, currency = 'EUR') {
  const d = minorDigits(currency);
  const clean = String(text).replace(/[^0-9.,-]/g, '').replace(',', '.');
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** d);
}

const fmtCache = new Map();
function numberFormat(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = fmtCache.get(key);
  if (!f) { f = new Intl.NumberFormat(locale, options); fmtCache.set(key, f); }
  return f;
}

/** Format an integer minor-unit amount as currency in the given locale. */
export function formatMoney(amountMinor, { currency, locale, signDisplay = 'auto', compact = false } = {}) {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const digits = minorDigits(currency);
  const f = numberFormat(locale, {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: compact ? 0 : digits, maximumFractionDigits: digits, signDisplay,
  });
  return f.format(amountMinor / 10 ** digits);
}

/** Plain number (no symbol) for table cells where the column states the currency. */
export function formatAmount(amountMinor, { currency, locale, signDisplay = 'auto' } = {}) {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const digits = minorDigits(currency);
  return numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay }).format(amountMinor / 10 ** digits);
}

/** Hours stored as hundredths (8000 = 80.00 h). */
export function formatHours(hoursHundredths, { locale, unit = 'h' } = {}) {
  if (hoursHundredths === null || hoursHundredths === undefined) return '—';
  const n = numberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hoursHundredths / 100);
  return unit ? `${n} ${unit}` : n;
}

export function formatMinutesAsHours(minutes, { locale } = {}) {
  return formatHours(Math.round((minutes / 60) * 100), { locale });
}

export function formatNumber(n, { locale, digits = 0 } = {}) {
  return numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function formatPercent(permyriad, { locale, digits = 2 } = {}) {
  // permyriad: 1/100 of a percent as integer, e.g. 595 => 5.95 %
  return numberFormat(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(permyriad / 10000);
}

export function formatRate(rateMinor, { currency, locale, per }) {
  // Rates may carry more precision than the currency's minor unit (e.g. 22,4171 €/h on a French bulletin).
  const extra = Number.isInteger(rateMinor) ? 0 : 2;
  const digits = minorDigits(currency) + extra;
  const text = extra ? numberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rateMinor / 10 ** minorDigits(currency)) : formatMoney(rateMinor, { currency, locale });
  return `${text}${per ? `/${per}` : ''}`;
}

/** ISO date (YYYY-MM-DD) -> localized date. Dates are treated as calendar dates, never shifted by timezone. */
export function formatDate(iso, { locale, style = 'medium' } = {}) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const options = style === 'long' ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
    : style === 'short' ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : style === 'weekday' ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
    : style === 'month' ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(iso, { locale } = {}) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatPeriod(period, { locale } = {}) {
  return `${formatDate(period.start, { locale })} – ${formatDate(period.end, { locale })}`;
}

export function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Deterministic rounding to integer minor units, half away from zero. */
export function roundHalfUp(value) {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5);
}

/** hours (hundredths) × rate (minor) × multiplier (hundredths) → minor units. */
export function hoursTimesRate(hoursHundredths, rateMinor, multiplier100 = 100) {
  return roundHalfUp((hoursHundredths * rateMinor * multiplier100) / (100 * 100));
}

/** base (minor) × rate (permyriad = 1/10000) → minor units. */
export function baseTimesRate(baseMinor, ratePermyriad) {
  return roundHalfUp((baseMinor * ratePermyriad) / 10000);
}
