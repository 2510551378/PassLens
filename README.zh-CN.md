<p align="center">
  <img src="docs/images/pass-lens-logo.png" width="132" alt="Pass Lens logo">
</p>

<h1 align="center">Pass Lens</h1>

<p align="center">
  <strong>面向 MLIR / LLVM pass pipeline 的 evidence-driven postmortem debugger。</strong>
</p>

<p align="center">
  把 compiler pass trace 变成可操作的调试现场：first signal、IR diff、
  diagnostics、metric anomalies、trace quality、repro context 和 artifact paths。
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="docs/trace-schema.md">Trace Schema</a>
  ·
  <a href="docs/collector-author-guide.md">Collector Guide</a>
  ·
  <a href="docs/sample-provenance.md">Sample Provenance</a>
  ·
  <a href="docs/release-milestones.md">Milestones</a>
  ·
  <a href="collectors/mlir-pass-lens">MLIR Collector</a>
</p>

<p align="center">
  <a href="https://github.com/2510551378/PassLens/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/2510551378/PassLens/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue">
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.90-007ACC">
  <img alt="Status" src="https://img.shields.io/badge/status-preview-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

![Pass Lens hero](docs/images/pass-lens-hero.png)

![Pass Lens first bad pass view](docs/images/pass-lens-first-bad-pass.png)

## 为什么需要 Pass Lens

编译器失败通常不是在最后一个 crash 点才发生。非法 IR、legality 破坏、资源预算
超限、可疑 metric 跳变，往往在更早的 pass 中已经出现。

Pass Lens 提供的是 trace-grounded 的排障链路：

| 环节 | Pass Lens 暴露的信息 |
| --- | --- |
| Signal | first verifier failure、first IR change、first anomaly、slowest pass |
| Evidence | before/after IR、diagnostics、metric deltas、validation issues |
| Repro | Markdown repro、directory repro bundle、commands、artifacts |
| Agent handoff | 带 evidence IDs 和 guardrails 的 bounded JSON/Markdown context |

Pass Lens trace schema 是公共契约。VS Code extension 是一个 viewer，MLIR
collector 是一个 reference producer，downstream compilers 可以实现自己的
producer。

## 功能亮点

- pass-by-pass timeline，区分 changed、unchanged、failed、anomalous 和 slow
  stages。
- long pass pipeline 使用 virtualized timeline rendering。
- first-signal 导航，支持 verifier failure、first IR change、anomaly spike 和
  slowest pass。
- side-by-side IR diff，支持 inline IR 和 lazy-loaded artifact-backed IR。
- metric anomaly 检测：zero-to-positive jump、大比例变化、domain-specific
  budget violation。
- trace quality score：检查 pass identity、timing、verifier status、artifact
  coverage 和 stage index consistency。
- trace size report：识别应该从 inline IR 切到 artifact-backed capture 的
  trace，并给出 quick fixes。
- directory-style repro bundle：包含 `trace.json`、artifacts、diagnostics、
  `run.ps1`、`run.sh`、`manifest.json`、agent context 和 agent tool manifest。
- 在任何 model call 之前，先生成 deterministic issue summaries 和
  suspicious-pass explanations。
- AI-facing exports 坚持 trace-grounded：输出带引用的 evidence 和 bounded
  context，而不是 generic chat surface。
- 预留 agent-ready deterministic tool contracts：覆盖 queries、reports、
  exports 和本地 rerun/bisect workflows。
- preview natural-language query planning 只把明确请求映射到 deterministic
  Pass Lens tools，不开放 generic chat surface。
- MLIR 支持两条路径：`mlir-opt` dump fallback 和基于 `PassInstrumentation`
  的 structured collector。

## 快速开始

