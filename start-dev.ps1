$env:DATABASE_URL = "postgres://avnadmin:<redacted>@pg-2e7d66da-babadawit1551-aecb.h.aivencloud.com:24648/defaultdb?sslmode=require"
$env:REDIS_URL = if ($env:REDIS_URL) { $env:REDIS_URL } else { "redis://localhost:6379" }
$env:RABBITMQ_URL = if ($env:RABBITMQ_URL) { $env:RABBITMQ_URL } else { "amqp://localhost:5672" }
$env:SECRET_KEY = if ($env:SECRET_KEY) { $env:SECRET_KEY } else { "dev-secret-change-in-production" }
$env:ENCRYPTION_KEY = if ($env:ENCRYPTION_KEY) { $env:ENCRYPTION_KEY } else { "00000000000000000000000000000000" }
$env:FRONTEND_URL = if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "http://localhost:5173" }

Write-Host "Starting SMAS services..." -ForegroundColor Cyan
Write-Host "  DATABASE_URL : $env:DATABASE_URL"
Write-Host "  REDIS_URL    : $env:REDIS_URL"
Write-Host "  RABBITMQ_URL : $env:RABBITMQ_URL"
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/auth; npm run dev" -WindowStyle Normal
Write-Host "[start] Auth Service (port 8001)" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/content; npm run dev" -WindowStyle Normal
Write-Host "[start] Content Service (port 8002)" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/schedule; npm run dev" -WindowStyle Normal
Write-Host "[start] Schedule Service (port 8003)" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/analytics; npm run dev" -WindowStyle Normal
Write-Host "[start] Analytics Service (port 8004)" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd workers/publisher; npx ts-node src/index.ts" -WindowStyle Normal
Write-Host "[start] Publisher Worker" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -WindowStyle Normal
Write-Host "[start] Frontend (port 5173)" -ForegroundColor Green

Write-Host ""
Write-Host "All services started in separate windows." -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
