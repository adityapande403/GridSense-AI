from typing import Any, Dict, Optional

from backend.src.core.database import get_db
from backend.src.models import DistributionTransformer, Feeder, Line, TopologyVersion
from backend.src.modules.network.benchmarks import (
    load_ieee33_benchmark,
    load_ieee69_benchmark,
    verify_benchmark,
)
from backend.src.modules.network.generator import TelanganaSyntheticNetworkGenerator
from backend.src.modules.network.serialization import save_synthetic_network_to_db
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/network", tags=["Network Digital Twin & Benchmarks"])


class GenerateSyntheticRequest(BaseModel):
    seed: int = Field(default=42, description="RNG seed for 100% deterministic reproducibility")
    archetype: str = Field(default="mixed", description="urban | rural_agricultural | mixed")
    injected_scenario: str = Field(
        default="normal",
        description="normal | dtr_overload | feeder_overload | undervoltage | fault_section",
    )
    persist_to_db: bool = Field(default=False, description="Persist the generated network into relational database")
    version_tag: Optional[str] = Field(default=None, description="Optional custom version tag")


class GenerateSyntheticResponse(BaseModel):
    network_id: str
    network_hash: str
    seed: int
    archetype: str
    injected_scenario: str
    bus_count: int
    line_count: int
    dtr_count: int
    switch_count: int
    consumer_count: int
    initial_power_flow: Dict[str, Any]
    persisted_version_id: Optional[str] = None
    provenance: str = "synthetic"


@router.post("/synthetic/generate", response_model=GenerateSyntheticResponse)
def generate_synthetic_network(
    req: GenerateSyntheticRequest,
    db: Session = Depends(get_db),
):
    """
    Generates a seeded, reproducible Telangana-style distribution network.
    Optionally persists the digital twin into the database.
    """
    gen = TelanganaSyntheticNetworkGenerator(
        seed=req.seed,
        archetype=req.archetype,
    )
    net_data = gen.generate(injected_scenario=req.injected_scenario)

    version_id_str = None
    if req.persist_to_db:
        v_tag = req.version_tag or f"v1.0.0-seed{req.seed}-{req.injected_scenario}"
        top_version = save_synthetic_network_to_db(
            db=db,
            net_data=net_data,
            version_tag=v_tag,
            is_authoritative=True,
        )
        version_id_str = str(top_version.id)

    return GenerateSyntheticResponse(
        network_id=net_data["network_id"],
        network_hash=net_data["network_hash"],
        seed=net_data["seed"],
        archetype=net_data["archetype"],
        injected_scenario=net_data["injected_scenario"],
        bus_count=len(net_data["buses"]),
        line_count=len(net_data["lines"]),
        dtr_count=len(net_data["dtrs"]),
        switch_count=len(net_data["switches"]),
        consumer_count=len(net_data["consumers"]),
        initial_power_flow=net_data["initial_power_flow"],
        persisted_version_id=version_id_str,
        provenance="synthetic",
    )


@router.get("/benchmarks/{benchmark_id}")
def get_benchmark_verification(benchmark_id: str):
    """
    Loads and runs AC power-flow verification for standard IEEE 33-bus or 69-bus benchmarks.
    """
    bench_upper = benchmark_id.upper()
    if bench_upper in ["IEEE33", "CASE33", "33"]:
        net = load_ieee33_benchmark()
    elif bench_upper in ["IEEE69", "CASE69", "69"]:
        net = load_ieee69_benchmark()
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Benchmark '{benchmark_id}' not found. Supported: IEEE33, IEEE69",
        )

    return verify_benchmark(net)


@router.get("/feeders")
def list_feeders(db: Session = Depends(get_db)):
    """List all feeders in database with telemetry summary."""
    feeders = db.query(Feeder).all()
    results = []
    for f in feeders:
        dtr_count = (
            db.query(DistributionTransformer)
            .join(DistributionTransformer.bus)
            .filter(DistributionTransformer.bus.has(feeder_id=f.id))
            .count()
        )
        line_count = db.query(Line).filter(Line.feeder_id == f.id).count()

        results.append({
            "id": str(f.id),
            "code": f.code,
            "name": f.name,
            "voltage_kv": f.voltage_kv,
            "trunk_conductor": f.trunk_conductor_type,
            "dtr_count": dtr_count,
            "line_count": line_count,
            "provenance": f.provenance,
        })
    return results


@router.get("/topology-versions")
def list_topology_versions(db: Session = Depends(get_db)):
    """List all immutable topology versions recorded in the twin registry."""
    versions = db.query(TopologyVersion).order_by(TopologyVersion.created_at.desc()).all()
    return [
        {
            "id": str(v.id),
            "version_tag": v.version_tag,
            "network_hash": v.network_hash,
            "description": v.description,
            "is_authoritative": v.is_authoritative,
            "metadata": v.metadata_json,
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]
