"""What the API can do. Each function is one action, called by a route in main.py.

Routes stay thin; the rules for promotions, orders, overrides and reports live
here. Pricing itself is delegated to engine.price_order.
"""

import copy
from datetime import datetime

from .engine import PricingError, price_order
from .overlaps import find_overlaps
from .store import Store


class ApiError(Exception):
    """Turned into {"error": {"code", "message"}} with this status code by main.py."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _wall_clock(timestamp: str) -> datetime:
    """For sorting: the time as written, ignoring any offset."""
    return datetime.fromisoformat(timestamp).replace(tzinfo=None)


def not_found(what: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{what} not found")


# ---------------------------------------------------------------------------
# Promotions

def list_promotions(store: Store) -> list[dict]:
    """Every promotion, each with the active promotions it overlaps."""
    result = []
    for promotion in store.promotions.values():
        conflicts = overlaps_for(store, promotion) if promotion["status"] == "ACTIVE" else []
        result.append({**copy.deepcopy(promotion), "conflicts": conflicts})
    return result


def get_promotion(store: Store, promotion_id: str) -> dict:
    promotion = store.promotions.get(promotion_id)
    if not promotion:
        raise not_found(f"Promotion {promotion_id}")
    return copy.deepcopy(promotion)


def create_promotion(store: Store, data: dict, now: str) -> dict:
    _check_references(store, data)
    return store.save_promotion({"id": store.new_promotion_id(), **data, "created_at": now, "updated_at": now})


def update_promotion(store: Store, promotion_id: str, data: dict, now: str) -> dict:
    existing = get_promotion(store, promotion_id)
    _check_references(store, data, self_id=promotion_id)
    return store.save_promotion({"id": promotion_id, **data, "created_at": existing["created_at"], "updated_at": now})


def set_promotion_status(store: Store, promotion_id: str, status: str, now: str) -> dict:
    promotion = get_promotion(store, promotion_id)
    return store.save_promotion({**promotion, "status": status, "updated_at": now})


def overlaps_for(store: Store, promotion: dict) -> list[dict]:
    return find_overlaps(promotion, list(store.promotions.values()), store.products, store.venues)


def _check_references(store: Store, data: dict, self_id: str | None = None) -> None:
    """Ids in a promotion must exist. (Pydantic checks the shape; this checks the data.)"""
    product_ids = {p["product_id"] for p in store.products}
    venue_ids = {v["venue_id"] for v in store.venues}
    applies_to = data["applies_to"]
    used_products = applies_to.get("product_ids", []) + [r["product_id"] for r in applies_to.get("required_items", [])]
    used_venues = data["venue_rules"].get("venue_ids", []) + [o["venue_id"] for o in data["schedule_overrides"]]

    for product_id in used_products:
        if product_id not in product_ids:
            raise ApiError(400, "VALIDATION_ERROR", f"Unknown product {product_id}")
    for venue_id in used_venues:
        if venue_id not in venue_ids:
            raise ApiError(400, "VALIDATION_ERROR", f"Unknown venue {venue_id}")
    for promotion_id in data["stacks_on"]:
        if promotion_id == self_id or promotion_id not in store.promotions:
            raise ApiError(400, "VALIDATION_ERROR", f"A promotion can only stack on another existing promotion ({promotion_id})")


# ---------------------------------------------------------------------------
# Orders

def evaluate(store: Store, order: dict) -> dict:
    """Price an order without storing anything."""
    try:
        return price_order(order, store.catalog())
    except PricingError as error:
        raise ApiError(error.status, error.code, error.message) from None


def create_order(store: Store, order: dict, now: str, seeded: bool = False) -> dict:
    """Price an order and store it with its full decision."""
    priced = evaluate(store, order)
    return store.save_order({
        **priced,
        "order_id": store.new_order_id(),
        "timestamp": order["timestamp"],
        "member_number": order.get("member_number"),
        "staff_id": order.get("staff_id"),
        "items": order["items"],
        "created_at": now,
        "seeded": seeded,
    })


def list_orders(store: Store) -> list[dict]:
    """Newest first."""
    orders = copy.deepcopy(list(store.orders.values()))
    return sorted(orders, key=lambda o: (_wall_clock(o["timestamp"]), o["order_id"]), reverse=True)


def override_order(store: Store, order_id: str, staff_id: str, new_total_cents: int, reason: str | None,
                   now: str, seeded: bool = False) -> dict:
    """Manually change an order's total. Needs override_price and a reason; always audited."""
    order = store.orders.get(order_id)
    if not order:
        raise not_found(f"Order {order_id}")
    staff = store.get_staff(staff_id)
    if not staff:
        raise ApiError(404, "STAFF_NOT_FOUND", f"Unknown staff member {staff_id}")
    if "override_price" not in staff["permissions"]:
        raise ApiError(403, "OVERRIDE_PERMISSION_REQUIRED", f"{staff['name']} doesn’t have permission to override prices")
    if not reason or len(reason.strip()) < 3:
        raise ApiError(400, "REASON_REQUIRED", "A reason of at least three characters is required")
    if order["override"]:
        raise ApiError(409, "ALREADY_OVERRIDDEN", "This order already has a manual override")

    record = {
        "id": store.new_override_id(),
        "order_id": order_id,
        "staff_id": staff_id,
        "staff_name": staff["name"],
        "venue_id": order["venue_id"],
        "venue_name": order["venue_name"],
        "original_total_cents": order["final_total_cents"],
        "new_total_cents": new_total_cents,
        "difference_cents": new_total_cents - order["final_total_cents"],
        "reason": reason.strip(),
        "timestamp": now,
        "seeded": seeded,
    }
    # The audit record is written first, so an override can never exist without one.
    store.add_override(record)
    return store.save_order({**order, "override": record})


# ---------------------------------------------------------------------------
# Reports (only from orders actually created; nothing invented)

def promotion_report(store: Store) -> dict:
    orders = list(store.orders.values())
    by_promotion: dict[str, dict] = {}
    for order in orders:
        for applied in order["applied_promotions"]:
            row = by_promotion.setdefault(applied["promotion_id"], {
                "promotion_id": applied["promotion_id"], "name": applied["name"], "uses": 0, "discount_cents": 0,
            })
            row["uses"] += 1
            row["discount_cents"] += applied["saving_cents"]
    return {
        "total_orders": len(orders),
        "orders_with_promotion": sum(1 for o in orders if o["applied_promotions"]),
        "total_discount_cents": sum(o["total_saving_cents"] for o in orders),
        "promotions": sorted(by_promotion.values(), key=lambda r: (-r["uses"], r["promotion_id"])),
    }


def override_report(store: Store) -> dict:
    records = sorted(copy.deepcopy(store.overrides), key=lambda r: (_wall_clock(r["timestamp"]), r["id"]), reverse=True)
    return {
        "count": len(records),
        "total_difference_cents": sum(r["difference_cents"] for r in records),
        "records": records,
    }
