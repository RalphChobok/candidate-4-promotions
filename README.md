# Ridgeline Promotions prototype

A pricing engine and manager tools for Ridgeline Hotels’ overlapping promotions.

The README includes an overview of my approach, how to run the project, and a few notes on the decisions I made and what I chose to leave out given the time constraint.

- [backend/](backend/): Python (FastAPI). Owns every pricing decision. Seeded from `docs/04_fixtures.json`.
- [frontend/](frontend/): React + Vite UI for promotions, the till simulator and reports. It holds no data of its own.

## My approach

Tania described three problems. Nobody can predict what the till will charge, so staff type in their own prices and the promotion reports become fiction. Every promotion change waits three days on a support ticket. And one bistro wants a happy hour the system can’t express. I treated the first problem as the real one: if staff trust the till, they stop overriding it, and the reporting becomes true by itself.

**One place decides the price.** All pricing happens in a single engine on the backend (`backend/app/engine.py`). The screens never calculate a discount; they send the order and show what comes back. There is one answer, and it’s the same everywhere.

**Every price comes with its reason.** For each order, the engine reports every promotion it considered: the one that won, the ones that lost and how much they would have saved, and the ones that didn’t apply and why (“outside 16:00–18:00”, “member is inactive”). A bar worker can read the answer to a customer instead of arguing with the till.

**A clear, predictable rule for conflicts.** Each item gets the lowest price its promotions allow, and promotions don’t stack unless a manager says so. That matches Tania’s “they only ever get the best single deal”. Ray pays $18.00 for his schnitzel, not $16.20. Priority only breaks exact ties.

**Promotions are settings, not code.** Managers create, edit, duplicate and switch off promotions in the app, with an overlap warning before saving. Per-venue times (the bistro’s happy hour) and stacking are options on a promotion, so the requests that used to need a ticket become a form.

**Overrides are allowed, but never invisible.** Staff can still change a price, because sometimes the customer has to be served. It needs the `override_price` permission and a reason, and every override is written to an audit log. Reports show how often it happens and how far prices moved.

**Only the supplied data.** The app runs on `docs/04_fixtures.json` and nothing else: no invented venues, products or sales history. Where the fixtures leave a gap (no timezones, Schnitzel Tuesday without the pot the brief mentions), I chose a default, wrote it down in [backend/README.md](backend/README.md), and listed it as a question for Tania.

**Deliberately cut:** authentication, a database, payments and the live Trestle integration. They matter in production, but they don’t help show whether the pricing rules are right. Storage sits behind one class (`backend/app/store.py`), so a database can replace it later.

## Run it

Two terminals:

```bash
# 1. API on http://localhost:4000/api
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 4000

# 2. UI on http://localhost:5173
cd frontend
npm install && npm run dev
```

The frontend proxies `/api` to port 4000. Run the backend tests with `cd backend && .venv/bin/pytest`.

See [backend/README.md](backend/README.md) for a guide to reading the code, the API, the assumptions and the questions for the customer.
