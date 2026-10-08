"""The pricing engine: works out what an order costs and explains why.

    price_order(order, catalog) -> priced order

It's a pure function: everything it needs is passed in (including the
timestamp), it never reads the clock and never touches the web layer.

How an order is priced, in order:
  1. Find the venue's local time, the trading day and the customer type.
  2. Split items into single units, so 3 pints can be 2 bundled + 1 on its own.
  3. Fixed-price and bundle offers first, one complete set at a time, but only
     when the set beats what those units would cost otherwise.
  4. Every remaining unit gets the percentage promotion that gives the LOWEST
     price. Priority only breaks exact ties.
  5. Stacking: a promotion with allow_stacking that lists the winner in
     stacks_on takes a further percentage off. Off by default.
  6. Totals are checked: line totals must add up to the order total.
  7. Every promotion gets a plain-English reason, including the ones that lost.
"""

from dataclasses import dataclass, field

from .money import apply_percentage, format_cents
from .rules import product_matches, required_items, tie_break, why_not_allowed
from .time_utils import local_moment


class PricingError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


@dataclass
class Unit:
    """One single item in the order, e.g. one of the three pints."""
    product: dict
    gross: int                      # normal price in cents
    final: int                      # price after promotions
    winner: dict | None = None      # the promotion that priced it
    in_set: bool = False            # part of a fixed-price or bundle set
    savings: dict = field(default_factory=dict)  # promotion id -> cents saved on this unit


def price_order(order: dict, catalog: dict) -> dict:
    """Price an order.

    order:   {venue_id, timestamp, member_number?, staff_id?, items: [{product_id, quantity}]}
    catalog: {venues, products, members, staff, promotions}  (lists of dicts)
    """
    # 1. Where, when and who.
    venue = _find(catalog["venues"], "venue_id", order["venue_id"])
    if not venue:
        raise PricingError("VENUE_NOT_FOUND", f"Unknown venue {order['venue_id']}", 404)
    moment = local_moment(venue, order["timestamp"])
    customer_type, member_inactive = _customer_type(order, catalog)
    sale = {**moment, "venue": venue, "customer_type": customer_type, "member_inactive": member_inactive}

    # 2. One Unit per item.
    units = _expand(order["items"], catalog["products"])

    # Which promotions are allowed for this sale at all (venue, day, time, customer...)?
    promotions = catalog["promotions"]
    rejections = {p["id"]: why_not_allowed(p, sale) for p in promotions}
    allowed = [p for p in promotions if rejections[p["id"]] is None]
    percentage_promos = [p for p in allowed if p["type"] == "PERCENTAGE"]
    set_promos = [p for p in allowed if p["type"] in ("FIXED_PRICE", "BUNDLE")]

    # 3-5. Price the units.
    _apply_set_offers(units, set_promos, percentage_promos)
    _apply_best_percentage(units, percentage_promos)
    _apply_stacking(units, percentage_promos)

    # 6. Totals.
    lines = _build_lines(units)
    original = sum(u.gross for u in units)
    final = sum(u.final for u in units)
    if sum(line["final_cents"] for line in lines) != final:
        raise PricingError("TOTAL_MISMATCH", "Line totals do not add up to the order total", 500)

    # 7. Explanations.
    applied = _applied_promotions(units, promotions)
    considered = _considered_promotions(promotions, rejections, units, applied)

    return {
        "trading_date": moment["trading_date"],
        "local_time": moment["local_time"],
        "venue_id": venue["venue_id"],
        "venue_name": venue["name"],
        "customer_type": customer_type,
        "original_total_cents": original,
        "final_total_cents": final,
        "total_saving_cents": original - final,
        "lines": lines,
        "applied_promotions": applied,
        "considered_promotions": considered,
        "reason": _summary(units, applied, considered),
        "override": None,
    }


# ---------------------------------------------------------------------------
# Step 1 and 2: customer and units

def _find(items: list[dict], key: str, value: str) -> dict | None:
    return next((item for item in items if item[key] == value), None)


def _customer_type(order: dict, catalog: dict) -> tuple[str, bool]:
    """STAFF if a staff id is given, MEMBER if an ACTIVE member number is given, else REGULAR."""
    if order.get("staff_id"):
        if not _find(catalog["staff"], "staff_id", order["staff_id"]):
            raise PricingError("STAFF_NOT_FOUND", f"Unknown staff member {order['staff_id']}", 404)
        return "STAFF", False
    if order.get("member_number"):
        member = _find(catalog["members"], "member_number", order["member_number"])
        if not member:
            raise PricingError("MEMBER_NOT_FOUND", f"Unknown member {order['member_number']}", 404)
        return ("MEMBER", False) if member["active"] else ("REGULAR", True)
    return "REGULAR", False


