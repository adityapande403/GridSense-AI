from sqlalchemy.orm import Session

from backend.src.api.v1.network import (
    GenerateSyntheticRequest,
    generate_synthetic_network,
)
from backend.src.models import (
    Bus,
    Consumer,
    DistributionTransformer,
    Feeder,
    Line,
    Switch,
)
from backend.src.modules.network.generator import TelanganaSyntheticNetworkGenerator
from backend.src.modules.network.serialization import save_synthetic_network_to_db


def test_generator_deterministic_reproducibility():
    """Gate requirement: same seed gives byte-identical output."""
    gen1 = TelanganaSyntheticNetworkGenerator(seed=101, archetype="mixed")
    net1 = gen1.generate(injected_scenario="normal")

    gen2 = TelanganaSyntheticNetworkGenerator(seed=101, archetype="mixed")
    net2 = gen2.generate(injected_scenario="normal")

    assert net1["network_hash"] == net2["network_hash"], "Hashes must match identically!"
    assert net1["initial_power_flow"]["total_losses_kw"] == net2["initial_power_flow"]["total_losses_kw"]
    assert net1["initial_power_flow"]["min_voltage_pu"] == net2["initial_power_flow"]["min_voltage_pu"]
    assert len(net1["buses"]) == len(net2["buses"])
    assert len(net1["lines"]) == len(net2["lines"])


def test_generator_provenance_tagging():
    """Gate requirement: generated datasets carry synthetic provenance."""
    gen = TelanganaSyntheticNetworkGenerator(seed=77, archetype="urban")
    net = gen.generate(injected_scenario="normal")

    assert net["provenance"] == "synthetic"
    assert net["substation"]["provenance"] == "synthetic"
    for b in net["buses"]:
        assert b["provenance"] == "synthetic"
    for l in net["lines"]:
        assert l["provenance"] == "synthetic"
    for d in net["dtrs"]:
        assert d["provenance"] == "synthetic"
    for c in net["consumers"]:
        assert c["provenance"] == "synthetic"


def test_generator_injected_scenarios():
    """Verify all injected scenarios solve to AC convergence and manifest distinct electrical profiles."""
    gen = TelanganaSyntheticNetworkGenerator(seed=42)

    scenarios = ["normal", "dtr_overload", "feeder_overload", "undervoltage"]
    results = {}
    for sc in scenarios:
        net = gen.generate(injected_scenario=sc)
        pf = net["initial_power_flow"]
        assert pf["converged"] is True, f"Scenario {sc} failed AC convergence!"
        results[sc] = pf

    # Feeder overload should have higher active losses than normal
    assert results["feeder_overload"]["total_losses_kw"] > results["normal"]["total_losses_kw"]
    # Undervoltage scenario should have lower minimum voltage than normal
    assert results["undervoltage"]["min_voltage_pu"] < results["normal"]["min_voltage_pu"]


def test_generator_database_persistence(db_session: Session):
    """Verify persistence of generated network into relational database."""
    gen = TelanganaSyntheticNetworkGenerator(seed=42)
    net_data = gen.generate(injected_scenario="normal")

    version_tag = "v1.0.0-unit-test-persist"
    top_version = save_synthetic_network_to_db(
        db=db_session,
        net_data=net_data,
        version_tag=version_tag,
        is_authoritative=True,
    )

    assert top_version.id is not None
    assert top_version.version_tag == version_tag
    assert top_version.network_hash == net_data["network_hash"]

    # Verify counts in database session
    assert db_session.query(Feeder).count() >= 2
    assert db_session.query(Bus).count() >= 20
    assert db_session.query(Line).count() >= 20
    assert db_session.query(DistributionTransformer).count() >= 20
    assert db_session.query(Switch).count() >= 5
    assert db_session.query(Consumer).count() >= 100


def test_generate_synthetic_api_endpoint(db_session: Session):
    """Verify the FastAPI endpoint for synthetic network generation."""
    req = GenerateSyntheticRequest(
        seed=88,
        archetype="mixed",
        injected_scenario="normal",
        persist_to_db=True,
        version_tag="v1.0.0-api-test",
    )
    res = generate_synthetic_network(req=req, db=db_session)

    assert res.seed == 88
    assert res.bus_count >= 20
    assert res.dtr_count >= 20
    assert res.initial_power_flow["converged"] is True
    assert res.persisted_version_id is not None
    assert res.provenance == "synthetic"


def test_100_seeded_networks_convergence_gate():
    """
    Gate requirement: 100 seeded networks all converge in AC power flow.
    We test 100 seeds (1 to 100) and verify 100% convergence.
    """
    converged_count = 0
    total = 100
    for s in range(1, total + 1):
        gen = TelanganaSyntheticNetworkGenerator(seed=s, archetype="mixed")
        net = gen.generate(injected_scenario="normal")
        if net["initial_power_flow"]["converged"]:
            converged_count += 1

    assert converged_count == total, f"Only {converged_count}/{total} seeded networks converged!"
