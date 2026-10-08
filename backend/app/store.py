"""In-memory storage. Everything lives in this one object while the server runs.

To use a real database later, replace this class with one that has the same
methods; nothing else needs to change.
"""

import copy


class Store:
    def __init__(self, venues, products, members, staff, promotions):
        self.venues: list[dict] = venues
        self.products: list[dict] = products
        self.members: list[dict] = members
        self.staff: list[dict] = staff
        self.promotions: dict[str, dict] = {p["id"]: p for p in promotions}
        self.orders: dict[str, dict] = {}
        self.overrides: list[dict] = []  # the audit log
        self._next_promotion = 100
        self._next_order = 9001

    # Reference data -----------------------------------------------------

    def get_venue(self, venue_id: str) -> dict | None:
        return next((v for v in self.venues if v["venue_id"] == venue_id), None)

    def get_member(self, member_number: str) -> dict | None:
        return next((m for m in self.members if m["member_number"] == member_number), None)

    def get_staff(self, staff_id: str) -> dict | None:
        return next((s for s in self.staff if s["staff_id"] == staff_id), None)

    def catalog(self) -> dict:
        """Everything the pricing engine needs, as copies so it can't change stored data."""
        return copy.deepcopy({
            "venues": self.venues,
            "products": self.products,
            "members": self.members,
            "staff": self.staff,
            "promotions": list(self.promotions.values()),
        })

    # Promotions ---------------------------------------------------------

    def new_promotion_id(self) -> str:
        while f"PRM-{self._next_promotion}" in self.promotions:
            self._next_promotion += 1
        self._next_promotion += 1
        return f"PRM-{self._next_promotion - 1}"

    def save_promotion(self, promotion: dict) -> dict:
        self.promotions[promotion["id"]] = copy.deepcopy(promotion)
        return copy.deepcopy(promotion)

    # Orders and audit ---------------------------------------------------

    def new_order_id(self) -> str:
        self._next_order += 1
        return f"ORD-{self._next_order - 1}"

    def save_order(self, order: dict) -> dict:
        self.orders[order["order_id"]] = copy.deepcopy(order)
        return copy.deepcopy(order)

    def new_override_id(self) -> str:
        return f"AUD-{len(self.overrides) + 1:04d}"

    def add_override(self, record: dict) -> None:
        self.overrides.append(copy.deepcopy(record))
