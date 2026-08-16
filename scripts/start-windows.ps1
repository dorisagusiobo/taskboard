$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

if (-not (Test-Path .env)) {
    throw "Missing .env file in project root."
}

$containerName = "project-management-mvp"

docker build -t project-management-mvp .
if ($LASTEXITCODE -ne 0) {
    throw "Docker image build failed."
}

$containerExists = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $containerName }
if ($containerExists) {
    docker rm -f $containerName | Out-Null
}

docker run --rm -d `
    --name $containerName `
    -p 8000:8000 `
    --env-file .env `
    project-management-mvp | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Docker container failed to run."
}

for ($attempt = 1; $attempt -le 30; $attempt++) {
    $status = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerName

    if ($status -eq "healthy") {
        Write-Host "Application running at http://localhost:8000"
        exit 0
    }

    if ($status -in @("unhealthy", "exited", "dead")) {
        docker logs $containerName
        docker rm -f $containerName | Out-Null
        throw "Application failed to start."
    }

    Start-Sleep -Seconds 1
}

docker logs $containerName
docker rm -f $containerName | Out-Null
throw "Application did not become healthy within 30 seconds."
