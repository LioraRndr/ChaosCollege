$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Index = Join-Path $Root "index.html"
if (-not (Test-Path -LiteralPath $Index)) {
    throw "index.html not found: $Index"
}

$Uri = ([System.Uri]$Index).AbsoluteUri

$Browsers = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
)

$Browser = $Browsers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($Browser) {
    Start-Process -FilePath $Browser -ArgumentList @("--app=$Uri", "--window-size=1440,900")
} else {
    Start-Process -FilePath $Index
}
