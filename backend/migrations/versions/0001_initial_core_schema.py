"""0001_initial_core_schema

Revision ID: 0001_initial_core_schema
Revises: None
Create Date: 2026-11-17 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial_core_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import backend.src.models  # noqa: F401
    from backend.src.core.database import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    import backend.src.models  # noqa: F401
    from backend.src.core.database import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
