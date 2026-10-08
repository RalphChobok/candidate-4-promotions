"""The web API. Each route reads the request, calls one service, returns JSON.

Run with:  uvicorn app.main:app --reload --port 4000
"""

import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import seed, services
from .models import OrderIn, OverrideIn, PromotionIn, StatusIn
from .services import ApiError


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_app(now=utc_now) -> FastAPI:
    """Build the app with a fresh in-memory store holding only the fixture data."""
    store = seed.build_store(now())

    app = FastAPI(title="Ridgeline Promotions API")
    app.state.store = store
    origins = os.environ.get("CORS_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

    # Errors are always {"error": {"code", "message"}} -------------------

    @app.exception_handler(ApiError)
    async def api_error(_: Request, error: ApiError):
        return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message}})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError):
        first = error.errors()[0]
        message = str(first["msg"]).removeprefix("Value error, ")
        field = ".".join(str(part) for part in first["loc"] if part != "body")
        if field and first["type"] != "value_error":
            message = f"{message} ({field})"
        return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": message}})

    @app.exception_handler(404)
    async def unknown_route(_: Request, __):
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "No such endpoint"}})

    # Reference data ------------------------------------------------------

    @app.get("/api/venues")
    def venues():
        return store.venues

    @app.get("/api/products")
    def products():
        return store.products

    @app.get("/api/staff")
    def staff():
        return store.staff

    @app.get("/api/members/{member_number}")
    def member(member_number: str):
        found = store.get_member(member_number)
        if not found:
            raise services.not_found(f"Member {member_number}")
        return found

    # Promotions ----------------------------------------------------------

    @app.get("/api/promotions")
    def list_promotions():
        return services.list_promotions(store)

    @app.post("/api/promotions/overlaps")
    def check_overlaps(body: PromotionIn, exclude: str | None = None):
        """Overlaps for a promotion that hasn't been saved yet (the form's live warning)."""
        return services.overlaps_for(store, {**body.to_dict(), "id": exclude})

    @app.get("/api/promotions/{promotion_id}")
    def get_promotion(promotion_id: str):
        return services.get_promotion(store, promotion_id)

    @app.post("/api/promotions", status_code=201)
    def create_promotion(body: PromotionIn):
        return services.create_promotion(store, body.to_dict(), now())

    @app.put("/api/promotions/{promotion_id}")
    def update_promotion(promotion_id: str, body: PromotionIn):
        return services.update_promotion(store, promotion_id, body.to_dict(), now())

    @app.patch("/api/promotions/{promotion_id}/status")
    def set_status(promotion_id: str, body: StatusIn):
        return services.set_promotion_status(store, promotion_id, body.status, now())

    # Pricing and orders ------------------------------------------------

    @app.post("/api/promotion-engine/evaluate")
    def evaluate(body: OrderIn):
        """Price an order. Read-only: nothing is stored."""
        return services.evaluate(store, body.to_dict())

    @app.get("/api/orders")
    def list_orders():
        return services.list_orders(store)

    @app.post("/api/orders", status_code=201)
    def create_order(body: OrderIn):
        return services.create_order(store, body.to_dict(), now())

    @app.post("/api/orders/{order_id}/override")
    def override(order_id: str, body: OverrideIn):
        return services.override_order(store, order_id, body.staff_id, body.new_total_cents, body.reason, now())

    # Reports -------------------------------------------------------------

    @app.get("/api/reports/promotions")
    def promotion_report():
        return services.promotion_report(store)

    @app.get("/api/reports/overrides")
    def override_report():
        return services.override_report(store)

    return app


app = create_app()
