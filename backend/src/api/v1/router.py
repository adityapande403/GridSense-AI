from backend.src.api.v1.config import router as config_router
from backend.src.api.v1.health import router as health_router
from backend.src.api.v1.ingest import router as ingest_router
from backend.src.api.v1.network import router as network_router
from backend.src.api.v1.physics import router as physics_router
from backend.src.api.v1.topology import router as topology_router
from backend.src.api.v1.switching import router as switching_router
from backend.src.api.v1.flisr import router as flisr_router
from backend.src.api.v1.capex import router as capex_router
from backend.src.api.v1.estimation import router as estimation_router
from backend.src.api.v1.thermal import router as thermal_router
from fastapi import APIRouter

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(config_router)
api_v1_router.include_router(network_router)
api_v1_router.include_router(ingest_router)
api_v1_router.include_router(topology_router)
api_v1_router.include_router(physics_router)
api_v1_router.include_router(switching_router)
api_v1_router.include_router(flisr_router)
api_v1_router.include_router(capex_router)
api_v1_router.include_router(estimation_router)
api_v1_router.include_router(thermal_router)

