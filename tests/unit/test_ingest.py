from backend.src.core.config import settings
from backend.src.models.network import DistributionTransformer
from backend.src.models.topology import TopologyVersion
from backend.src.modules.ingest.csv_adapter import CSVIngestionAdapter
from backend.src.modules.ingest.filegdb_adapter import FileGDBIngestionAdapter
from backend.src.modules.ingest.geojson_adapter import GeoJSONIngestionAdapter


def test_filegdb_validate_real_dataset():
    """Verify validation of real Puthiya Kadavu FileGDB."""
    gdb_path = settings.BASE_DIR / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb"
    if not gdb_path.exists():
        gdb_path = settings.BASE_DIR / "Puthiya Kadavu.gdb"
    assert gdb_path.exists(), f"GDB path {gdb_path} should exist"

    adapter = FileGDBIngestionAdapter()
    report = adapter.validate(gdb_path)

    assert report.source_type == "esri_filegdb"
    assert report.total_rows > 40
    assert report.rows_accepted > 40
    assert "distribution_transformer" in report.summary_counts
    assert report.summary_counts["distribution_transformer"] == 4
    assert report.summary_counts["ht_line"] == 33
    assert report.summary_counts["switch"] == 8


def test_filegdb_ingest_to_database(db_session):
    """Verify end-to-end ingestion of Puthiya Kadavu dataset into database models."""
    gdb_path = settings.BASE_DIR / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb"
    if not gdb_path.exists():
        gdb_path = settings.BASE_DIR / "Puthiya Kadavu.gdb"

    adapter = FileGDBIngestionAdapter()
    result = adapter.ingest(
        source=gdb_path, db_session=db_session, version_tag="v_test_kseb_1"
    )

    assert result.success is True
    assert result.topology_version_id is not None
    assert result.version_tag == "v_test_kseb_1"
    assert result.created_counts["distribution_transformers"] == 4
    assert result.created_counts["lines"] >= 34
    assert result.created_counts["buses"] >= 35
    assert result.created_counts["switches"] >= 8
    assert result.created_counts["connections"] >= 38

    # Verify database records
    dtrs = db_session.query(DistributionTransformer).all()
    assert len(dtrs) == 4
    for dtr in dtrs:
        assert dtr.provenance == "measured"
        assert dtr.rated_kva in (100.0, 250.0, 500.0)

    # Verify authoritative TopologyVersion was created
    topo = db_session.get(TopologyVersion, result.topology_version_id)
    assert topo is not None
    assert topo.is_authoritative is True
    assert len(topo.network_hash) == 64


def test_geojson_adapter_validation_and_rejections():
    """Verify GeoJSON adapter catches missing geometries, missing codes, and invalid lengths."""
    adapter = GeoJSONIngestionAdapter()

    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            # Valid bus
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.48, 17.38]},
                "properties": {
                    "entity_type": "bus",
                    "code": "BUS_VAL_1",
                    "voltage_level_kv": 11.0,
                },
            },
            # Invalid: Missing geometry
            {
                "type": "Feature",
                "geometry": None,
                "properties": {"entity_type": "bus", "code": "BUS_INVALID_1"},
            },
            # Invalid: Missing code
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.49, 17.39]},
                "properties": {"entity_type": "bus"},
            },
            # Invalid line: negative length
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[78.48, 17.38], [78.49, 17.39]],
                },
                "properties": {
                    "entity_type": "line",
                    "code": "LINE_NEG",
                    "from_bus_code": "BUS_VAL_1",
                    "to_bus_code": "BUS_VAL_2",
                    "length_km": -1.5,
                },
            },
        ],
    }

    report = adapter.validate(geojson_data)
    assert report.total_rows == 4
    assert report.rows_accepted == 1
    assert report.rows_rejected == 3

    error_codes = [r.error_code for r in report.rejection_reasons]
    assert "ERR_INVALID_GEOM" in error_codes
    assert "ERR_MISSING_ID" in error_codes
    assert "ERR_INVALID_NUMERIC" in error_codes


def test_geojson_adapter_ingest_roundtrip(db_session):
    """Verify GeoJSON ingestion populates DB models and explicit connections."""
    adapter = GeoJSONIngestionAdapter()

    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.40, 17.40]},
                "properties": {
                    "entity_type": "bus",
                    "code": "BUS_G1",
                    "bus_type": "slack",
                    "voltage_level_kv": 11.0,
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.41, 17.41]},
                "properties": {
                    "entity_type": "bus",
                    "code": "BUS_G2",
                    "bus_type": "pq",
                    "voltage_level_kv": 11.0,
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[78.40, 17.40], [78.41, 17.41]],
                },
                "properties": {
                    "entity_type": "line",
                    "code": "LINE_G1",
                    "from_bus_code": "BUS_G1",
                    "to_bus_code": "BUS_G2",
                    "length_km": 0.8,
                    "conductor_type": "ACSR_Rabbit",
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.41, 17.41]},
                "properties": {
                    "entity_type": "dtr",
                    "code": "DTR_G1",
                    "bus_code": "BUS_G2",
                    "rated_kva": 250.0,
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [78.411, 17.411]},
                "properties": {
                    "entity_type": "consumer",
                    "service_number": "CON_G1",
                    "dtr_code": "DTR_G1",
                    "sanctioned_load_kw": 5.0,
                },
            },
        ],
    }

    result = adapter.ingest(
        source=geojson_data, db_session=db_session, version_tag="v_geojson_test"
    )
    assert result.success is True
    assert result.created_counts["buses"] == 2
    assert result.created_counts["lines"] == 1
    assert result.created_counts["distribution_transformers"] == 1
    assert result.created_counts["consumers"] == 1
    assert result.created_counts["connections"] == 3  # 2 for line terminals + 1 for DTR primary


def test_csv_adapter_validation_and_ingest(db_session):
    """Verify CSV adapter validation and DB ingestion."""
    adapter = CSVIngestionAdapter()

    csv_content = """entity_type,code,from_bus_code,to_bus_code,length_km,rated_kva,latitude,longitude
bus,CSV_BUS_1,,,,,17.40,78.40
bus,CSV_BUS_2,,,,,17.41,78.41
line,CSV_LINE_1,CSV_BUS_1,CSV_BUS_2,0.65,,,
distribution_transformer,CSV_DTR_1,,,,160.0,17.41,78.41
"""
    report = adapter.validate({"content": csv_content, "filename": "test_grid.csv"})
    assert report.total_rows == 4
    assert report.rows_accepted == 4
    assert report.rows_rejected == 0

    result = adapter.ingest(
        {"content": csv_content, "filename": "test_grid.csv"}, db_session=db_session
    )
    assert result.success is True
    assert result.created_counts["buses"] >= 2
    assert result.created_counts["lines"] == 1
    assert result.created_counts["distribution_transformers"] == 1
