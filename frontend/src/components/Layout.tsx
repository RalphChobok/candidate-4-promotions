import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Calculator, ChartColumn, Check, ChevronDown, Menu as MenuIcon, Plus, Tag, X } from 'lucide-react';
import { useCurrentUser } from '../context/UserContext';
import { ReferenceDataProvider } from '../context/ReferenceData';
import { buttonClass, cx, Popover } from './ui';

const NAV = [
  { to: '/promotions', label: 'Promotions', icon: Tag },
  { to: '/simulator', label: 'Simulator', icon: Calculator },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
];

function Logo() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700" aria-hidden>
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <path d="M5 24l8-11 4.5 6.5L21 15l6 9z" fill="white" />
      </svg>
    </span>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col p-4">
      <Link to="/promotions/new" className={buttonClass('primary', 'md', 'w-full')}>
        <Plus className="h-4 w-4" aria-hidden />
        Create promotion
      </Link>
      <nav aria-label="Main" className="mt-6 space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {({ isActive }) => (
              <>
                <Icon className={cx('h-4 w-4', isActive ? 'text-brand-600' : 'text-slate-400')} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <p className="font-medium text-slate-800">How promotions combine</p>
        <p className="mt-1">Promotions don’t stack unless a promotion allows it. The engine gives each item its lowest price and records why.</p>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, users, setUserId } = useCurrentUser();
  if (!user) return <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />;
  const initials = user.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Popover
      align="end"
      panelClassName="w-72"
      triggerLabel={`Using the till as ${user.name}. Switch staff member`}
      triggerClassName="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-100"
      trigger={
        <>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700" aria-hidden>{initials}</span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-900">{user.name}</span>
            <span className="block text-xs capitalize leading-tight text-slate-500">{user.role}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
        </>
      }
    >
      {(close) => (
        <div className="p-2">
          <p className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-slate-500">Using the till as</p>
          {users.map((u) => (
            <button
              key={u.staff_id}
              type="button"
              onClick={() => {
                setUserId(u.staff_id);
                close();
              }}
              aria-pressed={u.staff_id === user.staff_id}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                {u.staff_id === user.staff_id && <Check className="h-4 w-4 text-brand-600" aria-hidden />}
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-900">{u.name}</span>
                <span className="block text-xs capitalize text-slate-500">{u.role} · {u.staff_id}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {u.permissions.includes('override_price') ? 'Can override prices' : 'Cannot override prices'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-sm shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
        <button
          type="button"
          className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileOpen(true)}
        >
          <MenuIcon className="h-5 w-5" aria-hidden />
        </button>
        <Link to="/promotions" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Logo />
          <span className="text-[15px] font-semibold text-slate-900">
            Ridgeline <span className="font-normal text-slate-500">Promotions</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <UserMenu />
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
          <SidebarContent />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden />
            <aside id="mobile-nav" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
              <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                <span className="font-semibold text-slate-900">Menu</span>
                <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="flex-1">
                <SidebarContent />
              </div>
            </aside>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-7xl">
            <ReferenceDataProvider>
              <Outlet />
            </ReferenceDataProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
