import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Ellipsis, Inbox, LoaderCircle, RotateCcw, X } from 'lucide-react';
import type { DisplayStatus } from '../types';
import { STATUS_LABELS } from '../lib/format';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

// ---------------------------------------------------------------------------
// Buttons

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  warning: 'bg-amber-600 text-white shadow-sm hover:bg-amber-700',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-[15px]',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{children}</div>;
}

export function CardHeader({ title, description, actions, icon: Icon, id }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: IconType;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow, badge }: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-sm">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 max-w-2xl text-[15px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint, loading }: {
  label: string;
  value: ReactNode;
  icon: IconType;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="rounded-lg bg-slate-100 p-2 text-slate-500">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-100" aria-label="Loading" />
      ) : (
        <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Badges

type Tone = 'neutral' | 'green' | 'amber' | 'blue' | 'violet' | 'red';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_STYLES: Record<DisplayStatus, { tone: Tone; dot: string }> = {
  active: { tone: 'green', dot: 'bg-emerald-500' },
  scheduled: { tone: 'blue', dot: 'bg-brand-500' },
  inactive: { tone: 'neutral', dot: 'border border-slate-400 bg-transparent' },
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <Badge tone={style.tone}>
      <span className={cx('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// States

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('h-5 w-5 animate-spin text-brand-600', className)} aria-hidden />;
}

export function LoadingBlock({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx('flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500', className)}>
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({ title, body, action, icon: Icon = Inbox }: { title: string; body?: ReactNode; action?: ReactNode; icon?: IconType }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="rounded-full bg-slate-100 p-3 text-slate-400">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-4 font-medium text-slate-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = 'Something went wrong' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="rounded-full bg-red-50 p-3 text-red-500">
        <CircleAlert className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-4 font-medium text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

type AlertTone = 'info' | 'warning' | 'error' | 'success';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

export function Alert({ tone = 'info', icon: Icon, title, children, className, action }: {
  tone?: AlertTone;
  icon?: IconType;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm', ALERT_TONES[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cx(!!title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms

export const inputClass = cx(
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm',
  'placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
  'disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400',
);

export function Field({ label, htmlFor, hint, error, optional, children, className }: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="font-normal text-slate-400"> (optional)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-sm text-red-600" id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Toggle({ checked, onChange, id, label, describedBy }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  label?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        checked ? 'bg-brand-600' : 'bg-slate-300',
      )}
    >
      <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

function centsToText(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

/** Dollar input that stores integer cents. */
export function MoneyInput({ id, valueCents, onChange, placeholder, invalid, describedBy, autoFocus }: {
  id: string;
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(() => centsToText(valueCents));
  const emitted = useRef(valueCents);

  useEffect(() => {
    if (valueCents !== emitted.current) {
      emitted.current = valueCents;
      setText(centsToText(valueCents));
    }
  }, [valueCents]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500" aria-hidden>$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        className={cx(inputClass, 'pl-7 tabular-nums')}
        value={text}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.]/g, '');
          setText(next);
          const n = Number.parseFloat(next);
          const cents = next.trim() === '' || Number.isNaN(n) ? null : Math.round(n * 100);
          emitted.current = cents;
          onChange(cents);
        }}
        onBlur={() => setText(centsToText(emitted.current))}
      />
    </div>
  );
}

export function CheckboxChip({ checked, onChange, children, name }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  name?: string;
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
        'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-1',
        checked ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <input type="checkbox" name={name} className="h-4 w-4 rounded border-slate-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Modal (native <dialog> gives focus trapping and Escape handling)

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40',
        size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Close">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Floating panels (menus, popovers). Rendered in a portal so table overflow
// doesn't clip them.

function useFloating(open: boolean, close: () => void, align: 'start' | 'end') {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const r = anchor.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      let left = align === 'end' ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = r.bottom + 6;
      if (top + height > window.innerHeight - 8 && r.top - height - 6 > 8) top = r.top - height - 6;
      setStyle({ position: 'fixed', top, left, visibility: 'visible' });
    };
    place();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, close, align]);

  return { anchorRef, panelRef, style };
}

export interface MenuItem {
  label: string;
  icon?: IconType;
  onSelect: () => void;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { anchorRef, panelRef, style } = useFloating(open, close, 'end');

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, panelRef]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (index + 1) % nodes.length : (index - 1 + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Ellipsis className="h-5 w-5" aria-hidden />
      </button>
      {open && createPortal(
        <div ref={panelRef} role="menu" aria-label={label} style={style} onKeyDown={onKeyDown} className="z-50 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon && <item.icon className="h-4 w-4 text-slate-400" aria-hidden />}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export function Popover({ trigger, triggerLabel, triggerClassName, children, align = 'start', panelClassName = 'w-80' }: {
  trigger: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { anchorRef, panelRef, style } = useFloating(open, close, align);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', triggerClassName)}
      >
        {trigger}
      </button>
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label={triggerLabel} style={style} className={cx('z-50 rounded-xl border border-slate-200 bg-white text-sm shadow-lg', panelClassName)}>
          {typeof children === 'function' ? children(close) : children}
        </div>,
        document.body,
      )}
    </>
  );
}
