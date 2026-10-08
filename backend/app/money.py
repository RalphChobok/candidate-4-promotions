"""Money helpers. All money is whole cents (int); never floats."""

from decimal import ROUND_HALF_UP, Decimal


def percent_of(price_cents: int, percentage: float) -> int:
    """The discount a percentage takes off a price, rounded half up to a cent."""
    exact = Decimal(price_cents) * Decimal(str(percentage)) / 100
    return int(exact.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def apply_percentage(price_cents: int, percentage: float) -> int:
    """Price after a percentage discount. Never below zero."""
    return max(0, price_cents - percent_of(price_cents, percentage))


def format_cents(cents: int) -> str:
    """1800 -> "$18.00" """
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) / 100:.2f}"
