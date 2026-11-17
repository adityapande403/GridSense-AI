import uuid

from sqlalchemy.orm import Session

from backend.src.models import (
    AuditLog,
    Bus,
    Consumer,
    DistributionTransformer,
    Feeder,
    Line,
    Organisation,
    Substation,
    TopologyVersion,
)
from backend.src.models.base import A5ApprovalStatusEnum, ProvenanceEnum


def test_create_organisation_and_substation(db_session: Session):
    org = Organisation(
        code="TSSPDCL", name="Telangana State Southern Power Distribution Co Ltd"
    )
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id,
        code="SS_GACHIBOWLI_33_11",
        name="Gachibowli 33/11 kV Substation",
        nominal_kv=33.0,
        ptr_capacity_mva=8.0,
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db_session.add(sub)
    db_session.flush()

    assert sub.id is not None
    assert sub.organisation.code == "TSSPDCL"
    assert sub.provenance == "synthetic"


def test_feeder_buses_and_lines_network(db_session: Session):
    org = Organisation(code="TEST_ORG", name="Test Utility")
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id,
        code="SS_TEST",
        name="Test SS",
        nominal_kv=33.0,
        ptr_capacity_mva=5.0,
    )
    db_session.add(sub)
    db_session.flush()

    feeder = Feeder(
        substation_id=sub.id,
        code="FDR_11KV_01",
        name="Financial District Feeder 1",
        voltage_kv=11.0,
        peak_load_kw=1800.0,
        trunk_conductor_type="ACSR_Rabbit",
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db_session.add(feeder)
    db_session.flush()

    bus1 = Bus(
        feeder_id=feeder.id,
        code="BUS_01",
        voltage_level_kv=11.0,
        bus_type="slack",
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    bus2 = Bus(
        feeder_id=feeder.id,
        code="BUS_02",
        voltage_level_kv=11.0,
        bus_type="pq",
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db_session.add_all([bus1, bus2])
    db_session.flush()

    line = Line(
        feeder_id=feeder.id,
        from_bus_id=bus1.id,
        to_bus_id=bus2.id,
        code="LINE_B1_B2",
        conductor_type="ACSR_Rabbit",
        length_km=1.2,
        r_ohm_per_km=0.5426,
        x_ohm_per_km=0.334,
        max_i_ka=0.20,
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db_session.add(line)
    db_session.flush()

    assert line.id is not None
    assert line.from_bus.code == "BUS_01"
    assert line.to_bus.code == "BUS_02"


def test_dtr_and_consumer_relationship(db_session: Session):
    org = Organisation(code="ORG_DTR", name="DTR Test Utility")
    db_session.add(org)
    db_session.flush()

    sub = Substation(
        organisation_id=org.id, code="SS_DTR", name="SS DTR", nominal_kv=33.0
    )
    db_session.add(sub)
    db_session.flush()

    feeder = Feeder(
        substation_id=sub.id, code="FDR_DTR", name="Feeder DTR", voltage_kv=11.0
    )
    db_session.add(feeder)
    db_session.flush()

    bus = Bus(feeder_id=feeder.id, code="BUS_DTR", voltage_level_kv=11.0)
    db_session.add(bus)
    db_session.flush()

    dtr = DistributionTransformer(
        bus_id=bus.id,
        code="DTR_100KVA_01",
        rated_kva=100.0,
        no_load_loss_kw=0.25,
        full_load_loss_kw=1.35,
        percent_z=4.5,
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db_session.add(dtr)
    db_session.flush()

    consumer = Consumer(
        dtr_id=dtr.id,
        service_number="TSSPDCL-SEC-998231",
        consumer_category="commercial",
        sanctioned_load_kw=15.0,
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db_session.add(consumer)
    db_session.flush()

    assert len(dtr.consumers) == 1
    assert dtr.consumers[0].service_number == "TSSPDCL-SEC-998231"


def test_topology_versioning_and_diff(db_session: Session):
    top_v1 = TopologyVersion(
        version_tag="v1.0.0-baseline",
        network_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        is_authoritative=True,
        description="Master authoritative network twin",
    )
    db_session.add(top_v1)
    db_session.flush()

    assert top_v1.id is not None
    assert top_v1.is_authoritative is True


def test_audit_logging(db_session: Session):
    audit = AuditLog(
        user_identifier="operator_anand",
        action_type="approve_switching_plan",
        resource_type="switching_plan",
        resource_id=uuid.uuid4(),
        details_json={"approval_status": A5ApprovalStatusEnum.VALIDATED_FEASIBLE.value},
    )
    db_session.add(audit)
    db_session.flush()

    assert audit.id is not None
    assert audit.details_json["approval_status"] == "VALIDATED_FEASIBLE"
