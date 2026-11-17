# GridSense-AI CI / Test Verification Script (Windows PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  GridSense-AI: Running Continuous Integration Suite" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Run Ruff Linter
Write-Host "`n[1/3] Running Ruff Linter..." -ForegroundColor Yellow
& .\.venv\Scripts\ruff.exe check .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Ruff linting failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Linter checks passed cleanly." -ForegroundColor Green

# 2. Test Alembic Migrations
Write-Host "`n[2/3] Verifying Alembic Migrations [Upgrade Head]..." -ForegroundColor Yellow
& .\.venv\Scripts\alembic.exe -c backend/alembic.ini upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "Alembic migration failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Database migrations applied successfully." -ForegroundColor Green

# 3. Run Pytest Suite
Write-Host "`n[3/3] Executing Pytest Test Suite..." -ForegroundColor Yellow
& .\.venv\Scripts\pytest.exe -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pytest test suite failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ All test suites passed successfully." -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  ✓ GridSense-AI CI Pipeline Completed Successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
