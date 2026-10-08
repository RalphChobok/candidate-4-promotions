import type { Member, Product, Promotion, PromotionConflict, PromotionInput, PromotionListItem, PromotionStatus, Staff, Venue } from '../types';
import { http, patch, post, put } from './client';

export const listPromotions = () => http<PromotionListItem[]>('/promotions');
export const getPromotion = (id: string) => http<Promotion>(`/promotions/${id}`);
export const createPromotion = (input: PromotionInput) => http<Promotion>('/promotions', post(input));
export const updatePromotion = (id: string, input: PromotionInput) => http<Promotion>(`/promotions/${id}`, put(input));
export const setPromotionStatus = (id: string, status: PromotionStatus) => http<Promotion>(`/promotions/${id}/status`, patch({ status }));

/** Which active promotions an unsaved configuration would overlap with. */
export const checkOverlaps = (input: PromotionInput, excludeId?: string) =>
  http<PromotionConflict[]>(`/promotions/overlaps${excludeId ? `?exclude=${encodeURIComponent(excludeId)}` : ''}`, post(input));

/** Duplicate = read the original and create an inactive copy. */
export async function duplicatePromotion(id: string): Promise<Promotion> {
  const { id: _id, created_at: _c, updated_at: _u, ...input } = await getPromotion(id);
  return createPromotion({ ...input, name: `${input.name} (copy)`, status: 'INACTIVE' });
}

export const listVenues = () => http<Venue[]>('/venues');
export const listProducts = () => http<Product[]>('/products');
export const listStaff = () => http<Staff[]>('/staff');
export const getMember = (memberNumber: string) => http<Member>(`/members/${encodeURIComponent(memberNumber)}`);
