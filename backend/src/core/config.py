import json
from pathlib import Path
from typing import Any, Dict, List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

CURRENT_FILE = Path(__file__).resolve()
SRC_DIR = CURRENT_FILE.parent.parent
BACKEND_DIR = SRC_DIR.parent
REPO_ROOT = BACKEND_DIR.parent if (BACKEND_DIR.parent / "config").exists() else BACKEND_DIR


def load_json_config(filename: str) -> Dict[str, Any]:
    config_path = REPO_ROOT / "config" / filename
    if not config_path.exists():
        alt_path = Path("config") / filename
        if alt_path.exists():
            config_path = alt_path
        else:
            return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="allow",
        populate_by_name=True,
    )

    PROJECT_NAME: str = "GridSense-AI"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database: default to SQLite for zero-dependency local runs and tests,
    # or PostgreSQL / PostGIS in Docker container / staging
    DATABASE_URL: str = Field(
        default="sqlite:///./gridsense_dev.db",
        validation_alias="DATABASE_URL",
    )

    # JWT Security
    SECRET_KEY: str = Field(
        default="gridsense-super-secret-development-key-change-in-production-2026",
        validation_alias="SECRET_KEY",
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*",
    ]

    # Preloaded domain configs
    @property
    def electrical_config(self) -> Dict[str, Any]:
        return load_json_config("electrical.json")

    @property
    def conductors_config(self) -> Dict[str, Any]:
        return load_json_config("conductors.json")

    @property
    def economics_config(self) -> Dict[str, Any]:
        return load_json_config("economics.json")

    @property
    def thermal_config(self) -> Dict[str, Any]:
        return load_json_config("thermal.json")


settings = Settings()
