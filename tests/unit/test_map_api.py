from shapely.geometry import Point

from backend.src.api.v1.network import (
    get_network_geojson,
    get_network_sld,
    list_feeders,
)
from backend.src.models.network import (
    Bus,
    DistributionTransformer,
    Feeder,
    Line,
    Organisation,
    Substation,
    Switch,
)


def test_geojson_endpoint_with_seeded_data(db_session):
    """Verify GeoJSON endpoint returns valid GIS layers and provenance."""
    # Seed minimal network
    org = Organisation(code="ORG_MAP_TEST", name="Map Test Org")
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id,
        code="SS_MAP_1",
        name="Map Substation",
        nominal_kv=33.0,
        geom=Point(78.40, 17.40),
        provenance="synthetic",
    )
    db_session.add(sub)
    db_session.flush()

    feeder = Feeder(
        substation_id=sub.id,
        code="F_MAP_1",
        name="Map Feeder 1",
        voltage_kv=11.0,
        provenance="synthetic",
    )
    db_session.add(feeder)
    db_session.flush()

    b1 = Bus(
        feeder_id=feeder.id,
        code="B_MAP_1",
        bus_type="slack",
        voltage_level_kv=11.0,
        geom=Point(78.40, 17.40),
        provenance="synthetic",
    )
    b2 = Bus(
        feeder_id=feeder.id,
        code="B_MAP_2",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.41, 17.41),
        provenance="synthetic",
    )
    db_session.add_all([b1, b2])
    db_session.flush()

    line = Line(
        feeder_id=feeder.id,
        from_bus_id=b1.id,
        to_bus_id=b2.id,
        code="L_MAP_1",
        length_km=0.8,
        r_ohm_per_km=0.9,
        x_ohm_per_km=0.3,
        max_i_ka=0.14,
        provenance="synthetic",
    )
    db_session.add(line)

    dtr = DistributionTransformer(
        bus_id=b2.id,
        code="DTR_MAP_1",
        rated_kva=250.0,
        geom=Point(78.41, 17.41),
        provenance="synthetic",
    )
    db_session.add(dtr)

    sw = Switch(
        from_bus_id=b1.id,
        to_bus_id=b2.id,
        code="SW_MAP_1",
        switch_type="sectionalizer",
        current_status="closed",
        provenance="synthetic",
    )
    db_session.add(sw)
    db_session.flush()

    # Call endpoint function directly
    res = get_network_geojson(
        feeder_code="F_MAP_1", include_consumers=False, db=db_session
    )

    assert "substations" in res
    assert "lines" in res
    assert "transformers" in res
    assert "switches" in res
    assert "summary" in res

    assert len(res["substations"]["features"]) == 1
    assert len(res["lines"]["features"]) == 1
    assert len(res["transformers"]["features"]) == 1
    assert len(res["switches"]["features"]) == 1

    # Verify GeoJSON geometries and provenance
    sub_feat = res["substations"]["features"][0]
    assert sub_feat["geometry"]["type"] == "Point"
    assert sub_feat["properties"]["provenance"] == "synthetic"

    line_feat = res["lines"]["features"][0]
    assert line_feat["geometry"]["type"] == "LineString"
    assert len(line_feat["geometry"]["coordinates"]) >= 2
    assert line_feat["properties"]["from_bus_code"] == "B_MAP_1"
    assert line_feat["properties"]["to_bus_code"] == "B_MAP_2"

    dtr_feat = res["transformers"]["features"][0]
    assert dtr_feat["properties"]["rated_kva"] == 250.0
    assert "loading_pct" in dtr_feat["properties"]


def test_sld_endpoint(db_session):
    """Verify Single Line Diagram (SLD) endpoint returns schematic nodes."""
    res = get_network_sld(db=db_session)
    assert "nodes" in res
    assert "total_nodes" in res
    assert isinstance(res["nodes"], list)


def test_feeders_list_endpoint(db_session):
    """Verify list_feeders endpoint returns summaries."""
    feeders = list_feeders(db=db_session)
    assert isinstance(feeders, list)
