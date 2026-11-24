"""
HTTP helpers for Lambda Function URL events: parsing, routing and JSON responses.

Every service builds its Lambda entry point with ``make_handler(routes)``.
Errors are raised as ``ApiError`` anywhere in a handler and turned into the
same JSON shape for every service::

    {"error": {"code": "validation_error", "message": "...", "details": {...}}}
"""

import base64
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, Optional

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class ApiError(Exception):
    """An error that is returned to the client as a JSON error response."""

    def __init__(self, status: int, code: str, message: str, details: Optional[dict] = None):
        """
        Create an API error.

        Args:
            status: HTTP status code, e.g. 400 or 404.
            code: Stable machine-readable error code, e.g. "not_found".
            message: Human-readable explanation shown to users.
            details: Optional extra information, e.g. per-field validation messages.
        """
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


@dataclass
class Request:
    """The parts of a Lambda Function URL event that handlers need."""

    method: str
    path: list[str]
    query: dict[str, str]
    headers: dict[str, str]
    body: Optional[str]
    user: Any = field(default=None)

    def json(self) -> dict:
        """
        Parse the request body as a JSON object.

        Returns:
            The decoded JSON object.

        Raises:
            ApiError: 400 if the body is missing, malformed, or not an object.
        """
        try:
            data = json.loads(self.body or "")
        except ValueError as exc:
            raise ApiError(400, "invalid_json", "Request body must be valid JSON") from exc
        if not isinstance(data, dict):
            raise ApiError(400, "invalid_json", "Request body must be a JSON object")
        return data


def parse_request(event: dict) -> Request:
    """
    Convert a Lambda Function URL (payload v2) event into a Request.

    The path differs by environment: CloudFront forwards ``/api/<service>/12``
    while the local proxy forwards ``/12``. Both become ``["12"]``.

    Args:
        event: The raw Lambda event.

    Returns:
        The parsed request.
    """
    http = event.get("requestContext", {}).get("http", {})
    segments = [part for part in event.get("rawPath", "/").split("/") if part]
    if len(segments) >= 2 and segments[0] == "api":
        segments = segments[2:]

    body = event.get("body")
    if body and event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")

    return Request(
        method=http.get("method", "GET").upper(),
        path=segments,
        query=event.get("queryStringParameters") or {},
        headers={key.lower(): value for key, value in (event.get("headers") or {}).items()},
        body=body,
    )


def _json_default(value: Any) -> str:
    """Serialize dates as ISO 8601 and decimals as exact strings (never floats)."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def json_response(status: int, body: Any = None) -> dict:
    """
    Build a Lambda response with a JSON body.

    Args:
        status: HTTP status code.
        body: Any JSON-serializable value, or None for an empty body (e.g. 204).

    Returns:
        A Lambda Function URL response dict.
    """
    response = {"statusCode": status, "headers": {"Content-Type": "application/json"}}
    if body is not None:
        response["body"] = json.dumps(body, default=_json_default)
    return response


def error_response(error: ApiError) -> dict:
    """Build the standard JSON error response for an ApiError."""
    payload = {"code": error.code, "message": error.message}
    if error.details:
        payload["details"] = error.details
    return json_response(error.status, {"error": payload})


# ASCII digits only: str.isdigit() also accepts characters such as "²"
_ID_PATTERN = re.compile(r"[1-9][0-9]{0,17}")


def parse_id(raw_id: str, label: str = "Id") -> int:
    """
    Convert a path id to an int.

    Raises:
        ApiError: 400 unless the value is a positive whole number (ASCII digits).
    """
    if not isinstance(raw_id, str) or not _ID_PATTERN.fullmatch(raw_id):
        raise ApiError(400, "invalid_id", f"{label} must be a positive number")
    return int(raw_id)


def parse_bool(name: str, raw: Optional[str]) -> Optional[bool]:
    """
    Parse an optional true/false query parameter (missing or empty → None).

    Raises:
        ApiError: 400 for any other value.
    """
    if raw in (None, ""):
        return None
    if raw in ("true", "false"):
        return raw == "true"
    raise ApiError(400, "validation_error", "Invalid filter", {name: "Must be true or false"})


Route = tuple[str, str, Callable[..., dict]]


def _match(pattern: list[str], path: list[str]) -> Optional[dict[str, str]]:
    """Match path segments against a pattern like ["{id}"]; return captured params."""
    if len(pattern) != len(path):
        return None
    params = {}
    for expected, actual in zip(pattern, path):
        if expected.startswith("{") and expected.endswith("}"):
            params[expected[1:-1]] = actual
        elif expected != actual:
            return None
    return params


def make_handler(routes: list[Route]) -> Callable[[dict, Any], dict]:
    """
    Create a Lambda handler that dispatches requests to route functions.

    Args:
        routes: (method, path pattern, function) tuples, e.g. ("GET", "/{id}", get_item).
            Path parameters are passed to the function as keyword arguments.

    Returns:
        A ``handler(event, context)`` function for Lambda.
    """
    compiled = [(method, [part for part in pattern.split("/") if part], func)
                for method, pattern, func in routes]

    def handler(event: dict, context: Any = None) -> dict:
        try:
            request = parse_request(event)
            if request.method == "OPTIONS":
                return json_response(204)

            path_matched = False
            for method, pattern, func in compiled:
                params = _match(pattern, request.path)
                if params is None:
                    continue
                path_matched = True
                if method == request.method:
                    return func(request, **params)

            if path_matched:
                raise ApiError(405, "method_not_allowed", f"{request.method} is not allowed here")
            raise ApiError(404, "not_found", "Route not found")
        except ApiError as error:
            return error_response(error)
        except Exception:  # pylint: disable=broad-except
            # Log the details for us, return a generic message to the client
            logger.exception("Unhandled error")
            return error_response(ApiError(500, "internal_error", "An unexpected error occurred"))

    return handler
