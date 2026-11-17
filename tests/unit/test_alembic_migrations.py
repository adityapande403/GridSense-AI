from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_alembic_migrations_roundtrip(tmp_path):
    """
    Test that Alembic can migrate cleanly from an empty database to head,
    and then downgrade back to base with 100% reversibility.
    """
    db_file = tmp_path / "migration_test.db"
    test_db_url = f"sqlite:///{db_file}"

    # Setup Alembic Config pointing to backend/alembic.ini
    repo_root = Path(__file__).resolve().parent.parent.parent
    alembic_cfg_path = repo_root / "backend" / "alembic.ini"
    alembic_cfg = Config(str(alembic_cfg_path))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)

    engine = create_engine(test_db_url)

    # 1. Upgrade cleanly from empty to head
    command.upgrade(alembic_cfg, "head")

    inspector = inspect(engine)
    tables_after_upgrade = inspector.get_table_names()
    assert "substations" in tables_after_upgrade
    assert "feeders" in tables_after_upgrade
    assert "distribution_transformers" in tables_after_upgrade
    assert "switches" in tables_after_upgrade
    assert "audit_logs" in tables_after_upgrade
    assert len(tables_after_upgrade) >= 20

    # 2. Downgrade cleanly back to base
    command.downgrade(alembic_cfg, "base")

    inspector = inspect(engine)
    tables_after_downgrade = inspector.get_table_names()
    # alembic_version table may remain, but application tables must be dropped
    app_tables = [t for t in tables_after_downgrade if t != "alembic_version"]
    assert len(app_tables) == 0, (
        f"Expected 0 application tables after downgrade, found: {app_tables}"
    )

    # 3. Re-upgrade to head to verify idempotency
    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    tables_after_reupgrade = inspector.get_table_names()
    assert "substations" in tables_after_reupgrade
    assert len(tables_after_reupgrade) >= 20
