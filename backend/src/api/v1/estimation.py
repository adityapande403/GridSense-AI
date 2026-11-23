from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.modules.estimation import (
    DTRLoadProfileReport,
    MeteringPenetrationSensitivityReport,
    allocate_dtr_load_profile,
    evaluate_metering_sensitivity,
)

router = APIRouter(prefix="/estimation", tags=["Load Allocation & Disaggregation (TR-EST)"])


@router.get(
    "/dtr-profile",
    response_model=DTRLoadProfileReport,
    summary="Get 24-Hour Diurnal Load Allocation Profile with P10/P50/P90 Bounds (TR-EST-01..04)",
    status_code=status.HTTP_200_OK,
)
def get_dtr_load_profile(
    dtr_code: str = Query(..., description="Target DTR code (e.g. 'DT-2011951-001')"),
    feeder_code: str = Query("2011951", description="Parent feeder code"),
    peak_multiplier: float = Query(1.0, description="Load scaling multiplier (0.8 = off-peak, 1.2 = peak summer)"),
    db: Session = Depends(get_db),
) -> DTRLoadProfileReport:
    """
    Computes 24-hour load allocation for a transformer using feeder-head SCADA disaggregation,
    connected consumer category load curves (Domestic, Commercial, Industrial, Agricultural shifts),
    and statistical P10/P50/P90 uncertainty intervals.
    """
    try:
        return allocate_dtr_load_profile(
            db_session=db,
            dtr_code=dtr_code,
            feeder_code=feeder_code,
            peak_multiplier=peak_multiplier,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DTR load profile allocation failed: {str(e)}",
        )


@router.get(
    "/metering-sensitivity",
    response_model=MeteringPenetrationSensitivityReport,
    summary="Evaluate Estimation Accuracy vs. Smart Metering Penetration 0-50% (TR-EST-05)",
    status_code=status.HTTP_200_OK,
)
def get_metering_penetration_sensitivity(
    feeder_code: str = Query("2011951", description="Feeder code"),
    db: Session = Depends(get_db),
) -> MeteringPenetrationSensitivityReport:
    """
    Returns benchmark sensitivity report comparing state estimation error (MAE, RMSE, MAPE)
    across 0%, 5%, 10%, 25%, and 50% AMI/AMR smart meter penetration levels.
    """
    try:
        return evaluate_metering_sensitivity(
            db_session=db,
            feeder_code=feeder_code,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Metering sensitivity analysis failed: {str(e)}",
        )
