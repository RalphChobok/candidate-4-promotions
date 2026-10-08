import { useState, type ReactNode } from 'react';
import { ChartColumn, ChevronDown, CircleCheck, CircleX, DollarSign, PenLine, Receipt, ScrollText } from 'lucide-react';
import type { Order, OverrideRecord, PromotionListItem, PromotionReport } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useReferenceData } from '../context/ReferenceData';
import { CUSTOMER_TYPE_LABELS, displayStatus, formatInstant, formatMoney, venueName } from '../lib/format';
import { listOrders } from '../services/orders';
import { listPromotions } from '../services/promotions';
import { getOverrideReport, getPromotionReport } from '../services/reports';
import { Badge, Button, Card, CardHeader, cx, EmptyState, ErrorState, Modal, PageHeader, Spinner, StatCard, StatusBadge } from '../components/ui';

export function ReportsPage() {
  const report = useAsync(
    () => Promise.all([getPromotionReport(), getOverrideReport(), listOrders(), listPromotions()])
      .then(([promotions, overrides, orders, catalogue]) => ({ promotions, overrides, orders, catalogue })),
    [],
  );
  const [overrideDetail, setOverrideDetail] = useState<OverrideRecord | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const data = report.data;

  return (
    <>
      <PageHeader
        title="Reports & Audit"
        subtitle="Understand promotion usage, discounts and manual overrides."
        badge={<Badge>Orders recorded by this server</Badge>}
      />

      {report.error ? (
        <Card><ErrorState title="Couldn’t load reports" message={report.error} onRetry={report.reload} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Orders priced" value={data?.promotions.total_orders} icon={Receipt} loading={!data} hint={data ? `${data.promotions.orders_with_promotion} with a promotion` : undefined} />
            <StatCard label="Discounts given" value={data && formatMoney(data.promotions.total_discount_cents)} icon={DollarSign} loading={!data} />
            <StatCard label="Manual overrides" value={data?.overrides.count} icon={PenLine} loading={!data} />
            <StatCard label="Away from system price" value={data && formatMoney(Math.abs(data.overrides.total_difference_cents))} icon={DollarSign} loading={!data} hint="Total difference made by overrides" />
          </div>

          <div className="mt-6 grid items-start gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-6">
              <PerformanceCard report={data?.promotions} catalogue={data?.catalogue} />
              <OverridesCard rows={data?.overrides.records} onOpen={setOverrideDetail} />
            </div>
            <DecisionsCard rows={data?.orders} onOpen={setOrderDetail} />
          </div>
        </>
      )}

      <OverrideDetailModal
        record={overrideDetail}
       
        onClose={() => setOverrideDetail(null)}
        onViewOrder={() => {
          const order = data?.orders.find((o) => o.order_id === overrideDetail?.order_id) ?? null;
          setOverrideDetail(null);
          setOrderDetail(order);
        }}
      />
      <OrderDetailModal order={orderDetail} onClose={() => setOrderDetail(null)} />
    </>
  );
}

function CardLoading() {
  return <div className="flex justify-center py-10"><Spinner /></div>;
}

// ---------------------------------------------------------------------------

