"""Starting data: exactly what's in fixtures.json, nothing added.

Venues, products, members and staff are loaded as they are. Promotions are
converted from Trestle's format into this app's format (see `convert_promotion`),
keeping every value the fixtures give. No orders or overrides exist until
someone records them.
"""

import json
from pathlib import Path

from .store import Store

FIXTURES = json.loads((Path(__file__).parent / "fixtures.json").read_text())

# Trestle's promotion types → this app's types.
TYPES = {"percent_off": "PERCENTAGE", "fixed_price": "FIXED_PRICE", "bundle_price": "BUNDLE"}

# Fixtures don't say who each promotion is for. The brief does:
# "Members get ten percent off everything" and "Staff get thirty percent".
CUSTOMER_RULES = {"Member Discount": "MEMBER", "Staff Discount": "STAFF"}


def convert_promotion(trestle: dict, now: str) -> dict:
    """One Trestle promotion from fixtures.json → this app's promotion shape."""
    kind = TYPES[trestle["type"]]
    applies = trestle["applies_to"]

    if "bundle" in applies:  # e.g. ["PRD-0202", "PRD-0202", "PRD-0101", "PRD-0101"]
        counts: dict[str, int] = {}
        for product_id in applies["bundle"]:
            counts[product_id] = counts.get(product_id, 0) + 1
        applies_to = {"required_items": [{"product_id": p, "quantity": q} for p, q in counts.items()]}
    elif kind == "FIXED_PRICE":  # a fixed price for the given product
        applies_to = {"required_items": [{"product_id": applies["product_id"], "quantity": 1}]}
    elif "category" in applies:
        applies_to = {"categories": [applies["category"]]}
    elif "product_id" in applies:
        applies_to = {"product_ids": [applies["product_id"]]}
    else:
        applies_to = {"all": True}

    return {
        "id": trestle["promotion_id"],
        "name": trestle["name"],
        "type": kind,
        "status": "ACTIVE",
        "percentage": trestle["value"] if kind == "PERCENTAGE" else None,
        "value_cents": trestle["value"] if kind != "PERCENTAGE" else None,
        "priority": trestle["priority"],
        "applies_to": applies_to,
        "venue_rules": {"all": True},
        "customer_rule": CUSTOMER_RULES.get(trestle["name"], "EVERYONE"),
        "schedule": {
            "days_of_week": trestle["days"],
            "starts_at": trestle["starts_at"],
            "ends_at": trestle["ends_at"],
            "start_date": None,
            "end_date": None,
        },
        "schedule_overrides": [],
        # Trestle's "stackable". With nothing listed in stacks_on it never stacks
        # until a manager chooses what it may stack on.
        "allow_stacking": trestle["stackable"],
        "stacks_on": [],
        "created_at": now,
        "updated_at": now,
    }


def build_store(now: str) -> Store:
    return Store(
        venues=[dict(v) for v in FIXTURES["venues"]],
        products=[dict(p) for p in FIXTURES["products"]],
        members=[dict(m) for m in FIXTURES["members"]],
        staff=[dict(s) for s in FIXTURES["staff"]],
        promotions=[convert_promotion(p, now) for p in FIXTURES["promotions"]],
    )
