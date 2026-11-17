from backend.src.core.database import JSONBType
from backend.src.models.base import A5ApprovalStatusEnum, CoreBaseModel, ProvenanceMixin
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import relationship


class SwitchingPlan(CoreBaseModel, ProvenanceMixin):
    """
    Candidate switching plan produced by MILP reconfiguration or FLISR,
    post-validated via AC power flow and categorized per A5 taxonomy.
    """

    __tablename__ = "switching_plans"

    topology_version_id = Column(
        Uuid(as_uuid=True), ForeignKey("topology_versions.id"), nullable=False, index=True
    )
    plan_type = Column(
        String(32), default="overload_relief", nullable=False
    )  # overload_relief, flisr
    candidate_rank = Column(Integer, default=1, nullable=False)
    approval_status = Column(
        String(48), default=A5ApprovalStatusEnum.INSUFFICIENT_DATA.value, nullable=False
    )
    ac_power_flow_converged = Column(Boolean, default=False, nullable=False)
    losses_before_kw = Column(Float, nullable=False)
    losses_after_kw = Column(Float, nullable=False)
    loss_reduction_pct = Column(Float, nullable=False)
    min_voltage_before_pu = Column(Float, nullable=False)
    min_voltage_after_pu = Column(Float, nullable=False)
    max_line_loading_after_pct = Column(Float, nullable=False)
    missing_protection_checklist = Column(JSONBType, default=list, nullable=False)
    simulation_diagnostics = Column(JSONBType, default=dict, nullable=False)

    steps = relationship("SwitchingStep", back_populates="plan", cascade="all, delete-orphan")


class SwitchingStep(CoreBaseModel):
    """
    Individual sequenced switching step.
    Enforces break-before-make sequencing to eliminate transient parallel loops.
    """

    __tablename__ = "switching_steps"

    plan_id = Column(
        Uuid(as_uuid=True), ForeignKey("switching_plans.id"), nullable=False, index=True
    )
    step_order = Column(Integer, nullable=False)
    switch_id = Column(Uuid(as_uuid=True), ForeignKey("switches.id"), nullable=False, index=True)
    action = Column(String(16), nullable=False)  # open, close
    is_remote = Column(Boolean, default=False, nullable=False)
    pre_check_instructions = Column(String(256), nullable=False)
    operator_verification_note = Column(String(256), nullable=True)

    plan = relationship("SwitchingPlan", back_populates="steps")
    switch = relationship("Switch")


class CapexRecommendation(CoreBaseModel, ProvenanceMixin):
    """
    CAPEX recommendations: Feeder bifurcation, DTR augmentation/siting, and reconductoring.
    """

    __tablename__ = "capex_recommendations"

    topology_version_id = Column(
        Uuid(as_uuid=True), ForeignKey("topology_versions.id"), nullable=False, index=True
    )
    intervention_type = Column(
        String(32), nullable=False
    )  # bifurcation, dtr_augmentation, dtr_siting, reconductoring
    target_asset_id = Column(Uuid(as_uuid=True), nullable=False, index=True)
    target_asset_code = Column(String(64), nullable=False)
    description = Column(String(256), nullable=False)
    capex_inr = Column(Float, nullable=False)
    annual_loss_reduction_kwh = Column(Float, nullable=False)
    annual_benefit_inr = Column(Float, nullable=False)
    simple_payback_years = Column(Float, nullable=False)
    npv_15yr_inr = Column(Float, nullable=False)
    priority_rank = Column(Integer, nullable=False)
    score_breakdown = Column(JSONBType, default=dict, nullable=False)
    sensitivity_tornado = Column(JSONBType, default=dict, nullable=False)
