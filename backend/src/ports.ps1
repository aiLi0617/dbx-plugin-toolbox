$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = $env:DBX_PORT_REQUEST | ConvertFrom-Json
    $portNumber = [int]$request.port
    function Get-PortEndpoints {
        # Get-NetTCPConnection performs a slow CIM scan (and its LocalPort
        # filter can require elevated access on some Windows versions).
        # netstat reads the same kernel tables in about 100 ms and needs no
        # localization-sensitive parsing beyond stable numeric columns.
        $netstat = Join-Path $env:SystemRoot 'System32\netstat.exe'
        $lines = @(& $netstat -ano -p $request.protocol)
        if ($LASTEXITCODE -ne 0) { throw 'PORT_QUERY_FAILED' }
        $rows = @()
        foreach ($line in $lines) {
            $parts = @($line.Trim() -split '\s+')
            $expected = if ($request.protocol -eq 'tcp') { 5 } else { 4 }
            if ($parts.Count -ne $expected -or $parts[0].ToLowerInvariant() -ne $request.protocol) { continue }
            $local = $parts[1]
            $colon = $local.LastIndexOf(':')
            if ($colon -lt 0) { continue }
            $parsedPort = 0
            if (![int]::TryParse($local.Substring($colon + 1), [ref]$parsedPort) -or $parsedPort -ne $portNumber) { continue }
            $address = $local.Substring(0, $colon).Trim('[', ']')
            $pidIndex = if ($request.protocol -eq 'tcp') { 4 } else { 3 }
            $owner = 0
            if (![int]::TryParse($parts[$pidIndex], [ref]$owner)) { continue }
            $rows += [pscustomobject]@{
                OwningProcess = $owner
                LocalAddress = $address
                State = if ($request.protocol -eq 'tcp') { $parts[3] } else { 'UDP' }
            }
        }
        @($rows)
    }
    $endpoints = @(Get-PortEndpoints)
    # Rust snapshots the process tree through Toolhelp before launching
    # PowerShell. This avoids several slow CIM round trips per request.
    $protected = @{}
    foreach ($protectedId in @($request.protectedPids)) {
        $protected[[int]$protectedId] = $true
    }
    if ($request.action -eq 'kill') {
        $targetId = [int]$request.pid
        if ($targetId -le 4 -or $protected.ContainsKey($targetId)) {
            throw 'PORT_PROCESS_PROTECTED'
        }
        $targetProcess = Get-Process -Id $targetId -ErrorAction SilentlyContinue
        if (!$targetProcess) { throw 'PORT_PROCESS_CHANGED' }
        try {
            # Keep an OS handle open through validation and termination to avoid PID reuse.
            $null = $targetProcess.Handle
            if ($targetProcess.StartTime.ToUniversalTime().Ticks.ToString() -ne $request.started) {
                throw 'PORT_PROCESS_CHANGED'
            }
            $current = @(Get-PortEndpoints | Where-Object { $_.OwningProcess -eq $targetId })
            if ($current.Count -eq 0) { throw 'PORT_PROCESS_CHANGED' }
            $targetProcess.Kill()
            if (!$targetProcess.WaitForExit(5000)) { throw 'PORT_TIMEOUT' }
        } finally {
            $targetProcess.Dispose()
        }
        @{ killed = $true; pid = $targetId } | ConvertTo-Json -Compress
    } else {
        $rows = @()
        foreach ($group in @($endpoints | Group-Object OwningProcess)) {
            $targetId = [int]$group.Name
            $processName = ''
            $started = ''
            $targetProcess = Get-Process -Id $targetId -ErrorAction SilentlyContinue
            if ($targetProcess) {
                try {
                    $processName = $targetProcess.ProcessName
                    $started = $targetProcess.StartTime.ToUniversalTime().Ticks.ToString()
                } catch {
                    # Still show inaccessible processes, but do not offer termination.
                } finally { $targetProcess.Dispose() }
            }
            $rows += @{
                pid = $targetId
                name = $processName
                started = $started
                canKill = ($targetId -gt 4 -and !$protected.ContainsKey($targetId) -and $started -ne '')
                addresses = @($group.Group | ForEach-Object { $_.LocalAddress } | Sort-Object -Unique)
                states = @($group.Group | ForEach-Object { if ($request.protocol -eq 'tcp') { "$($_.State)" } else { 'UDP' } } | Sort-Object -Unique)
            }
        }
        @{ processes = @($rows); port = $portNumber; protocol = $request.protocol } | ConvertTo-Json -Depth 5 -Compress
    }
} catch {
    $code = "$($_.Exception.Message)"
    if ($code -notmatch '^PORT_[A-Z_]+$') {
        if ($request.action -eq 'kill') { $code = 'PORT_KILL_FAILED' }
        else { $code = 'PORT_QUERY_FAILED' }
    }
    @{ error = $code } | ConvertTo-Json -Compress
}
