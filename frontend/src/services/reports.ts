import type { OverrideReport, PromotionReport } from '../types';
import { http } from './client';

export const getPromotionReport = () => http<PromotionReport>('/reports/promotions');
export const getOverrideReport = () => http<OverrideReport>('/reports/overrides');
