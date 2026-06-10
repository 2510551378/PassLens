# MLIR 社区文章草案：从第一坏 Pass 到可复现实验，如何用 Pass Lens 快速定位编译器管线故障

这篇草案可以直接转发到 MLIR Discourse，标题与结构已按社区常见写作习惯整理：

- 问题背景
- 复现步骤（可复核）
- 在 Pass Lens 中的证据链
- 结论与后续动作（可选）

---

## 标题（Draft）

**Finding the first bad pass in MLIR pipelines with Pass Lens**

## 引言

在很多 MLIR 编译器故障定位里，最终看到的报错通常“晚”很多步了：有可能是合法性校验、指标异常或者关键指标跳变才暴露出来，真正问题出现在更早的某个 pass。  
我希望通过一个真实样例展示一条更直接的路径：用 **Pass Lens** 把这些“证据”集中起来，快速产出：

- 第一坏信号（first signal）
- 变更前后 IR 证据
- 指标异常
- 可复现的最小前缀/重放命令（可选）
- Agent/automation 可消费的 trace + artifacts bundle

## 环境与输入

- 真实样例 trace：`sample-traces/mlir-live-pass-instrumentation.json`
- 工具：Pass Lens VS Code extension（命令 `Pass Lens: Open Sample Trace`）
- 核心能力：artifact-backed trace + trace-size / trace-quality 报告 + 查询报告

> 说明：该样例为真实的 MLIR `PassInstrumentation` 输出，包含 provenance 标注，适合展示“不是合成数据”的流程。

## 重现实验（可复核）

```powershell
git clone https://github.com/2510551378/PassLens.git
cd PassLens
npm install
npm test
npm run release:check

# 打开示例
npx --yes @vscode/vsce package  # 如需本地安装可选
```

在 VS Code 中运行：

1. `Pass Lens: Open Sample Trace`
2. 选择 “Live MLIR PassInstrumentation”
3. 点击 `First signal` 卡片（or 视图中的 first-signal 标记）
4. 运行 `Pass Lens: Query Current Trace`
5. 选择：
   - `Find first failure stage` / `Find first changed stage`
   - `Generate first failure localization report`
   - `Generate GitHub issue description`
6. 导出目录复现包：点击 `Export directory repro`（trace + artifacts + manifest）

如果是自定义 trace，直接 `Pass Lens: Open Trace File` 即可复用同一工作流。

## 证据链（示例）

以下证据来自同一 trace 的同源视图，形成闭环：

1. **First signal / first failure**  
   指向最早的可观察故障位置（失败、合法性、IR 变更、指标异常）。

2. **IR diff + artifacts**  
   选择该 stage 后，对比前后 IR 与 artifacts，确认是“哪个操作集合”的变更触发了后续异常。

3. **Trace quality**
   验证该 trace 的采集可信度：pass 标识、timing、verifier、artifact 覆盖、索引一致性。

4. **Trace size / performance hints**
   对于大 trace，报告会给出 inline 与 artifact 的权衡建议，避免“查看证据”本身引入性能阻塞。

5. **Repro + agent bundle**
   `Export directory repro` 导出的目录可直接用于 CI/自动化或 AI handoff。

## 建议的讨论贴结构（可直接发给社区）

- 先给一个 1–2 行问题摘要（报错现象 / pipeline）
- 给出复现命令（若可公开）
- 附上第一坏 pass 的证据截图 / 关键字段片段（不是源码）
- 写明为什么“不是最终报错位置”而是“first signal”更能减少误判
- 附带复现 bundle 输出路径或压缩包位置（可选）
- 明确下一步验证计划（rerun / prefix bisect / verifier 专注测试）

## 与 MLIR 社区协作建议

- 如果这是你 pipeline 的真实案例，欢迎按上述流程贴出：
  - 原始 trace JSON（脱敏）
  - provenance metadata（采集阶段/采集器）
  - 首次失败前后 1～2 个 stage 的 artifacts

这样可以直接把“抽象优化建议”变成“可验证的修复建议”。

---

如果你希望我再补一版英文社区贴（same content, plain English），我可以直接继续产出第二稿并对齐 MLIR Discourse 风格（更偏社区公告语气）。
