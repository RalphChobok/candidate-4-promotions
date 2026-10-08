// API types. These mirror the backend's response shapes (snake_case, integer
// cents) so no translation layer is needed. Source of truth: backend/src/types.

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Venue {
  venue_id: string;
  name: string;
  state: string;
  /** Always null in the supplied data. */
  timezone: string | null;
  trading_hours: Partial<Record<Weekday, [string, string]>>;
}

export interface Product {
  product_id: string;
  name: string;
  category: string;
  price_cents: number;
}

export interface Member {
  member_number: string;
  name: string;
  tier: string;
  active: boolean;
}

export interface Staff {
  staff_id: string;
  name: string;
  role: string;
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Promotions

export type PromotionType = 'PERCENTAGE' | 'FIXED_PRICE' | 'BUNDLE';
export type PromotionStatus = 'ACTIVE' | 'INACTIVE';
export type CustomerRule = 'EVERYONE' | 'MEMBER' | 'STAFF';
export type CustomerType = 'REGULAR' | 'MEMBER' | 'STAFF';

export interface RequiredItem {
  product_id: string;
  quantity: number;
}

export type AppliesTo =
  | { product_ids: string[] }
  | { categories: string[] }
  | { all: true }
  | { required_items: RequiredItem[] };

export type VenueRules = { venue_ids: string[] } | { all: true };

export interface Schedule {
  days_of_week: Weekday[];
  starts_at: string;
  ends_at: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ScheduleOverride {
  venue_id: string;
  days_of_week?: Weekday[];
  starts_at?: string;
  ends_at?: string;
}

export interface PromotionInput {
  name: string;
  type: PromotionType;
  status: PromotionStatus;
  value_cents?: number | null;
  percentage?: number | null;
  priority: number;
  applies_to: AppliesTo;
  venue_rules: VenueRules;
  customer_rule: CustomerRule;
  schedule: Schedule;
  schedule_overrides: ScheduleOverride[];
  allow_stacking: boolean;
  stacks_on: string[];
}

export interface Promotion extends PromotionInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionConflict {
  promotion_id: string;
  name: string;
  venue_ids: string[];
  days_of_week: Weekday[];
  window: string;
}

export interface PromotionListItem extends Promotion {
  conflicts: PromotionConflict[];
}

/** Display status derived from status + start date. */
export type DisplayStatus = 'active' | 'scheduled' | 'inactive';

// ---------------------------------------------------------------------------
// Pricing and orders

export interface OrderItem {
  product_id: string;
  quantity: number;
}

export interface PricingRequest {
  venue_id: string;
  timestamp: string;
  member_number?: string;
  staff_id?: string;
  items: OrderItem[];
}

export interface PricedLine {
  product_id: string;
  product_name: string;
  quantity: number;
  original_cents: number;
  final_cents: number;
  saving_cents: number;
  applied_promotion_id: string | null;
  applied_promotion_name: string | null;
  part_of_bundle: boolean;
}

export interface AppliedPromotion {
  promotion_id: string;
  name: string;
  type: PromotionType;
  saving_cents: number;
}

export interface ConsideredPromotion {
  promotion_id: string;
  name: string;
  eligible: boolean;
  reason: string;
  would_save_cents: number;
}

export interface OverrideRecord {
  id: string;
  order_id: string;
  staff_id: string;
  staff_name: string;
  venue_id: string;
  venue_name: string;
  original_total_cents: number;
  new_total_cents: number;
  difference_cents: number;
  reason: string;
  timestamp: string;
  seeded: boolean;
}

export interface PricedOrder {
  trading_date: string;
  local_time: string;
  venue_id: string;
  venue_name: string;
  customer_type: CustomerType;
  original_total_cents: number;
  final_total_cents: number;
  total_saving_cents: number;
  lines: PricedLine[];
  applied_promotions: AppliedPromotion[];
  considered_promotions: ConsideredPromotion[];
  reason: string;
  override: OverrideRecord | null;
}

export interface Order extends PricedOrder {
  order_id: string;
  timestamp: string;
  member_number: string | null;
  staff_id: string | null;
  items: OrderItem[];
  created_at: string;
  seeded: boolean;
}

export interface OverrideRequest {
  staff_id: string;
  new_total_cents: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Reports

export interface PromotionReport {
  total_orders: number;
  orders_with_promotion: number;
  total_discount_cents: number;
  promotions: { promotion_id: string; name: string; uses: number; discount_cents: number }[];
}

export interface OverrideReport {
  count: number;
  total_difference_cents: number;
  records: OverrideRecord[];
}
