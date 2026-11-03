"""JSON decoding that rejects duplicate object keys and non-finite numbers."""

import json
from typing import Any


def _unique_object(items: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in items:
        if key in value:
            raise ValueError("Duplicate JSON key")
        value[key] = item
    return value


def _invalid_constant(value: str) -> None:
    raise ValueError("Invalid number")


class StrictDecoder(json.JSONDecoder):
    def __init__(self, *args: Any, **kwargs: Any):
        kwargs["object_pairs_hook"] = _unique_object
        kwargs["parse_constant"] = _invalid_constant
        super().__init__(*args, **kwargs)
