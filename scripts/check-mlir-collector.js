#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const collectorRoot = path.join(repoRoot, 'collectors', 'mlir-pass-lens');

const args = parseArgs(process.argv.slice(2));
const mlirDir = args.mlirDir ?? process.env.MLIR_DIR ?? '';
const llvmDir = args.llvmDir ?? process.env.LLVM_DIR ?? '';
const buildDir = path.resolve(repoRoot, args.buildDir ?? path.join('build', 'pass-lens-mlir'));
const configuration = args.configuration ?? process.env.CONFIGURATION ?? 'Release';

function main() {
  if (!commandExists('cmake')) {
    failEnvironment('cmake was not found on PATH.');
  }
  if (!fs.existsSync(collectorRoot)) {
    throw new Error(`Collector source directory not found: ${collectorRoot}`);
  }
  if (!hasConfigFile(mlirDir, 'MLIRConfig.cmake')) {
    failEnvironment(`MLIR_DIR does not point to a directory containing MLIRConfig.cmake. Current value: '${mlirDir}'`);
  }
  if (!hasConfigFile(llvmDir, 'LLVMConfig.cmake')) {
    failEnvironment(`LLVM_DIR does not point to a directory containing LLVMConfig.cmake. Current value: '${llvmDir}'`);
  }

  if (args.clean && fs.existsSync(buildDir)) {
    assertPathInsideRepo(buildDir);
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(buildDir, { recursive: true });

  console.log('Configuring Pass Lens MLIR collector...');
  console.log(`  Source: ${collectorRoot}`);
  console.log(`  Build:  ${buildDir}`);
  console.log(`  MLIR_DIR: ${mlirDir}`);
  console.log(`  LLVM_DIR: ${llvmDir}`);

  const configureArgs = [
    '-S',
    collectorRoot,
    '-B',
    buildDir,
    `-DMLIR_DIR=${mlirDir}`,
    `-DLLVM_DIR=${llvmDir}`,
    `-DCMAKE_BUILD_TYPE=${configuration}`
  ];
  if (!process.env.CMAKE_GENERATOR && commandExists('ninja')) {
    configureArgs.splice(4, 0, '-G', 'Ninja');
  }
  run('cmake', configureArgs, 'CMake configure failed.');

  console.log('Building pass-lens-mlir-opt...');
  run('cmake', ['--build', buildDir, '--config', configuration, '--target', 'pass-lens-mlir-opt'], 'Collector build failed.');
  console.log('COLLECTOR_BUILD_OK');
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--clean') {
      parsed.clean = true;
    } else if (arg === '--mlir-dir') {
      parsed.mlirDir = rawArgs[++i];
    } else if (arg.startsWith('--mlir-dir=')) {
      parsed.mlirDir = arg.slice('--mlir-dir='.length);
    } else if (arg === '--llvm-dir') {
      parsed.llvmDir = rawArgs[++i];
    } else if (arg.startsWith('--llvm-dir=')) {
      parsed.llvmDir = arg.slice('--llvm-dir='.length);
    } else if (arg === '--build-dir') {
      parsed.buildDir = rawArgs[++i];
    } else if (arg.startsWith('--build-dir=')) {
      parsed.buildDir = arg.slice('--build-dir='.length);
    } else if (arg === '--configuration') {
      parsed.configuration = rawArgs[++i];
    } else if (arg.startsWith('--configuration=')) {
      parsed.configuration = arg.slice('--configuration='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function hasConfigFile(directory, configFile) {
  return typeof directory === 'string' &&
    directory.trim().length > 0 &&
    fs.existsSync(path.join(directory, configFile));
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: 'ignore',
    shell: process.platform === 'win32'
  });
  return result.status === 0;
}

function run(command, commandArgs, failureMessage) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    throw new Error(`${failureMessage} Exit code: ${result.status ?? 'unknown'}.`);
  }
}

function assertPathInsideRepo(targetPath) {
  const relative = path.relative(repoRoot, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean build path outside repo: ${targetPath}`);
  }
}

function failEnvironment(message) {
  console.log(`ENVIRONMENT_MISSING: ${message}`);
  console.log('');
  console.log('Set MLIR_DIR and LLVM_DIR to the CMake package directories from an LLVM/MLIR build or install tree.');
  console.log('Example:');
  console.log('  MLIR_DIR=/path/to/llvm-build/lib/cmake/mlir');
  console.log('  LLVM_DIR=/path/to/llvm-build/lib/cmake/llvm');
  process.exit(2);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
