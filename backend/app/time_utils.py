"""Times and trading days.

The fixtures give no timezones, so a sale's time is taken as the venue's
local wall-clock time, exactly as sent (an offset, if present, is ignored).

Trading day: each venue's trading_hours (from the fixtures) decide it. If the
previous day's hours run past midnight (e.g. Thursday 11:00–00:30) and the
sale is before that closing time, the sale belongs to the previous day.
So 00:15 on Friday at The Brass Anchor is Thursday trading.
"""

from datetime import date, datetime, timedelta

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def to_minutes(hhmm: str) -> int:
    """"16:30" -> 990"""
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def trading_date(venue: dict, day: date, time: str) -> date:
    """The trading day a sale at `day` `time` belongs to, using the venue's trading hours."""
    yesterday = day - timedelta(days=1)
    hours = venue.get("trading_hours", {}).get(WEEKDAYS[yesterday.weekday()])
    if hours:
        opens, closes = to_minutes(hours[0]), to_minutes(hours[1])
        runs_past_midnight = closes <= opens
        if runs_past_midnight and to_minutes(time) < closes:
            return yesterday
    return day


def local_moment(venue: dict, timestamp: str) -> dict:
    """Venue-local time and trading day for a timestamp like "2026-10-16T00:15:00"."""
    moment = datetime.fromisoformat(timestamp)
    local_time = moment.strftime("%H:%M")
    trading = trading_date(venue, moment.date(), local_time)
    return {
        "local_time": local_time,
        "trading_date": trading.isoformat(),
        "trading_weekday": WEEKDAYS[trading.weekday()],
    }


def get_trading_day(venue: dict, timestamp: str) -> str:
    return local_moment(venue, timestamp)["trading_date"]
