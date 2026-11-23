from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.modules.thermal import (
    DTRThermalReport,
    simulate_iec60076_thermal_dynamics,
)

router = APIRouter(prefix="/thermal", tags=["IEC 60076-7 Dynamic Thermal & Health Index (TR-THM)"])


@router.get(
    "/dtr-dynamics",
    response_model=DTRThermalReport,
    summary="Simulate 24-Hour IEC 60076-7 Dynamic Thermal Profile & Health Index (TR-THM-01..04)",
    status_code=status.HTTP_200_OK,
)
def get_dtr_thermal_dynamics(
    dtr_code: str = Query(..., description="Target DTR code (e.g. 'DT-2011951-001')"),
    feeder_code: str = Query("2011951", description="Parent feeder code"),
    base_ambient_temp_c: float = Query(35.0, description="Base ambient temperature (°C)"),
    peak_multiplier: float = Query(1.0, description="Load multiplier"),
    db: Session = Depends(get_db),
) -> DTRThermalReport:
    """
    Computes continuous numerical integration of the differential equations of IEC 60076-7
    over 24 hours, returning top-oil rise, winding hot-spot temperature, equivalent life consumed,
    and composite Asset Health Index.
    """
    try:
        return simulate_iec60076_thermal_dynamics(
            db_session=db,
            dtr_code=dtr_code,
            feeder_code=feeder_code,
            base_ambient_temp_c=base_ambient_temp_c,
            peak_multiplier=peak_multiplier,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Thermal dynamics simulation failed: {str(e)}",
        )
