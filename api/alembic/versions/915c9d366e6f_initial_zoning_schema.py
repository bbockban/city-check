"""initial_zoning_schema

Revision ID: 915c9d366e6f
Revises:
Create Date: 2026-04-12 23:50:37.305428

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "915c9d366e6f"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    op.execute(sa.text("DROP TABLE IF EXISTS regulations CASCADE"))

    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())
    expected_tables = {
        "zoning_areas",
        "urban_parameters",
        "regulatory_scopes",
        "scope_norm_limits",
    }
    if expected_tables.issubset(existing_tables):
        return

    import models.zoning  # noqa: F401 — register metadata
    from database import Base

    Base.metadata.create_all(
        bind=bind,
        tables=[
            models.zoning.ZoningArea.__table__,
            models.zoning.UrbanParameter.__table__,
            models.zoning.RegulatoryScope.__table__,
            models.zoning.ScopeNormLimit.__table__,
        ],
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    names = set(insp.get_table_names())

    if "scope_norm_limits" in names:
        op.drop_table("scope_norm_limits")
    if "regulatory_scopes" in names:
        op.drop_table("regulatory_scopes")
    if "urban_parameters" in names:
        op.drop_table("urban_parameters")
    if "zoning_areas" in names:
        op.drop_table("zoning_areas")

    op.execute(sa.text("DROP TYPE IF EXISTS urban_parameter_kind CASCADE"))
    op.execute(sa.text("DROP TYPE IF EXISTS regulatory_scope_type CASCADE"))

    op.create_table(
        "regulations",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("zone", sa.VARCHAR(length=100), autoincrement=False, nullable=False),
        sa.Column("description", sa.TEXT(), autoincrement=False, nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("regulations_pkey")),
    )
    op.create_index(op.f("ix_regulations_zone"), "regulations", ["zone"], unique=False)
    op.create_index(op.f("ix_regulations_id"), "regulations", ["id"], unique=False)
