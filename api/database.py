import os
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

load_dotenv()


def normalize_database_url(url: str) -> str:
    """Rewrite postgres://... / postgresql://... to the asyncpg driver scheme.

    Managed Postgres providers (Render, Heroku, etc.) hand out connection
    strings without a driver suffix; asyncpg requires postgresql+asyncpg://.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# Database URL from environment
DATABASE_URL = normalize_database_url(
    os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:password@localhost:5432/proyecto_grado_db",
    )
)

default_url = "postgresql+asyncpg://user:password@localhost:5432/proyecto_grado_db"
if not DATABASE_URL or DATABASE_URL == default_url:
    print(
        "⚠️  Warning: Using default DATABASE_URL. "
        "Create a .env file with your database credentials."
    )

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=True)

# Create async session maker
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Base class for models
Base = declarative_base()


# Dependency to get database session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
