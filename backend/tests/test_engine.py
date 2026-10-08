"""Engine tests on the fixture data, with the expected prices written out in cents."""

from app.engine import price_order
from app.overlaps import find_overlaps
from app.seed import build_store
from app.time_utils import get_trading_day

# Week of 12 Oct 2026: Tuesday 13, Wednesday 14, Thursday 15, Friday 16. Times are venue-local.
TUE, WED, THU, FRI = "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"
PINT = {"product_id": "PRD-0101", "quantity": 1}
SCHNITZEL = [{"product_id": "PRD-0201", "quantity": 1}]


def catalog():
    return build_store("2026-10-01T00:00:00+00:00").catalog()


def price(venue_id, day, time, items, cat=None, **customer):
    order = {"venue_id": venue_id, "timestamp": f"{day}T{time}:00", "items": items, **customer}
    return price_order(order, cat or catalog())


def considered(result, name):
    return next(c for c in result["considered_promotions"] if c["name"] == name)


def test_promotions_are_the_five_from_the_fixtures():
    promotions = {p["id"]: p for p in catalog()["promotions"]}
    assert sorted(promotions) == ["PRM-21", "PRM-22", "PRM-23", "PRM-24", "PRM-25"]
    assert promotions["PRM-23"]["applies_to"] == {"required_items": [{"product_id": "PRD-0201", "quantity": 1}]}
    assert promotions["PRM-25"]["applies_to"] == {"required_items": [{"product_id": "PRD-0202", "quantity": 2}, {"product_id": "PRD-0101", "quantity": 2}]}
    assert all(p["venue_rules"] == {"all": True} and p["schedule_overrides"] == [] for p in promotions.values())


def test_1_member_pint_wednesday_5pm_happy_hour_wins():
    r = price("VEN-0233", WED, "17:00", [PINT], member_number="M-004182")
    assert r["final_total_cents"] == 1020
    assert r["lines"][0]["applied_promotion_name"] == "Happy Hour"
    assert considered(r, "Member Discount")["would_save_cents"] == 120


def test_2_member_pint_wednesday_8pm_member_discount_only():
    r = price("VEN-0233", WED, "20:00", [PINT], member_number="M-004182")
    assert r["final_total_cents"] == 1080
    assert r["lines"][0]["applied_promotion_name"] == "Member Discount"
    assert considered(r, "Happy Hour")["reason"] == "outside 16:00-18:00"


def test_3_ray_schnitzel_tuesday_is_18_not_16_20():
    r = price("VEN-0233", TUE, "18:00", SCHNITZEL, member_number="M-004182")
    assert r["final_total_cents"] == 1800
    assert [a["name"] for a in r["applied_promotions"]] == ["Schnitzel Tuesday"]
    assert r["reason"] == ("Schnitzel Tuesday: $26.00 down to $18.00, saves $8.00. "
                           "Member Discount would only have saved $2.60. Promotions do not stack.")


def test_4_member_discount_stacking_on_schnitzel_tuesday_gives_16_20():
    cat = catalog()
    member = next(p for p in cat["promotions"] if p["id"] == "PRM-22")
    member["stacks_on"] = ["PRM-23"]  # fixtures already mark it stackable
    r = price("VEN-0233", TUE, "18:00", SCHNITZEL, cat, member_number="M-004182")
    assert r["final_total_cents"] == 1620
    assert [(a["name"], a["saving_cents"]) for a in r["applied_promotions"]] == [("Schnitzel Tuesday", 800), ("Member Discount", 180)]


def test_5_venue_specific_window_applies_only_at_that_venue():
    cat = catalog()
    happy_hour = next(p for p in cat["promotions"] if p["id"] == "PRM-21")
    happy_hour["schedule_overrides"] = [{"venue_id": "VEN-0907", "starts_at": "17:00", "ends_at": "19:00"}]
    assert price("VEN-0907", WED, "18:30", [PINT], cat)["final_total_cents"] == 1020
    assert price("VEN-0233", WED, "18:30", [PINT], cat)["final_total_cents"] == 1200


def test_6_happy_hour_has_ended_at_6_30():
    r = price("VEN-0233", WED, "18:30", [PINT])
    assert r["final_total_cents"] == 1200
    assert r["applied_promotions"] == []


def test_7_parma_and_pint_bundle():
    r = price("VEN-1207", THU, "18:00", [{"product_id": "PRD-0202", "quantity": 2}, {"product_id": "PRD-0101", "quantity": 2}])
    assert r["final_total_cents"] == 5500
    assert all(line["part_of_bundle"] for line in r["lines"])


