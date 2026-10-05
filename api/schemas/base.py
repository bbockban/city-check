"""Base Pydantic config: JSON serialized with camelCase field names."""

from typing import Any, cast

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


def camel_model_config(**extra: Any) -> ConfigDict:
    """Merge camelCase aliases with extra options (e.g. from_attributes=True)."""
    return cast(
        ConfigDict,
        {
            "alias_generator": to_camel,
            "populate_by_name": True,
            **extra,
        },
    )


class CamelModel(BaseModel):
    """Subclass for request/response models that should use camelCase in JSON."""

    model_config = camel_model_config()
