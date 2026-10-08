"""API tests: overrides, validation, and that evaluate stores nothing."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

NOW = lambda: "2026-10-14T03:00:00+00:00"  # noqa: E731
RAY_ORDER = {
    "venue_id": "VEN-0233",
    "timestamp": "2026-10-13T18:00:00",
    "member_number": "M-004182",
    "items": [{"product_id": "PRD-0201", "quantity": 1}],
}


@pytest.fixture
def app():
    return create_app(now=NOW)


@pytest.fixture
def client(app):
    return TestClient(app)


def new_order(client):
    response = client.post("/api/orders", json=RAY_ORDER)
    assert response.status_code == 201
    return response.json()["order_id"]


def test_13a_override_without_permission_is_403(client, app):
    order_id = new_order(client)
    r = client.post(f"/api/orders/{order_id}/override", json={"staff_id": "STF-11", "new_total_cents": 1620, "reason": "Regular"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "OVERRIDE_PERMISSION_REQUIRED"
    assert app.state.store.overrides == []


def test_13b_override_without_reason_is_400(client, app):
    order_id = new_order(client)
    r = client.post(f"/api/orders/{order_id}/override", json={"staff_id": "STF-21", "new_total_cents": 1620})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "REASON_REQUIRED"
    assert app.state.store.overrides == []


def test_13c_valid_override_writes_one_audit_record(client, app):
    order_id = new_order(client)
    r = client.post(f"/api/orders/{order_id}/override",
                    json={"staff_id": "STF-21", "new_total_cents": 1620, "reason": "Customer requested member discount"})
    assert r.status_code == 200
    override = r.json()["override"]
    assert (override["original_total_cents"], override["new_total_cents"], override["difference_cents"]) == (1800, 1620, -180)
    assert override["staff_name"] == "M. Ferreira"
    assert len(app.state.store.overrides) == 1


def test_override_unknown_order_is_404(client):
    r = client.post("/api/orders/ORD-0000/override", json={"staff_id": "STF-21", "new_total_cents": 1, "reason": "test"})
    assert r.status_code == 404


def test_evaluate_stores_nothing(client, app):
    r = client.post("/api/promotion-engine/evaluate", json={
        "venue_id": "VEN-0233", "timestamp": "2026-10-14T17:00:00", "items": [{"product_id": "PRD-0101", "quantity": 1}],
    })
    assert r.status_code == 200
    assert r.json()["final_total_cents"] == 1020
    assert app.state.store.orders == {}


def test_reports_are_zero_with_no_orders(client):
    assert client.get("/api/reports/promotions").json() == {
        "total_orders": 0, "orders_with_promotion": 0, "total_discount_cents": 0, "promotions": [],
    }


def test_boot_has_no_orders_or_overrides(client):
    assert client.get("/api/orders").json() == []
    assert client.get("/api/reports/overrides").json() == {"count": 0, "total_difference_cents": 0, "records": []}


def test_reference_data_is_the_fixtures(client):
    import json
    from pathlib import Path
    fixtures = json.loads((Path(__file__).parent.parent / "app" / "fixtures.json").read_text())
    for key in ("venues", "products", "staff"):
        assert client.get(f"/api/{key}").json() == fixtures[key]
    assert client.get("/api/members/M-003920").json() == fixtures["members"][2]
    assert client.get("/api/demo/scenarios").status_code == 404


BASE_PROMOTION = {
    "name": "Test", "type": "PERCENTAGE", "status": "INACTIVE", "percentage": 10, "priority": 10,
    "applies_to": {"all": True}, "venue_rules": {"all": True}, "customer_rule": "EVERYONE",
    "schedule": {"days_of_week": ["mon"], "starts_at": "16:00", "ends_at": "18:00", "start_date": None, "end_date": None},
}


@pytest.mark.parametrize("change, message", [
    ({"percentage": 120}, "between 0 and 100"),
    ({"type": "FIXED_PRICE", "value_cents": -1, "applies_to": {"required_items": [{"product_id": "PRD-0201", "quantity": 1}]}}, "negative"),
    ({"schedule": {**BASE_PROMOTION["schedule"], "ends_at": "16:00"}}, "same"),
    ({"schedule": {**BASE_PROMOTION["schedule"], "start_date": "2026-12-01", "end_date": "2026-11-01"}}, "end date"),
    ({"type": "BUNDLE", "value_cents": 500, "applies_to": {"required_items": []}}, "required item"),
    ({"percentage": None}, "needs a percentage"),
    ({"type": "BUNDLE", "value_cents": None, "applies_to": {"required_items": [{"product_id": "PRD-0201", "quantity": 2}]}}, "needs a price"),
    ({"applies_to": {"categories": []}}, "category"),
])
def test_invalid_promotions_are_rejected(client, change, message):
    r = client.post("/api/promotions", json={**BASE_PROMOTION, **change})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert message in r.json()["error"]["message"]


def test_create_promotion_round_trip(client):
    r = client.post("/api/promotions", json={**BASE_PROMOTION, "applies_to": {"categories": ["beverage"]}})
    assert r.status_code == 201
    created = r.json()
    assert created["applies_to"] == {"categories": ["beverage"]}
    assert client.get(f"/api/promotions/{created['id']}").json() == created
