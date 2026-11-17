import pytest
from shapely.geometry import Point

from backend.src.models.network import (
    Bus,
    Consumer,
    DistributionTransformer,
    Feeder,
    Line,
    Organisation,
    Substation,
    Switch,
)
from backend.src.modules.topology_ai.consistency import TopologyConsistencyEngine


@pytest.fixture
def base_network(db_session):
    """Sets up a minimal base feeder network in the test DB session."""
    org = Organisation(code="TEST_ORG", name="Test Utility")
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id, code="SS_TEST", name="Substation", nominal_kv=33.0
    )
    db_session.add(sub)
    db_session.flush()

    feeder = Feeder(
        substation_id=sub.id, code="F_TEST", name="Feeder 1", voltage_kv=11.0
    )
    db_session.add(feeder)
    db_session.flush()

    # Create 3 buses in line: B1 (slack) -> B2 -> B3
    b1 = Bus(
        feeder_id=feeder.id,
        code="BUS_1",
        bus_type="slack",
        voltage_level_kv=11.0,
        geom=Point(78.40, 17.40),
    )
    b2 = Bus(
        feeder_id=feeder.id,
        code="BUS_2",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.41, 17.40),
    )
    b3 = Bus(
        feeder_id=feeder.id,
        code="BUS_3",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.42, 17.40),
    )
    db_session.add_all([b1, b2, b3])
    db_session.flush()

    # Lines: B1-B2 and B2-B3
    l1 = Line(
        feeder_id=feeder.id,
        from_bus_id=b1.id,
        to_bus_id=b2.id,
        code="L1",
        length_km=0.5,
        r_ohm_per_km=0.9,
        x_ohm_per_km=0.3,
        max_i_ka=0.14,
    )
    l2 = Line(
        feeder_id=feeder.id,
        from_bus_id=b2.id,
        to_bus_id=b3.id,
        code="L2",
        length_km=0.5,
        r_ohm_per_km=0.9,
        x_ohm_per_km=0.3,
        max_i_ka=0.14,
    )
    db_session.add_all([l1, l2])

    # DTR on B3
    dtr = DistributionTransformer(
        bus_id=b3.id, code="DTR_1", rated_kva=100.0, geom=Point(78.42, 17.40)
    )
    db_session.add(dtr)

    # Switch
    sw = Switch(
        from_bus_id=b1.id,
        to_bus_id=b2.id,
        code="SW_1",
        switch_type="sectionalizer",
        current_status="closed",
    )
    db_session.add(sw)
    db_session.flush()

    return {
        "feeder": feeder,
        "buses": [b1, b2, b3],
        "lines": [l1, l2],
        "dtr": dtr,
        "sw": sw,
    }


def test_clean_network_validation(db_session, base_network):
    """Verify clean base network passes with 0 critical defects."""
    engine = TopologyConsistencyEngine()
    result = engine.validate_network(db_session, feeder_id=base_network["feeder"].id)

    assert result.is_valid is True
    assert result.critical_count == 0


def test_orphan_bus_detection(db_session, base_network):
    """Verify orphan bus with degree 0 is detected as critical error."""
    feeder = base_network["feeder"]
    orphan = Bus(
        feeder_id=feeder.id,
        code="BUS_ORPHAN",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.50, 17.50),
    )
    db_session.add(orphan)
    db_session.flush()

    engine = TopologyConsistencyEngine()
    result = engine.validate_network(db_session, feeder_id=feeder.id)

    assert result.is_valid is False
    rule_ids = [d.rule_id for d in result.defects]
    assert "TOPO_ERR_ORPHAN_BUS" in rule_ids
    orphan_defect = next(
        d for d in result.defects if d.rule_id == "TOPO_ERR_ORPHAN_BUS"
    )
    assert orphan_defect.entity_code == "BUS_ORPHAN"
    assert orphan_defect.severity == "critical"


def test_radial_loop_detection(db_session, base_network):
    """Verify closed loop in radial feeder is detected as critical defect."""
    feeder = base_network["feeder"]
    b1, _b2, b3 = base_network["buses"]

    # Close loop by adding line from B3 back to B1
    loop_line = Line(
        feeder_id=feeder.id,
        from_bus_id=b3.id,
        to_bus_id=b1.id,
        code="L_LOOP_3_1",
        length_km=1.0,
        r_ohm_per_km=0.9,
        x_ohm_per_km=0.3,
        max_i_ka=0.14,
        is_operational=True,
    )
    db_session.add(loop_line)
    db_session.flush()

    engine = TopologyConsistencyEngine()
    result = engine.validate_network(db_session, feeder_id=feeder.id)

    assert result.is_valid is False
    rule_ids = [d.rule_id for d in result.defects]
    assert "TOPO_ERR_RADIAL_LOOP" in rule_ids


