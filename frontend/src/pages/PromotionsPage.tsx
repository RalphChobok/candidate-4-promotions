import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, CircleCheck, Copy, Info, MapPin, PenLine, Pencil, Plus, Power, PowerOff, Search, Tag, TriangleAlert } from 'lucide-react';
import type { DisplayStatus, PromotionListItem } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useReferenceData } from '../context/ReferenceData';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../lib/errors';
import {
  CUSTOMER_RULE_LABELS,
  describeAppliesTo,
  describeDateRange,
  describeDays,
  describeOffer,
  describeSchedule,
  describeVenues,
  displayStatus,
  formatWindow,
  formatWindowString,
  STATUS_LABELS,
  venueName,
} from '../lib/format';
import { duplicatePromotion, listPromotions, setPromotionStatus } from '../services/promotions';
import { getOverrideReport } from '../services/reports';
import { Alert, buttonClass, Card, cx, EmptyState, ErrorState, inputClass, Menu, PageHeader, Popover, StatCard, StatusBadge } from '../components/ui';

type Filter = 'all' | DisplayStatus;
const FILTERS: Filter[] = ['all', 'active', 'scheduled', 'inactive'];

export function PromotionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { venues } = useReferenceData();
  const promotions = useAsync(listPromotions, []);
  const overrides = useAsync(getOverrideReport, []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => (promotions.data ?? []).map((p) => ({ ...p, display: displayStatus(p) })), [promotions.data]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, active: 0, scheduled: 0, inactive: 0 };
    for (const p of rows) {
      result.all += 1;
      result[p.display] += 1;
    }
    return result;
  }, [rows]);

  const overridesThisWeek = useMemo(() => {
    if (!overrides.data) return undefined;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return overrides.data.records.filter((r) => new Date(r.timestamp).getTime() >= cutoff).length;
  }, [overrides.data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => (filter === 'all' || p.display === filter) && p.name.toLowerCase().includes(q));
  }, [rows, filter, query]);

  const duplicate = async (p: PromotionListItem) => {
    try {
      const copy = await duplicatePromotion(p.id);
      toast.show(`Created “${copy.name}”. It’s inactive until you switch it on.`);
      promotions.reload();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  const toggleActive = async (p: PromotionListItem) => {
    const active = p.status === 'ACTIVE';
    try {
      await setPromotionStatus(p.id, active ? 'INACTIVE' : 'ACTIVE');
      toast.show(active ? `${p.name} switched off. It no longer applies at the till.` : `${p.name} switched on.`);
      promotions.reload();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Manage promotions, schedules and discount rules across all Ridgeline venues."
        actions={
          <Link to="/promotions/new" className={buttonClass('primary', 'lg')}>
            <Plus className="h-4 w-4" aria-hidden />
            Create promotion
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active promotions" value={counts.active} icon={CircleCheck} loading={!promotions.data} />
        <StatCard label="Scheduled" value={counts.scheduled} icon={CalendarClock} loading={!promotions.data} hint="Active, with a start date still to come" />
        <StatCard label="Venues" value={venues.length} icon={MapPin} />
        <StatCard label="Overrides this week" value={overridesThisWeek ?? '—'} icon={PenLine} loading={!overrides.data && !overrides.error} hint="Manual price changes at the till" />
      </div>

      <Alert tone="info" icon={Info} className="mt-6" action={
        <Link to="/simulator" className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-700 hover:text-brand-900">
          Try the simulator <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }>
        <span className="font-medium">Promotions don’t stack by default.</span> When more than one is eligible, the promotion engine gives each item the lowest price and records why.
      </Alert>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {f === 'all' ? 'All' : STATUS_LABELS[f]}
                <span className={cx('ml-1.5 tabular-nums', filter === f ? 'text-slate-300' : 'text-slate-400')}>{counts[f]}</span>
              </button>
            ))}
          </div>
          <div className="relative md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="promotion-search" className="sr-only">Search promotions</label>
            <input id="promotion-search" type="search" placeholder="Search promotions" value={query} onChange={(e) => setQuery(e.target.value)} className={cx(inputClass, 'pl-9')} />
          </div>
        </div>

        {promotions.error ? (
          <ErrorState title="Couldn’t load promotions" message={promotions.error} onRetry={promotions.reload} />
        ) : !promotions.data ? (
          <TableSkeleton />
        ) : visible.length === 0 ? (
          counts.all === 0 ? (
            <EmptyState
              icon={Tag}
              title="No promotions yet"
              body="Create your first promotion to see it here."
              action={<Link to="/promotions/new" className={buttonClass('primary')}><Plus className="h-4 w-4" aria-hidden />Create promotion</Link>}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No promotions match"
              body="Try a different search or status filter."
              action={<button type="button" className={buttonClass()} onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button>}
            />
          )
        ) : (
          <PromotionTable
            promotions={visible}
            onEdit={(p) => navigate(`/promotions/${p.id}/edit`)}
            onDuplicate={duplicate}
            onToggle={toggleActive}
          />
        )}
      </Card>
    </>
  );
}

