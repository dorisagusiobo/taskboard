$ErrorActionPreference = "Stop"

$containerExists = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq 'taskboard' }
if ($containerExists) {
    docker rm -f taskboard | Out-Null
}

Write-Host "Stopped taskboard"
