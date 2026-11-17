import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict


class AuditLogSchema(BaseModel):
    id: uuid.UUID
    user_identifier: str
    action_type: str
    resource_type: str
    resource_id: Optional[uuid.UUID] = None
    client_ip: Optional[str] = None
    details_json: Dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
