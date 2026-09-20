# Local dev infrastructure without Docker: project-local PostgreSQL (5433) + Redis (6380), data in .dev/ (git-ignored).
# Usage: pnpm infra:up | pnpm infra:down | pnpm infra:status
param([Parameter(Mandatory = $true)][ValidateSet('up', 'down', 'status')][string]$Action)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dev = Join-Path $root '.dev'
$pgBin = 'C:\laragon\bin\postgresql\postgresql-14.5-1\bin'
$redis = 'C:\laragon\bin\redis\redis-x64-5.0.14.1'
$pgData = Join-Path $dev 'pgdata'
$env:PGPASSWORD = 'howdy_dev'
New-Item -ItemType Directory -Force $dev | Out-Null

function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

switch ($Action) {
  'up' {
    if (-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
      $pw = Join-Path $dev 'pgpass.tmp'
      Set-Content -Path $pw -Value 'howdy_dev' -NoNewline -Encoding ascii
      & "$pgBin\initdb.exe" -D $pgData -U howdy -A scram-sha-256 "--pwfile=$pw" -E UTF8 --locale=C | Out-Null
      Remove-Item $pw
      $fresh = $true
    }
    if (-not (Test-Port 5433)) {
      Start-Process -FilePath "$pgBin\postgres.exe" -ArgumentList '-D', $pgData, '-p', '5433', '-c', 'listen_addresses=127.0.0.1' `
        -WindowStyle Hidden -RedirectStandardError (Join-Path $dev 'pg.log') | Out-Null
      1..20 | ForEach-Object { if (-not (Test-Port 5433)) { Start-Sleep -Milliseconds 500 } }
    }
    if ($fresh) {
      foreach ($db in 'howdy_dev', 'howdy_test') {
        & "$pgBin\psql.exe" -h 127.0.0.1 -p 5433 -U howdy -d postgres -c "create database $db" | Out-Null
      }
    }
    if (-not (Test-Port 6380)) {
      Start-Process -FilePath "$redis\redis-server.exe" -ArgumentList '--port', '6380', '--bind', '127.0.0.1', '--save', '""', '--dir', $dev `
        -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dev 'redis.log') | Out-Null
    }
    Write-Host "postgres:5433 = $(Test-Port 5433)   redis:6380 = $(Test-Port 6380)"
    Write-Host 'Next: pnpm db:migrate  (and for tests: set MIGRATE_DATABASE_URL to the howdy_test URL and migrate)'
  }
  'down' {
    & "$pgBin\pg_ctl.exe" -D $pgData stop -m fast 2>$null | Out-Null
    & "$redis\redis-cli.exe" -p 6380 shutdown nosave 2>$null | Out-Null
    Write-Host 'stopped'
  }
  'status' {
    Write-Host "postgres:5433 = $(Test-Port 5433)   redis:6380 = $(Test-Port 6380)"
  }
}
