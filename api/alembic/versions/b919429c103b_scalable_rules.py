"""scalable_rules

Revision ID: b919429c103b
Revises: 915c9d366e6f
Create Date: 2026-05-20 23:17:48.679209

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b919429c103b"
down_revision = "915c9d366e6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 915c9d366e6f creates these tables via `Base.metadata.create_all()` bound to
    # the live ORM models when starting from an empty database, so on a fresh
    # install these columns already exist by the time this migration runs.
    # Guard each add_column so this stays a no-op in that case, instead of
    # colliding with revisions applied incrementally against an older schema.
    existing_columns = {
        c["name"] for c in inspect(op.get_bind()).get_columns("urban_parameters")
    }

    # 1. Add new columns as nullable first (existing rows don't break)
    if "metric_key" not in existing_columns:
        op.add_column(
            "urban_parameters",
            sa.Column("metric_key", sa.String(64), nullable=True),
        )
    if "limit_key" not in existing_columns:
        op.add_column(
            "urban_parameters",
            sa.Column("limit_key", sa.String(64), nullable=True),
        )
    if "rule_expression" not in existing_columns:
        op.add_column(
            "urban_parameters",
            sa.Column(
                "rule_expression",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
        )

    # 2. Widen limit_value: Integer → Numeric(10, 3)
    op.alter_column(
        "scope_norm_limits",
        "limit_value",
        existing_type=sa.Integer(),
        type_=sa.Numeric(10, 3),
        existing_nullable=False,
    )

    # 3. Change parameter_kind: PostgreSQL enum → VARCHAR(64)
    #    Requires explicit USING cast; SQLAlchemy cannot auto-cast enum → varchar.
    op.execute(
        "ALTER TABLE urban_parameters "
        "ALTER COLUMN parameter_kind TYPE VARCHAR(64) USING parameter_kind::text"
    )
    op.execute("DROP TYPE IF EXISTS urban_parameter_kind")

    # 4. Backfill any pre-existing rows so the NOT NULL step below never fails.
    #    Rows inserted by seed.py will already have correct values; this guard
    #    covers automated deploys where seed.py may not have run yet.
    op.execute(
        "UPDATE urban_parameters"
        " SET metric_key = parameter_kind WHERE metric_key IS NULL"
    )
    op.execute(
        "UPDATE urban_parameters SET limit_key = 'limit_value' WHERE limit_key IS NULL"
    )
    op.execute(
        "UPDATE urban_parameters"
        ' SET rule_expression = \'{"op": "AND", "items": []}\'::jsonb'
        " WHERE rule_expression IS NULL"
    )

    op.alter_column("urban_parameters", "metric_key", nullable=False)
    op.alter_column("urban_parameters", "limit_key", nullable=False)
    op.alter_column("urban_parameters", "rule_expression", nullable=False)


def downgrade() -> None:
    # Re-create the enum type
    urban_parameter_kind = postgresql.ENUM(
        "ALTURA_MAXIMA",
        "FOS",
        "RETIRO_FRONTAL",
        name="urban_parameter_kind",
    )
    urban_parameter_kind.create(op.get_bind(), checkfirst=True)

    # Cast parameter_kind back to the enum
    op.execute(
        "ALTER TABLE urban_parameters "
        "ALTER COLUMN parameter_kind TYPE urban_parameter_kind "
        "USING parameter_kind::urban_parameter_kind"
    )

    # Remove new columns
    op.drop_column("urban_parameters", "rule_expression")
    op.drop_column("urban_parameters", "limit_key")
    op.drop_column("urban_parameters", "metric_key")

    # Revert limit_value to Integer
    op.alter_column(
        "scope_norm_limits",
        "limit_value",
        existing_type=sa.Numeric(10, 3),
        type_=sa.Integer(),
        existing_nullable=False,
    )
