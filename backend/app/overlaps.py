"""Which active promotions could compete with a given promotion?

Two promotions overlap when the same customer could buy the same product at
the same venue on the same day at the same time. Shown to managers as a
warning; the engine still decides the price at the till.
"""

from .rules import effective_schedule, product_matches, required_items, venue_matches
from .time_utils import WEEKDAYS, to_minutes


def _products_covered(promotion: dict, products: list[dict]) -> set[str]:
    if promotion["type"] == "PERCENTAGE":
        return {p["product_id"] for p in products if product_matches(promotion, p)}
    return {r["product_id"] for r in required_items(promotion)}


def _customers_overlap(a: str, b: str) -> bool:
    return a == "EVERYONE" or b == "EVERYONE" or a == b


def _dates_overlap(a: dict, b: dict) -> bool:
    a_start, a_end = a["start_date"] or "0000-01-01", a["end_date"] or "9999-12-31"
    b_start, b_end = b["start_date"] or "0000-01-01", b["end_date"] or "9999-12-31"
    return a_start <= b_end and b_start <= a_end


def _segments(starts_at: str, ends_at: str) -> list[tuple[int, int]]:
    """A time window as minute ranges within one day; one crossing midnight becomes two."""
    start = to_minutes(starts_at)
    end = 24 * 60 if ends_at == "23:59" else to_minutes(ends_at)
    return [(start, end)] if start < end else [(start, 24 * 60), (0, end)]


def _common_window(a: dict, b: dict) -> tuple[int, int] | None:
    for a_start, a_end in _segments(a["starts_at"], a["ends_at"]):
        for b_start, b_end in _segments(b["starts_at"], b["ends_at"]):
            if a_start < b_end and b_start < a_end:
                return max(a_start, b_start), min(a_end, b_end)
    return None


def _hhmm(minutes: int) -> str:
    return "24:00" if minutes >= 24 * 60 else f"{minutes // 60:02d}:{minutes % 60:02d}"


def find_overlaps(promotion: dict, others: list[dict], products: list[dict], venues: list[dict]) -> list[dict]:
    """Active promotions that overlap with `promotion` (which may not be saved yet)."""
    mine = _products_covered(promotion, products)
    overlaps = []
    for other in others:
        if other["id"] == promotion.get("id") or other["status"] != "ACTIVE":
            continue
        if not _customers_overlap(promotion["customer_rule"], other["customer_rule"]):
            continue
        if not mine & _products_covered(other, products):
            continue
        if not _dates_overlap(promotion["schedule"], other["schedule"]):
            continue

        venue_ids, days, window = [], set(), None
        for venue in venues:
            if not (venue_matches(promotion, venue) and venue_matches(other, venue)):
                continue
            a = effective_schedule(promotion, venue["venue_id"])
            b = effective_schedule(other, venue["venue_id"])
            shared_days = set(a["days_of_week"]) & set(b["days_of_week"])
            common = _common_window(a, b)
            if not shared_days or not common:
                continue
            venue_ids.append(venue["venue_id"])
            days |= shared_days
            window = window or f"{_hhmm(common[0])}-{_hhmm(common[1])}"

        if venue_ids:
            overlaps.append({
                "promotion_id": other["id"],
                "name": other["name"],
                "venue_ids": venue_ids,
                "days_of_week": [d for d in WEEKDAYS if d in days],
                "window": window,
            })
    return overlaps
