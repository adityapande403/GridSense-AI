from contextlib import asynccontextmanager

from backend.src.api.v1.router import api_v1_router
from backend.src.core.config import settings
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup sequence: ensure tables exist if running SQLite in local mode
    if settings.DATABASE_URL.startswith("sqlite"):
        import backend.src.models  # noqa: F401
        from backend.src.core.database import Base, engine

        Base.metadata.create_all(bind=engine)
    yield
    # Shutdown sequence


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="GridSense-AI: Advisory-Only Distribution Network Intelligence Platform for TISC 2026 Challenge 08 (TSSPDCL / TSNPDCL)",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Uniform error response handler ensuring no raw tracebacks leak to clients."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": str(exc)
            if settings.DEBUG
            else "An unexpected internal server error occurred.",
            "path": str(request.url.path),
        },
    )


# Mount versioned API routes
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


@app.get("/")
def root_redirect():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "health_url": f"{settings.API_V1_STR}/health",
        "advisory_only": True,
    }
