# Trestle Platform API — v2

Integration reference for partner and internal development.

Trestle is our hospitality POS platform. Venues run a till application against it; this API
is the server side. You will be building against a sandbox. There is no running sandbox
server — stub it however suits you. `fixtures.json` contains representative data as the
sandbox would return it.

**Base URL:** `https://api.trestle.example/v2`
**Auth:** `Authorization: Bearer <token>`. Any non-empty token is accepted in sandbox.
**Money:** integer cents, AUD.
**Timestamps:** ISO 8601 with offset.
**Errors:** standard status codes; body is `{ "error": { "code": "...", "message": "..." } }`.
**Rate limit:** 100 req/min per token. `429` with `Retry-After` when exceeded.

---

## Venues

### `GET /venues`

```json
[
  {
    "venue_id": "VEN-0233",
    "name": "The Brass Anchor",
    "state": "SA",
    "timezone": "IANA timezone identifier",
    "trading_hours": { "mon": ["11:00", "23:00"], "…": [] }
  }
]
```

### `GET /venues/{venue_id}`

Same shape, single object.

---

## Products

### `GET /products?venue_id={id}`

```json
[
  {
    "product_id": "PRD-0101",
    "name": "Lager — pint",
    "category": "beverage",
    "price_cents": 1200,
    "tax_code": "GST"
  }
]
```

Prices are per venue. The same `product_id` may carry a different `price_cents` at a
different venue.

---

## Orders

### `POST /orders`

```json
{ "venue_id": "VEN-0233", "staff_id": "STF-11", "channel": "till" }
```

Returns:

```json
{
  "order_id": "ORD-8801",
  "venue_id": "VEN-0233",
  "status": "open",
  "items": [],
  "subtotal_cents": 0,
  "created_at": "2026-09-19T18:42:11+09:30"
}
```

### `POST /orders/{order_id}/items`

```json
{ "product_id": "PRD-0101", "quantity": 2 }
```

Returns the updated order.

### `POST /orders/{order_id}/close`

Transitions `open` → `closed`. An order must be closed before it appears in `/sales`.

---

## Payments

### `POST /payments`

Payments are idempotent on `client_reference`: submitting the same `client_reference`
twice returns the original payment rather than charging again.

| Field | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | |
| `amount_cents` | integer | yes | |
| `method` | string | yes | `card` \| `cash` |
| `client_reference` | string | optional | Client-generated unique reference |

Example request:

```json
{ "order_id": "ORD-8801", "amount_cents": 2400, "method": "card" }
```

Returns:

```json
{
  "payment_id": "PAY-5512",
  "order_id": "ORD-8801",
  "status": "approved",
  "amount_cents": 2400,
  "approved_at": "2026-09-19T18:42:40+09:30",
  "acquirer_reference": "ACQ-99120031"
}
```

### `GET /payments/{payment_id}`

Returns the payment. `status` is one of `approved`, `declined`, `pending`.

### `GET /payments?order_id={id}`

All payment attempts against an order, most recent first.

---

## Sales

### `GET /sales?venue_id={id}&business_date=YYYY-MM-DD`

Line-level sales for a trading day. `business_date` is the venue's trading day, which for
late-trading venues does not align with the calendar date.

```json
[
  {
    "sale_id": "SAL-3301",
    "venue_id": "VEN-0233",
    "business_date": "2026-09-19",
    "order_id": "ORD-8801",
    "product_id": "PRD-0101",
    "quantity": 2,
    "gross_cents": 2400,
    "discount_cents": 0,
    "payment_method": "card",
    "staff_id": "STF-11",
    "voided": false,
    "voided_at": null
  }
]
```

---

## Settlements

### `GET /settlements?venue_id={id}&from=YYYY-MM-DD&to=YYYY-MM-DD`

Card settlement batches from the terminal provider.

```json
[
  {
    "settlement_id": "SET-771",
    "venue_id": "VEN-0233",
    "settlement_date": "2026-09-19",
    "gross_cents": 418250,
    "fee_cents": 5030,
    "net_cents": 413220,
    "batch_reference": "BATCH-20260919-0233"
  }
]
```

`settlement_date` is the date the funds cleared to the venue's account.

---

## Members

### `GET /members/{member_number}`

```json
{
  "member_number": "M-004182",
  "name": "R. Castellano",
  "tier": "gold",
  "discount_pct": 10,
  "active": true
}
```

`404` if not found.

---

## Promotions

### `GET /promotions?venue_id={id}`

```json
[
  {
    "promotion_id": "PRM-21",
    "name": "Happy Hour",
    "type": "percent_off",
    "value": 15,
    "applies_to": { "category": "beverage" },
    "starts_at": "16:00",
    "ends_at": "18:00",
    "days": ["mon", "tue", "wed", "thu", "fri"],
    "priority": 10
  }
]
```

Where two promotions apply to the same line, the one with the higher `priority` wins.

### `POST /promotions`

Same shape without `promotion_id`. Returns the created promotion.

---

## Staff

### `GET /staff?venue_id={id}`

```json
{
  "staff_id": "STF-11",
  "name": "J. Okonjo",
  "role": "casual",
  "permissions": ["sell", "print_receipt"]
}
```

Known permission values: `sell`, `print_receipt`, `void_line`, `override_price`,
`close_shift`, `view_reports`.

---

## Webhooks

The platform can POST `payment.approved` and `payment.failed` to a registered endpoint.
Webhooks are **not** delivered in sandbox.
