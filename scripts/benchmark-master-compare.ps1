param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [int]$Iterations = 5,

    [string]$PublishedPackage = "ngcompass",

    [string]$LocalCommand = "ngcompass",

    [string[]]$AnalyzeArgs = @("--quiet", "--format", "json"),

    [switch]$ClearCacheBeforeEachRun,

    [string]$RequiredBranch = "master",

    [string]$OutputDirectory = (Join-Path $PSScriptRoot "benchmark-compare")
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectPath {
    param([string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    return $resolved.ProviderPath
}

function Assert-RequiredBranch {
    param([string]$Branch)

    if ([string]::IsNullOrWhiteSpace($Branch)) {
        return
    }

    $repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop
    $repoRootPath = $repoRoot.ProviderPath
    $currentBranch = (& git -C $repoRootPath branch --show-current 2>$null).Trim()

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
        throw "Unable to determine the current Git branch for $repoRootPath."
    }

    if ($currentBranch -ne $Branch) {
        throw "This benchmark must be run from branch '$Branch'. Current branch is '$currentBranch'."
    }
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

function Get-Stats {
    param(
        [object[]]$Rows,
        [string]$Version
    )

    $items = @($Rows | Where-Object { $_.version -eq $Version })
    $successful = @($items | Where-Object { $_.exitCode -eq 0 -or $_.summaryParsed })
    $times = @($successful | ForEach-Object { [double]$_.wallClockMs } | Sort-Object)

    if ($times.Count -eq 0) {
        return [pscustomobject]@{
            version = $Version
            runs = $items.Count
            successfulRuns = 0
            averageMs = $null
            medianMs = $null
            minMs = $null
            maxMs = $null
            averagePeakWorkingSetMb = $null
        }
    }

    $median = if ($times.Count % 2 -eq 1) {
        $times[[math]::Floor($times.Count / 2)]
    } else {
        ($times[$times.Count / 2 - 1] + $times[$times.Count / 2]) / 2
    }

    $memoryValues = @($successful | Where-Object { $null -ne $_.peakWorkingSetMb } | ForEach-Object { [double]$_.peakWorkingSetMb })

    return [pscustomobject]@{
        version = $Version
        runs = $items.Count
        successfulRuns = $successful.Count
        averageMs = [math]::Round(($times | Measure-Object -Average).Average, 1)
        medianMs = [math]::Round($median, 1)
        minMs = [math]::Round(($times | Measure-Object -Minimum).Minimum, 1)
        maxMs = [math]::Round(($times | Measure-Object -Maximum).Maximum, 1)
        averagePeakWorkingSetMb = if ($memoryValues.Count -gt 0) { [math]::Round(($memoryValues | Measure-Object -Average).Average, 1) } else { $null }
    }
}

function Invoke-AnalyzeRun {
    param(
        [string]$Version,
        [int]$Iteration,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )

    $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ngcompass-master-compare-" + [Guid]::NewGuid().ToString("N") + ".out")
    $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ngcompass-master-compare-" + [Guid]::NewGuid().ToString("N") + ".err")
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
        version = $Version
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

Assert-RequiredBranch -Branch $RequiredBranch

$project = Resolve-ProjectPath -Path $ProjectPath
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$jsonPath = Join-Path $OutputDirectory "ngcompass-master-compare-$timestamp.json"
$csvPath = Join-Path $OutputDirectory "ngcompass-master-compare-$timestamp.csv"

$analyzeCommandArgs = @("analyze") + $AnalyzeArgs + "--force"

$publishedCommand = Resolve-CommandPath -Command "npx"
$localCommandPath = Resolve-CommandPath -Command $LocalCommand
$publishedArgs = @("--yes", $PublishedPackage) + $analyzeCommandArgs
$localArgs = $analyzeCommandArgs

$results = New-Object System.Collections.Generic.List[object]

Write-Host "Project: $project"
Write-Host "Iterations: $Iterations"
Write-Host "Required branch: $RequiredBranch"
Write-Host "Published: $publishedCommand $($publishedArgs -join ' ')"
Write-Host "Local master: $localCommandPath $($localArgs -join ' ')"
Write-Host "Execution: sequential, published then local master for each iteration"
Write-Host ""

for ($i = 1; $i -le $Iterations; $i++) {
    foreach ($target in @("published", "local-master")) {
        if ($ClearCacheBeforeEachRun) {
            Clear-NgcompassCache -Path $project
        }

        if ($target -eq "published") {
            Write-Host "[$i/$Iterations] published..."
            $results.Add((Invoke-AnalyzeRun -Version "published" -Iteration $i -FilePath $publishedCommand -ArgumentList $publishedArgs -WorkingDirectory $project))
        } else {
            Write-Host "[$i/$Iterations] local master..."
            $results.Add((Invoke-AnalyzeRun -Version "local-master" -Iteration $i -FilePath $localCommandPath -ArgumentList $localArgs -WorkingDirectory $project))
        }

        $last = $results[$results.Count - 1]
        Write-Host ("  {0}: {1}ms exit={2}" -f $last.version, $last.wallClockMs, $last.exitCode)
    }
}

$summary = @(
    Get-Stats -Rows $results.ToArray() -Version "published"
    Get-Stats -Rows $results.ToArray() -Version "local-master"
)

$payload = [pscustomobject]@{
    measuredAt = (Get-Date).ToString("o")
    projectPath = $project
    iterations = $Iterations
    requiredBranch = $RequiredBranch
    forceRerun = $true
    clearCacheBeforeEachRun = [bool]$ClearCacheBeforeEachRun
    publishedPackage = $PublishedPackage
    localCommand = $LocalCommand
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
