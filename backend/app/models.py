"""Request bodies, validated with Pydantic.

A bad request never reaches the engine: FastAPI rejects it with
{"error": {"code": "VALIDATION_ERROR", "message": ...}} (see main.py).
Messages are written for the person filling in the form, since the
frontend shows them as-is.
"""

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _check_time(value: str) -> str:
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
        raise ValueError("Use HH:MM (24-hour) for times")
    return value


def _check_date(value: str | None) -> str | None:
    if value is not None:
        try:
            date.fromisoformat(value)
        except ValueError:
            raise ValueError("Use YYYY-MM-DD for dates") from None
    return value


Time = Annotated[str, AfterValidator(_check_time)]
DateString = Annotated[str | None, AfterValidator(_check_date)]


# ---------------------------------------------------------------------------
# Promotions

class RequiredItem(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(ge=1)


class AppliesTo(BaseModel):
    """Exactly one of: all, product_ids, categories, required_items."""
    model_config = ConfigDict(extra="forbid")
    all: Literal[True] | None = None
    product_ids: list[str] | None = None
    categories: list[str] | None = None
    required_items: list[RequiredItem] | None = None

    @model_validator(mode="after")
    def exactly_one(self):
        chosen = [name for name, value in self if value is not None]
        if len(chosen) != 1:
            raise ValueError("applies_to needs exactly one of all, product_ids, categories or required_items")
        if self.product_ids == []:
            raise ValueError("Choose at least one product, or apply it to everything")
        if self.categories == []:
            raise ValueError("Choose at least one category, or apply it to everything")
        if self.required_items == []:
            raise ValueError("A bundle or fixed-price offer needs at least one required item")
        return self


class VenueRules(BaseModel):
    """Exactly one of: all, venue_ids."""
    model_config = ConfigDict(extra="forbid")
    all: Literal[True] | None = None
    venue_ids: list[str] | None = None

    @model_validator(mode="after")
    def exactly_one(self):
        chosen = [name for name, value in self if value is not None]
        if len(chosen) != 1:
            raise ValueError("venue_rules needs exactly one of all or venue_ids")
        if self.venue_ids == []:
            raise ValueError("Choose at least one venue")
        return self


class Schedule(BaseModel):
    days_of_week: list[Weekday]
    starts_at: Time
    ends_at: Time
    start_date: DateString = None
    end_date: DateString = None


class ScheduleOverride(BaseModel):
    venue_id: str = Field(min_length=1)
    days_of_week: list[Weekday] | None = None
    starts_at: Time | None = None
    ends_at: Time | None = None


class PromotionIn(BaseModel):
    name: str
    type: Literal["PERCENTAGE", "FIXED_PRICE", "BUNDLE"]
    status: Literal["ACTIVE", "INACTIVE"] = "INACTIVE"
    value_cents: int | None = None
    percentage: float | None = None
    priority: int = 10
    applies_to: AppliesTo
    venue_rules: VenueRules
    customer_rule: Literal["EVERYONE", "MEMBER", "STAFF"]
    schedule: Schedule
    schedule_overrides: list[ScheduleOverride] = []
    allow_stacking: bool = False
    stacks_on: list[str] = []

    @model_validator(mode="after")
    def check_rules(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Give the promotion a name")
        if self.type == "PERCENTAGE":
            if self.percentage is None:
                raise ValueError("A percentage promotion needs a percentage")
            if not 0 <= self.percentage <= 100:
                raise ValueError("Percentage must be between 0 and 100")
            if self.applies_to.required_items is not None:
                raise ValueError("A percentage promotion applies to products, categories or everything")
        else:
            if self.value_cents is None:
                raise ValueError("A fixed-price or bundle promotion needs a price")
            if self.value_cents < 0:
                raise ValueError("A price can’t be negative")
            if self.applies_to.required_items is None:
                raise ValueError("A fixed-price or bundle promotion needs required items")
        if not self.schedule.days_of_week:
            raise ValueError("Choose at least one day")
        if self.schedule.starts_at == self.schedule.ends_at:
            raise ValueError("Start and end time can’t be the same")
        if self.schedule.start_date and self.schedule.end_date and self.schedule.end_date < self.schedule.start_date:
            raise ValueError("The end date must be on or after the start date")
        for override in self.schedule_overrides:
            if (override.starts_at or self.schedule.starts_at) == (override.ends_at or self.schedule.ends_at):
                raise ValueError("A venue-specific window can’t start and end at the same time")
        if len({o.venue_id for o in self.schedule_overrides}) != len(self.schedule_overrides):
            raise ValueError("Each venue can only have one venue-specific schedule")
        return self

    def to_dict(self) -> dict:
        """Plain dict in the API's shape, without empty optional keys."""
        data = self.model_dump()
        data["applies_to"] = self.applies_to.model_dump(exclude_none=True)
        data["venue_rules"] = self.venue_rules.model_dump(exclude_none=True)
        data["schedule_overrides"] = [o.model_dump(exclude_none=True) for o in self.schedule_overrides]
        if self.type == "PERCENTAGE":
            data["value_cents"] = None
        else:
            data["percentage"] = None
        return data


class StatusIn(BaseModel):
    status: Literal["ACTIVE", "INACTIVE"]


# ---------------------------------------------------------------------------
# Orders

class OrderItem(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=99)


class OrderIn(BaseModel):
    """Body for /promotion-engine/evaluate and /orders.

    timestamp is the venue's local time, e.g. "2026-10-13T18:00:00".
    """
    venue_id: str = Field(min_length=1)
    timestamp: str
    member_number: str | None = None
    staff_id: str | None = None
    items: list[OrderItem]

    @model_validator(mode="after")
    def check_rules(self):
        try:
            datetime.fromisoformat(self.timestamp)
        except ValueError:
            raise ValueError("timestamp must be an ISO 8601 date and time, e.g. 2026-10-13T18:00:00") from None
        if not self.items:
            raise ValueError("Add at least one item")
        self.member_number = (self.member_number or "").strip() or None
        self.staff_id = (self.staff_id or "").strip() or None
        return self

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


class OverrideIn(BaseModel):
    staff_id: str = Field(min_length=1)
    new_total_cents: int = Field(ge=0)
    reason: str | None = None  # checked in the service so it can return REASON_REQUIRED
