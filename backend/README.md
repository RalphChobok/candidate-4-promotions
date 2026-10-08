# Ridgeline Promotions — backend (Python)

## What it does

Ridgeline’s tills apply overlapping promotions unpredictably, so staff type in their own prices and the reports can’t be trusted. This service decides the price of every order in one place, gives the customer the lowest price their promotions allow, and explains the decision in a sentence a bar worker can repeat. Every manual price change needs permission and a reason, and is logged.

## Running it

Needs Python 3.11 or newer.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/uvicorn app.main:app --reload --port 4000   # API on http://localhost:4000/api
.venv/bin/pytest                                        # tests
```

Interactive API docs are at http://localhost:4000/docs. `CORS_ORIGIN` takes a comma-separated list of allowed origins; it defaults to the Vite dev server.

## How to read the code

Start at the top of this list and work down. Each file does one job.

| File | What’s in it |
|---|---|
| `app/main.py` | Every URL the API answers, each one line calling a service. Start here to see what the API can do. |
| `app/models.py` | The shape of each request body, and the validation rules (e.g. “percentage must be between 0 and 100”). |
| `app/services.py` | The actions: create a promotion, price an order, override a price, build a report. |
| `app/engine.py` | **The pricing engine.** `price_order()` works out what an order costs and why. The steps are listed at the top of the file. |
| `app/rules.py` | Whether a promotion is allowed for a sale: venue, day, time window, customer. |
| `app/overlaps.py` | Which promotions could compete with each other. Used for the warnings in the UI. |
| `app/store.py` | Where data lives while the server runs, in plain lists and dicts. |
| `app/seed.py` | Loads `fixtures.json` and converts the fixture promotions into this app’s format. Nothing else. |
| `app/time_utils.py`, `app/money.py` | Small helpers: venue time, trading day, cents and rounding. |
| `tests/` | `test_engine.py` holds the pricing cases with expected prices; `test_api.py` covers overrides and validation. |

All data is plain Python dicts with the same keys as the JSON the API returns, so what you see in the code is what you see in the browser.

There’s no database. Everything is in `Store` and resets when the server restarts. To add a database, replace `Store` with a class that has the same methods; nothing else changes.

## API

All money is integer cents. Errors are always `{ "error": { "code", "message" } }`.

| Method | Path | |
|---|---|---|
| GET | `/api/venues`, `/api/products`, `/api/staff` | Reference data |
| GET | `/api/members/{member_number}` | Member lookup |
| GET | `/api/promotions` | All promotions, each with the active promotions it overlaps (`conflicts`) |
| GET | `/api/promotions/{id}` | One promotion |
| POST | `/api/promotions` | Create |
| PUT | `/api/promotions/{id}` | Replace |
| PATCH | `/api/promotions/{id}/status` | `{ "status": "ACTIVE" \| "INACTIVE" }` |
| POST | `/api/promotions/overlaps?exclude={id}` | Overlaps for an unsaved promotion (the form’s live warning) |
| POST | `/api/promotion-engine/evaluate` | Price an order. Read-only, stores nothing |
| GET | `/api/orders` | Stored orders with their decisions, newest first |
| POST | `/api/orders` | Price and store an order |
| POST | `/api/orders/{order_id}/override` | `{ staff_id, new_total_cents, reason }`. 403 `OVERRIDE_PERMISSION_REQUIRED`, 400 `REASON_REQUIRED`, 404 if no such order |
| GET | `/api/reports/promotions` | Totals and per-promotion uses and discount, from orders actually created |
| GET | `/api/reports/overrides` | Every audit record, newest first, with count and total difference |

## Proposed Trestle API extensions

The promotion model starts from Trestle’s shape and adds:

- `type` (`PERCENTAGE`, `FIXED_PRICE`, `BUNDLE`) and `status` (`ACTIVE`, `INACTIVE`).
- `applies_to`: one of `product_ids`, `categories`, `all`, or `required_items` for fixed-price and bundle offers.
- `venue_rules`: one of `venue_ids` or `all`.
- `customer_rule`: `EVERYONE`, `MEMBER` or `STAFF`.
- `schedule`: days, start and end time, optional start and end date.
- `schedule_overrides`: a different time window at one venue, so per-venue times don’t need a second promotion.
- `allow_stacking` and `stacks_on`.

## Data

The server starts with exactly what `fixtures.json` contains: 6 venues, 12 products, 3 members, 4 staff and 5 promotions. There are no orders or overrides until someone records one in the simulator.

Fixture promotions are converted field for field (`convert_promotion` in `app/seed.py`):

- `percent_off`, `fixed_price` and `bundle_price` become `PERCENTAGE`, `FIXED_PRICE` and `BUNDLE`.
- A bundle list such as `["PRD-0202", "PRD-0202", "PRD-0101", "PRD-0101"]` becomes 2× Parmigiana + 2× Lager.
- Schnitzel Tuesday is $18.00 for the Chicken Schnitzel (`PRD-0201`), as the fixture says. Its normal price is $26.00.
- Every promotion applies at all venues, with no per-venue times, because the fixtures don’t restrict them.
- `stackable` becomes `allow_stacking`. Member Discount is stackable in the fixtures, but it only stacks once a manager picks what it may stack on.
- Who each promotion is for isn’t in the fixtures. It comes from the brief: Member Discount is members only, Staff Discount is staff only, and the rest are for everyone.

## Assumptions

1. **Best single deal means lowest price for the customer**, not highest priority. Priority only breaks exact ties.
2. **Promotions don’t stack** unless a promotion allows stacking and lists the promotion it may stack on. Ray pays $18.00 for his schnitzel. Let Member Discount stack on Schnitzel Tuesday and he pays $16.20.
3. **Fixed-price and bundle offers go first, one complete set at a time.** They only take items when the set beats what those items would otherwise cost. Leftovers are priced on their own.
4. **Times are venue-local.** The fixtures give no timezones, so the time sent is taken as the time at the venue.
5. **The trading day comes from each venue’s trading hours.** The Brass Anchor trades Thursday 11:00–00:30, so a sale at 00:15 Friday is Thursday trading and 00:45 is Friday. Kestrel & Vine closes at midnight, so 00:15 is the next day.
6. **Time windows include the start and exclude the end.** `23:59` means the end of the day.
7. **An inactive member is a regular customer.** A staff id takes precedence over a member number.
8. **Percentages round half up per item**, and nothing goes below zero. Line totals must add up to the order total.
9. **An override changes the order total, needs `override_price` and a reason**, and writes an audit record first.

## What I cut, and why

Authentication, a real database, payments, Trestle integration, inventory, webhooks, Docker and deployment are out of scope for a pricing prototype. Trestle allows a different price per venue; this uses the list price everywhere.

## Questions I’d ask Tania, and the default I chose

| Question | Default |
|---|---|
| Should a member ever get 10% on top of a deal like Schnitzel Tuesday? | No. One promotion per item, configurable per promotion |
| “Best deal”: best for the customer, or best for the business? | Best for the customer |
| When does a late-trading venue’s day end? | When its trading hours say it closes |
| Which timezone is each venue in? | Times are taken as venue-local |
| Is a pot part of the $18 schnitzel deal? The brief says yes; the fixtures say schnitzel only | Fixtures: schnitzel only |
| Do lapsed members keep their discount? | No |
| Who can override prices, and is a reason always required? | Staff with `override_price`; a reason is always required |
| Can staff discount stack with happy hour? | No |
