# Pass Lens

[English](README.md) | **中文**

[![CI](https://github.com/2510551378/PassLens/actions/workflows/ci.yml/badge.svg)](https://github.com/2510551378/PassLens/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90-007ACC)
![Status](https://img.shields.io/badge/status-preview-orange)
![License](https://img.shields.io/badge/license-MIT-green)

Pass Lens 是一个面向编译器 pass pipeline 的 VSCode 调试插件。它把 pass
trace 转成一个 postmortem debugging 视图，把 first signal、metric
anomaly、IR diff、diagnostics 和 repro context 放在同一个界面里。

![Pass Lens first bad pass view](docs/images/pass-lens-first-bad-pass.png)

[动画演示](docs/images/pass-lens-first-bad-pass.gif)

## 为什么需要 Pass Lens

编译器失败通常不是在最后一个 crash 点才发生。非法 IR、legality 破坏、资源预算
超限、可疑 metric 跳变，往往在更早的 pass 中已经出现。

Pass Lens 服务的是这个 postmortem loop：

- 找到第一个失败或可疑的 pass。
- 不用在零散 dump 文件之间来回切换，就能看 before/after IR。
- 在选中 pass 旁边直接看 metric delta 和 anomaly hint。
- 从 diff 视图直接打开 before/after artifact 和 diagnostics。
- 导出紧凑的 Markdown repro bundle，用于 issue、bug report 或 code review。

## 功能亮点

- pass-by-pass timeline，区分 changed、unchanged、failed 状态。
- 可视化 pipeline map，适合在长 lowering pipeline 中快速定位。
- first-signal 导航，支持 verifier failure 和 first IR change。
- metric anomaly 检测：zero-to-positive jump、大比例变化、domain-specific
  budget violation。
- side-by-side IR diff，支持 inline IR 和 artifact-backed snapshot。
- 直接打开 before IR、after IR、diagnostics sidecar。
- 快捷键导航：`j` / `k`、方向键、`/`、`c`、`f`、`a`、`s`。
- 面向 downstream compiler 的结构化 JSON schema。
- 支持快速 `mlir-opt` dump fallback，也支持基于 `PassInstrumentation` 的结构化
  MLIR collector。
- 内置 sample gallery，包括 Triton NPU / AscendC case study。

## 快速开始

从
[v0.1.0 release](https://github.com/2510551378/PassLens/releases/tag/v0.1.0)
下载 `pass-lens-0.1.0.vsix`，或者本地构建。

安装 VSIX：

```powershell
code --install-extension pass-lens-0.1.0.vsix
```

打开 VSCode，运行：

```text
Pass Lens: Open Sample Trace
```

建议先看这些 sample：

- `Triton NPU strict fallback`
- `Real Triton NPU dual RMSNorm`
- `Verifier failure`

打开自己的 trace：

```text
Pass Lens: Open Trace File
```

选择符合 [`docs/pass-lens.schema.json`](docs/pass-lens.schema.json) 的 JSON
trace。

## 核心工作流

1. 从 sample gallery 或本地 JSON 文件打开 trace。
2. 先看顶部 summary cards：changed passes、first signal、anomalies、slowest
   pass。
3. 在左侧 timeline 选择 pass。
4. 先读 selected-pass card，它会说明这个 pass 为什么值得看。
5. 检查 metric anomalies 和 metric deltas。
6. 对比 side-by-side IR diff。
7. 如果 trace 使用 sidecar 文件，直接打开 artifact 或 diagnostics。
8. 如果要提交 bug report，导出 repro bundle。

常用快捷键：

| 快捷键 | 动作 |
| --- | --- |
| `j` / `Down` | 下一个可见 pass |
| `k` / `Up` | 上一个可见 pass |
| `/` | 聚焦搜索 |
| `c` | 切换 changed-only |
| `f` | 跳到 first signal |
| `a` | 跳到 first anomaly |
| `s` | 跳到 slowest pass |

## Trace 生成方式

Pass Lens 支持三条 trace-producing path。

### 结构化 MLIR Collector

如果可以构建 `pass-lens-mlir-opt`，或者可以把 collector 接入 downstream MLIR
driver，推荐使用这条路径。

```powershell
pass-lens-mlir-opt input.mlir `
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" `
  --pass-lens-trace=input.pass-lens.json `
  --pass-lens-artifact-dir=input.pass-lens-artifacts `
  -o output.mlir
```

这是更推荐的路径，因为它能提供 timing、verifier failure attribution、pass
identity 和 artifact-backed IR snapshots。

### `mlir-opt` Dump Fallback

当只有 `mlir-opt` 可用时，可以使用 `Pass Lens: Run mlir-opt Trace`。这条路径会
反向解析 textual dump marker，适合快速实验，但不能提供可靠的 per-pass duration。

示例 pass pipeline：

```text
builtin.module(func.func(canonicalize,cse))
```

如果 `mlir-opt` 不在 `PATH` 上，可以设置 `passLens.mlirOptPath`。

### Downstream Compiler 直接输出 JSON

downstream compiler 可以直接输出 Pass Lens schema。一个最小的 artifact-backed
trace 如下：

```json
{
  "schemaVersion": 1,
  "tool": "my-compiler",
  "capture": {
    "ir": "artifact",
    "metrics": true,
    "timing": true
  },
  "stages": [
    {
      "index": 0,
      "pass": "my-pass",
      "status": "changed",
      "changed": true,
      "artifacts": {
        "beforePath": "artifacts/0-before.mlir",
        "afterPath": "artifacts/0-after.mlir",
        "diagnosticsPath": "artifacts/0-diag.txt"
      },
      "metricsBefore": {
        "ops": 10
      },
      "metricsAfter": {
        "ops": 7
      }
    }
  ]
}
```

完整 viewer contract 见 [docs/trace-schema.md](docs/trace-schema.md)。

## Sample Gallery

`Pass Lens: Open Sample Trace` 包含：

- `Toy MLIR pipeline`：用于检查基础 viewer layout 的小 trace。
- `Long lowering pipeline`：用于验证 filter、changed-only、slowest-pass
  navigation 的长 trace。
- `Verifier failure`：failure-focused trace，会直接打开到第一个失败 pass。
- `External IR artifacts`：从 sidecar 文件加载 before/after IR 和 diagnostics。
- `Triton NPU UB budget overflow`：AscendC resource-budget anomaly case study。
- `Triton NPU strict fallback`：strict-mode legality 和 fallback case study。
- `Real Triton NPU dual RMSNorm`：来自本地 `npuir2ascendc` 的真实 trace，从
  captured TTAdapter IR 到生成的 AscendC kernel artifact。

Triton NPU / AscendC samples 背后的调试故事见
[docs/examples/triton-npu.md](docs/examples/triton-npu.md)。

## 开发

```powershell
npm install
npm run compile
code .
```

在 VSCode 中按 `F5`，然后运行：

- `Pass Lens: Open Sample Trace`
- `Pass Lens: Open Trace File`
- `Pass Lens: Run mlir-opt Trace`
- `Pass Lens: Run Structured MLIR Trace`
- `Pass Lens: Check MLIR Collector Setup`

运行测试：

```powershell
npm test
```

打包本地 VSIX：

```powershell
npm run package
```

## MLIR Collector

结构化 collector 位于
[`collectors/mlir-pass-lens`](collectors/mlir-pass-lens)。它提供 C++
`PassInstrumentation` library 和 `pass-lens-mlir-opt` driver scaffold，供自定义
MLIR driver 或 downstream compiler tool 调用 `PassManager::addInstrumentation`。

在有 LLVM/MLIR development files 的机器上检查 C++ collector：

```powershell
$env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"
$env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"
npm run check:mlir-collector
```

如果本地没有配置 LLVM/MLIR development files，helper 会打印
`ENVIRONMENT_MISSING` 并以 code `2` 退出。其他失败通常是 configure/build
失败，值得进一步检查。

## 项目状态

Pass Lens 目前是 preview extension。trace viewer、sample gallery、schema
validation、repro bundle export、artifact opening 和 MLIR collector scaffold
现在已经可用。当前重点是接入更真实的 downstream compiler，并继续减少从
“compiler failed” 到 “这个 pass 很可疑” 的时间。

## Roadmap

- directory-style repro bundle，包含 standalone `trace.json`、IR artifacts、
  diagnostics 和 repro scripts。
- metric trend charts 和 root-cause candidate summaries。
- 在真实 downstream MLIR / Triton NPU pipeline 中运行 live structured
  collector。
- 本地 VSIX workflow 稳定后发布到 VSCode Marketplace。

## 已知限制

- `mlir-opt` dump fallback 是 best-effort，不能产生可靠的 per-pass timing。
- structured collector 当前面向 MLIR-based drivers。LLVM New Pass Manager 支持是
  future work。
- metric anomalies 是 triage hints。它们能指出可疑 delta 和 domain contract
  violation，但不能证明某个 pass 一定错误。
- 内置 Triton NPU failure traces 是 case-study samples。真实 dual RMSNorm trace
  来自本地 `npuir2ascendc` run，但还不是该 compiler 内部 live
  `PassInstrumentation` 直接产生的 trace。

## License

MIT
