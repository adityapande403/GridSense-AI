from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.modules.forecast import (
    DTRForecastReport,
    FeederForecastAlertsSummary,
    build_dtr_forecast_report,
    generate_feeder_overload_alerts,
)

router = APIRouter(prefix="/forecast", tags=["Predictive ML Forecasting & Alerts (TR-FOR)"])


@router.get(
    "/dtr",
    response_model=DTRForecastReport,
    summary="Get Rolling Multi-Horizon ML Load Forecast with P10/P50/P90 Quantiles (TR-FOR-01..04)",
    status_code=status.HTTP_200_OK,
)
def get_dtr_forecast(
    dtr_code: str = Query(..., description="Target DTR code (e.g. 'DT-2011951-001')"),
    db: Session = Depends(get_db),
) -> DTRForecastReport:
    """
    Computes rolling 1h, 4h, 8h, and 24h LightGBM GBDT load forecasts with P10/P50/P90
    quantile confidence cones, walk-forward chronological benchmarking vs. Naive Persistence,
    and feature importance analysis (Telangana agricultural shift, ambient temp, lag kW).
    """
    try:
        return build_dtr_forecast_report(db_session=db, dtr_code=dtr_code)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Predictive ML load forecasting failed: {str(e)}",
        )


@router.get(
    "/feeder-alerts",
    response_model=FeederForecastAlertsSummary,
    summary="Get Feeder-Wide Overload Early Warning Alerts with 4-24h Lead Time (TR-FOR-05)",
    status_code=status.HTTP_200_OK,
)
def get_feeder_overload_alerts(
    feeder_code: str = Query("2011951", description="Target feeder code"),
    db: Session = Depends(get_db),
) -> FeederForecastAlertsSummary:
    """
    Scans all distribution transformers across the feeder, identifying projected thermal
    overloads (>=85% warning, >=100% critical) with 4-hour to 24-hour advance lead times.
    Generates actionable FLISR / tie-switch reconfiguration recommendations.
    """
    try:
        return generate_feeder_overload_alerts(db_session=db, feeder_code=feeder_code)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Predictive overload alert scanning failed: {str(e)}",
        )
