# .claude/start-dev.ps1
#
# Lumio development environment launcher.
#
# Starts two processes:
#   1. Cloudflare Worker via `wrangler dev` on port 8787  (new console window)
#   2. Node.js API proxy + static file server on port 4173 (this window)
#
# The proxy replicates the Cloudflare Pages production topology:
#   browser → localhost:4173 → /api/* stripped → Worker on :8787
#
# Kills the Worker process tree when the proxy exits (Ctrl+C or crash).
# Development use only — not deployed, not part of the application.

param()
$ErrorActionPreference = 'Stop'

$root       = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir = Join-Path $root 'backend'
$proxyJs    = Join-Path $PSScriptRoot 'proxy.js'

if (-not (Test-Path $proxyJs)) {
  Write-Error "proxy.js not found at: $proxyJs"
  exit 1
}

# ── 1. Start Worker in a new visible console window ───────────────────────────
Write-Host ''
Write-Host '[lumio-dev] Starting Cloudflare Worker (wrangler dev --port 8787)...'
Write-Host "[lumio-dev] Worker logs will appear in the new console window."
Write-Host ''

$wrangler = Start-Process `
  -FilePath    'cmd.exe' `
  -ArgumentList '/k', "title Lumio Worker && cd /d `"$backendDir`" && npx wrangler dev --port 8787" `
  -WindowStyle  Normal `
  -PassThru

Write-Host "[lumio-dev] Worker process PID: $($wrangler.Id)"

# ── 2. Wait for Worker health probe ──────────────────────────────────────────
Write-Host '[lumio-dev] Waiting for Worker to be ready on :8787...'
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $r = Invoke-WebRequest `
      -Uri            'http://localhost:8787/health' `
      -UseBasicParsing `
      -TimeoutSec     1 `
      -ErrorAction    Stop
    if ($r.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    # Worker not ready yet — keep polling
  }
}

if ($ready) {
  Write-Host '[lumio-dev] Worker ready.'
} else {
  Write-Host '[lumio-dev] WARNING: Worker did not respond on :8787 within 20 s.'
  Write-Host '[lumio-dev]          Check the Worker console window for errors.'
  Write-Host '[lumio-dev]          Proxy will start anyway — API calls may return 502 briefly.'
}

# ── 3. Start proxy in foreground; kill Worker on exit ─────────────────────────
Write-Host ''
Write-Host '[lumio-dev] Starting Node.js proxy on :4173...'
Write-Host ''

try {
  & node $proxyJs
}
finally {
  Write-Host ''
  Write-Host '[lumio-dev] Proxy stopped. Terminating Worker process tree...'
  try {
    if (-not $wrangler.HasExited) {
      # /T kills the entire process tree (cmd.exe + node + workerd children)
      & taskkill /PID $wrangler.Id /T /F 2>$null | Out-Null
    }
  } catch {
    # Worker may have already exited
  }
  Write-Host '[lumio-dev] Shutdown complete.'
}