def test_8_bundle_plus_one_of_each_at_full_price():
    r = price("VEN-1207", THU, "18:00", [{"product_id": "PRD-0202", "quantity": 3}, {"product_id": "PRD-0101", "quantity": 3}])
    assert r["final_total_cents"] == 5500 + 2900 + 1200
    leftovers = [(l["product_id"], l["quantity"], l["final_cents"]) for l in r["lines"] if not l["part_of_bundle"]]
    assert leftovers == [("PRD-0202", 1, 2900), ("PRD-0101", 1, 1200)]


def test_9_staff_steak_sandwich():
    r = price("VEN-0233", FRI, "19:00", [{"product_id": "PRD-0204", "quantity": 1}], staff_id="STF-21")
    assert r["customer_type"] == "STAFF"
    assert r["final_total_cents"] == 1680


def test_10_inactive_member_gets_no_discount():
    r = price("VEN-0233", WED, "20:00", [PINT], member_number="M-003920")
    assert r["customer_type"] == "REGULAR"
    assert r["final_total_cents"] == 1200
    assert considered(r, "Member Discount")["reason"] == "member is inactive"


def test_11_trading_day_comes_from_the_venues_trading_hours():
    venues = {v["venue_id"]: v for v in catalog()["venues"]}
    # The Brass Anchor trades Thursday 11:00-00:30, so 00:15 Friday is still Thursday...
    assert get_trading_day(venues["VEN-0233"], f"{FRI}T00:15:00") == THU
    # ...but 00:45 is after closing, so it's Friday.
    assert get_trading_day(venues["VEN-0233"], f"{FRI}T00:45:00") == FRI
    # Kestrel & Vine closes at midnight on Thursday, so 00:15 Friday is Friday.
    assert get_trading_day(venues["VEN-0418"], f"{FRI}T00:15:00") == FRI


def test_11b_thursday_promotions_apply_after_midnight_on_thursday_trading():
    cat = catalog()
    def late(promotion_id, name, day):
        return {**cat["promotions"][0], "id": promotion_id, "name": name, "percentage": 50, "applies_to": {"all": True},
                "schedule": {"days_of_week": [day], "starts_at": "22:00", "ends_at": "02:00", "start_date": None, "end_date": None}}
    cat["promotions"] += [late("PRM-90", "Thursday Late", "thu"), late("PRM-91", "Friday Late", "fri")]

    r = price("VEN-0233", FRI, "00:15", [PINT], cat)
    assert r["trading_date"] == THU
    assert [a["name"] for a in r["applied_promotions"]] == ["Thursday Late"]
    assert considered(r, "Friday Late")["reason"] == "not Friday"


def test_12_lines_always_add_up_to_the_total():
    orders = [
        ("VEN-0907", THU, "18:00", [("PRD-0202", 3), ("PRD-0101", 5), ("PRD-0108", 1)], {"member_number": "M-004182"}),
        ("VEN-1160", TUE, "12:30", [("PRD-0201", 2), ("PRD-0102", 3), ("PRD-0105", 1)], {"staff_id": "STF-11"}),
        ("VEN-0418", WED, "16:59", [("PRD-0103", 7), ("PRD-0203", 1)], {}),
    ]
    for venue_id, day, time, items, customer in orders:
        r = price(venue_id, day, time, [{"product_id": p, "quantity": q} for p, q in items], **customer)
        assert sum(l["final_cents"] for l in r["lines"]) == r["final_total_cents"]
        assert r["original_total_cents"] - r["final_total_cents"] == r["total_saving_cents"]
        assert all(l["final_cents"] >= 0 for l in r["lines"])


def test_every_promotion_is_listed_with_a_reason():
    r = price("VEN-0233", TUE, "18:00", SCHNITZEL, member_number="M-004182")
    assert {c["name"]: c["reason"] for c in r["considered_promotions"]} == {
        "Happy Hour": "outside 16:00-18:00",
        "Member Discount": "would have saved only $2.60",
        "Schnitzel Tuesday": "applied, saves $8.00",
        "Parma & Pint for Two": "not Thursday",
        "Staff Discount": "staff only",
    }


def test_member_discount_overlaps():
    cat = catalog()
    member = next(p for p in cat["promotions"] if p["id"] == "PRM-22")
    overlaps = find_overlaps(member, cat["promotions"], cat["products"], cat["venues"])
    assert {o["name"]: (len(o["venue_ids"]), o["window"]) for o in overlaps} == {
        "Happy Hour": (6, "16:00-18:00"),
        "Schnitzel Tuesday": (6, "11:00-21:00"),
        "Parma & Pint for Two": (6, "17:00-21:00"),
    }
