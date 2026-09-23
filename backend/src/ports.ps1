$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = $env:DBX_PORT_REQUEST | ConvertFrom-Json
    $portNumber = [int]$request.port
    function Get-PortEndpoints {
        # Filter numerically by LOCAL port, never by a substring or remote port.
        if ($request.protocol -eq 'tcp') {
            @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.LocalPort -eq $portNumber })
        } else {
            @(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object { $_.LocalPort -eq $portNumber })
        }
    }
    $endpoints = @(Get-PortEndpoints)
    # Protect the sidecar, DBX, and its ancestors as well as Windows system PIDs.
    $protected = @{}
    $ancestor = [int]$request.backendPid
    while ($ancestor -gt 0 -and !$protected.ContainsKey($ancestor)) {
        $protected[$ancestor] = $true
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $ancestor" -ErrorAction Stop
        if (!$parent) { break }
        $ancestor = [int]$parent.ParentProcessId
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
