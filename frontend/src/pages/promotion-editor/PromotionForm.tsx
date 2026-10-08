import { useId, type ReactNode } from 'react';
import { CircleCheck, Clock, Info, Layers, MapPin, Package, Percent, Plus, Tag, Trash, Users } from 'lucide-react';
import type { CustomerRule, Promotion, PromotionInput, PromotionType, Schedule, ScheduleOverride } from '../../types';
import { useReferenceData } from '../../context/ReferenceData';
import { capitalise, DAY_LONG, DAY_SHORT, DAYS, formatMoney } from '../../lib/format';
import { Alert, Button, Card, CheckboxChip, cx, Field, inputClass, MoneyInput, Toggle } from '../../components/ui';
import type { FormErrors, FormState, ProductMode, VenueMode } from './formState';

interface FormProps {
  form: FormState;
  onChange: (updater: (f: FormState) => FormState) => void;
  errors: FormErrors;
}

type Icon = typeof Tag;

function Section({ title, description, children, icon: SectionIcon }: { title: string; description?: string; children: ReactNode; icon?: Icon }) {
  const id = useId();
  return (
    <Card>
      <section aria-labelledby={id}>
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id={id} className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            {SectionIcon && <SectionIcon className="h-4 w-4 text-slate-400" aria-hidden />}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        <div className="space-y-6 px-6 py-5">{children}</div>
      </section>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

function RadioCards<T extends string>({ name, legend, options, value, onChange, columns = 3 }: {
  name: string;
  legend: string;
  options: { value: T; label: string; description: string; icon?: Icon }[];
  value: T;
  onChange: (v: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{legend}</legend>
      <div className={cx('mt-2 grid gap-3', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              className={cx(
                'relative flex cursor-pointer flex-col rounded-lg border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-1',
                selected ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <input type="radio" name={name} value={o.value} checked={selected} onChange={() => onChange(o.value)} className="sr-only" />
              <span className="flex items-center gap-2 pr-6 text-sm font-medium text-slate-900">
                {o.icon && <o.icon className={cx('h-4 w-4', selected ? 'text-brand-600' : 'text-slate-400')} aria-hidden />}
                {o.label}
              </span>
              <span className="mt-1 text-xs text-slate-500">{o.description}</span>
              {selected && <CircleCheck className="absolute right-3 top-3 h-4 w-4 text-brand-600" aria-hidden />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TYPES: { value: PromotionType; label: string; description: string; icon: Icon }[] = [
  { value: 'PERCENTAGE', label: 'Percentage discount', description: 'e.g. 15% off beverages', icon: Percent },
  { value: 'FIXED_PRICE', label: 'Fixed price', description: 'e.g. schnitzel for $18', icon: Tag },
  { value: 'BUNDLE', label: 'Bundle', description: 'e.g. 2 parmas + 2 pints for $55', icon: Package },
];

const CUSTOMERS: { value: CustomerRule; label: string; description: string }[] = [
  { value: 'EVERYONE', label: 'Everyone', description: 'All customers' },
  { value: 'MEMBER', label: 'Members', description: 'Active loyalty members only' },
  { value: 'STAFF', label: 'Staff', description: 'Ridgeline staff only' },
];

export function PromotionForm({ form, onChange, errors, promotions, selfId }: FormProps & { promotions: Promotion[]; selfId?: string }) {
  const setInput = (patch: Partial<PromotionInput>) => onChange((f) => ({ ...f, input: { ...f.input, ...patch } }));

  return (
    <div className="space-y-6">
      <Section title="Basic information">
        <Field label="Promotion name" htmlFor="promo-name" error={errors.name} hint="Shown to staff at the till.">
          <input
            id="promo-name"
            className={inputClass}
            value={form.input.name}
            placeholder="Promotion name"
            onChange={(e) => setInput({ name: e.target.value })}
            aria-invalid={!!errors.name || undefined}
          />
        </Field>
        <RadioCards name="promotion-type" legend="Promotion type" value={form.input.type} onChange={(type) => setInput({ type })} options={TYPES} />
      </Section>

      <OfferSection form={form} onChange={onChange} errors={errors} />

      <Section title="Customer eligibility" icon={Users}>
        <RadioCards name="customer-rule" legend="Who can use this promotion?" value={form.input.customer_rule} onChange={(customer_rule) => setInput({ customer_rule })} options={CUSTOMERS} />
      </Section>

      <VenuesSection form={form} onChange={onChange} errors={errors} />
      <ScheduleSection form={form} onChange={onChange} errors={errors} />
      <BehaviourSection form={form} onChange={onChange} errors={errors} promotions={promotions} selfId={selfId} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function OfferSection({ form, onChange, errors }: FormProps) {
  const { products } = useReferenceData();
  const categories = [...new Set(products.map((p) => p.category))];
  const setInput = (patch: Partial<PromotionInput>) => onChange((f) => ({ ...f, input: { ...f.input, ...patch } }));
  const set = (patch: Partial<FormState>) => onChange((f) => ({ ...f, ...patch }));
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((x) => x !== value));

  if (form.input.type === 'PERCENTAGE') {
    return (
      <Section title="Discount" icon={Percent}>
        <Field label="Discount" htmlFor="promo-percent" error={errors.offer} className="max-w-[12rem]">
          <div className="relative">
            <input
              id="promo-percent"
              type="number"
              min={1}
              max={100}
              inputMode="decimal"
              className={cx(inputClass, 'pr-8 tabular-nums')}
              placeholder="15"
              value={form.input.percentage ?? ''}
              onChange={(e) => setInput({ percentage: e.target.value === '' ? null : Number(e.target.value) })}
              aria-invalid={!!errors.offer || undefined}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500" aria-hidden>%</span>
          </div>
        </Field>
        <div>
          <p className="text-sm font-medium text-slate-700">Applies to</p>
          <div className="mt-2">
            <Segmented<ProductMode>
              label="Applies to"
              value={form.productMode}
              onChange={(productMode) => set({ productMode })}
              options={[{ value: 'all', label: 'Everything' }, { value: 'categories', label: 'Categories' }, { value: 'products', label: 'Specific products' }]}
            />
          </div>
          {form.productMode === 'categories' && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {categories.map((c) => (
                <CheckboxChip key={c} checked={form.categories.includes(c)} onChange={(on) => set({ categories: toggle(form.categories, c, on) })}>
                  {capitalise(c)}
                </CheckboxChip>
              ))}
            </div>
          )}
          {form.productMode === 'products' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {products.map((p) => (
                <CheckboxChip key={p.product_id} checked={form.productIds.includes(p.product_id)} onChange={(on) => set({ productIds: toggle(form.productIds, p.product_id, on) })}>
                  <span className="flex-1">{p.name}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{formatMoney(p.price_cents)}</span>
                </CheckboxChip>
              ))}
            </div>
          )}
          <div className="mt-2"><FieldError message={errors.products} /></div>
        </div>
      </Section>
    );
  }

  const isBundle = form.input.type === 'BUNDLE';
  const rows = form.requiredItems;
  const updateRow = (index: number, patch: Partial<{ product_id: string; quantity: number }>) =>
    set({ requiredItems: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const normal = rows.reduce((n, r) => n + (products.find((p) => p.product_id === r.product_id)?.price_cents ?? 0) * r.quantity, 0);
  const price = form.input.value_cents;

  return (
    <Section
      title={isBundle ? 'Bundle' : 'Fixed price'}
      icon={isBundle ? Package : Tag}
      description={isBundle ? undefined : 'A fixed-price promotion is a complete offer: the items below are sold together at this price.'}
    >
      <Field label={isBundle ? 'Bundle price' : 'Offer price'} htmlFor="promo-price" error={errors.offer} className="max-w-[12rem]">
        <MoneyInput id="promo-price" valueCents={price ?? null} onChange={(c) => setInput({ value_cents: c })} placeholder={isBundle ? '55.00' : '18.00'} invalid={!!errors.offer} />
      </Field>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">{isBundle ? 'Required items' : 'Included items'}</legend>
        <ul className="mt-2 space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="grid grid-cols-[5rem_auto_minmax(0,1fr)_auto] items-center gap-2">
              <label className="sr-only" htmlFor={`item-qty-${i}`}>Quantity for row {i + 1}</label>
              <input
                id={`item-qty-${i}`}
                type="number"
                min={1}
                max={20}
                className={cx(inputClass, 'tabular-nums')}
                value={row.quantity}
                onChange={(e) => updateRow(i, { quantity: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className="text-slate-400" aria-hidden>×</span>
              <label className="sr-only" htmlFor={`item-product-${i}`}>Item for row {i + 1}</label>
              <select id={`item-product-${i}`} className={inputClass} value={row.product_id} onChange={(e) => updateRow(i, { product_id: e.target.value })}>
                <option value="">Choose an item</option>
                {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} ({formatMoney(p.price_cents)})</option>)}
              </select>
              <Button variant="ghost" size="sm" aria-label={`Remove row ${i + 1}`} onClick={() => set({ requiredItems: rows.filter((_, j) => j !== i) })} disabled={rows.length === 1}>
                <Trash className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => set({ requiredItems: [...rows, { product_id: '', quantity: 1 }] })}>
          <Plus className="h-4 w-4" aria-hidden />
          Add item
        </Button>
        <div className="mt-2"><FieldError message={errors.products} /></div>
      </fieldset>
      {normal > 0 && price != null && (
        <p className="text-sm text-slate-600">
          Normally <span className="font-medium tabular-nums">{formatMoney(normal)}</span>
          {price < normal
            ? <> · customer saves <span className="font-medium text-emerald-700 tabular-nums">{formatMoney(normal - price)}</span>{isBundle && ' per set'}</>
            : <span className="text-amber-700"> · the offer price isn’t lower than the normal price, so it will never be chosen</span>}
        </p>
      )}
      <Alert tone="info" icon={Info}>
        Applies once per complete set. Extra items stay at their normal price unless another promotion applies.
      </Alert>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function VenuesSection({ form, onChange, errors }: FormProps) {
  const { venues } = useReferenceData();
  const set = (patch: Partial<FormState>) => onChange((f) => ({ ...f, ...patch }));

  return (
    <Section title="Venues" icon={MapPin} description="Where does this promotion apply?">
      <Segmented<VenueMode>
        label="Venue rule"
        value={form.venueMode}
        onChange={(venueMode) => set({ venueMode })}
        options={[{ value: 'all', label: 'All venues' }, { value: 'venues', label: 'Specific venues' }]}
      />
      {form.venueMode === 'all' && <p className="text-sm text-slate-600">Applies at all {venues.length} venues, including any added later.</p>}
      {form.venueMode === 'venues' && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <CheckboxChip key={v.venue_id} checked={form.venueIds.includes(v.venue_id)} onChange={(on) => set({ venueIds: on ? [...form.venueIds, v.venue_id] : form.venueIds.filter((x) => x !== v.venue_id) })}>
              <span>
                <span className="block">{v.name}</span>
                <span className="block text-xs text-slate-500">{v.state}</span>
              </span>
            </CheckboxChip>
          ))}
        </div>
      )}
      <FieldError message={errors.venues} />
    </Section>
  );
}

// ---------------------------------------------------------------------------

function ScheduleSection({ form, onChange, errors }: FormProps) {
  const { venues } = useReferenceData();
  const s = form.input.schedule;
  const overrides = form.input.schedule_overrides;
  const setSchedule = (patch: Partial<Schedule>) => onChange((f) => ({ ...f, input: { ...f.input, schedule: { ...f.input.schedule, ...patch } } }));
  const setOverrides = (next: ScheduleOverride[]) => onChange((f) => ({ ...f, input: { ...f.input, schedule_overrides: next } }));
  const allDay = s.starts_at === '00:00' && s.ends_at === '23:59';
  const allDayHint = useId();
  const unused = venues.filter((v) => !overrides.some((o) => o.venue_id === v.venue_id));

  const toggleDay = (day: (typeof DAYS)[number]) =>
    setSchedule({ days_of_week: s.days_of_week.includes(day) ? s.days_of_week.filter((d) => d !== day) : DAYS.filter((d) => d === day || s.days_of_week.includes(d)) });

  return (
    <Section title="Schedule" icon={Clock}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="promo-start-date" optional>
          <input id="promo-start-date" type="date" className={inputClass} value={s.start_date ?? ''} onChange={(e) => setSchedule({ start_date: e.target.value || null })} />
        </Field>
        <Field label="End date" htmlFor="promo-end-date" optional error={errors.dates} hint="Leave empty to run until it’s switched off.">
          <input id="promo-end-date" type="date" className={inputClass} value={s.end_date ?? ''} min={s.start_date ?? undefined} onChange={(e) => setSchedule({ end_date: e.target.value || null })} aria-invalid={!!errors.dates || undefined} />
        </Field>
      </div>

      <fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-slate-700">Days of week</legend>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSchedule({ days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'] })}>Weekdays</Button>
            <Button variant="ghost" size="sm" onClick={() => setSchedule({ days_of_week: ['sat', 'sun'] })}>Weekends</Button>
            <Button variant="ghost" size="sm" onClick={() => setSchedule({ days_of_week: [...DAYS] })}>Every day</Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = s.days_of_week.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={DAY_LONG[d]}
                onClick={() => toggleDay(d)}
                className={cx(
                  'h-10 w-14 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {DAY_SHORT[d]}
              </button>
            );
          })}
        </div>
        <div className="mt-2"><FieldError message={errors.days} /></div>
      </fieldset>

      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">All day</p>
            <p className="text-xs text-slate-500" id={allDayHint}>Days are trading days: after midnight counts toward the previous day while the venue is still trading.</p>
          </div>
          <Toggle
            checked={allDay}
            onChange={(on) => setSchedule(on ? { starts_at: '00:00', ends_at: '23:59' } : { starts_at: '16:00', ends_at: '18:00' })}
            label="All day"
            describedBy={allDayHint}
          />
        </div>
        {!allDay && (
          <div className="mt-4 grid max-w-md grid-cols-2 gap-4">
            <Field label="Start time" htmlFor="promo-start-time">
              <input id="promo-start-time" type="time" className={inputClass} value={s.starts_at} onChange={(e) => setSchedule({ starts_at: e.target.value })} />
            </Field>
            <Field label="End time" htmlFor="promo-end-time">
              <input id="promo-end-time" type="time" className={inputClass} value={s.ends_at} onChange={(e) => setSchedule({ ends_at: e.target.value })} />
            </Field>
          </div>
        )}
        {!allDay && <p className="mt-2 text-xs text-slate-500">Start time is included, end time is not. A window like 10:00 PM – 2:00 AM crosses midnight.</p>}
        <div className="mt-2"><FieldError message={errors.times} /></div>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-4">
        <p className="text-sm font-medium text-slate-800">Venue-specific times</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Give one venue its own time window. Other venues keep the times above.
        </p>
        {overrides.length > 0 && (
          <ul className="mt-3 space-y-2">
            {overrides.map((o, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto_8rem_auto]">
                <label className="sr-only" htmlFor={`override-venue-${i}`}>Venue</label>
                <select
                  id={`override-venue-${i}`}
                  className={cx(inputClass, 'col-span-2 sm:col-span-1')}
                  value={o.venue_id}
                  onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, venue_id: e.target.value } : x)))}
                >
                  {venues.filter((v) => v.venue_id === o.venue_id || unused.includes(v)).map((v) => <option key={v.venue_id} value={v.venue_id}>{v.name}</option>)}
                </select>
                <label className="sr-only" htmlFor={`override-start-${i}`}>Start time</label>
                <input id={`override-start-${i}`} type="time" className={inputClass} value={o.starts_at ?? s.starts_at}
                  onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, starts_at: e.target.value } : x)))} />
                <span className="hidden text-slate-400 sm:block" aria-hidden>–</span>
                <label className="sr-only" htmlFor={`override-end-${i}`}>End time</label>
                <input id={`override-end-${i}`} type="time" className={inputClass} value={o.ends_at ?? s.ends_at}
                  onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, ends_at: e.target.value } : x)))} />
                <Button variant="ghost" size="sm" aria-label="Remove venue-specific time" onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}>
                  <Trash className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={!unused.length}
          onClick={() => setOverrides([...overrides, { venue_id: unused[0].venue_id, starts_at: '17:00', ends_at: '19:00' }])}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add venue-specific schedule
        </Button>
        <div className="mt-2"><FieldError message={errors.overrides} /></div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function BehaviourSection({ form, onChange, promotions, selfId }: FormProps & { promotions: Promotion[]; selfId?: string }) {
  const stackingHint = useId();
  const setInput = (patch: Partial<PromotionInput>) => onChange((f) => ({ ...f, input: { ...f.input, ...patch } }));
  const others = promotions.filter((p) => p.id !== selfId);
  return (
    <Section title="Promotion behavior" icon={Layers}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-slate-700">Allow stacking</p>
          <p id={stackingHint} className="mt-0.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Promotions do not stack by default. Turn this on to let this discount be taken off on top of the promotions you pick below.
          </p>
        </div>
        <Toggle checked={form.input.allow_stacking} onChange={(v) => setInput({ allow_stacking: v })} label="Allow stacking" describedBy={stackingHint} />
      </div>
      {form.input.allow_stacking && (
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Can stack on top of</legend>
          {form.input.type !== 'PERCENTAGE' && (
            <p className="mt-1 text-xs text-amber-700">Only percentage discounts can stack on top of another promotion.</p>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {others.map((p) => (
              <CheckboxChip
                key={p.id}
                checked={form.input.stacks_on.includes(p.id)}
                onChange={(on) => setInput({ stacks_on: on ? [...form.input.stacks_on, p.id] : form.input.stacks_on.filter((x) => x !== p.id) })}
              >
                {p.name}
              </CheckboxChip>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Example: let Member Discount stack on Schnitzel Tuesday and Ray pays $16.20 instead of $18.00.</p>
        </fieldset>
      )}
      <Field
        label="Priority"
        htmlFor="promo-priority"
        className="max-w-xs"
        hint="Only breaks exact ties. The engine always picks the lowest price for the customer first."
      >
        <input
          id="promo-priority"
          type="number"
          className={cx(inputClass, 'tabular-nums')}
          value={form.input.priority}
          onChange={(e) => setInput({ priority: Number(e.target.value) || 0 })}
        />
      </Field>
    </Section>
  );
}
