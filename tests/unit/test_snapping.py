import pytest
from shapely.geometry import Point

from backend.src.models.network import (
    Bus,
    Connection,
    Feeder,
    Line,
    Organisation,
    Substation,
)
from backend.src.models.topology import TopologyDiff, TopologyVersion
from backend.src.modules.topology_ai.snapping import SnappingRulesEngine


@pytest.fixture
def snapping_setup(db_session):
    org = Organisation(code="SNAP_ORG", name="Snapping Org")
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id, code="SS_SNAP", name="Substation", nominal_kv=33.0
    )
    db_session.add(sub)
    db_session.flush()

    feeder = Feeder(
        substation_id=sub.id, code="F_SNAP", name="Snapping Feeder", voltage_kv=11.0
    )
    db_session.add(feeder)
    db_session.flush()

    # Create an authoritative TopologyVersion
    topo = TopologyVersion(
        version_tag="v_snap_auth",
        network_hash="0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff",
        is_authoritative=True,
    )
    db_session.add(topo)
    db_session.flush()

    # Bus 1 at (78.400000, 17.400000)
    # Bus 2 at (78.400027, 17.400000) -> 0.000027 degrees lon ~ 3.0 meters!
    b1 = Bus(
        feeder_id=feeder.id,
        code="BUS_SNAP_1",
        bus_type="slack",
        voltage_level_kv=11.0,
        geom=Point(78.400000, 17.400000),
    )
    b2 = Bus(
        feeder_id=feeder.id,
        code="BUS_SNAP_2",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.400027, 17.400000),
    )
    # Bus 3 far away (500m)
    b3 = Bus(
        feeder_id=feeder.id,
        code="BUS_SNAP_3",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.405000, 17.405000),
    )

    db_session.add_all([b1, b2, b3])
    db_session.flush()

    return {"feeder": feeder, "b1": b1, "b2": b2, "b3": b3, "topo": topo}


def test_candidate_connections_found(db_session, snapping_setup):
    """Verify candidate connection found between buses within 5m tolerance."""
    engine = SnappingRulesEngine(default_ht_tolerance_m=5.0)
    candidates = engine.find_snapping_candidates(
        db_session=db_session,
        feeder_id=snapping_setup["feeder"].id,
        tolerance_meters=5.0,
    )

    assert len(candidates) == 1
    cand = candidates[0]
    assert cand.from_code in ("BUS_SNAP_1", "BUS_SNAP_2")
    assert cand.to_code in ("BUS_SNAP_1", "BUS_SNAP_2")
    assert cand.distance_meters <= 5.0
    assert cand.status == "candidate_for_review"
    assert cand.provenance == "estimated"
    assert cand.confidence_score > 0.5


def test_authoritative_topology_is_never_silently_mutated(db_session, snapping_setup):
    """Principle A4-4 & A4-9: Merely finding candidates MUST NOT alter database topology or lines."""
    initial_line_count = db_session.query(Line).count()
    initial_conn_count = db_session.query(Connection).count()

    engine = SnappingRulesEngine(default_ht_tolerance_m=5.0)
    candidates = engine.find_snapping_candidates(db_session=db_session)
    assert len(candidates) >= 1

    # Lines and connections must be strictly unchanged
    assert db_session.query(Line).count() == initial_line_count
    assert db_session.query(Connection).count() == initial_conn_count


def test_operator_approval_applies_connection(db_session, snapping_setup):
    """Principle A6: Explicit operator sign-off applies connection and logs diff."""
    engine = SnappingRulesEngine(default_ht_tolerance_m=5.0)
    candidates = engine.find_snapping_candidates(db_session=db_session)
    cand = candidates[0]

    line = engine.approve_and_apply_candidate(
        candidate=cand,
        db_session=db_session,
        approver_name="Er. Ramesh (AEE)",
        conductor_type="ACSR_Rabbit",
    )

    assert line.id is not None
    assert line.conductor_type == "ACSR_Rabbit"
    assert line.provenance == "estimated"
    assert "OperatorApproval:Er. Ramesh (AEE)" in line.source

    # Connection table record created
    conn = db_session.query(Connection).filter_by(from_element_id=line.id).first()
    assert conn is not None
    assert conn.is_active is True

    # TopologyDiff logged
    diff = db_session.query(TopologyDiff).filter_by(entity_id=line.id).first()
    assert diff is not None
    assert diff.action == "add"
    assert diff.diff_payload["approved_by"] == "Er. Ramesh (AEE)"
