$ErrorActionPreference = "Stop"
$pairs = @(
  @("catalog_db",   "scripts\seed\catalog.sql"),
  @("inventory_db", "scripts\seed\inventory.sql"),
  @("delivery_db",  "scripts\seed\delivery.sql")
)
foreach ($p in $pairs) {
  Write-Host "Seeding $($p[0])..."
  Get-Content $p[1] | docker compose exec -T postgres psql -1 -v ON_ERROR_STOP=1 -U admin -d $p[0]
  if ($LASTEXITCODE -ne 0) { throw "Seed failed for $($p[0])" }
}
Write-Host "Done."