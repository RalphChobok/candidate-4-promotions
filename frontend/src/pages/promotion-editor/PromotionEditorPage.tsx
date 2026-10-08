import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import type { Promotion, PromotionConflict, PromotionInput, PromotionStatus } from '../../types';
import { useReferenceData } from '../../context/ReferenceData';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/errors';
import { CUSTOMER_RULE_LABELS, describeAppliesTo, describeDays, describeVenues, displayStatus, formatDate, formatWindowString, venueName } from '../../lib/format';
import { checkOverlaps, createPromotion, getPromotion, listPromotions, updatePromotion } from '../../services/promotions';
import { Alert, Button, buttonClass, Card, ErrorState, LoadingBlock, Modal, PageHeader } from '../../components/ui';
import { emptyForm, formFromPromotion, toInput, validateForm, type FormErrors, type FormState } from './formState';
import { PromotionForm } from './PromotionForm';
import { offerHeadline, PromotionPreview, scheduleLines } from './PromotionPreview';

type OverlapState = 'idle' | 'checking' | 'done' | 'incomplete';

function useLiveOverlaps(input: PromotionInput, valid: boolean, excludeId?: string) {
  const [state, setState] = useState<{ conflicts: PromotionConflict[]; status: OverlapState }>({ conflicts: [], status: 'idle' });
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!valid) {
      setState({ conflicts: [], status: 'incomplete' });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, status: 'checking' }));
    const timer = window.setTimeout(() => {
      checkOverlaps(input, excludeId).then(
        (conflicts) => !cancelled && setState({ conflicts, status: 'done' }),
        () => !cancelled && setState({ conflicts: [], status: 'incomplete' }),
      );
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, excludeId]);
  return state;
}

