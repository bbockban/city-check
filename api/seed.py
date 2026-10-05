"""
Seed reference urban zoning data (Plan Montevideo tertiary areas + general limits).
Run with: poetry run python seed.py
"""

import asyncio

from sqlalchemy import func, select

from database import AsyncSessionLocal, engine
from models.zoning import (
    RegulatoryScope,
    RegulatoryScopeType,
    ScopeNormLimit,
    UrbanParameter,
    ZoningArea,
)
from seeds.urban_zoning import URBAN_PARAMETERS_SEED, ZONING_AREAS_SEED


async def seed_urban_zoning() -> None:
    async with AsyncSessionLocal() as session:
        n_zones = await session.scalar(select(func.count()).select_from(ZoningArea))
        if n_zones:
            print(f"⚠️  Found {n_zones} zoning area(s).")
            response = input("Add seed data anyway? (y/n): ")
            if response.lower() != "y":
                print("Skipping seed.")
                return

        kind_to_param: dict = {}
        for row in URBAN_PARAMETERS_SEED:
            kind = row["parameter_kind"]
            result = await session.execute(
                select(UrbanParameter).where(UrbanParameter.parameter_kind == kind)
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.metric_key = str(row["metric_key"])
                existing.limit_key = str(row["limit_key"])
                existing.rule_expression = dict(row["rule_expression"])
                kind_to_param[kind] = existing
            else:
                p = UrbanParameter(
                    name=str(row["name"]),
                    description=(row.get("description") or None),
                    unit=str(row["unit"]),
                    parameter_kind=kind,
                    metric_key=str(row["metric_key"]),
                    limit_key=str(row["limit_key"]),
                    rule_expression=dict(row["rule_expression"]),
                )
                session.add(p)
                await session.flush()
                kind_to_param[kind] = p

        for z in ZONING_AREAS_SEED:
            name = str(z["name"])
            result = await session.execute(
                select(ZoningArea).where(ZoningArea.name == name)
            )
            zone = result.scalar_one_or_none()
            if zone:
                print(f"⏭️  Zoning area '{name}' already exists. Skipping.")
                continue

            zone = ZoningArea(
                name=name,
                description=z.get("description"),
                is_active=True,
                municipality_codes=list(z["municipality_codes"]),
                match_priority=int(z["match_priority"]),
            )
            session.add(zone)
            await session.flush()

            scope = RegulatoryScope(
                zoning_area_id=zone.id,
                scope_type=RegulatoryScopeType.ZONA_GENERAL,
                description=str(z["scope_description"]),
            )
            session.add(scope)
            await session.flush()

            limits_map = z["limits"]
            for kind, (lim_val, note) in limits_map.items():
                param = kind_to_param[kind]
                session.add(
                    ScopeNormLimit(
                        regulatory_scope_id=scope.id,
                        urban_parameter_id=param.id,
                        limit_value=lim_val,
                        description=note,
                    )
                )

            print(f"✅ Seeded zoning area: {name}")

        await session.commit()
        print("\n🎉 Urban zoning seed completed.")


async def clear_urban_zoning() -> None:
    async with AsyncSessionLocal() as session:
        nz = await session.scalar(select(func.count()).select_from(ZoningArea))
        if not nz:
            print("No zoning data to delete.")
            return
        response = input(
            f"⚠️  Delete ALL zoning areas, scopes, limits, and parameter definitions "
            f"({nz} zone(s))? (yes/no): "
        )
        if response.lower() != "yes":
            print("Cancelled.")
            return
        await session.execute(ScopeNormLimit.__table__.delete())
        await session.execute(RegulatoryScope.__table__.delete())
        await session.execute(ZoningArea.__table__.delete())
        await session.execute(UrbanParameter.__table__.delete())
        await session.commit()
        print("🗑️  Cleared urban zoning tables.")


async def main() -> None:
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "clear":
        await clear_urban_zoning()
    else:
        await seed_urban_zoning()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
