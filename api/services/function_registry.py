"""Load callables from a Python package folder (plugin pattern)."""

from __future__ import annotations

import importlib
from collections.abc import Callable
from pathlib import Path
from typing import Any


class FunctionRegistry:
    """Maps stem names to ``execute`` callables discovered under ``package``."""

    def __init__(self) -> None:
        self._functions: dict[str, Callable[..., Any]] = {}

    def load_from_folder(self, folder: str, package: str) -> None:
        for file in Path(folder).glob("*.py"):
            if file.name.startswith("_"):
                continue
            module_name = file.stem
            full_module_name = f"{package}.{module_name}"
            module = importlib.import_module(full_module_name)
            if hasattr(module, "execute"):
                self._functions[module_name] = module.execute

    def register(self, name: str, fn: Callable[..., Any]) -> None:
        self._functions[name] = fn

    def execute(self, name: str, *args: Any, **kwargs: Any) -> Any:
        if name not in self._functions:
            raise ValueError(f"Function not found: {name}")
        return self._functions[name](*args, **kwargs)

    def has(self, name: str) -> bool:
        return name in self._functions
