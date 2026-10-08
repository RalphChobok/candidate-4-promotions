# Ridgeline Promotions — frontend

React + TypeScript + Vite + Tailwind CSS. All data comes from the backend in [../backend](../backend). There is no mock data in the frontend.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (needs the backend on :4000)
npm run build        # type-check + production build
```

In development, Vite proxies `/api` to `http://localhost:4000`. To call a backend elsewhere, set `VITE_API_URL` (see `.env.example`).

## Screens

| Route | Screen | API used |
|---|---|---|
| `/promotions` | Promotions table with overlap warnings, switch on/off, duplicate | `GET /promotions`, `PATCH /promotions/:id/status`, `POST /promotions`, `GET /reports/overrides` |
| `/promotions/new`, `/promotions/:id/edit` | Promotion form with live preview and overlap check | `GET/POST/PUT /promotions`, `POST /promotions/overlaps` |
| `/simulator` | Till simulator: price an order, see every promotion considered and why, record the sale, override with a reason | `POST /promotion-engine/evaluate`, `POST /orders`, `POST /orders/:id/override`, `GET /members/:n` |
| `/reports` | Promotion usage, override log, per-order decision history | `GET /reports/promotions`, `GET /reports/overrides`, `GET /orders` |

The staff member in the top right is the person using the till. Their `staff_id` is sent with overrides, and the backend rejects anyone without `override_price` (try J. Okonjo).

## Demo flow

1. **Promotions**: the five promotions from the fixtures. Each shows **Potential overlap**; click it to see what it competes with.
2. **Simulator**: The Brass Anchor, a Tuesday, 6:00 PM, Member `M-004182`, one Chicken Schnitzel → $18.00. The explanation says Member Discount would only have saved $2.60.
3. **Override price** with a reason. This records the sale and writes an audit record.
4. **Reports**: starts empty; the order and the override from steps 2–3 appear here.

## Structure

```
src/services/   the only code that talks to the API (client.ts, promotions.ts, orders.ts, reports.ts)
src/types.ts    mirrors the backend's response shapes (snake_case, integer cents)
src/pages/      the four screens
src/lib/        display formatting
src/context/    reference data, current staff member, toasts
```

The frontend never calculates a discount. It sends orders to the engine and displays what comes back.
