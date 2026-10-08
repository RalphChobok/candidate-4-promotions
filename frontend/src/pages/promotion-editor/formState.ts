// Editor state. The form edits the API's PromotionInput directly; the only
// UI-only fields are the "mode" choices for products and venues.

import type { Promotion, PromotionInput, PromotionType, RequiredItem } from '../../types';
import { DAYS } from '../../lib/format';

export type ProductMode = 'all' | 'categories' | 'products';
export type VenueMode = 'all' | 'venues';

export interface FormState {
  input: PromotionInput;
  productMode: ProductMode;
  categories: string[];
  productIds: string[];
  requiredItems: RequiredItem[];
  venueMode: VenueMode;
  venueIds: string[];
}

export type FormErrors = Partial<Record<'name' | 'offer' | 'products' | 'venues' | 'days' | 'times' | 'dates' | 'overrides', string>>;

export function emptyForm(): FormState {
  return {
    input: {
      name: '',
      type: 'PERCENTAGE',
      status: 'INACTIVE',
      percentage: null,
      value_cents: null,
      priority: 10,
      applies_to: { all: true },
      venue_rules: { all: true },
      customer_rule: 'EVERYONE',
      schedule: { days_of_week: [...DAYS], starts_at: '00:00', ends_at: '23:59', start_date: null, end_date: null },
      schedule_overrides: [],
      allow_stacking: false,
      stacks_on: [],
    },
    productMode: 'all',
    categories: [],
    productIds: [],
    requiredItems: [{ product_id: '', quantity: 1 }],
    venueMode: 'all',
    venueIds: [],
  };
}

export function formFromPromotion(p: Promotion): FormState {
  const { id: _id, created_at: _c, updated_at: _u, ...input } = p;
  const base = emptyForm();
  const a = input.applies_to;
  const r = input.venue_rules;
  return {
    input,
    productMode: 'categories' in a ? 'categories' : 'product_ids' in a ? 'products' : 'all',
    categories: 'categories' in a ? a.categories : [],
    productIds: 'product_ids' in a ? a.product_ids : [],
    requiredItems: 'required_items' in a ? a.required_items : base.requiredItems,
    venueMode: 'venue_ids' in r ? 'venues' : 'all',
    venueIds: 'venue_ids' in r ? r.venue_ids : [],
  };
}

const isSetOffer = (type: PromotionType) => type === 'FIXED_PRICE' || type === 'BUNDLE';

/** Assemble the request body the API expects. */
export function toInput(f: FormState): PromotionInput {
  const setOffer = isSetOffer(f.input.type);
  return {
    ...f.input,
    name: f.input.name.trim(),
    percentage: setOffer ? null : f.input.percentage,
    value_cents: setOffer ? f.input.value_cents : null,
    applies_to: setOffer
      ? { required_items: f.requiredItems.filter((i) => i.product_id) }
      : f.productMode === 'categories' ? { categories: f.categories }
        : f.productMode === 'products' ? { product_ids: f.productIds }
          : { all: true },
    venue_rules: f.venueMode === 'venues' ? { venue_ids: f.venueIds } : { all: true },
    stacks_on: f.input.allow_stacking ? f.input.stacks_on : [],
  };
}

/** Quick checks so people get feedback before saving. The API validates again and its message is shown if it disagrees. */
export function validateForm(f: FormState): FormErrors {
  const e: FormErrors = {};
  const i = f.input;
  if (!i.name.trim()) e.name = 'Give the promotion a name staff will recognise.';
  if (i.type === 'PERCENTAGE') {
    if (i.percentage == null || i.percentage <= 0 || i.percentage > 100) e.offer = 'Enter a discount between 1 and 100%.';
    if (f.productMode === 'categories' && !f.categories.length) e.products = 'Choose at least one category.';
    if (f.productMode === 'products' && !f.productIds.length) e.products = 'Choose at least one product.';
  } else {
    if (i.value_cents == null || i.value_cents < 0) e.offer = 'Enter a price.';
    if (!f.requiredItems.some((r) => r.product_id) || f.requiredItems.some((r) => r.product_id && r.quantity < 1)) {
      e.products = 'Add the required items, each with a quantity of at least 1.';
    }
  }
  if (f.venueMode === 'venues' && !f.venueIds.length) e.venues = 'Choose at least one venue.';
  if (!i.schedule.days_of_week.length) e.days = 'Choose at least one day.';
  if (i.schedule.starts_at === i.schedule.ends_at) e.times = 'Start and end times can’t be the same.';
  if (i.schedule.start_date && i.schedule.end_date && i.schedule.end_date < i.schedule.start_date) e.dates = 'The end date must be on or after the start date.';
  if (i.schedule_overrides.some((o) => !o.venue_id || (o.starts_at ?? i.schedule.starts_at) === (o.ends_at ?? i.schedule.ends_at))) {
    e.overrides = 'Each venue-specific time needs a venue and different start and end times.';
  }
  return e;
}
