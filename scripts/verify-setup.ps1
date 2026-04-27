Write-Host "Starting full project verification..."
$ErrorActionPreference = "Stop"

Write-Host "`n[1/5] Cleaning..."
pnpm run clean

Write-Host "`n[2/5] Installing dependencies..."
pnpm install

Write-Host "`n[3/5] Running Typecheck..."
pnpm run typecheck

Write-Host "`n[4/5] Building..."
pnpm run build

Write-Host "`n[5/5] Running Tests..."
pnpm run test

Write-Host "`n✅ All checks passed successfully!"
