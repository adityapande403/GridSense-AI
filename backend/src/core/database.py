from typing import Generator

from backend.src.core.config import settings
from geoalchemy2 import Geometry
from sqlalchemy import JSON, Text, TypeDecorator, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# Engine configuration
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    future=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
    future=True
)

Base = declarative_base()


# Dialect-aware type helpers
class GeometryPointType(TypeDecorator):
    """
    On PostgreSQL + PostGIS: compiles to GEOMETRY(POINT, 4326)
    On SQLite (test/local): compiles to Text storing WKT/GeoJSON
    """
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Geometry(geometry_type="POINT", srid=4326))
        return dialect.type_descriptor(Text())


class GeometryLineStringType(TypeDecorator):
    """
    On PostgreSQL + PostGIS: compiles to GEOMETRY(LINESTRING, 4326)
    On SQLite (test/local): compiles to Text storing WKT/GeoJSON
    """
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Geometry(geometry_type="LINESTRING", srid=4326))
        return dialect.type_descriptor(Text())


# Portable JSON / JSONB
JSONBType = JSON().with_variant(postgresql.JSONB, "postgresql")


def get_db() -> Generator[Session, None, None]:
    """Dependency injection for FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
