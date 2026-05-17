param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [int]$Iterations = 5,

    [string]$Command = "ngcompass",

    [string[]]$Modes = @("eco", "balanced", "turbo"),

    [string[]]$AnalyzeArgs = @("--quiet", "--format", "json"),

    [switch]$ClearCacheBeforeEachRun,

    [string]$OutputDirectory = (Join-Path $PSScriptRoot "benchmark-compare")
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectPath {
    param([string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    return $resolved.ProviderPath
}

function Clear-NgcompassCache {
    param([string]$Path)

    $cachePath = Join-Path $Path "node_modules\.cache\ngcompass"
    if (Test-Path -LiteralPath $cachePath) {
        Remove-Item -LiteralPath $cachePath -Recurse -Force
    }
}

function Convert-BytesToMegabytes {
    param([Nullable[long]]$Bytes)

    if ($null -eq $Bytes -or $Bytes -le 0) {
        return $null
    }

    return [math]::Round($Bytes / 1MB, 1)
}

function Resolve-CommandPath {
    param([string]$Command)

    $resolved = Get-Command $Command -ErrorAction Stop
    $path = if ($resolved.Source) { $resolved.Source } elseif ($resolved.Path) { $resolved.Path } else { $Command }

    if ($path.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
        $cmdPath = [System.IO.Path]::ChangeExtension($path, ".cmd")
        if (Test-Path -LiteralPath $cmdPath) {
            return $cmdPath
        }
    }

    return $path
}

function Get-Median {
    param([double[]]$Values)

    $sorted = @($Values | Sort-Object)
    if ($sorted.Count -eq 0) {
        return $null
    }

    if ($sorted.Count % 2 -eq 1) {
        return $sorted[[math]::Floor($sorted.Count / 2)]
    }

    return ($sorted[$sorted.Count / 2 - 1] + $sorted[$sorted.Count / 2]) / 2
}

function Get-Stats {
    param(
        [object[]]$Rows,
        [string]$Mode
    )

    $items = @($Rows | Where-Object { $_.mode -eq $Mode })
    $successful = @($items | Where-Object { $_.exitCode -eq 0 -or $_.summaryParsed })
    $times = @($successful | ForEach-Object { [double]$_.wallClockMs })
    $reporterTimes = @($successful | Where-Object { $null -ne $_.reporterDurationMs } | ForEach-Object { [double]$_.reporterDurationMs })
    $memoryValues = @($successful | Where-Object { $null -ne $_.peakWorkingSetMb } | ForEach-Object { [double]$_.peakWorkingSetMb })

    if ($times.Count -eq 0) {
        return [pscustomobject]@{
            mode = $Mode
            runs = $items.Count
            successfulRuns = 0
            averageMs = $null
            medianMs = $null
            minMs = $null
            maxMs = $null
            averageReporterMs = $null
            medianReporterMs = $null
            averagePeakWorkingSetMb = $null
        }
    }

    return [pscustomobject]@{
        mode = $Mode
        runs = $items.Count
        successfulRuns = $successful.Count
        averageMs = [math]::Round(($times | Measure-Object -Average).Average, 1)
        medianMs = [math]::Round((Get-Median -Values $times), 1)
        minMs = [math]::Round(($times | Measure-Object -Minimum).Minimum, 1)
        maxMs = [math]::Round(($times | Measure-Object -Maximum).Maximum, 1)
        averageReporterMs = if ($reporterTimes.Count -gt 0) { [math]::Round(($reporterTimes | Measure-Object -Average).Average, 1) } else { $null }
        medianReporterMs = if ($reporterTimes.Count -gt 0) { [math]::Round((Get-Median -Values $reporterTimes), 1) } else { $null }
        averagePeakWorkingSetMb = if ($memoryValues.Count -gt 0) { [math]::Round(($memoryValues | Measure-Object -Average).Average, 1) } else { $null }
    }
}

function Invoke-AnalyzeRun {
    param(
        [string]$Mode,
        [int]$Iteration,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )

    $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ngcompass-mode-compare-" + [Guid]::NewGuid().ToString("N") + ".out")
    $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ngcompass-mode-compare-" + [Guid]::NewGuid().ToString("N") + ".err")
    $timer = [System.Diagnostics.Stopwatch]::StartNew()

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -NoNewWindow `
        -Wait `
        -PassThru

    $timer.Stop()

    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

    $summary = $null
    $parseError = $null
    try {
        if ($stdout.Trim().Length -gt 0) {
            $json = $stdout | ConvertFrom-Json
            if ($null -ne $json.summary) {
                $summary = $json.summary
            }
        }
    } catch {
        $parseError = $_.Exception.Message
    }

    [pscustomobject]@{
        mode = $Mode
        iteration = $Iteration
        command = $FilePath
        arguments = ($ArgumentList -join " ")
        exitCode = $process.ExitCode
        wallClockMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 1)
        peakWorkingSetMb = Convert-BytesToMegabytes -Bytes $process.PeakWorkingSet64
        peakPagedMemoryMb = Convert-BytesToMegabytes -Bytes $process.PeakPagedMemorySize64
        peakVirtualMemoryMb = Convert-BytesToMegabytes -Bytes $process.PeakVirtualMemorySize64
        summaryParsed = $null -ne $summary
        reporterDurationMs = if ($summary) { [math]::Round([double]$summary.duration, 1) } else { $null }
        discoveredFiles = if ($summary) { $summary.discoveredFiles } else { $null }
        scannedFiles = if ($summary) { $summary.scannedFiles } else { $null }
        totalTasks = if ($summary) { $summary.totalTasks } else { $null }
        totalErrors = if ($summary) { $summary.totalErrors } else { $null }
        totalWarnings = if ($summary) { $summary.totalWarnings } else { $null }
        parseError = $parseError
        stderr = $stderr.Trim()
    }
}

if ($Iterations -lt 1) {
    throw "Iterations must be >= 1."
}

$validModes = @("eco", "balanced", "turbo")
foreach ($mode in $Modes) {
    if ($validModes -notcontains $mode) {
        throw "Invalid mode '$mode'. Expected one of: $($validModes -join ', ')."
    }
}

$project = Resolve-ProjectPath -Path $ProjectPath
$commandPath = Resolve-CommandPath -Command $Command
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$jsonPath = Join-Path $OutputDirectory "ngcompass-mode-compare-$timestamp.json"
$csvPath = Join-Path $OutputDirectory "ngcompass-mode-compare-$timestamp.csv"

$baseAnalyzeArgs = @("analyze") + $AnalyzeArgs + "--force"
$results = New-Object System.Collections.Generic.List[object]

Write-Host "Project: $project"
Write-Host "Iterations: $Iterations"
Write-Host "Command: $commandPath"
Write-Host "Modes: $($Modes -join ', ')"
Write-Host "Base args: $($baseAnalyzeArgs -join ' ')"
Write-Host "Execution: sequential, eco then balanced then turbo for each iteration"
Write-Host ""

for ($i = 1; $i -le $Iterations; $i++) {
    foreach ($mode in $Modes) {
        if ($ClearCacheBeforeEachRun) {
            Clear-NgcompassCache -Path $project
        }

        $argsForMode = $baseAnalyzeArgs + @("--mode", $mode)
        Write-Host "[$i/$Iterations] $mode..."
        $results.Add((Invoke-AnalyzeRun -Mode $mode -Iteration $i -FilePath $commandPath -ArgumentList $argsForMode -WorkingDirectory $project))

        $last = $results[$results.Count - 1]
        Write-Host ("  {0}: {1}ms reporter={2}ms exit={3}" -f $last.mode, $last.wallClockMs, $last.reporterDurationMs, $last.exitCode)
    }
}

$summary = @($Modes | ForEach-Object { Get-Stats -Rows $results.ToArray() -Mode $_ })
$baseline = $summary | Where-Object { $_.mode -eq "eco" } | Select-Object -First 1
if ($null -ne $baseline -and $null -ne $baseline.medianMs -and $baseline.medianMs -gt 0) {
    $summary = @($summary | ForEach-Object {
        $deltaMs = if ($null -ne $_.medianMs) { [math]::Round($_.medianMs - $baseline.medianMs, 1) } else { $null }
        $speedupPct = if ($null -ne $_.medianMs) { [math]::Round((($baseline.medianMs - $_.medianMs) / $baseline.medianMs) * 100, 1) } else { $null }
        $_ | Add-Member -NotePropertyName medianDeltaVsEcoMs -NotePropertyValue $deltaMs -PassThru |
            Add-Member -NotePropertyName medianSpeedupVsEcoPct -NotePropertyValue $speedupPct -PassThru
    })
}

$payload = [pscustomobject]@{
    measuredAt = (Get-Date).ToString("o")
    projectPath = $project
    iterations = $Iterations
    forceRerun = $true
    clearCacheBeforeEachRun = [bool]$ClearCacheBeforeEachRun
    command = $Command
    resolvedCommand = $commandPath
    modes = $Modes
    analyzeArgs = $AnalyzeArgs
    summary = $summary
    results = $results
}

$payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
$results | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "Summary:"
$summary | Format-Table -AutoSize
Write-Host "JSON: $jsonPath"
Write-Host "CSV:  $csvPath"
