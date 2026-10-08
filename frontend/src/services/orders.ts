import type { Order, OverrideRequest, PricedOrder, PricingRequest } from '../types';
import { http, post } from './client';

/** Ask the promotion engine to price an order. Read-only: nothing is stored. */
export const evaluateOrder = (request: PricingRequest) => http<PricedOrder>('/promotion-engine/evaluate', post(request));

/** Ring up an order: the backend prices it and stores the full decision. */
export const createOrder = (request: PricingRequest) => http<Order>('/orders', post(request));

export const listOrders = () => http<Order[]>('/orders');

/** Manual override. Needs override_price permission and a reason; always audited. */
export const overrideOrder = (orderId: string, request: OverrideRequest) => http<Order>(`/orders/${orderId}/override`, post(request));

