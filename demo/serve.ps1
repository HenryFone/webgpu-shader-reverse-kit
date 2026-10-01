# 本地静态服务器（WebGPU 需要安全上下文；localhost 视为安全来源）
param([int]$Port = 8123)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "本地服务器已启动: http://localhost:$Port/index.html  (Ctrl+C 停止)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
    $full = Join-Path $root $path
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $mime = switch ($ext) { '.html' {'text/html; charset=utf-8'} '.js' {'application/javascript'} '.wasm' {'application/wasm'} default {'application/octet-stream'} }
      $ctx.Response.ContentType = $mime
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  }
} finally { $listener.Stop() }