def _expand(items: list[dict], products: list[dict]) -> list[Unit]:
    units = []
    for item in items:
        product = _find(products, "product_id", item["product_id"])
        if not product:
            raise PricingError("PRODUCT_NOT_FOUND", f"Unknown product {item['product_id']}", 404)
        for _ in range(item["quantity"]):
            units.append(Unit(product=product, gross=product["price_cents"], final=product["price_cents"]))
    return units


# ---------------------------------------------------------------------------
# Step 3: fixed-price and bundle sets

def count_sets(required: list[dict], units: list[Unit]) -> int:
    """How many complete sets the units contain."""
    if not required:
        return 0
    return min(sum(1 for u in units if u.product["product_id"] == r["product_id"]) // r["quantity"] for r in required)


def _take_set(required: list[dict], units: list[Unit]) -> list[Unit] | None:
    """One complete set taken from the units, or None if there isn't one."""
    if count_sets(required, units) < 1:
        return None
    chosen = []
    for r in required:
        matching = [u for u in units if u.product["product_id"] == r["product_id"]]
        chosen.extend(matching[: r["quantity"]])
    return chosen


def _split_price(price: int, units: list[Unit]) -> list[int]:
    """Spread a set price across its units in proportion to their normal prices. Adds up exactly."""
    total = sum(u.gross for u in units)
    shares, assigned = [], 0
    for i, unit in enumerate(units):
        share = price - assigned if i == len(units) - 1 else (price * unit.gross * 2 + total) // (2 * total)
        shares.append(share)
        assigned += share
    return shares


def _best_percentage(unit: Unit, percentage_promos: list[dict]) -> tuple[int, dict] | None:
    """The lowest price any percentage promotion gives this unit, or None if none lowers it."""
    options = [
        (apply_percentage(unit.gross, p["percentage"]), tie_break(p), p)
        for p in percentage_promos
        if product_matches(p, unit.product)
    ]
    if not options:
        return None
    price, _, promotion = min(options, key=lambda option: option[:2])
    return (price, promotion) if price < unit.gross else None


def _apply_set_offers(units: list[Unit], set_promos: list[dict], percentage_promos: list[dict]) -> None:
    while True:
        free = [u for u in units if u.winner is None]
        candidates = []
        for promotion in set_promos:
            chosen = _take_set(required_items(promotion), free)
            if not chosen:
                continue
            otherwise = sum((_best_percentage(u, percentage_promos) or (u.gross,))[0] for u in chosen)
            saving = otherwise - promotion["value_cents"]
            if saving > 0:
                candidates.append((-saving, tie_break(promotion), promotion, chosen))
        if not candidates:
            return
        _, _, promotion, chosen = min(candidates, key=lambda c: c[:2])
        for unit, price in zip(chosen, _split_price(promotion["value_cents"], chosen)):
            unit.final, unit.winner, unit.in_set = price, promotion, True
            unit.savings[promotion["id"]] = unit.gross - price


# ---------------------------------------------------------------------------
# Steps 4 and 5: percentage promotions and stacking

def _apply_best_percentage(units: list[Unit], percentage_promos: list[dict]) -> None:
    for unit in units:
        if unit.winner is not None:
            continue
        best = _best_percentage(unit, percentage_promos)
        if best:
            price, promotion = best
            unit.final, unit.winner = price, promotion
            unit.savings[promotion["id"]] = unit.gross - price


def _apply_stacking(units: list[Unit], percentage_promos: list[dict]) -> None:
    stackers = [p for p in percentage_promos if p["allow_stacking"] and p["stacks_on"]]
    for unit in units:
        if unit.winner is None:
            continue
        for promotion in stackers:
            if promotion["id"] == unit.winner["id"] or unit.winner["id"] not in promotion["stacks_on"]:
                continue
            if not product_matches(promotion, unit.product):
                continue
            after = apply_percentage(unit.final, promotion["percentage"])
            unit.savings[promotion["id"]] = unit.savings.get(promotion["id"], 0) + unit.final - after
            unit.final = after


# ---------------------------------------------------------------------------
# Steps 6 and 7: lines and explanations

def _build_lines(units: list[Unit]) -> list[dict]:
    """Group identical units (same product, same promotions) into lines."""
    lines: dict[tuple, dict] = {}
    for unit in units:
        winner_id = unit.winner["id"] if unit.winner else None
        key = (unit.product["product_id"], winner_id, unit.in_set, tuple(unit.savings))
        line = lines.setdefault(key, {
            "product_id": unit.product["product_id"],
            "product_name": unit.product["name"],
            "quantity": 0,
            "original_cents": 0,
            "final_cents": 0,
            "saving_cents": 0,
            "applied_promotion_id": winner_id,
            "applied_promotion_name": unit.winner["name"] if unit.winner else None,
            "part_of_bundle": unit.in_set,
        })
        line["quantity"] += 1
        line["original_cents"] += unit.gross
        line["final_cents"] += unit.final
        line["saving_cents"] = line["original_cents"] - line["final_cents"]
    return list(lines.values())


def _applied_promotions(units: list[Unit], promotions: list[dict]) -> list[dict]:
    totals: dict[str, int] = {}
    for unit in units:
        for promotion_id, cents in unit.savings.items():
            totals[promotion_id] = totals.get(promotion_id, 0) + cents
    by_id = {p["id"]: p for p in promotions}
    return [
        {"promotion_id": pid, "name": by_id[pid]["name"], "type": by_id[pid]["type"], "saving_cents": cents}
        for pid, cents in totals.items()
        if cents > 0
    ]


def _saving_on_its_own(promotion: dict, units: list[Unit]) -> int:
    """What this promotion would have saved on the whole order if it were the only one."""
    if promotion["type"] == "PERCENTAGE":
        return sum(u.gross - apply_percentage(u.gross, promotion["percentage"]) for u in units if product_matches(promotion, u.product))
    required = required_items(promotion)
    prices = {u.product["product_id"]: u.gross for u in units}
    set_price = sum(prices.get(r["product_id"], 0) * r["quantity"] for r in required)
    return max(0, count_sets(required, units) * (set_price - promotion["value_cents"]))


def _missing_items(promotion: dict, units: list[Unit]) -> str | None:
    """Product and quantity rules: does the order contain what this promotion needs?"""
    if promotion["type"] == "PERCENTAGE":
        return None if any(product_matches(promotion, u.product) for u in units) else "no qualifying items in this order"
    required = required_items(promotion)
    in_order = {u.product["product_id"]: u.product["name"] for u in units}
    if not any(r["product_id"] in in_order for r in required):
        return "no qualifying items in this order"
    if count_sets(required, units) >= 1:
        return None
    return "needs " + " + ".join(f"{r['quantity']}× {in_order.get(r['product_id'], r['product_id'])}" for r in required)


def _considered_promotions(promotions: list[dict], rejections: dict, units: list[Unit], applied: list[dict]) -> list[dict]:
    """Every promotion, with whether it was eligible and a short reason."""
    total_saving = sum(a["saving_cents"] for a in applied)
    applied_by_id = {a["promotion_id"]: a for a in applied}
    result = []
    for promotion in promotions:
        entry = {"promotion_id": promotion["id"], "name": promotion["name"]}
        rejected = rejections[promotion["id"]] or _missing_items(promotion, units)
        if rejected:
            result.append({**entry, "eligible": False, "reason": rejected, "would_save_cents": 0})
            continue
        if promotion["id"] in applied_by_id:
            saving = applied_by_id[promotion["id"]]["saving_cents"]
            result.append({**entry, "eligible": True, "reason": f"applied, saves {format_cents(saving)}", "would_save_cents": saving})
            continue
        would = _saving_on_its_own(promotion, units)
        if would == 0:
            reason = "would not lower the price"
        elif would < total_saving:
            reason = f"would have saved only {format_cents(would)}"
        else:
            reason = f"would have saved {format_cents(would)}, but a better combination applies to these items"
        result.append({**entry, "eligible": True, "reason": reason, "would_save_cents": would})
    return result


def _summary(units: list[Unit], applied: list[dict], considered: list[dict]) -> str:
    """One paragraph a bar worker can read out, e.g.
    "Schnitzel Tuesday: $32.50 down to $18.00, saves $14.50. Member Discount would only have saved $3.25. Promotions do not stack."
    """
    if not applied:
        return "No promotion applies to this order, so normal prices are charged."

    sentences = []
    winners: dict[str, list[Unit]] = {}
    for unit in units:
        if unit.winner:
            winners.setdefault(unit.winner["id"], []).append(unit)
    for promotion_id, group in winners.items():
        before = sum(u.gross for u in group)
        saving = sum(u.savings.get(promotion_id, 0) for u in group)
        sentences.append(f"{group[0].winner['name']}: {format_cents(before)} down to {format_cents(before - saving)}, saves {format_cents(saving)}.")
    for a in applied:
        if a["promotion_id"] not in winners:
            sentences.append(f"{a['name']} stacks on top, saving a further {format_cents(a['saving_cents'])}.")

    applied_ids = {a["promotion_id"] for a in applied}
    losers = [c for c in considered if c["eligible"] and c["promotion_id"] not in applied_ids and c["would_save_cents"] > 0]
    for loser in losers:
        sentences.append(f"{loser['name']} would only have saved {format_cents(loser['would_save_cents'])}.")
    if losers and len(applied) == len(winners):
        sentences.append("Promotions do not stack.")
    return " ".join(sentences)