def test_disconnected_dtr_detection(db_session, base_network):
    """Verify DTR attached to an isolated bus is detected as disconnected."""
    feeder = base_network["feeder"]
    island_bus = Bus(
        feeder_id=feeder.id,
        code="BUS_ISLAND",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.60, 17.60),
    )
    db_session.add(island_bus)
    db_session.flush()

    # Line between island bus and another unconnected bus
    island_bus_2 = Bus(
        feeder_id=feeder.id,
        code="BUS_ISLAND_2",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.61, 17.61),
    )
    db_session.add(island_bus_2)
    db_session.flush()

    l_island = Line(
        feeder_id=feeder.id,
        from_bus_id=island_bus.id,
        to_bus_id=island_bus_2.id,
        code="L_ISLAND",
        length_km=0.3,
        r_ohm_per_km=0.9,
        x_ohm_per_km=0.3,
        max_i_ka=0.14,
    )
    db_session.add(l_island)

    dtr_island = DistributionTransformer(
        bus_id=island_bus_2.id,
        code="DTR_ISLAND",
        rated_kva=63.0,
        geom=Point(78.61, 17.61),
    )
    db_session.add(dtr_island)
    db_session.flush()

    engine = TopologyConsistencyEngine()
    result = engine.validate_network(db_session, feeder_id=feeder.id)

    assert result.is_valid is False
    rule_ids = [d.rule_id for d in result.defects]
    assert "TOPO_ERR_DISCONNECTED_DTR" in rule_ids


def test_voltage_mismatch_detection(db_session, base_network):
    """Verify line connecting different voltage levels directly is caught."""
    feeder = base_network["feeder"]
    b1 = base_network["buses"][0]

    b_33kv = Bus(
        feeder_id=feeder.id,
        code="BUS_33KV",
        bus_type="pq",
        voltage_level_kv=33.0,  # 33 kV
        geom=Point(78.405, 17.405),
    )
    db_session.add(b_33kv)
    db_session.flush()

    bad_line = Line(
        feeder_id=feeder.id,
        from_bus_id=b1.id,  # 11 kV
        to_bus_id=b_33kv.id,  # 33 kV
        code="L_MISMATCH",
        length_km=0.2,
        r_ohm_per_km=0.9,
        x_ohm_per_km=0.3,
        max_i_ka=0.14,
    )
    db_session.add(bad_line)
    db_session.flush()

    engine = TopologyConsistencyEngine()
    result = engine.validate_network(db_session, feeder_id=feeder.id)

    assert result.is_valid is False
    rule_ids = [d.rule_id for d in result.defects]
    assert "TOPO_ERR_VOLTAGE_MISMATCH" in rule_ids


def test_undefined_switch_status_detection(db_session, base_network):
    """Verify switch with status other than 'open' or 'closed' is flagged."""
    sw = base_network["sw"]
    sw.current_status = "floating_unknown"
    db_session.flush()

    engine = TopologyConsistencyEngine()
    result = engine.validate_network(db_session, feeder_id=base_network["feeder"].id)

    assert result.is_valid is False
    rule_ids = [d.rule_id for d in result.defects]
    assert "TOPO_ERR_UNDEFINED_SWITCH" in rule_ids


def test_duplicate_asset_warning(db_session, base_network):
    """Verify duplicate asset codes trigger warning."""
    feeder = base_network["feeder"]
    b1 = base_network["buses"][0]
    import uuid

    dup_bus = Bus(
        id=uuid.uuid4(),
        feeder_id=feeder.id,
        code=b1.code,  # Duplicate code BUS_1
        bus_type="pq",
        voltage_level_kv=11.0,
    )

    engine = TopologyConsistencyEngine()
    defects = engine.check_duplicate_assets(
        buses=[b1, dup_bus],
        lines=[],
        dtrs=[],
    )

    rule_ids = [d.rule_id for d in defects]
    assert "TOPO_WARN_DUPLICATE_ASSET" in rule_ids


def test_consumer_distance_outlier_warning(db_session, base_network):
    """Verify consumer situated > threshold distance from DTR triggers warning."""
    dtr = base_network["dtr"]  # Point(78.42, 17.40)

    # Place consumer at Point(78.50, 17.50) ~ 14 km away!
    far_consumer = Consumer(
        dtr_id=dtr.id,
        service_number="CON_FAR_AWAY",
        sanctioned_load_kw=2.0,
        geom=Point(78.50, 17.50),
    )
    db_session.add(far_consumer)
    db_session.flush()

    engine = TopologyConsistencyEngine(consumer_distance_threshold_m=1000.0)
    result = engine.validate_network(db_session, feeder_id=base_network["feeder"].id)

    rule_ids = [d.rule_id for d in result.defects]
    assert "TOPO_WARN_DISTANCE_OUTLIER" in rule_ids