export function PromotionEditorPage({ id }: { id?: string }) {
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { venues, products } = useReferenceData();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [existing, setExisting] = useState<Promotion | null>(null);
  const [allPromotions, setAllPromotions] = useState<Promotion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState<PromotionStatus | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const input = useMemo(() => toInput(form), [form]);
  const formValid = Object.keys(validateForm(form)).length === 0;
  const overlaps = useLiveOverlaps(input, formValid, id);

  useEffect(() => {
    setLoadError(null);
    listPromotions().then(setAllPromotions, () => setAllPromotions([]));
    if (!id) return;
    getPromotion(id).then(
      (p) => {
        setExisting(p);
        setForm(formFromPromotion(p));
      },
      (e) => setLoadError(errorMessage(e)),
    );
  }, [id, loadNonce]);

  useEffect(() => {
    if (submitted) setErrors(validateForm(form));
  }, [form, submitted]);

  const isActive = existing?.status === 'ACTIVE';

  const requestSave = (status: PromotionStatus) => {
    setSubmitted(true);
    const v = validateForm(form);
    setErrors(v);
    if (Object.keys(v).length) {
      setSaveError('Some details need attention before this can be saved.');
      return;
    }
    setSaveError(null);
    if (status === 'INACTIVE') void save('INACTIVE');
    else setConfirming(true);
  };

  const save = async (status: PromotionStatus) => {
    setSaving(status);
    setSaveError(null);
    try {
      const body = { ...input, status };
      const saved = id ? await updatePromotion(id, body) : await createPromotion(body);
      const shown = displayStatus(saved);
      const suffix =
        shown === 'scheduled' && saved.schedule.start_date ? ` It will start on ${formatDate(saved.schedule.start_date)}.`
          : shown === 'inactive' ? ' It’s switched off and won’t apply until you switch it on.'
            : ' It applies from the next order at the till.';
      toast.show(`Promotion saved successfully.${suffix}`);
      navigate('/promotions');
    } catch (e) {
      setSaveError(errorMessage(e));
      setConfirming(false);
    } finally {
      setSaving(null);
    }
  };

  if (isEdit && loadError) {
    return (
      <Card>
        <ErrorState title="Couldn’t open this promotion" message={loadError} onRetry={() => setLoadNonce((n) => n + 1)} />
      </Card>
    );
  }
  if (isEdit && !existing) return <LoadingBlock label="Loading promotion…" />;

  const status = existing ? displayStatus(existing) : 'inactive';

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/promotions" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Promotions
          </Link>
        }
        title={isEdit ? 'Edit promotion' : 'Create promotion'}
        subtitle={isEdit
          ? `Update the rules for ${existing!.name}. Changes apply from the next order at the till.`
          : 'Set up the offer, who it’s for, and where and when it runs.'}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <PromotionForm form={form} onChange={setForm} errors={errors} promotions={allPromotions} selfId={id} />
          <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-5 sm:shadow-sm">
            {saveError && <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-red-700"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />{saveError}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link to="/promotions" className={buttonClass('ghost')}>Cancel</Link>
              <Button onClick={() => requestSave('INACTIVE')} loading={saving === 'INACTIVE'} disabled={!!saving}>
                {saving === 'INACTIVE' ? 'Saving…' : isActive ? 'Save and switch off' : 'Save, switched off'}
              </Button>
              <Button variant="primary" onClick={() => requestSave('ACTIVE')} disabled={!!saving}>
                {isActive ? 'Save changes' : 'Save and activate'}
              </Button>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20">
          <PromotionPreview input={input} status={status} conflicts={overlaps.conflicts} overlapState={overlaps.status} />
        </aside>
      </div>

      <Modal
        open={confirming}
        onClose={() => !saving && setConfirming(false)}
        title={isActive ? `Save changes to ${input.name}?` : `Activate ${input.name}?`}
        description={isActive ? 'This promotion is live. Changes apply from the next order at the till.' : 'Once active, the till applies this promotion automatically.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={!!saving}>Cancel</Button>
            <Button variant="primary" loading={!!saving} onClick={() => void save('ACTIVE')}>
              {saving ? 'Saving…' : isActive ? 'Save changes' : 'Activate promotion'}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Offer</dt>
          <dd className="font-medium text-slate-900">{offerHeadline(input)} · {describeAppliesTo(input, products)}</dd>
          <dt className="text-slate-500">Customers</dt>
          <dd className="font-medium text-slate-900">{CUSTOMER_RULE_LABELS[input.customer_rule]}</dd>
          <dt className="text-slate-500">Venues</dt>
          <dd className="font-medium text-slate-900">{describeVenues(input, venues)}</dd>
          <dt className="text-slate-500">Schedule</dt>
          <dd className="font-medium text-slate-900">
            {scheduleLines(input, (vid) => venueName(vid, venues)).map((l) => <span key={l} className="block">{l}</span>)}
          </dd>
          {input.schedule.start_date && (
            <>
              <dt className="text-slate-500">Starts</dt>
              <dd className="font-medium text-slate-900">{formatDate(input.schedule.start_date)}</dd>
            </>
          )}
          <dt className="text-slate-500">Stacking</dt>
          <dd className="font-medium text-slate-900">{input.allow_stacking ? 'Enabled' : 'Disabled'}</dd>
        </dl>
        {overlaps.conflicts.length > 0 && (
          <Alert tone="warning" icon={TriangleAlert} className="mt-5" title="Overlaps with active promotions">
            <ul className="mt-1 space-y-0.5">
              {overlaps.conflicts.map((c) => (
                <li key={c.promotion_id}>
                  {c.name}: {c.venue_ids.length === 1 ? venueName(c.venue_ids[0], venues) : `${c.venue_ids.length} venues`}, {describeDays(c.days_of_week)} {formatWindowString(c.window)}
                </li>
              ))}
            </ul>
            <p className="mt-2">Where both are eligible, the engine gives each item whichever price is lowest.</p>
          </Alert>
        )}
      </Modal>
    </>
  );
}
