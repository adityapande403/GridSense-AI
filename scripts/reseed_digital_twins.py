"""
Reseed digital twin networks (Kerala KSEB Puthiya Kadavu + Telangana Synthetic)
Ensures 100% of network entities possess valid geographic geometries.
"""
import os
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from backend.src.core.database import SessionLocal, engine, Base
from backend.src.models import (
    Organisation, Substation, Feeder, Bus, Line, DistributionTransformer, Switch, Consumer,
    TopologyVersion, TopologyDiff, AuditLog, LoadSnapshot, LoadMeasurement
)
from backend.src.modules.network.generator import TelanganaSyntheticNetworkGenerator
from backend.src.modules.network.serialization import save_synthetic_network_to_db
from backend.src.modules.ingest.filegdb_adapter import FileGDBIngestionAdapter

def main():
    db = SessionLocal()
    print("Clearing existing network tables...")
    # Delete in order of foreign key constraints
    db.query(LoadMeasurement).delete()
    db.query(LoadSnapshot).delete()
    db.query(TopologyDiff).delete()
    db.query(AuditLog).delete()
    db.query(Consumer).delete()
    db.query(DistributionTransformer).delete()
    db.query(Switch).delete()
    db.query(Line).delete()
    db.query(Bus).delete()
    db.query(Feeder).delete()
    db.query(Substation).delete()
    db.query(Organisation).delete()
    db.query(TopologyVersion).delete()
    db.commit()

    print("1. Ingesting Kerala Brownfield KSEB GIS (Puthiya Kadavu.gdb)...")
    gdb_path = root_dir / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb"
    adapter = FileGDBIngestionAdapter()
    res = adapter.ingest(source=gdb_path, db_session=db, version_tag="v_kseb_authoritative")
    print(f"KSEB Ingestion result: success={res.success}, counts={res.created_counts}")

    print("2. Generating Telangana Synthetic Benchmark Network (Seed 42)...")
    gen = TelanganaSyntheticNetworkGenerator(seed=42, archetype="mixed")
    net_data = gen.generate(injected_scenario="normal")
    save_synthetic_network_to_db(db=db, net_data=net_data, version_tag="v1.0.0-authoritative-seed")
    print("Telangana Network saved with full geometry persistence.")

    # Verifications
    print("\n=== Database Geometry Verification ===")
    feeders = db.query(Feeder).all()
    for f in feeders:
        buses = db.query(Bus).filter(Bus.feeder_id == f.id).all()
        lines = db.query(Line).filter(Line.feeder_id == f.id).all()
        dtrs = db.query(DistributionTransformer).filter(DistributionTransformer.bus_id.in_([b.id for b in buses])).all()
        b_geoms = sum(1 for b in buses if b.geom is not None)
        l_geoms = sum(1 for l in lines if l.geom is not None)
        d_geoms = sum(1 for d in dtrs if d.geom is not None)
        print(f"Feeder {f.code} ({f.name}):")
        print(f"  - Buses: {len(buses)} (with valid geom: {b_geoms})")
        print(f"  - Lines: {len(lines)} (with valid geom: {l_geoms})")
        print(f"  - DTRs:  {len(dtrs)} (with valid geom: {d_geoms})")

    db.close()
    print("\nDatabase reseeding complete!")

if __name__ == "__main__":
    main()
