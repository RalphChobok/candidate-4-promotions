# Ridgeline Promotions prototype

A pricing engine and manager tools for Ridgeline Hotels’ overlapping promotions.

- [backend/](backend/): Python (FastAPI). Owns every pricing decision. Seeded from `docs/04_fixtures.json`.
- [frontend/](frontend/): React + Vite UI for promotions, the till simulator and reports. It holds no data of its own.

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