从
[v0.1.0 release](https://github.com/2510551378/PassLens/releases/tag/v0.1.0)
下载 `pass-lens-0.1.0.vsix`，或者本地构建：

```powershell
npm install
npm run package
code --install-extension pass-lens-0.1.0.vsix
```

打开 VS Code，运行：

```text
Pass Lens: Open Sample Trace
```

建议先看这些 sample：

- `Live MLIR PassInstrumentation`
- `Verifier failure`
- `External IR artifacts`
- `Toy MLIR pipeline`
- `Long lowering pipeline`

打开自己的 trace：

```text
Pass Lens: Open Trace File
```

trace 应符合 [`docs/pass-lens.schema.json`](docs/pass-lens.schema.json)。

在分享 trace 或从 CI 上传之前，可以先验证：

```powershell
npm run validate:trace -- --check-artifacts path\to\trace.json
```

准备公开 preview build 前，先运行 release entry-point check：

```powershell
npm run release:check
```

Marketplace / Open VSX checklist 见
[`docs/release-readiness.md`](docs/release-readiness.md)。

## 使用指南

### 1. 查看 trace

可以从 sample 或本地 JSON trace 开始：

```text
Pass Lens: Open Sample Trace
Pass Lens: Open Trace File
```

先读顶部 summary cards：

- `First signal`：第一个 verifier failure；如果没有 failure，则显示第一个
  changed pass。
- `Anomalies`：可疑 metric jump 或 budget violation。
- `Trace quality`：collector 是否提供了 pass identity、timing、verifier
  status、artifacts 和稳定的 stage indexes。
- `Trace size`：inline IR bytes、artifact bytes、diagnostics bytes，以及需要从
  inline IR 切换到 artifact-backed capture 的 quick fixes。
- `Origin`：trace 是 live instrumentation、converted dump、hand-authored
  example，还是 real artifact capture。

在 timeline 中选择一个 pass 后，重点看：

- before/after IR diff；
- metric deltas；
- diagnostics；
- artifact paths；
- suspicious-pass explanation；
- copy/export actions。

artifact-backed IR 是 lazy-loaded。打开大 trace 时，Pass Lens 不会一次性读取所有
before/after artifacts；只有当你选择某个 stage 并查看或导出它时，才会读取对应
artifact text。

### 2. 采集 structured MLIR trace

如果可以构建 `pass-lens-mlir-opt`，或者可以把 collector 接入 downstream MLIR
driver，推荐使用这条路径：

```powershell
pass-lens-mlir-opt input.mlir `
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" `
  --pass-lens-trace=input.pass-lens.json `
  --pass-lens-artifact-dir=input.pass-lens-artifacts `
  -o output.mlir
```

然后用 `Pass Lens: Open Trace File` 打开 `input.pass-lens.json`。

这条路径最适合提供：

- pass identity 和 nested pass scope；
- verifier attribution；
- per-pass timing；
- metric capture；
- artifact-backed before/after IR。

### 3. 使用 `mlir-opt` dump fallback

当只有 `mlir-opt` 可用时，运行：

```text
Pass Lens: Run mlir-opt Trace
```

这个 wrapper 会反向解析 `mlir-opt` textual dump markers。它适合快速实验，但不能
提供可靠的 per-pass duration。Pass Lens 会通过 trace quality reports 标注这个
限制，而不是把 fallback 伪装成 structured instrumentation。

### 4. 让其他 compiler 直接输出 JSON

downstream compiler 可以直接输出 Pass Lens schema。真实 compiler pipeline
建议优先使用 artifact-backed IR：

```json
{
  "schemaVersion": 1,
  "tool": "my-compiler",
  "provenance": {
    "kind": "live-pass-instrumentation",
    "description": "Collected from the compiler pass instrumentation hook."
  },
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

collector-author templates 见
[`docs/schema-examples.md`](docs/schema-examples.md)，覆盖 MLIR、LLVM New
Pass Manager-style traces 和 hardware backend metrics。完整 schema 位于
[`docs/pass-lens.schema.json`](docs/pass-lens.schema.json)，字段语义见
[`docs/trace-schema.md`](docs/trace-schema.md)。外部 producer 接入步骤见
[`docs/collector-author-guide.md`](docs/collector-author-guide.md)。

### 5. 生成 reports 和 repro artifacts

打开 trace 后，运行：

```text
Pass Lens: Query Current Trace
```

常用 report actions 包括：

- GitHub issue description；
- top suspicious passes；
- first fallback / legality / budget signal；
- candidate root causes；
- trace quality report；
- trace size report。

在 trace panel 中也可以导出：

- Markdown repro bundle；
- directory repro bundle，包含 `trace.json`、artifacts、`run.ps1`、`run.sh`、
  `manifest.json`、`agent-context.json` 和 `agent-tools.json`；
- bounded agent context JSON 或 Markdown；
- suspicious-pass explanation。

Agent exports 遵循
[`docs/pass-lens-agent-context.schema.json`](docs/pass-lens-agent-context.schema.json)。
Agent tool manifests 遵循
[`docs/pass-lens-agent-tools.schema.json`](docs/pass-lens-agent-tools.schema.json)。
agent-facing contract 见 [`docs/agent-tools.md`](docs/agent-tools.md)。

### 6. 寻找最小失败前缀

如果 pipeline 失败，并且你需要最小 failing prefix，运行：

```text
Pass Lens: Run Prefix Bisect
```

Pass Lens 会用配置好的 structured collector driver 重新运行 textual MLIR
pipeline prefixes，并打开 minimal failing prefix report。报告包含 command lines、
attempt traces、diagnostics，以及找到时的 shortest failing prefix。

### 7. 处理 large traces

真实 compiler pipeline 建议：

- 优先使用 `capture.ir = "artifact"`，避免把大段 IR 放进 inline strings；
- 将 before/after IR 放到 sidecar files，并通过 `artifacts.beforePath` /
  `artifacts.afterPath` 引用；
- 填写 `provenance`，让用户知道 trace 来自 live instrumentation、converted
  dumps、hand-authored examples，还是 real artifact captures；
- 用 trace size report 找出应该迁移到 artifacts 的 inline payload；
- 用 trace quality report 确认 pass identity、verifier status、timing 和 artifact
  coverage 是否可信。

## 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `j` / `Down` | 下一个可见 pass |
| `k` / `Up` | 上一个可见 pass |
| `/` | 聚焦搜索 |
| `c` | 切换 changed-only |
| `f` | 跳到 first signal |
| `a` | 跳到 first anomaly |
| `s` | 跳到 slowest pass |

## Sample Gallery

`Pass Lens: Open Sample Trace` 包含：

- `Live MLIR PassInstrumentation`：来自 L20 的真实 structured collector
  output，使用 artifact-backed IR 展示 `canonicalize,cse`。
- `Toy MLIR pipeline`：用于检查基础 viewer layout 的小 trace。
- `Long lowering pipeline`：用于验证 filter、changed-only view 和 slowest-pass
  navigation 的长 trace。
- `Verifier failure`：failure-focused trace，会直接打开到第一个失败 pass。
- `External IR artifacts`：从 sidecar 文件加载 before/after IR 和 diagnostics。
- `Triton NPU UB budget overflow`：可选 hardware-backend metric anomaly case
  study。
- `Triton NPU strict fallback`：可选 strict-mode legality 和 fallback case
  study。
- `Real Triton NPU dual RMSNorm`：可选真实本地 `npuir2ascendc` trace，从
  captured TTAdapter IR 到生成的 AscendC kernel artifacts。

Triton NPU / AscendC samples 不是核心产品契约的一部分，只作为 optional case
studies 保留，用来说明同一套 schema 可以承载 hardware-backend evidence。

哪些 sample 是 live collector output、real artifact capture 或 hand-authored
example，见 [`docs/sample-provenance.md`](docs/sample-provenance.md)。

## Commands

| Command | 用途 |
| --- | --- |
| `Pass Lens: Open Sample Trace` | 查看内置样例 |
| `Pass Lens: Open Trace File` | 打开本地 Pass Lens JSON trace |
| `Pass Lens: Run mlir-opt Trace` | 从 dump output 收集 best-effort trace |
| `Pass Lens: Run Structured MLIR Trace` | 运行 structured MLIR collector driver |
| `Pass Lens: Query Current Trace` | 生成 deterministic reports 和 summaries |
| `Pass Lens: Run Prefix Bisect` | 找到最小失败 MLIR pass prefix |
| `Pass Lens: Check MLIR Collector Setup` | 检查本地 LLVM/MLIR collector build 环境 |

## 开发

```powershell
npm install
npm run compile
npm test
npm run validate:trace:all
PASS_LENS_MLIR_OPT=/path/to/pass-lens-mlir-opt npm run smoke:oss-mlir
npm run package
```

在 VS Code 中按 `F5` 启动 Extension Development Host。

structured collector 位于
[`collectors/mlir-pass-lens`](collectors/mlir-pass-lens)。在有 LLVM/MLIR
development files 的机器上：

```powershell
$env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"
$env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"
npm run check:mlir-collector
```

## 项目状态

Pass Lens 目前是 preview extension。viewer、schema validation、sample
gallery、artifact opening、trace quality/size reports、repro bundle export、
agent context export、agent tool manifests、prefix bisection 和 MLIR collector
scaffold 都已经可用。

当前重点：

- 面向 MLIR、LLVM、IREE、torch-mlir、Triton、XLA、TVM 和 hardware backends
  的真实 downstream compiler collector workflows；
- lazy artifact loading 和 large-trace UX；
- 面向 external collector authors 的稳定 schema docs；
- 面向 agent 的 deterministic tool contracts；
- Marketplace-ready packaging 和 demos。

完整计划见 [docs/expert-roadmap-todo.md](docs/expert-roadmap-todo.md)。
release-level 开源路线图见
[docs/release-milestones.md](docs/release-milestones.md)。

## 已知限制

- `mlir-opt` dump fallback 是 best-effort，不能产生可靠的 per-pass timing。
- structured collector 当前面向 MLIR-based drivers。LLVM New Pass Manager 支持是
  future work。
- metric anomalies 和 suspicious-pass explanations 是 triage hints，不能证明某个
  pass 一定错误。
- 内置 Triton NPU failure traces 是 case-study samples。真实 dual RMSNorm trace
  来自本地 `npuir2ascendc` run，但还不是该 compiler 内部 live
  `PassInstrumentation` 直接产生的 trace。

## License

MIT
