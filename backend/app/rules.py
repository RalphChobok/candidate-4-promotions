"""Promotion rules: is this promotion allowed for this sale, here and now?

Checks run in a fixed order so the reason a promotion was rejected is always
the first rule it failed: status, date range, venue, day, time window, customer.
Product and quantity rules depend on the order's items and live in engine.py.
"""

from .time_utils import WEEKDAYS, to_minutes

DAY_NAMES = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
    "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
}


def effective_schedule(promotion: dict, venue_id: str) -> dict:
    """The promotion's days and times at one venue. A venue override replaces the defaults there only."""
    schedule = promotion["schedule"]
    override = next((o for o in promotion["schedule_overrides"] if o["venue_id"] == venue_id), None) or {}
    return {
        "days_of_week": override.get("days_of_week") or schedule["days_of_week"],
        "starts_at": override.get("starts_at") or schedule["starts_at"],
        "ends_at": override.get("ends_at") or schedule["ends_at"],
        "overridden": bool(override),
    }


def in_window(starts_at: str, ends_at: str, time: str) -> bool:
    """Start included, end excluded. "23:59" means end of day. 22:00-02:00 crosses midnight."""
    start = to_minutes(starts_at)
    end = 24 * 60 if ends_at == "23:59" else to_minutes(ends_at)
    now = to_minutes(time)
    if start < end:
        return start <= now < end
    return now >= start or now < end


def venue_matches(promotion: dict, venue: dict) -> bool:
    rules = promotion["venue_rules"]
    if "venue_ids" in rules:
        return venue["venue_id"] in rules["venue_ids"]
    return True  # {"all": True}


def product_matches(promotion: dict, product: dict) -> bool:
    """For percentage promotions: does it cover this product?"""
    applies_to = promotion["applies_to"]
    if "product_ids" in applies_to:
        return product["product_id"] in applies_to["product_ids"]
    if "categories" in applies_to:
        return product["category"] in applies_to["categories"]
    return "all" in applies_to


def required_items(promotion: dict) -> list[dict]:
    """For fixed-price and bundle promotions: the items that make one complete set."""
    return promotion["applies_to"].get("required_items", [])


def describe_days(days: list[str]) -> str:
    ordered = [d for d in WEEKDAYS if d in days]
    if len(ordered) == 1:
        return DAY_NAMES[ordered[0]]
    if len(ordered) == 7:
        return "every day"
    return ", ".join(DAY_NAMES[d][:3] for d in ordered)


def why_not_allowed(promotion: dict, sale: dict) -> str | None:
    """The reason this promotion can't apply to this sale, or None if it can.

    `sale` holds: venue, trading_date, trading_weekday, local_time,
    customer_type, member_inactive.
    """
    schedule = promotion["schedule"]
    if promotion["status"] != "ACTIVE":
        return "switched off"
    if schedule["start_date"] and sale["trading_date"] < schedule["start_date"]:
        return f"starts {schedule['start_date']}"
    if schedule["end_date"] and sale["trading_date"] > schedule["end_date"]:
        return f"ended {schedule['end_date']}"
    if not venue_matches(promotion, sale["venue"]):
        return "not offered at this venue"

    here = effective_schedule(promotion, sale["venue"]["venue_id"])
    if sale["trading_weekday"] not in here["days_of_week"]:
        if len(here["days_of_week"]) == 1:
            return f"not {DAY_NAMES[here['days_of_week'][0]]}"
        return f"only runs {describe_days(here['days_of_week'])}"
    if not in_window(here["starts_at"], here["ends_at"], sale["local_time"]):
        at_venue = " at this venue" if here["overridden"] else ""
        return f"outside {here['starts_at']}-{here['ends_at']}{at_venue}"

    if promotion["customer_rule"] == "MEMBER" and sale["customer_type"] != "MEMBER":
        return "member is inactive" if sale["member_inactive"] else "members only"
    if promotion["customer_rule"] == "STAFF" and sale["customer_type"] != "STAFF":
        return "staff only"
    return None


def tie_break(promotion: dict) -> tuple:
    """Sort key used only when two promotions give exactly the same price.

    Higher priority first, then more specific products (product > category > all),
    then promotions limited to specific venues, then lower id.
    """
    applies_to, venues = promotion["applies_to"], promotion["venue_rules"]
    target = 2 if ("product_ids" in applies_to or "required_items" in applies_to) else 1 if "categories" in applies_to else 0
    venue = 1 if "venue_ids" in venues else 0
    return (-promotion["priority"], -target, -venue, promotion["id"])
