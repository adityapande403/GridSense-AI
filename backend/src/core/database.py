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

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, echo=False, future=True)

SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, expire_on_commit=False, future=True
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

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        from shapely.geometry.base import BaseGeometry

        if isinstance(value, BaseGeometry):
            if dialect.name == "postgresql":
                return f"SRID=4326;{value.wkt}"
            return value.wkt
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        from geoalchemy2.elements import WKBElement
        from geoalchemy2.shape import to_shape
        from shapely import wkt

        if isinstance(value, WKBElement):
            try:
                return to_shape(value)
            except Exception:
                return value
        if isinstance(value, str):
            try:
                clean_str = value
                if clean_str.startswith("SRID="):
                    clean_str = clean_str.split(";", 1)[1]
                return wkt.loads(clean_str)
            except Exception:
                return value
        return value


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

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        from shapely.geometry.base import BaseGeometry

        if isinstance(value, BaseGeometry):
            if dialect.name == "postgresql":
                return f"SRID=4326;{value.wkt}"
            return value.wkt
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        from geoalchemy2.elements import WKBElement
        from geoalchemy2.shape import to_shape
        from shapely import wkt

        if isinstance(value, WKBElement):
            try:
                return to_shape(value)
            except Exception:
                return value
        if isinstance(value, str):
            try:
                clean_str = value
                if clean_str.startswith("SRID="):
                    clean_str = clean_str.split(";", 1)[1]
                return wkt.loads(clean_str)
            except Exception:
                return value
        return value


# Portable JSON / JSONB
JSONBType = JSON().with_variant(postgresql.JSONB, "postgresql")


def get_db() -> Generator[Session, None, None]:
    """Dependency injection for FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
