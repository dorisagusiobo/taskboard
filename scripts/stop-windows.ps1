$ErrorActionPreference = "Stop"

$containerExists = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq 'project-management-mvp' }
if ($containerExists) {
    docker rm -f project-management-mvp | Out-Null
}

Write-Host "Stopped project-management-mvp"
