// Presentation helpers: turn API objects into the words staff read.
// Nothing in here decides prices; the backend engine does that.

import type { CustomerRule, CustomerType, DisplayStatus, Product, Promotion, PromotionInput, PromotionType, Venue, Weekday } from '../types';

export const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_SHORT: Record<Weekday, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

export const DAY_LONG: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export const TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE: 'Percentage discount',
  FIXED_PRICE: 'Fixed price',
  BUNDLE: 'Bundle',
};

export const CUSTOMER_RULE_LABELS: Record<CustomerRule, string> = {
  EVERYONE: 'Everyone',
  MEMBER: 'Members',
  STAFF: 'Staff',
};

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  REGULAR: 'Regular customer',
  MEMBER: 'Member',
  STAFF: 'Staff',
};

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  inactive: 'Inactive',
};

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Money, dates and times

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const value = (Math.abs(cents) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}$${value}`;
}

export function formatMoneyShort(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString('en-AU')}` : formatMoney(cents);
}

/** "16:00" → "4:00 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "16:00","18:00" → "4:00 PM – 6:00 PM"; the whole day reads as "All day". */
export function formatWindow(startsAt: string, endsAt: string): string {
  if (startsAt === '00:00' && endsAt === '23:59') return 'All day';
  return `${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

/** "17:00-19:00" (the API's overlap window) → "5:00 PM – 7:00 PM" */
export function formatWindowString(window: string): string {
  const [s, e] = window.split('-');
  return e === '24:00' ? `${formatTime(s)} – midnight` : formatWindow(s, e);
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-12-01" → "Tue 01 Dec 2026" */
export function formatDate(iso: string, withWeekday = false): string {
  return parseIsoDate(iso).toLocaleDateString('en-AU', {
    ...(withWeekday ? { weekday: 'short' as const } : {}),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** A timestamp shown as "Tue 13 Oct, 6:42 PM". Order times are venue-local, so they're shown as written. */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Today's date, "YYYY-MM-DD". */
export function todayLocal(): string {
  return toIsoDate(new Date());
}

// ---------------------------------------------------------------------------
// Promotion descriptions

export function displayStatus(p: Pick<Promotion, 'status' | 'schedule'>, today = todayLocal()): DisplayStatus {
  if (p.status !== 'ACTIVE') return 'inactive';
  return p.schedule.start_date && p.schedule.start_date > today ? 'scheduled' : 'active';
}

export function describeDays(days: Weekday[]): string {
  const sorted = DAYS.filter((d) => days.includes(d));
  if (sorted.length === 0) return 'No days';
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 1) return DAY_LONG[sorted[0]];
  const idx = sorted.map((d) => DAYS.indexOf(d));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${DAY_SHORT[sorted[0]]}–${DAY_SHORT[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_SHORT[d]).join(', ');
}

/** "Mon–Fri · 4:00 PM – 6:00 PM", "Every day" */
export function describeSchedule(p: Pick<PromotionInput, 'schedule'>): string {
  const days = describeDays(p.schedule.days_of_week);
  const window = formatWindow(p.schedule.starts_at, p.schedule.ends_at);
  return window === 'All day' ? days : `${days} · ${window}`;
}

export function describeDateRange(p: Pick<PromotionInput, 'schedule'>): string | null {
  const { start_date, end_date } = p.schedule;
  if (start_date && end_date) return `${formatDate(start_date)} – ${formatDate(end_date)}`;
  if (start_date) return `From ${formatDate(start_date)}`;
  if (end_date) return `Until ${formatDate(end_date)}`;
  return null;
}

/** "15% off", "Fixed price · $18", "Bundle · $55" */
export function describeOffer(p: Pick<PromotionInput, 'type' | 'percentage' | 'value_cents'>): string {
  if (p.type === 'PERCENTAGE') return `${p.percentage ?? '—'}% off`;
  const price = p.value_cents == null ? '—' : formatMoneyShort(p.value_cents);
  return p.type === 'FIXED_PRICE' ? `Fixed price · ${price}` : `Bundle · ${price}`;
}

/** "Beverage", "Everything", "2× Parmigiana + 2× Lager — pint" */
export function describeAppliesTo(p: Pick<PromotionInput, 'applies_to'>, products: Product[]): string {
  const a = p.applies_to;
  const name = (id: string) => products.find((x) => x.product_id === id)?.name ?? id;
  if ('all' in a) return 'Everything';
  if ('categories' in a) return a.categories.length ? a.categories.map(capitalise).join(', ') : 'No categories';
  if ('product_ids' in a) return a.product_ids.length ? a.product_ids.map(name).join(', ') : 'No products';
  return a.required_items.length ? a.required_items.map((r) => `${r.quantity}× ${name(r.product_id)}`).join(' + ') : 'No items';
}

/** "All venues", "The Brass Anchor", "3 venues" */
export function describeVenues(p: Pick<PromotionInput, 'venue_rules'>, venues: Venue[]): string {
  const r = p.venue_rules;
  if ('all' in r) return 'All venues';
  if (r.venue_ids.length === 1) return venues.find((v) => v.venue_id === r.venue_ids[0])?.name ?? r.venue_ids[0];
  return `${r.venue_ids.length} venues`;
}

export function venueName(id: string, venues: Venue[]): string {
  return venues.find((v) => v.venue_id === id)?.name ?? id;
}
