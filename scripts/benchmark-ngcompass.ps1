param(
    [string]$CliPath = "C:\Users\30694\Desktop\ngcompass_\packages\cli\dist\cli.js",
    [string]$OutputPath = "C:\Users\30694\Desktop\ngcompass_\benchmark-results.json"
)

$ErrorActionPreference = "Stop"

$projects = @(
    @{ Name = "angular-realworld-example-app"; Path = "C:\Users\30694\Desktop\angular-realworld-example-app" },
    @{ Name = "clients"; Path = "C:\Users\30694\Desktop\clients" },
    @{ Name = "components"; Path = "C:\Users\30694\Desktop\components" },
    @{ Name = "spartacus"; Path = "C:\Users\30694\Desktop\spartacus" },
    @{ Name = "test_compass/ngcompass"; Path = "C:\Users\30694\Desktop\test_compass\ngcompass" }
)

function Clear-NgcompassCache {
    param([string]$ProjectPath)

    $cachePath = Join-Path $ProjectPath "node_modules\.cache\ngcompass"
    if (Test-Path -LiteralPath $cachePath) {
        Remove-Item -LiteralPath $cachePath -Recurse -Force
    }
}

function Invoke-NgcompassAnalysis {
    param(
        [string]$ProjectName,
        [string]$ProjectPath,
        [string]$RunKind
    )

    $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ngcompass-" + [Guid]::NewGuid().ToString("N") + ".json")
    $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ngcompass-" + [Guid]::NewGuid().ToString("N") + ".err")
    $wallClock = [System.Diagnostics.Stopwatch]::StartNew()

    $process = Start-Process `
        -FilePath "node" `
        -ArgumentList @($CliPath, "analyze", "--format", "json", "--quiet") `
        -WorkingDirectory $ProjectPath `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -NoNewWindow `
        -Wait `
        -PassThru
    $exitCode = $process.ExitCode
    $wallClock.Stop()

    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

    $json = $null
    $parseError = $null
    try {
        if ($stdout.Trim().Length -gt 0) {
            $json = $stdout | ConvertFrom-Json
        }
    }
    catch {
        $parseError = $_.Exception.Message
    }

    $summary = if ($null -ne $json -and $null -ne $json.summary) { $json.summary } else { $null }

    [pscustomobject]@{
        project = $ProjectName
        path = $ProjectPath
        run = $RunKind
        exitCode = $exitCode
        wallClockMs = [math]::Round($wallClock.Elapsed.TotalMilliseconds, 1)
        reporterDurationMs = if ($summary) { [math]::Round([double]$summary.duration, 1) } else { $null }
        discoveredFiles = if ($summary) { $summary.discoveredFiles } else { $null }
        scannedFiles = if ($summary) { $summary.scannedFiles } else { $null }
        totalFiles = if ($summary) { $summary.totalFiles } else { $null }
        totalTasks = if ($summary) { $summary.totalTasks } else { $null }
        cachedTasks = if ($summary) { $summary.cachedTasks } else { $null }
        totalViolations = if ($summary) { $summary.totalViolations } else { $null }
        totalErrors = if ($summary) { $summary.totalErrors } else { $null }
        totalWarnings = if ($summary) { $summary.totalWarnings } else { $null }
        parseErrorCount = if ($summary) { $summary.parseErrorCount } else { $null }
        status = if ($summary) { $summary.statusLabel } else { $null }
        parseError = $parseError
        stderr = $stderr.Trim()
    }
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($project in $projects) {
    Clear-NgcompassCache -ProjectPath $project.Path
    $results.Add((Invoke-NgcompassAnalysis -ProjectName $project.Name -ProjectPath $project.Path -RunKind "cold"))
    $results.Add((Invoke-NgcompassAnalysis -ProjectName $project.Name -ProjectPath $project.Path -RunKind "warm"))
}

$payload = [pscustomobject]@{
    measuredAt = (Get-Date).ToString("o")
    cliPath = $CliPath
    results = $results
}

$payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$payload | ConvertTo-Json -Depth 6
