"""Domain Module: Branch-and-Mutate What-If Scenario Simulator."""

from backend.src.modules.scenarios.schemas import (
    ScenarioMutationType,
    ScenarioMutation,
    ScenarioRequest,
    ScenarioElementDelta,
    ScenarioKpiComparison,
    ScenarioSimulationResponse,
    ScenarioPreset,
    MultiScenarioComparisonRequest,
    MultiScenarioComparisonResponse,
)
from backend.src.modules.scenarios.engine import (
    compute_feeder_hash,
    get_scenario_presets,
    simulate_scenario,
    compare_multiple_scenarios,
)

__all__ = [
    "ScenarioMutationType",
    "ScenarioMutation",
    "ScenarioRequest",
    "ScenarioElementDelta",
    "ScenarioKpiComparison",
    "ScenarioSimulationResponse",
    "ScenarioPreset",
    "MultiScenarioComparisonRequest",
    "MultiScenarioComparisonResponse",
    "compute_feeder_hash",
    "get_scenario_presets",
    "simulate_scenario",
    "compare_multiple_scenarios",
]
