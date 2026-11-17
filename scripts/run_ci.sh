#!/usr/bin/env bash
# GridSense-AI CI / Test Verification Script (Linux / Bash)
set -e

echo "=========================================================="
echo "  GridSense-AI: Running Continuous Integration Suite"
echo "=========================================================="

echo -e "\n[1/3] Running Ruff Linter..."
ruff check .
echo "✓ Linter checks passed cleanly."

echo -e "\n[2/3] Verifying Alembic Migrations (Upgrade Head)..."
alembic -c backend/alembic.ini upgrade head
echo "✓ Database migrations applied successfully."

echo -e "\n[3/3] Executing Pytest Test Suite..."
pytest -v
echo "✓ All test suites passed successfully."

echo -e "\n=========================================================="
echo "  ✓ GridSense-AI CI Pipeline Completed Successfully!"
echo "=========================================================="
