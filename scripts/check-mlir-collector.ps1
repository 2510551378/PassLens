param(
  [string]$MLIR_DIR = $env:MLIR_DIR,
  [string]$LLVM_DIR = $env:LLVM_DIR,
  [string]$BuildDir = "build\pass-lens-mlir",
  [string]$Configuration = "Release",
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path -LiteralPath (Join-Path $scriptDir "..")).Path
}

function Test-CMakePackageDir {
  param(
    [string]$Path,
    [string]$ConfigFile
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $false
  }
  $candidate = Join-Path $Path $ConfigFile
  return Test-Path -LiteralPath $candidate -PathType Leaf
}

function Fail-Environment {
  param([string]$Message)
  Write-Host "ENVIRONMENT_MISSING: $Message" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Set MLIR_DIR and LLVM_DIR to the CMake package directories from an LLVM/MLIR build or install tree." -ForegroundColor Yellow
  Write-Host "Example:" -ForegroundColor Yellow
  Write-Host '  $env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"' -ForegroundColor Yellow
  Write-Host '  $env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"' -ForegroundColor Yellow
  exit 2
}

$repoRoot = Resolve-RepoRoot
$collectorRoot = Join-Path $repoRoot "collectors\mlir-pass-lens"
$buildPath = Join-Path $repoRoot $BuildDir

$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) {
  Fail-Environment "cmake was not found on PATH."
}

if (-not (Test-Path -LiteralPath $collectorRoot -PathType Container)) {
  throw "Collector source directory not found: $collectorRoot"
}

if (-not (Test-CMakePackageDir -Path $MLIR_DIR -ConfigFile "MLIRConfig.cmake")) {
  Fail-Environment "MLIR_DIR does not point to a directory containing MLIRConfig.cmake. Current value: '$MLIR_DIR'"
}

if (-not (Test-CMakePackageDir -Path $LLVM_DIR -ConfigFile "LLVMConfig.cmake")) {
  Fail-Environment "LLVM_DIR does not point to a directory containing LLVMConfig.cmake. Current value: '$LLVM_DIR'"
}

if ($Clean -and (Test-Path -LiteralPath $buildPath)) {
  $resolvedBuild = (Resolve-Path -LiteralPath $buildPath).Path
  $resolvedRepo = (Resolve-Path -LiteralPath $repoRoot).Path
  if (-not $resolvedBuild.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean build path outside repo: $resolvedBuild"
  }
  Remove-Item -LiteralPath $resolvedBuild -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $buildPath | Out-Null

Write-Host "Configuring Pass Lens MLIR collector..."
Write-Host "  Source: $collectorRoot"
Write-Host "  Build:  $buildPath"
Write-Host "  MLIR_DIR: $MLIR_DIR"
Write-Host "  LLVM_DIR: $LLVM_DIR"

& cmake -S $collectorRoot -B $buildPath `
  -DMLIR_DIR="$MLIR_DIR" `
  -DLLVM_DIR="$LLVM_DIR" `
  -DCMAKE_BUILD_TYPE="$Configuration"

if ($LASTEXITCODE -ne 0) {
  throw "CMake configure failed with exit code $LASTEXITCODE."
}

Write-Host "Building pass-lens-mlir-opt..."
& cmake --build $buildPath --config $Configuration --target pass-lens-mlir-opt

if ($LASTEXITCODE -ne 0) {
  throw "Collector build failed with exit code $LASTEXITCODE."
}

Write-Host "COLLECTOR_BUILD_OK"
