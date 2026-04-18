Write-Host "Starting full project verification..."
$ErrorActionPreference = "Stop"

Write-Host "`n[1/6] Cleaning..."
pnpm run clean

Write-Host "`n[2/6] Installing dependencies..."
pnpm install

Write-Host "`n[3/6] Running Typecheck..."
pnpm run typecheck

Write-Host "`n[4/6] Running Lint..."
pnpm run lint

Write-Host "`n[5/6] Building..."
pnpm run build

Write-Host "`n[6/6] Running Tests..."
pnpm run test

Write-Host "`n✅ All checks passed successfully!"
