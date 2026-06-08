# Deploy Asta Torneo su Vercel
# Prerequisito: aver fatto login con `npx vercel login`

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Write-Error "File .env mancante. Crea .env con VITE_ABLY_KEY=..."
}

$ablyKey = (Get-Content ".env" | Where-Object { $_ -match '^VITE_ABLY_KEY=' }) -replace '^VITE_ABLY_KEY=', ''
if (-not $ablyKey) {
    Write-Error "VITE_ABLY_KEY non trovata in .env"
}

Write-Host "Build locale..." -ForegroundColor Cyan
npm run build

$appUrl = "https://basket-three-kappa.vercel.app"

Write-Host "Imposto VITE_ABLY_KEY su Vercel (production)..." -ForegroundColor Cyan
$ablyKey | npx vercel env add VITE_ABLY_KEY production --force 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Variabile gia presente o aggiunta manualmente — continuo." -ForegroundColor Yellow
}

Write-Host "Imposto VITE_APP_URL su Vercel (production)..." -ForegroundColor Cyan
$appUrl | npx vercel env add VITE_APP_URL production --force 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "VITE_APP_URL gia presente o aggiunta manualmente — continuo." -ForegroundColor Yellow
}

Write-Host "Deploy in produzione..." -ForegroundColor Cyan
npx vercel deploy --prod --yes --name asta-torneo

Write-Host ""
Write-Host "Fatto! Apri il link mostrato sopra (es. https://asta-torneo.vercel.app)" -ForegroundColor Green
Write-Host "Mandalo agli allenatori su WhatsApp." -ForegroundColor Green
