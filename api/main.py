from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cors_config import get_cors_allow_origins
from database import Base, engine
from routers import ifc, parcels, regulations
from schemas.common import HealthResponse, RootResponse
from services import wfs_montevideo


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables
    try:
        async with engine.begin() as conn:
            # await conn.run_sync(Base.metadata.drop_all)  # Be careful with this!
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Database tables created successfully")
    except Exception as e:
        print(f"⚠️  Warning: Could not create database tables: {e}")
        print("   Make sure your DATABASE_URL is correct and the database is running")
    yield
    # Shutdown: Close connections
    await engine.dispose()
    await wfs_montevideo.close_client()


app = FastAPI(
    title="Proyecto Grado API",
    description="API REST del proyecto de grado (zonificación, parcelas WFS, IFC).",
    version="0.1.0",
    docs_url="/docs",  # Swagger UI available at /docs
    redoc_url="/redoc",  # ReDoc available at /redoc
    openapi_url="/openapi.json",  # OpenAPI schema available at /openapi.json
    lifespan=lifespan,
)

_cors_origins = get_cors_allow_origins()
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include routers
app.include_router(regulations.router)
app.include_router(parcels.router)
app.include_router(ifc.router)


@app.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    """Root endpoint"""
    return RootResponse(
        message="Bienvenido a la API de Proyecto de Grado",
        docs="/docs",
        redoc="/redoc",
        openapi="/openapi.json",
    )


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint"""
    return HealthResponse(status="en_servicio")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
