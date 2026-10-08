import type { ReactNode } from 'react';
import { CircleCheck, Eye, TriangleAlert } from 'lucide-react';
import type { DisplayStatus, PromotionConflict, PromotionInput } from '../../types';
import { useReferenceData } from '../../context/ReferenceData';
import {
  CUSTOMER_RULE_LABELS,
  DAY_LONG,
  describeAppliesTo,
  describeDateRange,
  describeDays,
  describeVenues,
  formatMoneyShort,
  formatWindow,
  formatWindowString,
  venueName,
} from '../../lib/format';
import { Card, Spinner, StatusBadge } from '../../components/ui';

export function offerHeadline(input: PromotionInput): string {
  if (input.type === 'PERCENTAGE') return `${input.percentage ?? '—'}% off`;
  const price = input.value_cents == null ? '$—' : formatMoneyShort(input.value_cents);
  return input.type === 'FIXED_PRICE' ? `${price} fixed price` : `${price} bundle`;
}

export function scheduleLines(input: PromotionInput, venueLabel: (id: string) => string): string[] {
  const s = input.schedule;
  const days = s.days_of_week.length === 1 ? `Every ${DAY_LONG[s.days_of_week[0]]}` : describeDays(s.days_of_week);
  const window = formatWindow(s.starts_at, s.ends_at);
  const base = window === 'All day' ? days : `${days} · ${window}`;
  if (!input.schedule_overrides.length) return [base];
  return [
    `${base} (other venues)`,
    ...input.schedule_overrides.map((o) => `${venueLabel(o.venue_id)}: ${formatWindow(o.starts_at ?? s.starts_at, o.ends_at ?? s.ends_at)}`),
  ];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function PromotionPreview({ input, status, conflicts, overlapState }: {
  input: PromotionInput;
  status: DisplayStatus;
  conflicts: PromotionConflict[];
  overlapState: 'idle' | 'checking' | 'done' | 'incomplete';
}) {
  const { venues, products } = useReferenceData();
  const dates = describeDateRange(input);

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
        <Eye className="h-4 w-4 text-slate-400" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Promotion preview</h2>
      </div>
      <div className="px-5 py-4">
        <p className={input.name.trim() ? 'text-lg font-semibold text-slate-900' : 'text-lg font-medium italic text-slate-400'}>
          {input.name.trim() || 'Untitled promotion'}
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-700">{offerHeadline(input)}</p>
        <p className="mt-0.5 text-sm text-slate-600">{describeAppliesTo(input, products)}</p>

        <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
          <Row label="Customers">{CUSTOMER_RULE_LABELS[input.customer_rule]}</Row>
          <Row label="Venues">{describeVenues(input, venues)}</Row>
          <Row label="Schedule">
            {scheduleLines(input, (id) => venueName(id, venues)).map((line) => <span key={line} className="block">{line}</span>)}
          </Row>
          {dates && <Row label="Dates">{dates}</Row>}
          <Row label="Stacking">{input.allow_stacking ? `On top of ${input.stacks_on.length} promotion${input.stacks_on.length === 1 ? '' : 's'}` : 'Disabled'}</Row>
          <Row label="Priority">{input.priority}</Row>
          <Row label="Status"><StatusBadge status={status} /></Row>
        </dl>

        <div className="mt-4 border-t border-slate-100 pt-4" aria-live="polite">
          {overlapState === 'incomplete' ? (
            <p className="text-xs text-slate-500">Finish the required fields to check for overlaps with active promotions.</p>
          ) : overlapState === 'checking' && !conflicts.length ? (
            <p className="flex items-center gap-2 text-xs text-slate-500"><Spinner className="h-3.5 w-3.5" /> Checking for overlaps…</p>
          ) : conflicts.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                Overlaps with {conflicts.length} active {conflicts.length === 1 ? 'promotion' : 'promotions'}
              </p>
              <ul className="mt-1.5 space-y-1">
                {conflicts.map((c) => (
                  <li key={c.promotion_id}>
                    <span className="font-medium">{c.name}</span> · {c.venue_ids.length === 1 ? venueName(c.venue_ids[0], venues) : `${c.venue_ids.length} venues`} · {describeDays(c.days_of_week)}, {formatWindowString(c.window)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-amber-800">The engine will give each item whichever price is lowest.</p>
            </div>
          ) : overlapState === 'done' ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden />
              No overlaps with active promotions
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
