from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.modules.capex import (
    ReconductoringReport,
    DTRInvestmentReport,
    FeederBifurcationReport,
    TornadoSensitivityReport,
    evaluate_reconductoring_portfolio,
    evaluate_dtr_investments,
    analyze_feeder_bifurcation,
    run_tornado_sensitivity_analysis,
)

router = APIRouter(prefix="/capex", tags=["CAPEX Intelligence & Investment Prioritization (TR-CPX)"])


class TornadoRequest(BaseModel):
    base_capex_inr: float = Field(2450000.0, description="Base portfolio total capital expenditure in INR")
    base_annual_savings_inr: float = Field(425000.0, description="Base portfolio annual technical loss savings in INR")
    base_cost_per_kwh: float = Field(5.50, description="Bulk energy loss tariff (ACoS) in INR/kWh")
    base_discount_rate_pct: float = Field(10.0, description="Discount rate / cost of capital in %")
    base_growth_rate_pct: float = Field(3.5, description="Annual feeder load growth rate in %")
    portfolio_name: str = Field("Puthiya Kadavu Feeder CAPEX Program", description="Portfolio descriptor")


@router.get(
    "/reconductoring-ranks",
    response_model=ReconductoringReport,
    summary="Rank Line Reconductoring Opportunities by Benefit-to-Cost Ratio (TR-CPX-03)",
    status_code=status.HTTP_200_OK,
)
def get_reconductoring_ranks(
    feeder_code: str = Query("2011951", description="Target feeder code"),
    cost_per_kwh_inr: float = Query(5.50, description="Bulk loss valuation in INR/kWh"),
    discount_rate_pct: float = Query(10.0, description="Discount rate in %"),
    db: Session = Depends(get_db),
) -> ReconductoringReport:
    """
    Ranks all 11 kV conductor line segments on the feeder by annual loss savings (INR/year)
    divided by replacement cost (TR-CPX-03), with 15-year NPV and Payback Period.
    """
    try:
        return evaluate_reconductoring_portfolio(
            db_session=db,
            feeder_code=feeder_code,
            cost_per_kwh_inr=cost_per_kwh_inr,
            discount_rate_pct=discount_rate_pct,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reconductoring analysis failed: {str(e)}",
        )


@router.get(
    "/dtr-investments",
    response_model=DTRInvestmentReport,
    summary="Evaluate 3-Way DTR Alternatives: Augmentation vs Siting vs Switching (TR-CPX-02)",
    status_code=status.HTTP_200_OK,
)
def get_dtr_investments(
    feeder_code: str = Query("2011951", description="Target feeder code"),
    cost_per_kwh_inr: float = Query(5.50, description="Bulk loss valuation in INR/kWh"),
    discount_rate_pct: float = Query(10.0, description="Discount rate in %"),
    db: Session = Depends(get_db),
) -> DTRInvestmentReport:
    """
    Compares 3 distinct interventions for stressed distribution transformers:
    (a) Augmentation to next standard kVA rating
    (b) New DTR siting at load centroid with LT bifurcation
    (c) Zero-CAPEX load transfer via switching
    """
    try:
        return evaluate_dtr_investments(
            db_session=db,
            feeder_code=feeder_code,
            cost_per_kwh_inr=cost_per_kwh_inr,
            discount_rate_pct=discount_rate_pct,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DTR investment analysis failed: {str(e)}",
        )


@router.get(
    "/bifurcation",
    response_model=FeederBifurcationReport,
    summary="Evaluate Feeder Bifurcation Triggers & Optimal Split Candidates (TR-CPX-01)",
    status_code=status.HTTP_200_OK,
)
def get_feeder_bifurcation(
    feeder_code: str = Query("2011951", description="Target feeder code"),
    cost_per_kwh_inr: float = Query(5.50, description="Bulk loss valuation in INR/kWh"),
    discount_rate_pct: float = Query(10.0, description="Discount rate in %"),
    db: Session = Depends(get_db),
) -> FeederBifurcationReport:
    """
    Screens feeder bifurcation triggers (trunk ampacity >80%, length >15km, tail voltage <0.94 pu),
    computes load-moment centroid coordinates, and ranks graph-cut candidate split points.
    """
    try:
        return analyze_feeder_bifurcation(
            db_session=db,
            feeder_code=feeder_code,
            cost_per_kwh_inr=cost_per_kwh_inr,
            discount_rate_pct=discount_rate_pct,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bifurcation analysis failed: {str(e)}",
        )


@router.post(
    "/sensitivity-tornado",
    response_model=TornadoSensitivityReport,
    summary="Compute Tornado Sensitivity Analysis for Portfolio NPV & Payback (TR-CPX-06)",
    status_code=status.HTTP_200_OK,
)
def post_sensitivity_tornado(
    req: TornadoRequest,
) -> TornadoSensitivityReport:
    """
    Generates multi-variable sensitivity intervals (Tornado chart dataset) by varying
    tariff ACoS, CAPEX escalation, discount rate, and annual load growth.
    """
    try:
        return run_tornado_sensitivity_analysis(
            base_capex_inr=req.base_capex_inr,
            base_annual_savings_inr=req.base_annual_savings_inr,
            base_cost_per_kwh=req.base_cost_per_kwh,
            base_discount_rate_pct=req.base_discount_rate_pct,
            base_growth_rate_pct=req.base_growth_rate_pct,
            portfolio_name=req.portfolio_name,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sensitivity analysis failed: {str(e)}",
        )
