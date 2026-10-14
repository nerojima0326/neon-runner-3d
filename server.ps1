param([int]$Port = 8080, [switch]$NoBrowser)

# Simple static file server (no install needed) - serves this folder on http://localhost:$Port/
$root = (Resolve-Path $PSScriptRoot).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "Port $Port is already in use. Try: .\server.ps1 -Port 8081" -ForegroundColor Red
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  Neon Runner 3D server running: $url" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.mp3'  = 'audio/mpeg'
    '.wav'  = 'audio/wav'
}

try {
    while ($listener.IsListening) {
        # Async wait so Ctrl+C can interrupt
        $task = $listener.GetContextAsync()
        while (-not $task.AsyncWaitHandle.WaitOne(200)) { }
        $ctx = $task.GetAwaiter().GetResult()
        $res = $ctx.Response

        # One bad request must never stop the server
        try {
            $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
            if ($path -eq '') { $path = 'index.html' }
            $full = [IO.Path]::GetFullPath((Join-Path $root $path))

            if ($full.StartsWith($root) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($full)
                $ext = [IO.Path]::GetExtension($full).ToLower()
                if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
                $res.Headers.Add('Cache-Control', 'no-cache')
                $res.ContentLength64 = $bytes.Length
                if ($ctx.Request.HttpMethod -ne 'HEAD') {
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                }
                Write-Host "200 /$path" -ForegroundColor DarkGreen
            } else {
                $res.StatusCode = 404
                Write-Host "404 /$path" -ForegroundColor DarkYellow
            }
        } catch {
            Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor Red
        } finally {
            try { $res.Close() } catch { }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
