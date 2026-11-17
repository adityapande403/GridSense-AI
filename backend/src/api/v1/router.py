from backend.src.api.v1.config import router as config_router
from backend.src.api.v1.health import router as health_router
from backend.src.api.v1.network import router as network_router
from fastapi import APIRouter

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(config_router)
api_v1_router.include_router(network_router)