function PerformanceCard({ report, catalogue }: { report?: PromotionReport; catalogue?: PromotionListItem[] }) {
  const rows = report?.promotions;
  const max = Math.max(1, ...(rows ?? []).map((r) => r.uses));
  return (
    <Card>
      <CardHeader title="Promotion performance" icon={ChartColumn} description="How often each promotion won, and what it gave away." />
      {!rows ? <CardLoading /> : rows.length === 0 ? (
        <EmptyState title="No promotion use yet" body="Usage appears here once orders are recorded." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-2.5 text-left font-semibold">Promotion</th>
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">Uses</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Discount given</th>
                <th scope="col" className="px-5 py-2.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const promo = catalogue?.find((p) => p.id === r.promotion_id);
                return (
                  <tr key={r.promotion_id}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-right tabular-nums">{r.uses}</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:w-40" aria-hidden>
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.uses / max) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.discount_cents)}</td>
                    <td className="px-5 py-3">{promo ? <StatusBadge status={displayStatus(promo)} /> : <Badge>Deleted</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function OverridesCard({ rows, onOpen }: { rows?: OverrideRecord[]; onOpen: (r: OverrideRecord) => void }) {
  return (
    <Card>
      <CardHeader title="Manual overrides" icon={PenLine} description="Every manual price change, who made it and why." />
      {!rows ? <CardLoading /> : rows.length === 0 ? (
        <EmptyState icon={CircleCheck} title="No manual overrides" body="Staff haven’t needed to change a calculated price." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                {['Time', 'Staff', 'System', 'Entered', 'Reason'].map((h) => (
                  <th key={h} scope="col" className={cx('px-4 py-2.5 font-semibold', h === 'System' || h === 'Entered' ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  aria-label={`Override ${r.id} on order ${r.order_id} by ${r.staff_name}. Open details`}
                  onClick={() => onOpen(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(r);
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-50 focus-visible:bg-brand-50 focus-visible:outline-none"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatInstant(r.timestamp)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="block font-medium text-slate-900">{r.staff_name}</span>
                    <span className="block text-xs text-slate-500">{r.venue_name}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatMoney(r.original_total_cents)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">{formatMoney(r.new_total_cents)}</td>
                  <td className="min-w-48 px-4 py-3 text-slate-700">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DecisionsCard({ rows, onOpen }: { rows?: Order[]; onOpen: (o: Order) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows?.slice(0, 8);
  return (
    <Card>
      <CardHeader title="Promotion decision history" icon={ScrollText} description="Why each recorded order got the price it did." />
      {!rows || !visible ? <CardLoading /> : rows.length === 0 ? (
        <EmptyState title="No orders recorded yet" body="Record a sale in the simulator to see it here." />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {visible.map((o) => {
              const eligible = o.considered_promotions.filter((c) => c.eligible).length;
              return (
                <li key={o.order_id}>
                  <button
                    type="button"
                    onClick={() => onOpen(o)}
                    className="flex w-full flex-col gap-2 px-5 py-3.5 text-left hover:bg-slate-50 focus-visible:bg-brand-50 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        Order {o.order_id}
                        {!o.seeded && <Badge tone="violet">New</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">{o.venue_name} · {CUSTOMER_TYPE_LABELS[o.customer_type]} · {formatInstant(o.timestamp)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      <Badge>{eligible} eligible</Badge>
                      <Badge tone={o.applied_promotions.length ? 'green' : 'neutral'}>{o.applied_promotions.length ? `${o.applied_promotions.length} applied` : 'None applied'}</Badge>
                      <Badge tone={o.override ? 'amber' : 'neutral'}>{o.override ? 'Override' : 'No override'}</Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > 8 && (
            <div className="border-t border-slate-200 px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
                <ChevronDown className={cx('h-4 w-4 transition-transform', showAll && 'rotate-180')} aria-hidden />
                {showAll ? 'Show fewer' : `Show all ${rows.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function OverrideDetailModal({ record, onClose, onViewOrder }: {
  record: OverrideRecord | null;
  onClose: () => void;
  onViewOrder: () => void;
}) {
  return (
    <Modal
      open={!!record}
      onClose={onClose}
      title={record ? `Override ${record.id}` : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={onViewOrder}>View order {record?.order_id}</Button>
        </>
      }
    >
      {record && (
        <dl className="divide-y divide-slate-100 text-sm">
          <DetailRow label="Time">{formatInstant(record.timestamp)}</DetailRow>
          <DetailRow label="Venue">{record.venue_name}</DetailRow>
          <DetailRow label="Staff">{record.staff_name} ({record.staff_id})</DetailRow>
          <DetailRow label="System price">{formatMoney(record.original_total_cents)}</DetailRow>
          <DetailRow label="Entered price">{formatMoney(record.new_total_cents)}</DetailRow>
          <DetailRow label="Difference">{formatMoney(record.difference_cents)}</DetailRow>
          <DetailRow label="Reason">{record.reason}</DetailRow>
        </dl>
      )}
    </Modal>
  );
}

function OrderDetailModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { products, venues } = useReferenceData();
  return (
    <Modal open={!!order} onClose={onClose} title={order ? `Order ${order.order_id}` : ''} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {order && (
        <dl className="divide-y divide-slate-100 text-sm">
          <DetailRow label="Customer">
            {CUSTOMER_TYPE_LABELS[order.customer_type]}
            {order.member_number && ` · ${order.member_number}`}
            {order.staff_id && ` · ${order.staff_id}`}
          </DetailRow>
          <DetailRow label="Venue">{venueName(order.venue_id, venues)}</DetailRow>
          <DetailRow label="Time">{formatInstant(order.timestamp)} (trading day {order.trading_date})</DetailRow>
          <DetailRow label="Items">{order.items.map((i) => `${products.find((p) => p.product_id === i.product_id)?.name ?? i.product_id} ×${i.quantity}`).join(', ')}</DetailRow>
          <DetailRow label="Promotions considered">
            <ul className="space-y-1">
              {order.considered_promotions.map((c) => (
                <li key={c.promotion_id} className="flex items-start gap-1.5 font-normal">
                  {c.eligible ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
                  <span><span className="font-medium text-slate-900">{c.name}</span> <span className="text-slate-500">· {c.reason}</span></span>
                </li>
              ))}
            </ul>
          </DetailRow>
          <DetailRow label="Applied">{order.applied_promotions.length ? order.applied_promotions.map((a) => a.name).join(' + ') : 'No promotion'}</DetailRow>
          <DetailRow label="Reason"><span className="font-normal text-slate-700">{order.reason}</span></DetailRow>
          <DetailRow label="Price">
            {formatMoney(order.original_total_cents)} → {formatMoney(order.final_total_cents)}
            {order.override && <> → <span className="text-amber-800">{formatMoney(order.override.new_total_cents)} (override)</span></>}
          </DetailRow>
          <DetailRow label="Manual override">
            {order.override ? <span className="text-amber-800">{order.override.staff_name}: “{order.override.reason}”</span> : 'None'}
          </DetailRow>
        </dl>
      )}
    </Modal>
  );
}

