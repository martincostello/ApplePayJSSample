#! /usr/bin/env pwsh
param(
    [Parameter(Mandatory = $false)][string] $OutputPath = "",
    [Parameter(Mandatory = $false)][switch] $SkipTests,
    [Parameter(Mandatory = $false)][string] $Runtime = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$solutionPath = Split-Path $MyInvocation.MyCommand.Definition
$sdkFile = Join-Path $solutionPath "global.json"

$dotnetVersion = (Get-Content $sdkFile | Out-String | ConvertFrom-Json).sdk.version

if ($OutputPath -eq "") {
    $OutputPath = Join-Path "$(Convert-Path "$PSScriptRoot")" "artifacts"
}

$installDotNetSdk = $false;

if (($null -eq (Get-Command "dotnet" -ErrorAction SilentlyContinue)) -and ($null -eq (Get-Command "dotnet.exe" -ErrorAction SilentlyContinue))) {
    Write-Output "The .NET SDK is not installed."
    $installDotNetSdk = $true
}
else {
    Try {
        $installedDotNetVersion = (dotnet --version 2>&1 | Out-String).Trim()
    }
    Catch {
        $installedDotNetVersion = "?"
    }

    if ($installedDotNetVersion -ne $dotnetVersion) {
        Write-Output "The required version of the .NET SDK is not installed. Expected $dotnetVersion."
        $installDotNetSdk = $true
    }
}

if ($installDotNetSdk -eq $true) {

    $env:DOTNET_INSTALL_DIR = Join-Path "$(Convert-Path "$PSScriptRoot")" ".dotnetcli"
    $sdkPath = Join-Path $env:DOTNET_INSTALL_DIR "sdk\$dotnetVersion"

    if (!(Test-Path $sdkPath)) {
        if (!(Test-Path $env:DOTNET_INSTALL_DIR)) {
            mkdir $env:DOTNET_INSTALL_DIR | Out-Null
        }
        $installScript = Join-Path $env:DOTNET_INSTALL_DIR "install.ps1"
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor "Tls12"
        Invoke-WebRequest "https://dot.net/v1/dotnet-install.ps1" -OutFile $installScript -UseBasicParsing
        & $installScript -Version "$dotnetVersion" -InstallDir "$env:DOTNET_INSTALL_DIR" -NoPath
    }
}
else {
    $env:DOTNET_INSTALL_DIR = Split-Path -Path (Get-Command dotnet).Path
}

$dotnet = Join-Path "$env:DOTNET_INSTALL_DIR" "dotnet"

if (($installDotNetSdk -eq $true) -And ($null -eq $env:TF_BUILD)) {
    $env:PATH = "$env:DOTNET_INSTALL_DIR;$env:PATH"
}

$additionalArgs = @()

if (![string]::IsNullOrEmpty($Runtime)) {
    $additionalArgs += "--self-contained"
    $additionalArgs += "--runtime"
    $additionalArgs += $Runtime
}

Write-Output "Publishing application..." -ForegroundColor Green
& $dotnet publish (Join-Path $solutionPath "src" "ApplePayJS" "ApplePayJS.csproj") --output $OutputPath $additionalArgs

$additionalArgs = @()

if (![string]::IsNullOrEmpty($env:GITHUB_SHA)) {
    $additionalArgs += "--report-github"
    $additionalArgs += "--report-github-summary-include-passed"
    $additionalArgs += "false"
}

if ($SkipTests -eq $false) {
    Write-Output "Running tests..." -ForegroundColor Green
    & $dotnet test (Join-Path $solutionPath "tests" "ApplePayJS.Tests" "ApplePayJS.Tests.csproj") --configuration "Release" $additionalArgs
}

if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE"
}