const COLUMNS = ['Promotion', 'Type', 'Applies to', 'Schedule', 'Venues', 'Status'];

function PromotionTable({ promotions, onEdit, onDuplicate, onToggle }: {
  promotions: (PromotionListItem & { display: DisplayStatus })[];
  onEdit: (p: PromotionListItem) => void;
  onDuplicate: (p: PromotionListItem) => void;
  onToggle: (p: PromotionListItem) => void;
}) {
  const { venues, products } = useReferenceData();
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{c}</th>
            ))}
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {promotions.map((p) => {
            const dates = describeDateRange(p);
            return (
              <tr key={p.id} className="align-top hover:bg-slate-50/60">
                <td className="min-w-56 px-4 py-4">
                  <Link to={`/promotions/${p.id}/edit`} className="rounded font-medium text-slate-900 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    {p.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.id} · {p.customer_rule === 'EVERYONE' ? 'Everyone' : `${CUSTOMER_RULE_LABELS[p.customer_rule]} only`}
                    {p.allow_stacking && ' · Can stack'}
                  </p>
                  {p.conflicts.length > 0 && <ConflictPopover promotion={p} />}
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-800">{describeOffer(p)}</td>
                <td className="px-4 py-4 text-slate-700">{describeAppliesTo(p, products)}</td>
                <td className="px-4 py-4 text-slate-700">
                  <span className="whitespace-nowrap">{describeSchedule(p)}</span>
                  {p.schedule_overrides.map((o) => (
                    <p key={o.venue_id} className="mt-0.5 text-xs text-slate-500">
                      {venueName(o.venue_id, venues)}: {formatWindow(o.starts_at ?? p.schedule.starts_at, o.ends_at ?? p.schedule.ends_at)}
                    </p>
                  ))}
                  {dates && <p className="mt-0.5 text-xs text-slate-500">{dates}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-slate-700">{describeVenues(p, venues)}</td>
                <td className="px-4 py-4"><StatusBadge status={p.display} /></td>
                <td className="px-2 py-3 text-right">
                  <Menu
                    label={`Actions for ${p.name}`}
                    items={[
                      { label: 'Edit', icon: Pencil, onSelect: () => onEdit(p) },
                      { label: 'Duplicate', icon: Copy, onSelect: () => onDuplicate(p) },
                      p.status === 'ACTIVE'
                        ? { label: 'Switch off', icon: PowerOff, onSelect: () => onToggle(p) }
                        : { label: 'Switch on', icon: Power, onSelect: () => onToggle(p) },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConflictPopover({ promotion }: { promotion: PromotionListItem }) {
  const { venues } = useReferenceData();
  return (
    <Popover
      triggerLabel={`Potential overlap for ${promotion.name}`}
      triggerClassName="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100"
      trigger={<><TriangleAlert className="h-3.5 w-3.5" aria-hidden />Potential overlap</>}
    >
      <div className="p-4">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden />
          Potential overlap
        </p>
        <ul className="mt-3 space-y-2.5 text-slate-700">
          {promotion.conflicts.map((c) => (
            <li key={c.promotion_id}>
              This promotion overlaps with <strong className="font-semibold text-slate-900">{c.name}</strong>{' '}
              {c.venue_ids.length === 1 ? `at ${venueName(c.venue_ids[0], venues)}` : `at ${c.venue_ids.length} venues`}.
              <span className="mt-0.5 block text-xs text-slate-500">{describeDays(c.days_of_week)} · {formatWindowString(c.window)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          {promotion.allow_stacking
            ? 'Stacking is enabled for this promotion, so it can be added on top of the promotions it lists.'
            : 'Stacking is disabled. When both are eligible, the promotion engine gives each item the lowest price.'}
        </p>
        <Link to="/simulator" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
          Test a scenario in the simulator <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </Popover>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="Loading promotions">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 py-5">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 md:block" />
          <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
