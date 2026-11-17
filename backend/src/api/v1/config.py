from backend.src.core.config import settings
from backend.src.schemas.health import ConfigResponse
from fastapi import APIRouter

router = APIRouter(prefix="/config", tags=["Configuration"])


@router.get("", response_model=ConfigResponse)
def get_full_configuration():
    """Retrieve active engineering, conductor, economic, and thermal configurations."""
    return ConfigResponse(
        electrical=settings.electrical_config,
        conductors=settings.conductors_config,
        economics=settings.economics_config,
        thermal=settings.thermal_config,
    )


@router.get("/electrical")
def get_electrical_configuration():
    return settings.electrical_config


@router.get("/conductors")
def get_conductors_configuration():
    return settings.conductors_config


@router.get("/economics")
def get_economics_configuration():
    return settings.economics_config


@router.get("/thermal")
def get_thermal_configuration():
    return settings.thermal_config
