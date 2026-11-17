from shapely.geometry import Point

from backend.src.api.v1.ingest import (
    IngestGeoJSONRequest,
    ingest_geojson,
    validate_dataset,
)
from backend.src.api.v1.topology import (
    ApproveCandidateRequest,
    ValidateTopologyRequest,
    approve_candidate,
    get_snapping_candidates,
    validate_topology,
)
from backend.src.models.network import Bus, Feeder, Line, Organisation, Substation


def test_api_ingest_validate_geojson():
    """Verify validate_dataset endpoint with GeoJSON payload."""
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.4, 17.4]},
                "properties": {"entity_type": "bus", "code": "B_API_1"},
            }
        ],
    }
    report = validate_dataset(source_type="geojson", payload=payload)
    assert report.total_rows == 1
    assert report.rows_accepted == 1


def test_api_ingest_geojson_direct(db_session):
    """Verify ingest_geojson endpoint directly."""
    req = IngestGeoJSONRequest(
        data={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [78.4, 17.4]},
                    "properties": {
                        "entity_type": "bus",
                        "code": "B_API_TEST",
                        "voltage_level_kv": 11.0,
                    },
                }
            ],
        },
        version_tag="v_api_test_1",
    )
    result = ingest_geojson(request=req, db=db_session)
    assert result.success is True
    assert result.version_tag == "v_api_test_1"
    assert result.created_counts["buses"] == 1


def test_api_topology_validate(db_session):
    """Verify validate_topology endpoint."""
    req = ValidateTopologyRequest()
    result = validate_topology(request=req, db=db_session)
    assert hasattr(result, "is_valid")
    assert hasattr(result, "critical_count")
    assert hasattr(result, "defects")


def test_api_topology_candidates_and_approval(db_session):
    """Verify candidate querying and approval endpoints."""
    # Setup two proximate buses
    org = Organisation(code="ORG_API", name="API Org")
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id, code="SS_API", name="Substation", nominal_kv=33.0
    )
    db_session.add(sub)
    db_session.flush()

    feeder = Feeder(substation_id=sub.id, code="F_API", name="Feeder", voltage_kv=11.0)
    db_session.add(feeder)
    db_session.flush()

    b1 = Bus(
        feeder_id=feeder.id,
        code="B_PROX_1",
        bus_type="slack",
        voltage_level_kv=11.0,
        geom=Point(78.40000, 17.40000),
    )
    b2 = Bus(
        feeder_id=feeder.id,
        code="B_PROX_2",
        bus_type="pq",
        voltage_level_kv=11.0,
        geom=Point(78.40002, 17.40000),
    )
    db_session.add_all([b1, b2])
    db_session.flush()

    # Query candidates
    candidates = get_snapping_candidates(
        feeder_id=feeder.id, tolerance_meters=5.0, db=db_session
    )
    assert len(candidates) == 1
    cand = candidates[0]

    # Approve candidate
    approve_req = ApproveCandidateRequest(
        candidate=cand,
        approver_name="Er. S. Rao (Divisional Engineer)",
        conductor_type="ACSR_Weasel",
    )
    response = approve_candidate(request=approve_req, db=db_session)
    assert response["success"] is True
    assert response["approver"] == "Er. S. Rao (Divisional Engineer)"

    # Verify line was created
    created_line = db_session.query(Line).filter_by(code=response["line_code"]).first()
    assert created_line is not None
