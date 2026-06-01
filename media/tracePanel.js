(() => {
  const vscode = acquireVsCodeApi();
  const dataElement = document.getElementById('pass-lens-data');
  const serializedData = dataElement?.content?.textContent ?? dataElement?.textContent ?? '{}';
  const passLensData = JSON.parse(serializedData);
  const { trace, traceIssues, traceAnomalies, traceIssueSummary, sourcePath } = passLensData;
  let selectedIndex = initialSelectedIndex();
  let filterText = '';
  let showChangedOnly = false;
  
  const timeline = document.getElementById('timeline');
  const details = document.getElementById('details');
  const overview = document.getElementById('overview');
  const search = document.getElementById('search');
  const changedOnly = document.getElementById('changed-only');
  
  document.getElementById('tool').textContent = trace.tool ? 'tool: ' + trace.tool : 'tool: unknown';
  document.getElementById('pipeline').textContent = trace.pipeline ? 'pipeline: ' + trace.pipeline : 'pipeline: unknown';
  document.getElementById('source').textContent = 'trace: ' + sourcePath;
  renderSummary();
  renderIssuePanel();
  
  document.getElementById('summary').addEventListener('click', (event) => {
    const card = event.target.closest('[data-jump]');
    if (!card) {
      return;
    }
    jumpTo(card.dataset.jump);
  });
  
  details.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) {
      return;
    }
    handleAction(button.dataset.action, button);
  });
  
  search.addEventListener('input', () => {
    filterText = search.value.trim().toLowerCase();
    ensureVisibleSelection();
    renderTimeline();
  });
  changedOnly.addEventListener('change', () => {
    showChangedOnly = changedOnly.checked;
    ensureVisibleSelection();
    renderTimeline();
  });
  document.addEventListener('keydown', handleKeydown);
  
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  
  function fmtNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value * 100) / 100
      : '';
  }
  
  function initialSelectedIndex() {
    const failedIndex = trace.stages.findIndex((stage) => isFailedStage(stage));
    if (failedIndex >= 0) {
      return failedIndex;
    }
    const firstChanged = trace.stages.findIndex((stage) => stage.changed);
    return firstChanged >= 0 ? firstChanged : 0;
  }
  
  function stageAccent(stage) {
    if (isFailedStage(stage)) {
      return 'var(--failed)';
    }
    if (stage.changed) {
      return 'var(--changed)';
    }
    return 'var(--unchanged)';
  }
  
  function metricImpact(stage) {
    const before = stage.metricsBefore ?? {};
    const after = stage.metricsAfter ?? {};
    return topMetricDeltas(before, after)
      .reduce((sum, item) => sum + Math.abs(item.delta), 0);
  }
  
  function impactPercent(stage) {
    const impacts = trace.stages.map(metricImpact);
    const maxImpact = Math.max(1, ...impacts);
    const base = stage.changed ? 18 : 6;
    return Math.min(100, base + Math.round((metricImpact(stage) / maxImpact) * 82));
  }
  
  function firstSignalIndex() {
    const failedIndex = trace.stages.findIndex((stage) => isFailedStage(stage));
    if (failedIndex >= 0) {
      return failedIndex;
    }
    return trace.stages.findIndex((stage) => stage.changed);
  }
  
  function isFailedStage(stage) {
    return stage.status === 'verifier_failed' ||
      stage.status === 'pass_failed' ||
      String(stage.verifier ?? '').toLowerCase() === 'failed';
  }
  
  function slowestIndex() {
    let bestIndex = -1;
    let bestDuration = -1;
    trace.stages.forEach((stage, index) => {
      if (typeof stage.durationMs === 'number' && stage.durationMs > bestDuration) {
        bestDuration = stage.durationMs;
        bestIndex = index;
      }
    });
    return bestIndex;
  }
  
  function firstAnomalyIndex() {
    if (!traceAnomalies.length) {
      return -1;
    }
    const stageIndex = traceAnomalies[0].stageIndex;
    return trace.stages.findIndex((stage) => stage.index === stageIndex);
  }
  
  function anomaliesForStage(stageIndex) {
    return traceAnomalies.filter((entry) => entry.stageIndex === stageIndex);
  }

  function visibleStageEntries() {
    return trace.stages
      .map((stage, idx) => ({ stage, idx }))
      .filter(({ stage }) => !showChangedOnly || stage.changed)
      .filter(({ stage }) => matchesFilter(stage));
  }

  function matchesFilter(stage) {
    if (!filterText) {
      return true;
    }
    const haystack = [
      stage.pass,
      stage.scope,
      stage.verifier,
      ...Object.keys(stage.metricsBefore ?? {}),
      ...Object.keys(stage.metricsAfter ?? {})
    ].join(' ').toLowerCase();
    return haystack.includes(filterText);
  }

  function ensureVisibleSelection() {
    const visibleStages = visibleStageEntries();
    if (!visibleStages.length || visibleStages.some(({ idx }) => idx === selectedIndex)) {
      return;
    }
    selectedIndex = visibleStages[0].idx;
    renderDetails();
  }

  function selectVisibleOffset(direction) {
    const visibleStages = visibleStageEntries();
    if (!visibleStages.length) {
      return;
    }
    const current = visibleStages.findIndex(({ idx }) => idx === selectedIndex);
    const base = current >= 0 ? current : 0;
    const next = (base + direction + visibleStages.length) % visibleStages.length;
    selectIndex(visibleStages[next].idx, { scrollIntoView: true });
  }
  
  function nextChangedIndex(direction) {
    if (!trace.stages.length) {
      return -1;
    }
    for (let step = 1; step <= trace.stages.length; step++) {
      const index = (selectedIndex + direction * step + trace.stages.length) % trace.stages.length;
      if (trace.stages[index]?.changed) {
        return index;
      }
    }
    return -1;
  }
  
  function selectIndex(index, options = {}) {
    if (index < 0 || index >= trace.stages.length) {
      return;
    }
    selectedIndex = index;
    renderTimeline();
    renderDetails();
    if (options.scrollIntoView) {
      requestAnimationFrame(() => {
        timeline.querySelector('.stage-card.active')?.scrollIntoView({ block: 'nearest' });
      });
    }
  }
  
  function jumpTo(target) {
    if (target === 'first-signal') {
      selectIndex(firstSignalIndex());
    } else if (target === 'first-anomaly') {
      selectIndex(firstAnomalyIndex());
    } else if (target === 'slowest') {
      selectIndex(slowestIndex());
    } else if (target === 'first') {
      selectIndex(0);
    }
  }
  
  function handleAction(action, button) {
    if (action === 'first-signal') {
      jumpTo('first-signal');
    } else if (action === 'prev-changed') {
      selectIndex(nextChangedIndex(-1));
    } else if (action === 'next-changed') {
      selectIndex(nextChangedIndex(1));
    } else if (action === 'slowest') {
      jumpTo('slowest');
    } else if (action === 'copy-command' && trace.command) {
      vscode.postMessage({ type: 'copy', text: trace.command });
    } else if (action === 'open-trace') {
      vscode.postMessage({ type: 'openTrace' });
    } else if (action === 'export-bundle') {
      const stage = trace.stages[selectedIndex];
      vscode.postMessage({ type: 'exportBundle', selectedStageIndex: stage?.index });
    } else if (action === 'open-artifact' && button?.dataset.artifactPath) {
      vscode.postMessage({ type: 'openArtifact', path: button.dataset.artifactPath });
    }
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (isTextInput(event.target)) {
      if (event.key === 'Escape') {
        event.target.blur();
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'j') {
      event.preventDefault();
      selectVisibleOffset(1);
    } else if (event.key === 'ArrowUp' || event.key === 'k') {
      event.preventDefault();
      selectVisibleOffset(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = visibleStageEntries()[0];
      if (first) {
        selectIndex(first.idx, { scrollIntoView: true });
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const visibleStages = visibleStageEntries();
      const last = visibleStages[visibleStages.length - 1];
      if (last) {
        selectIndex(last.idx, { scrollIntoView: true });
      }
    } else if (event.key === '/') {
      event.preventDefault();
      search.focus();
      search.select();
    } else if (event.key === 'f') {
      event.preventDefault();
      jumpTo('first-signal');
    } else if (event.key === 'a') {
      event.preventDefault();
      jumpTo('first-anomaly');
    } else if (event.key === 's') {
      event.preventDefault();
      jumpTo('slowest');
    } else if (event.key === 'c') {
      event.preventDefault();
      changedOnly.checked = !changedOnly.checked;
      showChangedOnly = changedOnly.checked;
      ensureVisibleSelection();
      renderTimeline();
    }
  }

  function isTextInput(target) {
    return target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable;
  }
  
  function renderSummary() {
    const changed = trace.stages.filter((stage) => stage.changed);
    const failed = trace.stages.find((stage) => isFailedStage(stage));
    const slowest = trace.stages
      .filter((stage) => typeof stage.durationMs === 'number')
      .sort((a, b) => b.durationMs - a.durationMs)[0];
    const firstChanged = changed[0];
    const firstAnomaly = traceAnomalies[0];
    document.getElementById('summary').innerHTML =
      summaryCard('Stages', String(trace.stages.length), 'first') +
      summaryCard('Changed', changed.length + ' / ' + trace.stages.length, firstChanged ? 'first-signal' : undefined, firstChanged ? 'changed' : undefined) +
      summaryCard('First signal', failed ? 'verifier failed at #' + failed.index : firstChanged ? 'first change at #' + firstChanged.index : 'no IR changes', failed || firstChanged ? 'first-signal' : undefined, failed ? 'failed' : firstChanged ? 'changed' : undefined) +
      summaryCard('Anomalies', traceAnomalies.length ? traceAnomalies.length + ' suspicious metric delta(s)' : 'none', firstAnomaly ? 'first-anomaly' : undefined, traceAnomalies.length ? 'warning' : undefined) +
      summaryCard('Slowest', slowest ? slowest.pass + ' (' + fmtNumber(slowest.durationMs) + ' ms)' : 'not recorded', slowest ? 'slowest' : undefined);
    document.getElementById('stage-count').textContent = trace.stages.length + ' stages';
    document.getElementById('changed-count').textContent = changed.length + ' changed';
  }
  
  function renderIssuePanel() {
    const panel = document.getElementById('issue-panel');
    if (!traceIssues.length) {
      panel.classList.remove('visible');
      panel.innerHTML = '';
      return;
    }
    const visibleIssues = traceIssues.slice(0, 6);
    const more = traceIssues.length > visibleIssues.length
      ? '<li>' + escapeHtml(traceIssues.length - visibleIssues.length) + ' more issue(s) omitted.</li>'
      : '';
    panel.classList.add('visible');
    panel.innerHTML =
      '<div class="issue-title">Trace validation: ' + escapeHtml(traceIssueSummary) + '</div>' +
      '<ul class="issue-list">' +
      visibleIssues.map((entry) => {
        const stage = typeof entry.stageIndex === 'number' ? ' stage #' + entry.stageIndex + ':' : '';
        return '<li><span class="issue-severity">' + escapeHtml(entry.severity) + '</span>' +
          escapeHtml(stage + ' ' + entry.message) + '</li>';
      }).join('') +
      more +
      '</ul>';
  }
  
  function summaryCard(label, value, jump, tone) {
    const jumpAttr = jump ? ' data-jump="' + escapeHtml(jump) + '"' : '';
    const toneClass = tone ? ' ' + escapeHtml(tone) : '';
    return '<button class="summary-card' + toneClass + '"' + jumpAttr + '><div class="summary-label">' + escapeHtml(label) + '</div>' +
      '<div class="summary-value" title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</div></button>';
  }
  
  function renderTimeline() {
    if (!trace.stages.length) {
      timeline.innerHTML = '<div class="empty">No stages in trace.</div>';
      overview.innerHTML = '';
      details.innerHTML = '';
      return;
    }
  
    const visibleStages = visibleStageEntries();
  
    if (!visibleStages.length) {
      timeline.innerHTML = '<div class="empty">No passes match the current filter.</div>';
      renderOverview([]);
      return;
    }
  
    renderOverview(visibleStages);
    timeline.innerHTML = '<div class="stage-list">' +
      visibleStages.map(({ stage, idx }) => {
        const active = idx === selectedIndex ? ' active' : '';
        const failed = isFailedStage(stage);
        const statusClass = failed ? 'failed' : stage.changed ? 'changed' : 'unchanged';
        const statusText = failed ? 'failed' : stage.changed ? 'changed' : 'unchanged';
        const duration = typeof stage.durationMs === 'number' ? fmtNumber(stage.durationMs) + ' ms' : '';
        const anomalies = anomaliesForStage(stage.index);
        const anomalyText = anomalies.length ? anomalies.length + ' anomaly' + (anomalies.length === 1 ? '' : 'ies') : '';
        const impact = impactPercent(stage) + '%';
        const accent = stageAccent(stage);
        return '<button class="stage-card ' + statusClass + active + '" data-index="' + idx + '" aria-current="' + (active ? 'true' : 'false') + '" style="--accent: ' + accent + '; --impact: ' + impact + '">' +
          '<div class="stage-line">' +
            '<span class="stage-index">#' + escapeHtml(stage.index) + '</span>' +
            '<span class="stage-pass">' + escapeHtml(stage.pass) + '</span>' +
            '<span class="status ' + statusClass + '">' + statusText + '</span>' +
          '</div>' +
          '<div class="stage-line">' +
            '<span></span>' +
            '<span class="scope">' + escapeHtml(stage.scope ?? '') + '</span>' +
            '<span class="duration">' + escapeHtml(anomalyText || duration) + '</span>' +
          '</div>' +
        '</button>';
      }).join('') +
      '</div>';
  
    timeline.querySelectorAll('button[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        selectIndex(Number(button.dataset.index));
      });
    });
  }
  
  function renderOverview(visibleStages) {
    overview.innerHTML = visibleStages.map(({ stage, idx }) => {
      const active = idx === selectedIndex ? ' active' : '';
      return '<button class="overview-segment' + active + '" data-index="' + idx + '" aria-label="Select pass #' +
        escapeHtml(stage.index) + '" title="#' +
        escapeHtml(stage.index) + ' ' + escapeHtml(stage.pass) + '" style="--accent: ' +
        stageAccent(stage) + '; --impact: ' + impactPercent(stage) + '%"></button>';
    }).join('');
    overview.querySelectorAll('button[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        selectIndex(Number(button.dataset.index));
      });
    });
  }
  
  function renderDetails() {
    const stage = trace.stages[selectedIndex];
    if (!stage) {
      return;
    }
  
    details.innerHTML =
      renderPassHero(stage) +
      '<div class="details-grid">' +
        kv('Scope', stage.scope ?? 'unknown') +
        kv('Changed', stage.changed ? 'yes' : 'no') +
        kv('Duration', typeof stage.durationMs === 'number' ? fmtNumber(stage.durationMs) + ' ms' : 'unknown') +
        kv('Verifier', stage.verifier ?? 'unknown') +
      '</div>' +
      renderMetricAnomalies(stage.index) +
      '<h2>Metric Delta</h2>' +
      renderMetrics(stage.metricsBefore ?? {}, stage.metricsAfter ?? {}) +
      '<h2>IR Diff</h2>' +
      renderDiff(stage) +
      renderCommandAndDiagnostics(stage);
  }
  
  function renderPassHero(stage) {
    const failed = isFailedStage(stage);
    const statusClass = failed ? 'failed' : stage.changed ? 'changed' : '';
    const statusText = failed ? 'verifier failed' : stage.changed ? 'changed IR' : 'no IR change';
    const impact = impactPercent(stage);
    const anomalyCount = anomaliesForStage(stage.index).length;
    const irSource = stageIrSource(stage);
    return '<div class="pass-hero ' + statusClass + '" style="--accent: ' + stageAccent(stage) + '">' +
      '<div>' +
        '<h2>' + escapeHtml(stage.pass) + '</h2>' +
        renderInsight(stage) +
        renderActionRow() +
      '</div>' +
      '<div class="badges">' +
        '<span class="pill ' + statusClass + '">' + escapeHtml(statusText) + '</span>' +
        '<span class="pill">impact ' + escapeHtml(impact) + '%</span>' +
        (anomalyCount ? '<span class="pill warning">' + escapeHtml(anomalyCount + ' anomaly' + (anomalyCount === 1 ? '' : 'ies')) + '</span>' : '') +
        '<span class="pill">' + escapeHtml(irSource) + '</span>' +
        '<span class="pill">#' + escapeHtml(stage.index) + '</span>' +
      '</div>' +
    '</div>';
  }
  
  function renderActionRow() {
    return '<div class="action-row">' +
      '<button class="action-button primary" data-action="first-signal" title="Jump to first signal (f)">First signal</button>' +
      '<button class="action-button" data-action="prev-changed" title="Previous changed pass">Prev changed</button>' +
      '<button class="action-button" data-action="next-changed" title="Next changed pass">Next changed</button>' +
      '<button class="action-button" data-action="slowest" title="Jump to slowest pass (s)">Slowest</button>' +
      '<button class="action-button" data-action="export-bundle">Export repro bundle</button>' +
      '<button class="action-button" data-action="open-trace">Open trace JSON</button>' +
    '</div>';
  }
  
  function renderInsight(stage) {
    const failed = isFailedStage(stage);
    if (failed) {
      return '<div class="insight">Verifier failed after this pass. This is the first place to inspect before debugging later changes.</div>';
    }
    const top = topMetricDeltas(stage.metricsBefore ?? {}, stage.metricsAfter ?? {})[0];
    if (!stage.changed) {
      return '<div class="insight">This pass did not change the recorded IR. Use the filter to skip unchanged passes in long pipelines.</div>';
    }
    if (top) {
      const sign = top.delta > 0 ? '+' : '';
      return '<div class="insight">Main visible metric change: ' + escapeHtml(top.key) + ' ' + sign + escapeHtml(fmtNumber(top.delta)) + '.</div>';
    }
    return '<div class="insight">This pass changed the IR. The diff below shows the recorded before/after text.</div>';
  }
  
  function renderMetricAnomalies(stageIndex) {
    const entries = anomaliesForStage(stageIndex).slice(0, 5);
    if (!entries.length) {
      return '';
    }
    return '<h2>Metric Anomalies</h2><div class="anomaly-panel"><div class="anomaly-list">' +
      entries.map((entry) => {
        const delta = entry.delta > 0 ? '+' + fmtNumber(entry.delta) : String(fmtNumber(entry.delta));
        return '<div class="anomaly-item">' +
          '<span class="anomaly-severity">' + escapeHtml(entry.severity) + '</span>' +
          '<span class="anomaly-message" title="' + escapeHtml(entry.message) + '">' + escapeHtml(entry.message) + '</span>' +
          '<span class="anomaly-delta">' + escapeHtml(entry.metric + ' ' + delta) + '</span>' +
        '</div>';
      }).join('') +
    '</div></div>';
  }
  
  function kv(label, value) {
    return '<div class="kv"><div class="kv-label">' + escapeHtml(label) + '</div>' +
      '<div class="kv-value" title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</div></div>';
  }
  
  function renderMetrics(before, after) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    if (!keys.length) {
      return '<div class="empty">No metrics recorded for this pass.</div>';
    }
  
    const maxDelta = Math.max(1, ...keys.map((key) => {
      const b = typeof before[key] === 'number' ? before[key] : 0;
      const a = typeof after[key] === 'number' ? after[key] : 0;
      return Math.abs(a - b);
    }));
  
    return '<div class="table-scroll"><table class="metrics"><thead><tr><th>metric</th><th>before</th><th>after</th><th>delta</th></tr></thead><tbody>' +
      keys.map((key) => {
        const b = before[key];
        const a = after[key];
        const delta = (typeof a === 'number' ? a : 0) - (typeof b === 'number' ? b : 0);
        const deltaClass = delta > 0 ? 'metric-pos' : delta < 0 ? 'metric-neg' : '';
        const deltaLabel = delta > 0 ? '+' + fmtNumber(delta) : String(fmtNumber(delta));
        const spark = Math.round((Math.abs(delta) / maxDelta) * 100) + '%';
        const accent = delta > 0 ? 'var(--vscode-gitDecoration-addedResourceForeground)' :
          delta < 0 ? 'var(--vscode-gitDecoration-deletedResourceForeground)' :
          'var(--unchanged)';
        return '<tr><td><span class="metric-name"><span>' + escapeHtml(key) +
          '</span><span class="metric-spark"><span style="--spark: ' + spark + '; --accent: ' + accent + '"></span></span></span></td><td>' + escapeHtml(fmtNumber(b)) +
          '</td><td>' + escapeHtml(fmtNumber(a)) + '</td><td class="' + deltaClass + '">' +
          escapeHtml(deltaLabel) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }
  
  function topMetricDeltas(before, after) {
    return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
      .map((key) => {
        const b = typeof before[key] === 'number' ? before[key] : 0;
        const a = typeof after[key] === 'number' ? after[key] : 0;
        return { key, delta: a - b };
      })
      .filter((item) => item.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  
  function renderCommandAndDiagnostics(stage) {
    const command = trace.command
      ? '<h2>Repro Command</h2><div class="action-row"><button class="action-button" data-action="copy-command">Copy command</button></div><pre class="diagnostics">' + escapeHtml(trace.command) + '</pre>'
      : '';
    const stageDiagnostics = stage.diagnostics
      ? '<h2>Stage Diagnostics</h2>' + renderSourceLine('diagnostics', stage.artifacts?.diagnosticsPath, stage.diagnostics) +
        '<pre class="diagnostics">' + escapeHtml(stage.diagnostics) + '</pre>'
      : '';
    const traceDiagnostics = trace.diagnostics ? '<h2>Trace Diagnostics</h2><pre class="diagnostics">' + escapeHtml(trace.diagnostics) + '</pre>' : '';
    return command + stageDiagnostics + traceDiagnostics;
  }
  
  function renderDiff(stage) {
    const beforeText = stage.irBefore ?? '';
    const afterText = stage.irAfter ?? '';
    const rows = diffLines(beforeText, afterText);
    if (!rows.length) {
      return '<div class="empty">No IR text recorded for this pass.</div>';
    }
  
    return '<div class="diff-head"><div><div class="diff-title">Before pass</div>' +
      renderSourceLine('before IR', stage.artifacts?.beforePath, beforeText) +
      '</div><div><div class="diff-title">After pass</div>' +
      renderSourceLine('after IR', stage.artifacts?.afterPath, afterText) +
      '</div></div>' +
      '<div class="diff-scroll"><table class="diff"><tbody>' +
      rows.map((row) => {
        return '<tr class="' + row.kind + '">' +
          '<td class="line-no">' + escapeHtml(row.leftNo ?? '') + '</td>' +
          '<td class="code">' + escapeHtml(row.left ?? '') + '</td>' +
          '<td class="line-no">' + escapeHtml(row.rightNo ?? '') + '</td>' +
          '<td class="code">' + escapeHtml(row.right ?? '') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }
  
  function renderSourceLine(label, artifactPath, text) {
    const source = artifactPath
      ? 'artifact: ' + artifactPath
      : text ? 'inline ' + label : 'missing ' + label;
    const open = artifactPath
      ? '<button class="artifact-open" data-action="open-artifact" data-artifact-path="' + escapeHtml(artifactPath) + '">Open ' + escapeHtml(label) + '</button>'
      : '';
    return '<div class="source-line"><span class="source-path" title="' + escapeHtml(source) + '">' +
      escapeHtml(source) + '</span>' + open + '</div>';
  }
  
  function stageIrSource(stage) {
    const hasBeforeArtifact = Boolean(stage.artifacts?.beforePath);
    const hasAfterArtifact = Boolean(stage.artifacts?.afterPath);
    if (hasBeforeArtifact && hasAfterArtifact) {
      return 'artifact IR';
    }
    if (hasBeforeArtifact || hasAfterArtifact) {
      return 'mixed IR';
    }
    if (stage.irBefore || stage.irAfter) {
      return 'inline IR';
    }
    return 'IR missing';
  }
  
  function diffLines(beforeText, afterText) {
    if (!beforeText && !afterText) {
      return [];
    }
  
    const a = beforeText.split(/\\r?\\n/);
    const b = afterText.split(/\\r?\\n/);
    if (a.length * b.length > 200000) {
      return pairedDiff(a, b);
    }
  
    const width = b.length + 1;
    const dp = new Uint16Array((a.length + 1) * (b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        const pos = i * width + j;
        dp[pos] = a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
  
    const rows = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        rows.push({ kind: 'same', leftNo: i + 1, rightNo: j + 1, left: a[i], right: b[j] });
        i++;
        j++;
      } else if (j < b.length && (i === a.length || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) {
        rows.push({ kind: 'add', rightNo: j + 1, right: b[j] });
        j++;
      } else if (i < a.length) {
        rows.push({ kind: 'del', leftNo: i + 1, left: a[i] });
        i++;
      }
    }
    return rows;
  }
  
  function pairedDiff(a, b) {
    const rows = [];
    const count = Math.max(a.length, b.length);
    for (let i = 0; i < count; i++) {
      const left = a[i];
      const right = b[i];
      const kind = left === right ? 'same' : left === undefined ? 'add' : right === undefined ? 'del' : 'changed';
      rows.push({
        kind,
        leftNo: left === undefined ? undefined : i + 1,
        rightNo: right === undefined ? undefined : i + 1,
        left,
        right
      });
    }
    return rows;
  }
  
  renderTimeline();
  renderDetails();
})();
