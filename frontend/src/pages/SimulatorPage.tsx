import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Calculator,
  CircleCheck,
  CircleX,
  Lightbulb,
  Minus,
  PenLine,
  Plus,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Trash,
  TriangleAlert,
} from 'lucide-react';
import type { Member, Order, PricedOrder, PricingRequest } from '../types';
import { useReferenceData } from '../context/ReferenceData';
import { useCurrentUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../lib/errors';
import { CUSTOMER_TYPE_LABELS, formatDate, formatMoney, formatTime, todayLocal } from '../lib/format';
import { createOrder, evaluateOrder, overrideOrder } from '../services/orders';
import { getMember } from '../services/promotions';
import { Alert, Badge, Button, Card, CardHeader, cx, EmptyState, ErrorState, Field, inputClass, Modal, MoneyInput, PageHeader, Spinner } from '../components/ui';

type CustomerKind = 'REGULAR' | 'MEMBER' | 'STAFF';

interface OrderForm {
  venue_id: string;
  date: string;
  time: string;
  customer: CustomerKind;
  member_number: string;
  staff_id: string;
  items: { product_id: string; quantity: number }[];
}

export function SimulatorPage() {
  const { venues, staff } = useReferenceData();
  const toast = useToast();
  const [form, setForm] = useState<OrderForm>(() => ({
    venue_id: venues[0]?.venue_id ?? '',
    date: todayLocal(),
    time: '18:00',
    customer: 'REGULAR',
    member_number: '',
    staff_id: staff[0]?.staff_id ?? '',
    items: [],
  }));
  const [result, setResult] = useState<{ priced: PricedOrder; request: PricingRequest } | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const toRequest = (f: OrderForm): PricingRequest => {
    return {
      venue_id: f.venue_id,
      // The fixtures have no timezones, so the time is sent as the venue's local time.
      timestamp: `${f.date}T${f.time}:00`,
      ...(f.customer === 'MEMBER' && f.member_number.trim() ? { member_number: f.member_number.trim() } : {}),
      ...(f.customer === 'STAFF' && f.staff_id ? { staff_id: f.staff_id } : {}),
      items: f.items,
    };
  };

  const update = (patch: Partial<OrderForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (result) setStale(true);
  };

  const calculate = async (f: OrderForm = form) => {
    setCalculating(true);
    setError(null);
    try {
      const request = toRequest(f);
      const priced = await evaluateOrder(request);
      setResult({ priced, request });
      setOrder(null);
      setStale(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCalculating(false);
    }
  };

  const record = async (): Promise<Order | null> => {
    if (!result) return null;
    if (order) return order;
    setRecording(true);
    try {
      const created = await createOrder(result.request);
      setOrder(created);
      return created;
    } finally {
      setRecording(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Promotion Simulator"
        subtitle="Test how the promotion engine calculates the final customer price."
        badge={<Badge tone="violet"><Receipt className="h-3 w-3" aria-hidden />Demo / Till simulation</Badge>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <OrderPanel form={form} onChange={update} onCalculate={() => void calculate()} calculating={calculating} />

        <div aria-live="polite" className="min-w-0">
          {error ? (
            <Card><ErrorState title="Couldn’t calculate this order" message={error} onRetry={() => void calculate()} /></Card>
          ) : !result ? (
            <Card>
              {calculating ? (
                <div role="status" className="flex flex-col items-center gap-3 py-20 text-sm text-slate-500"><Spinner />Calculating promotion…</div>
              ) : (
                <EmptyState
                  icon={Calculator}
                  title="No calculation yet"
                  body="Choose a venue, time, customer and items, then click Calculate promotion."
                />
              )}
            </Card>
          ) : (
            <Results
              priced={order ?? result.priced}
              requestDate={result.request.timestamp.slice(0, 10)}
              order={order}
              stale={stale}
              busy={calculating || recording}
              onRecalculate={() => void calculate()}
              onRecord={() => void record().then((o) => o && toast.show(`Sale recorded as order ${o.order_id}.`), (e) => toast.show(errorMessage(e), 'error'))}
              onOverride={() => setOverrideOpen(true)}
            />
          )}
        </div>
      </div>

      {result && (
        <OverrideModal
          open={overrideOpen}
          calculatedCents={result.priced.final_total_cents}
          venueName={result.priced.venue_name}
          onClose={() => setOverrideOpen(false)}
          submit={async (newTotal, reason, staffId) => {
            const target = await record();
            if (!target) throw new Error('Calculate the order first.');
            const updated = await overrideOrder(target.order_id, { staff_id: staffId, new_total_cents: newTotal, reason });
            setOrder(updated);
            setOverrideOpen(false);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Order configuration

function OrderPanel({ form, onChange, onCalculate, calculating }: {
  form: OrderForm;
  onChange: (patch: Partial<OrderForm>) => void;
  onCalculate: () => void;
  calculating: boolean;
}) {
  const { venues, products, staff } = useReferenceData();
  const productOf = (id: string) => products.find((p) => p.product_id === id);
  const subtotal = form.items.reduce((n, i) => n + (productOf(i.product_id)?.price_cents ?? 0) * i.quantity, 0);

  const setQuantity = (productId: string, quantity: number) =>
    onChange({ items: form.items.map((i) => (i.product_id === productId ? { ...i, quantity: Math.max(1, Math.min(99, quantity)) } : i)) });
  const remove = (productId: string) => onChange({ items: form.items.filter((i) => i.product_id !== productId) });
  const add = (productId: string) => {
    const existing = form.items.find((i) => i.product_id === productId);
    if (existing) setQuantity(productId, existing.quantity + 1);
    else onChange({ items: [...form.items, { product_id: productId, quantity: 1 }] });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCalculate();
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader title="Order" description="Set up the sale exactly as it would happen at the till." />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Venue" htmlFor="sim-venue" className="sm:col-span-2">
            <select id="sim-venue" className={inputClass} value={form.venue_id} onChange={(e) => onChange({ venue_id: e.target.value })}>
              {venues.map((v) => <option key={v.venue_id} value={v.venue_id}>{v.name} ({v.state})</option>)}
            </select>
          </Field>
          <Field label="Date" htmlFor="sim-date">
            <input id="sim-date" type="date" required className={inputClass} value={form.date} onChange={(e) => onChange({ date: e.target.value })} />
          </Field>
          <Field label="Time at the venue" htmlFor="sim-time" hint="After midnight counts toward the previous day while the venue is still trading from the night before.">
            <input id="sim-time" type="time" required className={inputClass} value={form.time} onChange={(e) => onChange({ time: e.target.value })} />
          </Field>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Customer</legend>
            <div role="radiogroup" aria-label="Customer" className="mt-1.5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(['REGULAR', 'MEMBER', 'STAFF'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.customer === k}
                  onClick={() => onChange({ customer: k })}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    form.customer === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {k === 'REGULAR' ? 'Regular' : k === 'MEMBER' ? 'Member' : 'Staff'}
                </button>
              ))}
            </div>
            {form.customer === 'MEMBER' && <MemberLookup value={form.member_number} onChange={(member_number) => onChange({ member_number })} />}
            {form.customer === 'STAFF' && (
              <div className="mt-3">
                <label htmlFor="sim-staff" className="sr-only">Staff member</label>
                <select id="sim-staff" className={inputClass} value={form.staff_id} onChange={(e) => onChange({ staff_id: e.target.value })}>
                  {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.role}, {s.staff_id})</option>)}
                </select>
              </div>
            )}
          </fieldset>
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Order items</h3>
          {form.items.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No items yet. Add something below.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {form.items.map((item) => {
                const p = productOf(item.product_id);
                if (!p) return null;
                return (
                  <li key={item.product_id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{formatMoney(p.price_cents)} each</p>
                    </div>
                    <div className="flex items-center rounded-lg border border-slate-200">
                      <button type="button" aria-label={`Decrease ${p.name} quantity`} className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-40" disabled={item.quantity <= 1} onClick={() => setQuantity(p.product_id, item.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <label htmlFor={`qty-${p.product_id}`} className="sr-only">{p.name} quantity</label>
                      <input
                        id={`qty-${p.product_id}`}
                        type="number"
                        min={1}
                        max={99}
                        className="w-10 border-0 bg-transparent p-0 text-center text-sm tabular-nums focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        value={item.quantity}
                        onChange={(e) => setQuantity(p.product_id, Number(e.target.value) || 1)}
                      />
                      <button type="button" aria-label={`Increase ${p.name} quantity`} className="p-1.5 text-slate-500 hover:text-slate-900" onClick={() => setQuantity(p.product_id, item.quantity + 1)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    <p className="w-16 text-right text-sm font-medium text-slate-900 tabular-nums">{formatMoney(p.price_cents * item.quantity)}</p>
                    <button type="button" aria-label={`Remove ${p.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => remove(p.product_id)}>
                      <Trash className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <label htmlFor="sim-add" className="mt-4 block text-xs font-medium text-slate-500">Add item</label>
          <select
            id="sim-add"
            className={cx(inputClass, 'mt-1')}
            value=""
            onChange={(e) => e.target.value && add(e.target.value)}
          >
            <option value="">Choose a product…</option>
            {[...new Set(products.map((p) => p.category))].map((category) => (
              <optgroup key={category} label={category.charAt(0).toUpperCase() + category.slice(1)}>
                {products.filter((p) => p.category === category).map((p) => (
                  <option key={p.product_id} value={p.product_id}>{p.name} · {formatMoney(p.price_cents)}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
            <span className="text-slate-500">Normal price</span>
            <span className="text-base font-semibold text-slate-900 tabular-nums">{formatMoney(subtotal)}</span>
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={calculating} disabled={!form.items.length || !form.date || !form.venue_id}>
            {!calculating && <Calculator className="h-4 w-4" aria-hidden />}
            {calculating ? 'Calculating…' : 'Calculate promotion'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MemberLookup({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [member, setMember] = useState<Member | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle');

  useEffect(() => {
    const n = value.trim();
    if (!n) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('loading');
    const timer = window.setTimeout(() => {
      getMember(n).then(
        (m) => { if (!cancelled) { setMember(m); setState('found'); } },
        () => { if (!cancelled) { setMember(null); setState('missing'); } },
      );
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value]);

  return (
    <div className="mt-3">
      <label htmlFor="sim-member" className="sr-only">Member number</label>
      <input id="sim-member" className={inputClass} placeholder="Member number, e.g. M-004182" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1.5 text-xs" aria-live="polite">
        {state === 'loading' && <span className="text-slate-500">Looking up member…</span>}
        {state === 'missing' && <span className="text-red-600">No member with that number.</span>}
        {state === 'found' && member && (
          <span className={member.active ? 'text-emerald-700' : 'text-amber-700'}>
            {member.name} · {member.tier} · {member.active ? 'active' : 'inactive, so no member discount'}
          </span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results

function Results({ priced, requestDate, order, stale, busy, onRecalculate, onRecord, onOverride }: {
  priced: PricedOrder;
  requestDate: string;
  order: Order | null;
  stale: boolean;
  busy: boolean;
  onRecalculate: () => void;
  onRecord: () => void;
  onOverride: () => void;
}) {
  const { can, user } = useCurrentUser();
  const override = order?.override ?? null;
  const finalCents = override?.new_total_cents ?? priced.final_total_cents;
  const considered = [...priced.considered_promotions].sort((a, b) => Number(b.eligible) - Number(a.eligible));
  const appliedIds = new Set(priced.applied_promotions.map((a) => a.promotion_id));

  return (
    <div className={cx('space-y-4 transition-opacity', (stale || busy) && 'opacity-60')} aria-busy={busy}>
      {stale && (
        <Alert tone="warning" icon={TriangleAlert} action={<Button size="sm" onClick={onRecalculate} loading={busy}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Recalculate</Button>}>
          The order has changed since this calculation.
        </Alert>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
        <span className="font-medium text-slate-700">{priced.venue_name}</span>
        <span aria-hidden>·</span>
        <span>{CUSTOMER_TYPE_LABELS[priced.customer_type]}</span>
        <span aria-hidden>·</span>
        <span>Trading day {formatDate(priced.trading_date, true)}, {formatTime(priced.local_time)}</span>
        {order && <><span aria-hidden>·</span><span className="font-medium text-slate-700">Order {order.order_id}</span></>}
      </p>
      {requestDate !== priced.trading_date && (
        <Alert tone="info">This sale is after midnight while the venue is still trading from the night before, so it counts toward {formatDate(priced.trading_date, true)}’s trading day.</Alert>
      )}

      {/* Selected promotion */}
      <Card className={cx('overflow-hidden', priced.applied_promotions.length > 0 && 'border-brand-200')}>
        <div className={cx('flex flex-wrap items-start justify-between gap-4 px-6 py-5', priced.applied_promotions.length ? 'bg-brand-50/70' : 'bg-slate-50')}>
          <div className="min-w-0">
            <p className={cx('text-xs font-semibold uppercase tracking-wide', priced.applied_promotions.length ? 'text-brand-700' : 'text-slate-500')}>
              {priced.applied_promotions.length > 1 ? 'Applied promotions' : 'Selected promotion'}
            </p>
            {priced.applied_promotions.length ? (
              priced.applied_promotions.map((a, i) => (
                <p key={a.promotion_id} className={cx('font-semibold text-slate-900', i === 0 ? 'mt-1 text-2xl tracking-tight' : 'mt-1 text-base')}>
                  {i > 0 && <span className="font-normal text-slate-500">+ </span>}
                  {a.name}
                  {priced.applied_promotions.length > 1 && <span className="ml-2 text-sm font-normal text-emerald-700">saves {formatMoney(a.saving_cents)}</span>}
                </p>
              ))
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">No promotion applies</p>
                <p className="text-sm text-slate-600">The customer pays the normal price.</p>
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{override ? 'Final price (overridden)' : 'Final price'}</p>
            <p className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatMoney(finalCents)}</p>
            {override ? (
              <p className="text-sm text-slate-500 line-through tabular-nums">{formatMoney(priced.final_total_cents)}</p>
            ) : priced.total_saving_cents > 0 ? (
              <p className="text-sm font-medium text-emerald-700 tabular-nums">Saves {formatMoney(priced.total_saving_cents)}</p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Explanation */}
      <section aria-labelledby="why-heading" className="rounded-xl border border-slate-200 border-l-4 border-l-brand-600 bg-white px-6 py-5 shadow-sm">
        <h2 id="why-heading" className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Lightbulb className="h-5 w-5 text-brand-600" aria-hidden />
          {priced.applied_promotions.length ? 'Why this price' : 'Why no promotion applied'}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{priced.reason}</p>
        <p className="mt-4 text-xs text-slate-500">
          Decided by the promotion engine.{' '}
          {order ? <>Recorded as order {order.order_id}. <Link to="/reports" className="font-medium text-brand-700 hover:text-brand-900">View audit log</Link></> : 'Not recorded yet: this was a price check.'}
        </p>
      </section>

      {/* Considered promotions */}
      <Card>
        <CardHeader title="Every promotion the engine considered" description="Including the ones that lost, and why." />
        <ul className="divide-y divide-slate-100">
          {considered.map((c) => {
            const applied = appliedIds.has(c.promotion_id);
            return (
              <li key={c.promotion_id} className="flex items-start gap-3 px-5 py-3">
                {c.eligible
                  ? <CircleCheck className={cx('mt-0.5 h-5 w-5 shrink-0', applied ? 'text-emerald-600' : 'text-slate-300')} aria-hidden />
                  : <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className={cx('font-medium', c.eligible ? 'text-slate-900' : 'text-slate-600')}>{c.name}</p>
                  <p className="text-sm text-slate-500">{c.reason.charAt(0).toUpperCase() + c.reason.slice(1)}</p>
                </div>
                {applied ? <Badge tone="green">Applied</Badge> : c.eligible ? <Badge>Eligible, not applied</Badge> : <Badge>Not eligible</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Price breakdown */}
      <Card>
        <CardHeader title="Price breakdown" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-2 text-left font-semibold">Item</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Qty</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Normal</th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">Charged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priced.lines.map((l, i) => (
                <tr key={`${l.product_id}-${i}`}>
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-slate-900">{l.product_name}</span>
                    {l.applied_promotion_name && (
                      <span className="block text-xs text-slate-500">
                        {l.applied_promotion_name}{l.part_of_bundle && ' · part of a set'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{formatMoney(l.original_cents)}</td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums">{formatMoney(l.final_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="space-y-2 border-t border-slate-200 px-5 py-4 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Original price</dt><dd className="tabular-nums">{formatMoney(priced.original_total_cents)}</dd></div>
          {priced.applied_promotions.map((a) => (
            <div key={a.promotion_id} className="flex justify-between gap-4">
              <dt className="text-slate-500">Promotion · <span className="text-slate-700">{a.name}</span></dt>
              <dd className="tabular-nums text-emerald-700">−{formatMoney(a.saving_cents)}</dd>
            </div>
          ))}
          <div className="flex justify-between"><dt className="text-slate-500">Promotion price</dt><dd className="tabular-nums">{formatMoney(priced.final_total_cents)}</dd></div>
          {override && (
            <div className="flex justify-between gap-4">
              <dt className="text-amber-800">Manual override</dt>
              <dd className="tabular-nums text-amber-800">{override.difference_cents < 0 ? '−' : '+'}{formatMoney(Math.abs(override.difference_cents))}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
            <dt className="font-semibold text-slate-900">Final total</dt>
            <dd className="text-xl font-semibold tabular-nums text-slate-900">{formatMoney(finalCents)}</dd>
          </div>
        </dl>

        {override ? (
          <div className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" aria-hidden />Manual override applied</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
              <dt className="text-amber-800">Original price</dt><dd className="font-medium tabular-nums">{formatMoney(override.original_total_cents)}</dd>
              <dt className="text-amber-800">Final price</dt><dd className="font-medium tabular-nums">{formatMoney(override.new_total_cents)}</dd>
              <dt className="text-amber-800">Reason</dt><dd className="font-medium">{override.reason}</dd>
              <dt className="text-amber-800">Logged</dt><dd className="font-medium">{override.staff_name} · {override.id} · order {override.order_id}</dd>
            </dl>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="max-w-sm text-xs text-slate-500">
              {can('override_price')
                ? 'Record the sale to store this decision. An override records the sale too, with a reason, in the audit log.'
                : `${user?.name ?? 'This staff member'} can’t override prices. Switch staff member in the top bar to try it.`}
            </p>
            <div className="flex gap-2">
              <Button onClick={onRecord} disabled={!!order || stale || busy}>
                <Receipt className="h-4 w-4" aria-hidden />
                {order ? 'Sale recorded' : 'Record sale'}
              </Button>
              <Button onClick={onOverride} disabled={!can('override_price') || stale || busy}>
                <PenLine className="h-4 w-4" aria-hidden />
                Override price
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override

function OverrideModal({ open, calculatedCents, venueName, onClose, submit }: {
  open: boolean;
  calculatedCents: number;
  venueName: string;
  onClose: () => void;
  submit: (newTotalCents: number, reason: string, staffId: string) => Promise<void>;
}) {
  const { user } = useCurrentUser();
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPriceCents(null);
      setReason('');
      setSubmitted(false);
      setError(null);
    }
  }, [open]);

  const priceError = priceCents == null ? 'Enter the new price.' : null;
  const reasonError = reason.trim().length < 3 ? 'A reason is required for every override.' : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (priceError || reasonError || !user || priceCents == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submit(priceCents, reason.trim(), user.staff_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manual price override"
      description={venueName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="warning" type="submit" form="override-form" loading={submitting}>
            {submitting ? 'Saving…' : 'Confirm override'}
          </Button>
        </>
      }
    >
      <form id="override-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="flex items-baseline justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-500">Calculated price</span>
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(calculatedCents)}</span>
        </div>
        <Field label="New price" htmlFor="override-price" error={submitted ? priceError ?? undefined : undefined}>
          <MoneyInput id="override-price" valueCents={priceCents} onChange={setPriceCents} placeholder="0.00" invalid={submitted && !!priceError} autoFocus />
        </Field>
        {priceCents != null && priceCents !== calculatedCents && (
          <p className="-mt-3 text-xs text-slate-500 tabular-nums">
            {priceCents < calculatedCents ? `${formatMoney(calculatedCents - priceCents)} less` : `${formatMoney(priceCents - calculatedCents)} more`} than the calculated price
          </p>
        )}
        <Field label="Reason" htmlFor="override-reason" error={submitted ? reasonError ?? undefined : undefined}>
          <input
            id="override-reason"
            className={inputClass}
            value={reason}
            placeholder="Why is the price being changed?"
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={(submitted && !!reasonError) || undefined}
          />
        </Field>
        <Alert tone="warning" icon={ShieldAlert}>
          This override will be logged for audit purposes, recorded against <span className="font-medium">{user?.name} ({user?.staff_id})</span>.
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
