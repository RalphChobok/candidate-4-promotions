// Venues, products and staff: small lists every screen needs, loaded once from the API.

import { createContext, useContext, type ReactNode } from 'react';
import type { Product, Staff, Venue } from '../types';
import { listProducts, listStaff, listVenues } from '../services/promotions';
import { useAsync } from '../hooks/useAsync';
import { ErrorState, LoadingBlock } from '../components/ui';

interface ReferenceData {
  venues: Venue[];
  products: Product[];
  staff: Staff[];
}

const ReferenceDataContext = createContext<ReferenceData | null>(null);

export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const { data, error, reload } = useAsync(
    () => Promise.all([listVenues(), listProducts(), listStaff()]).then(([venues, products, staff]) => ({ venues, products, staff })),
    [],
  );
  if (error) return <ErrorState title="Couldn’t load venues and products" message={error} onRetry={reload} />;
  if (!data) return <LoadingBlock label="Loading Ridgeline data…" />;
  return <ReferenceDataContext.Provider value={data}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceData(): ReferenceData {
  const ctx = useContext(ReferenceDataContext);
  if (!ctx) throw new Error('useReferenceData must be used inside ReferenceDataProvider');
  return ctx;
}
