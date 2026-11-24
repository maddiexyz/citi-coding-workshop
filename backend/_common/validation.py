"""
A small input validator that collects every field error before failing.

Usage::

    v = Validator(request.json())
    v.string("name", required=True, max_length=200)
    v.date("start_date")
    v.raise_if_errors()      # 400 with {"details": {"field": "message"}}
    data = v.clean           # validated, normalized values
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Iterable, Optional

from .http import ApiError

REQUIRED = "This field is required"


class Validator:
    """Validates fields of a JSON object and gathers cleaned values and errors."""

    def __init__(self, data: dict):
        """Start validating the given JSON object."""
        self.data = data
        self.clean: dict[str, Any] = {}
        self.errors: dict[str, str] = {}

    def add_error(self, name: str, message: str) -> None:
        """Record an error for a field (the first error per field wins)."""
        self.errors.setdefault(name, message)

    def string(self, name: str, *, required: bool = False, max_length: int = 255,
               pattern: Optional[str] = None, pattern_message: str = "Invalid format",
               transform: Optional[Callable[[str], str]] = None, strip: bool = True) -> Optional[str]:
        """
        Validate a text field.

        Empty strings count as missing. Optional missing fields become None.
        ``transform`` (e.g. ``str.upper``) runs before the pattern check.
        """
        value = self.data.get(name)
        if value is not None and not isinstance(value, str):
            self.add_error(name, "Must be text")
            return None
        if value is not None and strip:
            value = value.strip()
        if not value:
            if required:
                self.add_error(name, REQUIRED)
            self.clean[name] = None
            return None
        if transform:
            value = transform(value)
        if len(value) > max_length:
            self.add_error(name, f"Must be at most {max_length} characters")
        elif pattern and not re.fullmatch(pattern, value):
            self.add_error(name, pattern_message)
        self.clean[name] = value
        return value

    def choice(self, name: str, options: Iterable[str], *, default: Optional[str] = None) -> Optional[str]:
        """Validate that a field is one of the allowed values (or use the default)."""
        options = tuple(options)
        value = self.data.get(name)
        if value in (None, ""):
            value = default
        if value is None:
            self.add_error(name, REQUIRED)
        elif value not in options:
            self.add_error(name, f"Must be one of: {', '.join(options)}")
        self.clean[name] = value
        return value

    def date(self, name: str) -> Optional[date]:
        """Validate an optional date in YYYY-MM-DD format."""
        value = self.data.get(name)
        if value in (None, ""):
            self.clean[name] = None
            return None
        try:
            if not isinstance(value, str) or len(value) != 10:
                raise ValueError(value)
            parsed = date.fromisoformat(value)
        except ValueError:
            self.add_error(name, "Must be a date in YYYY-MM-DD format")
            return None
        self.clean[name] = parsed
        return parsed

    def integer(self, name: str, *, required: bool = False, minimum: int = 1) -> Optional[int]:
        """Validate a whole number (JSON number, not a string or boolean), e.g. a referenced id."""
        value = self.data.get(name)
        if value is None:
            if required:
                self.add_error(name, REQUIRED)
            self.clean[name] = None
            return None
        if isinstance(value, bool) or not isinstance(value, int):
            self.add_error(name, "Must be a whole number")
            return None
        if value < minimum:
            self.add_error(name, f"Must be at least {minimum}")
            return None
        self.clean[name] = value
        return value

    def number(self, name: str, *, required: bool = False,  # pylint: disable=too-many-arguments
               greater_than: Optional[Decimal] = None, minimum: Optional[Decimal] = None,
               maximum: Optional[Decimal] = None, places: int = 2,
               default: Optional[Decimal] = None) -> Optional[Decimal]:
        """
        Validate a decimal amount (JSON number or numeric string, e.g. "37.5").

        Returns a Decimal, never a float, so money and hours stay exact.
        """
        value = self.data.get(name)
        if value in (None, ""):
            if required and default is None:
                self.add_error(name, REQUIRED)
            self.clean[name] = default
            return default
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            self.add_error(name, "Must be a number")
            return None
        try:
            number = Decimal(str(value).strip())
        except InvalidOperation:
            number = None
        if number is None or not number.is_finite():
            self.add_error(name, "Must be a number")
            return None
        if -number.as_tuple().exponent > places:
            self.add_error(name, f"Use at most {places} decimal places")
        elif greater_than is not None and number <= greater_than:
            self.add_error(name, f"Must be greater than {greater_than}")
        elif minimum is not None and number < minimum:
            self.add_error(name, f"Must be at least {minimum}")
        elif maximum is not None and number > maximum:
            self.add_error(name, f"Must be at most {maximum}")
        self.clean[name] = number
        return number

    def boolean(self, name: str, *, default: bool) -> bool:
        """Validate an optional true/false field."""
        value = self.data.get(name)
        if value is None:
            value = default
        elif not isinstance(value, bool):
            self.add_error(name, "Must be true or false")
            return default
        self.clean[name] = value
        return value

    def raise_if_errors(self) -> None:
        """Raise a 400 ApiError listing every invalid field, if there are any."""
        if self.errors:
            raise ApiError(400, "validation_error", "Some fields are invalid", self.errors)
