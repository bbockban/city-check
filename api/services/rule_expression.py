"""Evaluate simple JSON rule trees against a flat data context."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast


def _compare(left: Any, operator: str, right: Any) -> bool | None:
    if left is None or right is None:
        return None
    ops: dict[str, Any] = {
        "<": lambda a, b: a < b,
        "<=": lambda a, b: a <= b,
        ">": lambda a, b: a > b,
        ">=": lambda a, b: a >= b,
        "==": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
    }
    fn = ops.get(operator)
    if fn is None:
        raise ValueError(f"Unsupported operator: {operator}")
    return bool(fn(left, right))


def resolve_value(key_or_literal: Any, data: Mapping[str, Any]) -> Any:
    if isinstance(key_or_literal, int | float | bool) or key_or_literal is None:
        return key_or_literal
    if isinstance(key_or_literal, str):
        return data.get(key_or_literal)
    return key_or_literal


def evaluate_rule(node: Mapping[str, Any], data: Mapping[str, Any]) -> bool | None:
    """Recursive AND/OR/leaf evaluation; ``None`` means unknown (missing operands)."""
    if "op" in node:
        op = str(node["op"]).upper()
        items_raw = node.get("items")
        if not isinstance(items_raw, list):
            raise ValueError("Composite rule requires a list 'items'")
        items = [
            evaluate_rule(cast(Mapping[str, Any], item), data) for item in items_raw
        ]
        if op == "AND":
            if any(x is False for x in items):
                return False
            if any(x is None for x in items):
                return None
            return True
        if op == "OR":
            if any(x is True for x in items):
                return True
            if any(x is None for x in items):
                return None
            return False
        raise ValueError(f"Unsupported logical op: {op}")

    left = resolve_value(node["left"], data)
    operator = str(node["operator"])
    right = resolve_value(node["right"], data)
    return _compare(left, operator, right)
