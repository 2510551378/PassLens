(() => {
  const vscode = acquireVsCodeApi();
  const dataElement = document.getElementById('pass-lens-data');
  const serializedData = dataElement?.content?.textContent ?? dataElement?.textContent ?? '{}';
  const passLensData = JSON.parse(serializedData);
  const { trace, traceIssues, traceAnomalies, traceIssueSummary, traceQuality, traceSize, sourcePath } = passLensData;
  let filterText = '';
  let showChangedOnly = false;
  let showFullDiff = false;
  const pendingArtifactLoads = new Set();
  const attemptedArtifactLoads = new Set();
  const maxRenderedDiffRows = 700;
  const diffEdgeRows = 300;
  const virtualRowHeight = 72;
  const virtualOverscanRows = 8;
  const maxOverviewSegments = 600;
  const stageImpactCache = new WeakMap(trace.stages.map((stage) => [stage, metricImpact(stage)]));
  const maxMetricImpact = Math.max(1, ...trace.stages.map((stage) => stageImpactCache.get(stage) ?? 0));
  const anomaliesByStage = buildAnomaliesByStage(traceAnomalies);
  const debugState = window && typeof window === 'object' ? window.__passLensTracePanelDebug : undefined;
  let firstFailedIndex = -1;
  let firstChangedIndex = -1;
  let slowestStageIndex = -1;
  let firstAnomalyTraceIndex = -1;
  let changedIndexes = [];
  let visibleStageEntriesCacheKey = '';
  if (debugState && typeof debugState === 'object' && typeof debugState.visibleStageEntriesCalls !== 'number') {
    debugState.visibleStageEntriesCalls = 0;
  }
  let latestVisibleStages = [];
  let pendingTimelineRender = false;
  
  const timeline = document.getElementById('timeline');
  const details = document.getElementById('details');
  const overview = document.getElementById('overview');
  const search = document.getElementById('search');
  const changedOnly = document.getElementById('changed-only');
  const timelineScrollContainer = timeline.closest?.('aside') ?? timeline;
  let firstSignalIndexValue = -1;
  rebuildTraceMetadataCache();
  let selectedIndex = initialSelectedIndex();
  
  document.getElementById('tool').textContent = trace.tool ? 'tool: ' + trace.tool : 'tool: unknown';
  document.getElementById('provenance').textContent = 'origin: ' + provenanceLabel(trace.provenance);
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
    invalidateVisibleEntries();
    ensureVisibleSelection();
    renderTimeline();
  });
  changedOnly.addEventListener('change', () => {
    showChangedOnly = changedOnly.checked;
    invalidateVisibleEntries();
    ensureVisibleSelection();
    renderTimeline();
  });
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('message', (event) => {
      handleExtensionMessage(event.data);
    });
    window.addEventListener('resize', scheduleTimelineWindowRender);
  }
  timelineScrollContainer.addEventListener('scroll', scheduleTimelineWindowRender, { passive: true });
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

  function fmtBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
      return 'unknown';
    }
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return fmtNumber(bytes / 1024) + ' KiB';
    }
    return fmtNumber(bytes / (1024 * 1024)) + ' MiB';
  }

  function provenanceLabel(provenance) {
    const kind = provenance?.kind;
    if (kind === 'live-pass-instrumentation') {
      return 'live PassInstrumentation';
    }
    if (kind === 'converted-dump') {
      return 'converted dump';
    }
    if (kind === 'hand-authored') {
      return 'hand-authored';
    }
    if (kind === 'real-artifact-capture') {
      return 'real artifact capture';
    }
    return 'unknown';
  }
  
  function initialSelectedIndex() {
    if (firstFailedIndex >= 0) {
      return firstFailedIndex;
    }
    return firstChangedIndex >= 0 ? firstChangedIndex : 0;
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
    const base = stage.changed ? 18 : 6;
    const impact = stageImpactCache.get(stage) ?? metricImpact(stage);
    return Math.min(100, base + Math.round((impact / maxMetricImpact) * 82));
  }
  
  function firstSignalIndex() {
    return firstSignalIndexValue;
  }
  
  function isFailedStage(stage) {
    return stage.status === 'verifier_failed' ||
      stage.status === 'pass_failed' ||
      String(stage.verifier ?? '').toLowerCase() === 'failed';
  }
  
  function slowestIndex() {
    return slowestStageIndex;
  }
  
  function firstAnomalyIndex() {
    return firstAnomalyTraceIndex;
  }
  
  function anomaliesForStage(stageIndex) {
    return anomaliesByStage.get(stageIndex) ?? [];
  }

  function visibleStageEntries() {
    const cacheKey = (showChangedOnly ? '1|' : '0|') + filterText;
    if (cacheKey === visibleStageEntriesCacheKey) {
      return latestVisibleStages;
    }
    if (debugState && typeof debugState === 'object') {
      debugState.visibleStageEntriesCalls += 1;
    }
    const nextVisibleStages = [];
    for (let i = 0; i < trace.stages.length; i++) {
      const stage = trace.stages[i];
      if (showChangedOnly && !stage.changed) {
        continue;
      }
      if (!matchesFilter(stage)) {
        continue;
      }
      nextVisibleStages.push({
        stage,
        idx: i
      });
    }
    latestVisibleStages = nextVisibleStages;
    visibleStageEntriesCacheKey = cacheKey;
    return nextVisibleStages;
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
    if (!changedIndexes.length) {
      return -1;
    }
    if (direction > 0) {
      for (const index of changedIndexes) {
        if (index > selectedIndex) {
          return index;
        }
      }
      return changedIndexes[0];
    }
    for (let i = changedIndexes.length - 1; i >= 0; i--) {
      if (changedIndexes[i] < selectedIndex) {
        return changedIndexes[i];
      }
    }
    return -1;
  }
  
  function selectIndex(index, options = {}) {
    if (index < 0 || index >= trace.stages.length) {
      return;
    }
    selectedIndex = index;
    if (options.scrollIntoView) {
      scrollSelectedIntoVirtualWindow();
    }
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
      selectIndex(firstSignalIndex(), { scrollIntoView: true });
    } else if (target === 'first-anomaly') {
      selectIndex(firstAnomalyIndex(), { scrollIntoView: true });
    } else if (target === 'slowest') {
      selectIndex(slowestIndex(), { scrollIntoView: true });
    } else if (target === 'first') {
      selectIndex(0, { scrollIntoView: true });
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
    } else if (action === 'export-directory-bundle') {
      const stage = trace.stages[selectedIndex];
      vscode.postMessage({ type: 'exportDirectoryBundle', selectedStageIndex: stage?.index });
    } else if (action === 'export-agent-context') {
      const stage = trace.stages[selectedIndex];
      vscode.postMessage({ type: 'exportAgentContext', selectedStageIndex: stage?.index });
    } else if (action === 'export-explanation') {
      const stage = trace.stages[selectedIndex];
      vscode.postMessage({ type: 'exportExplanation', selectedStageIndex: stage?.index });
    } else if (action === 'copy-agent-context') {
      const stage = trace.stages[selectedIndex];
      vscode.postMessage({ type: 'copyAgentContext', selectedStageIndex: stage?.index });
    } else if (action === 'copy-explanation') {
      const stage = trace.stages[selectedIndex];
      vscode.postMessage({ type: 'copyExplanation', selectedStageIndex: stage?.index });
    } else if (action === 'open-artifact' && button?.dataset.artifactPath) {
      vscode.postMessage({ type: 'openArtifact', path: button.dataset.artifactPath });
    } else if (action === 'toggle-diff-context') {
      showFullDiff = !showFullDiff;
      renderDetails();
    }
  }

  function handleExtensionMessage(message) {
    if (!message || message.type !== 'stageArtifacts' || typeof message.stageIndex !== 'number') {
      return;
    }
    pendingArtifactLoads.delete(message.stageIndex);
    if (Array.isArray(message.issues) && message.issues.length) {
      traceIssues.push(...message.issues);
    }
    const index = trace.stages.findIndex((stage) => stage.index === message.stageIndex);
    if (index >= 0 && message.stage) {
      const beforeStage = trace.stages[index];
      trace.stages[index] = {
        ...trace.stages[index],
        ...message.stage
      };
      const updatedStage = trace.stages[index];
      const changedInIndex = beforeStage?.status !== updatedStage.status ||
        beforeStage?.verifier !== updatedStage.verifier ||
        beforeStage?.changed !== updatedStage.changed ||
        beforeStage?.durationMs !== updatedStage.durationMs;
      if (changedInIndex) {
        rebuildTraceMetadataCache();
      }
    }
    invalidateVisibleEntries();
    renderSummary();
    renderIssuePanel();
    renderTimeline();
    renderDetails();
  }

  function buildAnomaliesByStage(anomalies) {
    const byStage = new Map();
    for (const anomaly of anomalies) {
      const stageIndex = anomaly.stageIndex;
      if (typeof stageIndex !== 'number') {
        continue;
      }
      const entries = byStage.get(stageIndex) ?? [];
      entries.push(anomaly);
      byStage.set(stageIndex, entries);
    }
    return byStage;
  }

  function rebuildTraceMetadataCache() {
    firstFailedIndex = -1;
    firstChangedIndex = -1;
    slowestStageIndex = -1;
    firstAnomalyTraceIndex = -1;
    firstSignalIndexValue = -1;
    changedIndexes = [];
    let slowestDuration = -1;
    const stageIndexToPosition = new Map();
    for (let i = 0; i < trace.stages.length; i++) {
      const stage = trace.stages[i];
      stageIndexToPosition.set(stage.index, i);
      if (typeof stage.durationMs === 'number' && stage.durationMs > slowestDuration) {
        slowestDuration = stage.durationMs;
        slowestStageIndex = i;
      }
      if (firstFailedIndex < 0 && isFailedStage(stage)) {
        firstFailedIndex = i;
      }
      if (firstChangedIndex < 0 && stage.changed) {
        firstChangedIndex = i;
      }
      if (stage.changed) {
        changedIndexes.push(i);
      }
    }
    firstAnomalyTraceIndex = -1;
    for (const stageIndex of anomaliesByStage.keys()) {
      const tracePosition = stageIndexToPosition.get(stageIndex);
      if (typeof tracePosition === 'number') {
        if (firstAnomalyTraceIndex < 0 || tracePosition < firstAnomalyTraceIndex) {
          firstAnomalyTraceIndex = tracePosition;
        }
      }
    }
    firstSignalIndexValue = firstFailedIndex >= 0 ? firstFailedIndex : firstChangedIndex;
  }

  function invalidateVisibleEntries() {
    visibleStageEntriesCacheKey = '';
    latestVisibleStages = [];
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
      invalidateVisibleEntries();
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
    const changed = changedIndexes.map((index) => trace.stages[index]);
    const failed = firstFailedIndex >= 0 ? trace.stages[firstFailedIndex] : undefined;
    const slowest = slowestStageIndex >= 0 ? trace.stages[slowestStageIndex] : undefined;
    const firstChanged = changed[0];
    const firstAnomaly = traceAnomalies[0];
    const qualityTone = traceQuality?.score < 70 ? 'warning' : undefined;
    const sizeTone = traceSize?.warnings?.some((entry) => entry.severity === 'warning') ? 'warning' : undefined;
    document.getElementById('summary').innerHTML =
      summaryCard('Stages', String(trace.stages.length), 'first') +
      summaryCard('Changed', changed.length + ' / ' + trace.stages.length, firstChanged ? 'first-signal' : undefined, firstChanged ? 'changed' : undefined) +
      summaryCard('First signal', failed ? 'verifier failed at #' + failed.index : firstChanged ? 'first change at #' + firstChanged.index : 'no IR changes', failed || firstChanged ? 'first-signal' : undefined, failed ? 'failed' : firstChanged ? 'changed' : undefined) +
      summaryCard('Anomalies', traceAnomalies.length ? traceAnomalies.length + ' suspicious metric delta(s)' : 'none', firstAnomaly ? 'first-anomaly' : undefined, traceAnomalies.length ? 'warning' : undefined) +
      summaryCard('Origin', provenanceLabel(trace.provenance), undefined, trace.provenance?.kind ? undefined : 'warning') +
      summaryCard('Trace quality', traceQuality ? traceQuality.score + '/100' : 'unknown', undefined, qualityTone) +
      summaryCard('Trace size', traceSize ? fmtBytes(traceSize.totalKnownBytes) : 'unknown', undefined, sizeTone) +
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
    latestVisibleStages = visibleStages;
    renderTimelineWindow();
  }

  function scheduleTimelineWindowRender() {
    if (pendingTimelineRender) {
      return;
    }
    pendingTimelineRender = true;
    requestAnimationFrame(() => {
      pendingTimelineRender = false;
      renderTimelineWindow();
    });
  }

  function renderTimelineWindow() {
    if (!latestVisibleStages.length) {
      return;
    }
    const windowRange = visibleTimelineRange(latestVisibleStages.length);
    const renderedStages = latestVisibleStages.slice(windowRange.start, windowRange.end);
    const topSpacer = '<div class="stage-spacer" style="height: ' + (windowRange.start * virtualRowHeight) + 'px"></div>';
    const bottomSpacer = '<div class="stage-spacer" style="height: ' + ((latestVisibleStages.length - windowRange.end) * virtualRowHeight) + 'px"></div>';
    const meta = latestVisibleStages.length > renderedStages.length
      ? '<div class="virtual-list-meta">Showing passes ' + escapeHtml(windowRange.start + 1) + '-' + escapeHtml(windowRange.end) +
        ' of ' + escapeHtml(latestVisibleStages.length) + ' visible</div>'
      : '';
    timeline.innerHTML = '<div class="stage-list" style="--virtual-row-height: ' + virtualRowHeight + 'px">' +
      meta +
      topSpacer +
      renderedStages.map(({ stage, idx }) => renderStageCard(stage, idx)).join('') +
      bottomSpacer +
      '</div>';

    timeline.querySelectorAll('button[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        selectIndex(Number(button.dataset.index));
      });
    });
  }

  function visibleTimelineRange(count) {
    const scrollTop = Math.max(0, Number(timelineScrollContainer.scrollTop) || 0);
    const viewportHeight = Math.max(virtualRowHeight * 4, Number(timelineScrollContainer.clientHeight) || 600);
    const timelineTop = Math.max(0, Number(timeline.offsetTop) || 0);
    const listScrollTop = Math.max(0, scrollTop - timelineTop);
    const first = Math.max(0, Math.floor(listScrollTop / virtualRowHeight) - virtualOverscanRows);
    const visibleCount = Math.ceil(viewportHeight / virtualRowHeight) + virtualOverscanRows * 2;
    return {
      start: first,
      end: Math.min(count, first + visibleCount)
    };
  }

  function scrollSelectedIntoVirtualWindow() {
    const visibleStages = visibleStageEntries();
    const offset = visibleStages.findIndex(({ idx }) => idx === selectedIndex);
    if (offset < 0) {
      return;
    }
    const viewportHeight = Math.max(virtualRowHeight * 4, Number(timelineScrollContainer.clientHeight) || 600);
    const itemTop = Math.max(0, Number(timeline.offsetTop) || 0) + offset * virtualRowHeight;
    const itemBottom = itemTop + virtualRowHeight;
    const currentTop = Math.max(0, Number(timelineScrollContainer.scrollTop) || 0);
    const currentBottom = currentTop + viewportHeight;
    if (itemTop < currentTop) {
      timelineScrollContainer.scrollTop = itemTop;
    } else if (itemBottom > currentBottom) {
      timelineScrollContainer.scrollTop = Math.max(0, itemBottom - viewportHeight);
    }
  }

  function renderStageCard(stage, idx) {
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
  }
  
  function renderOverview(visibleStages) {
    const segments = overviewSegments(visibleStages);
    overview.innerHTML = segments.map(({ stage, idx, active, count, startStage, endStage }) => {
      const activeClass = active ? ' active' : '';
      const bucketClass = count > 1 ? ' bucket' : '';
      const title = count > 1
        ? '#' + startStage.index + '-' + endStage.index + ' (' + count + ' passes)'
        : '#' + stage.index + ' ' + stage.pass;
      const label = count > 1
        ? 'Select pass bucket #' + startStage.index + ' to #' + endStage.index
        : 'Select pass #' + stage.index;
      return '<button class="overview-segment' + bucketClass + activeClass + '" data-index="' + idx + '" aria-label="' +
        escapeHtml(label) + '" title="' + escapeHtml(title) + '" style="--accent: ' +
        stageAccent(stage) + '; --impact: ' + impactPercent(stage) + '%"></button>';
    }).join('');
    overview.querySelectorAll('button[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        selectIndex(Number(button.dataset.index));
      });
    });
  }

  function overviewSegments(visibleStages) {
    if (visibleStages.length <= maxOverviewSegments) {
      return visibleStages.map((entry) => ({
        ...entry,
        active: entry.idx === selectedIndex,
        count: 1,
        startStage: entry.stage,
        endStage: entry.stage
      }));
    }
    const bucketSize = Math.ceil(visibleStages.length / maxOverviewSegments);
    const segments = [];
    for (let start = 0; start < visibleStages.length; start += bucketSize) {
      const bucket = visibleStages.slice(start, Math.min(visibleStages.length, start + bucketSize));
      const activeEntry = bucket.find((entry) => entry.idx === selectedIndex);
      const representative = activeEntry ?? bucket.find((entry) => isFailedStage(entry.stage)) ??
        bucket.find((entry) => entry.stage.changed) ?? bucket[0];
      segments.push({
        ...representative,
        active: Boolean(activeEntry),
        count: bucket.length,
        startStage: bucket[0].stage,
        endStage: bucket[bucket.length - 1].stage
      });
    }
    return segments;
  }
  
  function renderDetails() {
    const stage = trace.stages[selectedIndex];
    if (!stage) {
      return;
    }
    requestStageArtifactsIfNeeded(stage);
  
    details.innerHTML =
      renderPassHero(stage) +
      renderShortcutStrip() +
      '<div class="details-grid">' +
        kv('Scope', stage.scope ?? 'unknown') +
        kv('Changed', stage.changed ? 'yes' : 'no') +
        kv('Duration', typeof stage.durationMs === 'number' ? fmtNumber(stage.durationMs) + ' ms' : 'unknown') +
        kv('Verifier', stage.verifier ?? 'unknown') +
      '</div>' +
      renderMetricAnomalies(stage.index) +
      sectionBlock('Suspicious Pass Explanation', renderExplanationPanel(stage), {
        hint: 'Trace-grounded candidate, not a proof'
      }) +
      sectionBlock('Metric Delta', renderMetrics(stage.metricsBefore ?? {}, stage.metricsAfter ?? {}), {
        hint: 'Before vs after counters for the selected pass.'
      }) +
      sectionBlock('IR Diff', renderDiff(stage), {
        hint: stageIrSource(stage)
      }) +
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
      '<button class="action-button" data-action="export-explanation" title="Export evidence-grounded explanation">Explain suspicious pass</button>' +
      '<button class="action-button" data-action="export-agent-context" title="Export bounded agent-ready context">Export agent context</button>' +
      '<button class="action-button" data-action="export-bundle">Export repro bundle</button>' +
      '<button class="action-button" data-action="export-directory-bundle">Export repro directory</button>' +
      '<button class="action-button" data-action="open-trace">Open trace JSON</button>' +
    '</div>';
  }

  function renderShortcutStrip() {
    return '<div class="shortcut-strip" aria-label="Keyboard shortcuts">' +
      shortcutKey('j / ↓', 'next pass') +
      shortcutKey('k / ↑', 'previous pass') +
      shortcutKey('/', 'search') +
      shortcutKey('c', 'changed only') +
      shortcutKey('f', 'first signal') +
    '</div>';
  }

  function shortcutKey(key, label) {
    return '<span class="shortcut"><kbd>' + escapeHtml(key) + '</kbd>' + escapeHtml(label) + '</span>';
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
    const body = '<div class="anomaly-panel"><div class="anomaly-list">' +
      entries.map((entry) => {
        const delta = entry.delta > 0 ? '+' + fmtNumber(entry.delta) : String(fmtNumber(entry.delta));
        return '<div class="anomaly-item">' +
          '<span class="anomaly-severity">' + escapeHtml(entry.severity) + '</span>' +
          '<span class="anomaly-message" title="' + escapeHtml(entry.message) + '">' + escapeHtml(entry.message) + '</span>' +
          '<span class="anomaly-delta">' + escapeHtml(entry.metric + ' ' + delta) + '</span>' +
        '</div>';
      }).join('') +
    '</div></div>';
    return sectionBlock('Metric Anomalies', body, {
      tone: 'warning',
      hint: entries.length + ' suspicious signal' + (entries.length === 1 ? '' : 's')
    });
  }

  function renderExplanationPanel(stage) {
    const evidence = explanationEvidence(stage).slice(0, 8);
    const checks = explanationNextChecks(stage);
    const guardrails = [
      'Generated from trace evidence only.',
      'Treat root-cause statements as candidates until a rerun, verifier output, or source inspection confirms them.',
      'Do not infer dialect-specific semantics that are not visible in diagnostics, metrics, IR, or artifacts.'
    ];
    return '<div class="explanation-panel">' +
      '<div class="explanation-section strong">' +
        '<div class="explanation-label">Likely issue</div>' +
        '<p>' + escapeHtml(explanationLikelyIssue(stage)) + '</p>' +
        '<div class="action-row compact">' +
          '<button class="action-button compact" data-action="copy-explanation">Copy explanation</button>' +
          '<button class="action-button compact" data-action="copy-agent-context">Copy agent context</button>' +
        '</div>' +
      '</div>' +
      '<div class="explanation-grid">' +
        explanationList('Evidence', evidence.length ? evidence : ['No concrete evidence recorded for this stage.']) +
        explanationList('Recommended next checks', checks) +
      '</div>' +
      '<div class="explanation-section">' +
        '<div class="explanation-label">Confidence</div>' +
        '<p>' + escapeHtml(explanationConfidence(stage, evidence)) + '</p>' +
      '</div>' +
      '<div class="explanation-section">' +
        '<div class="explanation-label">Guardrails</div>' +
        '<ul>' + guardrails.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>' +
      '</div>' +
    '</div>';
  }

  function explanationList(label, items) {
    return '<div class="explanation-section">' +
      '<div class="explanation-label">' + escapeHtml(label) + '</div>' +
      '<ul>' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>' +
    '</div>';
  }

  function explanationLikelyIssue(stage) {
    if (isFailedStage(stage)) {
      return 'The selected pass ' + stage.pass + ' is a root-cause candidate because the trace records a failed status or failed verifier immediately after this stage.';
    }
    const anomaly = anomaliesForStage(stage.index)[0];
    if (anomaly) {
      return 'The selected pass ' + stage.pass + ' is suspicious because metric ' + anomaly.metric + ' changed with a recorded anomaly.';
    }
    if (stage.changed) {
      return 'The selected pass ' + stage.pass + ' changed the recorded IR. Inspect the before/after diff and neighboring stages before attributing root cause.';
    }
    return 'The selected pass ' + stage.pass + ' did not change the recorded IR. It is less suspicious unless diagnostics or hidden side effects point to it.';
  }

  function explanationEvidence(stage) {
    const evidence = [
      'Selected stage #' + stage.index + ': pass=' + stage.pass + ', status=' + (stage.status ?? 'unknown') + ', changed=' + (stage.changed ? 'yes' : 'no') + ', verifier=' + (stage.verifier ?? 'unknown') + '.'
    ];
    const firstFailure = trace.stages.find((entry) => isFailedStage(entry));
    const firstChanged = trace.stages.find((entry) => entry.changed);
    if (firstFailure) {
      evidence.push('First failure stage recorded by trace: #' + firstFailure.index + '.');
    }
    if (firstChanged) {
      evidence.push('First changed stage recorded by trace: #' + firstChanged.index + '.');
    }
    topMetricDeltas(stage.metricsBefore ?? {}, stage.metricsAfter ?? {}).slice(0, 4).forEach((delta) => {
      evidence.push('Metric ' + delta.key + ' changed by ' + signed(delta.delta) + '.');
    });
    anomaliesForStage(stage.index).slice(0, 3).forEach((anomaly) => {
      evidence.push('Metric anomaly: ' + anomaly.message);
    });
    if (stage.diagnostics) {
      evidence.push('Stage diagnostics are present.');
    }
    if (trace.diagnostics) {
      evidence.push('Trace-level diagnostics are present.');
    }
    if (stage.artifacts?.beforePath || stage.artifacts?.afterPath || stage.artifacts?.diagnosticsPath) {
      const artifacts = [
        stage.artifacts.beforePath ? 'before=' + stage.artifacts.beforePath : undefined,
        stage.artifacts.afterPath ? 'after=' + stage.artifacts.afterPath : undefined,
        stage.artifacts.diagnosticsPath ? 'diagnostics=' + stage.artifacts.diagnosticsPath : undefined
      ].filter(Boolean).join(', ');
      evidence.push('Artifacts referenced: ' + artifacts + '.');
    }
    traceIssues.filter((issue) => typeof issue.stageIndex !== 'number' || issue.stageIndex === stage.index)
      .slice(0, 3)
      .forEach((issue) => {
        evidence.push('Trace validation ' + issue.severity + ': ' + issue.message);
      });
    return evidence;
  }

  function explanationNextChecks(stage) {
    const neighbors = neighborStages(stage)
      .map((entry) => '#' + entry.index + ' ' + entry.pass)
      .join(', ') || 'none recorded';
    const checks = [
      'Compare before/after IR for stage #' + stage.index + ' and identify the first concrete op, type, attribute, or region change.',
      'Inspect neighboring stages: ' + neighbors + '.'
    ];
    if (isFailedStage(stage)) {
      checks.push('Rerun the pipeline prefix through stage #' + stage.index + ' with verifier enabled to confirm this is the minimal failing prefix.');
    } else if (stage.changed) {
      checks.push('Check whether the changed IR is expected lowering or the first visible symptom of an earlier pass.');
    } else {
      checks.push('Prefer another stage for root-cause localization if this stage has no recorded IR change.');
    }
    const anomaly = anomaliesForStage(stage.index)[0];
    if (anomaly) {
      checks.push('Audit metric ' + anomaly.metric + ' around this stage and decide whether the delta is expected for this lowering step.');
    }
    if (stage.artifacts?.beforePath || stage.artifacts?.afterPath) {
      checks.push('Open the referenced artifact files if the bounded context is insufficient.');
    }
    checks.push('Export a repro bundle or agent context before filing an issue or asking an AI agent to propose fixes.');
    return checks;
  }

  function explanationConfidence(stage, evidence) {
    if (isFailedStage(stage) && evidence.length >= 3) {
      return 'high: failure status/verifier evidence is directly attached to the selected stage.';
    }
    if (anomaliesForStage(stage.index).length && stage.changed) {
      return 'medium: the selected stage has both an IR change and metric anomaly, but root cause still needs rerun/source confirmation.';
    }
    if (stage.changed) {
      return 'medium-low: the selected stage changed IR, but no failure or anomaly directly proves root cause.';
    }
    return 'low: the selected stage has no recorded IR change or direct failure evidence.';
  }

  function neighborStages(stage) {
    const position = trace.stages.findIndex((entry) => entry.index === stage.index);
    if (position < 0) {
      return [];
    }
    return trace.stages.slice(Math.max(0, position - 2), Math.min(trace.stages.length, position + 3))
      .filter((entry) => entry.index !== stage.index);
  }

  function sectionBlock(title, body, options = {}) {
    if (!body) {
      return '';
    }
    const tone = options.tone ? ' ' + escapeHtml(options.tone) : '';
    const hint = options.hint ? '<span class="section-hint">' + escapeHtml(options.hint) + '</span>' : '';
    return '<section class="detail-section' + tone + '">' +
      '<div class="section-heading"><h2>' + escapeHtml(title) + '</h2>' + hint + '</div>' +
      body +
    '</section>';
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

  function signed(value) {
    return value > 0 ? '+' + fmtNumber(value) : String(fmtNumber(value));
  }

  function renderCommandAndDiagnostics(stage) {
    const command = trace.command
      ? sectionBlock('Repro Command', '<div class="action-row compact"><button class="action-button" data-action="copy-command">Copy command</button></div><pre class="diagnostics">' + escapeHtml(trace.command) + '</pre>', {
        hint: 'Copyable command context'
      })
      : '';
    const stageDiagnostics = stage.diagnostics
      ? sectionBlock('Stage Diagnostics', renderSourceLine('diagnostics', stage.artifacts?.diagnosticsPath, stage.diagnostics) +
        '<pre class="diagnostics">' + escapeHtml(stage.diagnostics) + '</pre>', {
        hint: 'Selected pass output'
      })
      : '';
    const traceDiagnostics = trace.diagnostics
      ? sectionBlock('Trace Diagnostics', '<pre class="diagnostics">' + escapeHtml(trace.diagnostics) + '</pre>', {
        hint: 'Collector-level context'
      })
      : '';
    return command + stageDiagnostics + traceDiagnostics;
  }
  
  function renderDiff(stage) {
    const beforeText = stage.irBefore ?? '';
    const afterText = stage.irAfter ?? '';
    if (isMissingArtifactIr(stage)) {
      return renderArtifactOnlyToolbar(stage) +
        '<div class="empty">Loading artifact IR for this pass...</div>';
    }
    const rows = diffLines(beforeText, afterText);
    if (!rows.length) {
      return renderArtifactOnlyToolbar(stage) +
        '<div class="empty">No IR text recorded for this pass.</div>';
    }
    const contextRows = showFullDiff ? rows : collapseUnchangedRows(rows);
    const renderedRows = boundDiffRows(contextRows);
    const stats = diffStats(rows, renderedRows);
  
    return renderDiffToolbar(stage, stats) +
      '<div class="diff-head"><div><div class="diff-title">Before pass</div>' +
      renderSourceLine('before IR', stage.artifacts?.beforePath, beforeText, { open: false }) +
      '</div><div><div class="diff-title">After pass</div>' +
      renderSourceLine('after IR', stage.artifacts?.afterPath, afterText, { open: false }) +
      '</div></div>' +
      '<div class="diff-scroll"><table class="diff"><tbody>' +
      renderedRows.map((row) => {
        if (row.kind === 'context') {
          return '<tr class="context-row"><td class="line-no"></td><td class="context-cell" colspan="3">' +
            escapeHtml(row.message) + '</td></tr>';
        }
        return '<tr class="' + row.kind + '">' +
          '<td class="line-no">' + escapeHtml(row.leftNo ?? '') + '</td>' +
          '<td class="code">' + escapeHtml(row.left ?? '') + '</td>' +
          '<td class="line-no">' + escapeHtml(row.rightNo ?? '') + '</td>' +
          '<td class="code">' + escapeHtml(row.right ?? '') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }
  
  function renderDiffToolbar(stage, stats) {
    const artifactButtons = [
      artifactButton('Open before artifact', stage.artifacts?.beforePath),
      artifactButton('Open after artifact', stage.artifacts?.afterPath),
      artifactButton('Open diagnostics', stage.artifacts?.diagnosticsPath)
    ].filter(Boolean).join('');
    const artifactGroup = artifactButtons
      ? '<div class="artifact-toolbar" aria-label="Diff artifacts"><span class="toolbar-label">Artifacts</span>' + artifactButtons + '</div>'
      : '';
    const contextLabel = showFullDiff
      ? 'Collapse unchanged context'
      : stats.hidden > 0 ? 'Show full context' : 'Full context shown';
    const contextDisabled = !showFullDiff && stats.hidden === 0 ? ' disabled' : '';
    const hidden = stats.unchangedHidden > 0
      ? '<span class="diff-chip muted">' + escapeHtml(stats.unchangedHidden + ' unchanged hidden') + '</span>'
      : '';
    const bounded = stats.boundedHidden > 0
      ? '<span class="diff-chip warning">' + escapeHtml(stats.boundedHidden + ' omitted by render cap') + '</span>'
      : '';
    return '<div class="diff-toolbar">' +
      '<div class="diff-stats">' +
        '<span class="diff-chip add">+' + escapeHtml(stats.added) + '</span>' +
        '<span class="diff-chip del">-' + escapeHtml(stats.deleted) + '</span>' +
        '<span class="diff-chip">shown ' + escapeHtml(stats.shown) + ' / ' + escapeHtml(stats.total) + '</span>' +
        hidden +
        bounded +
      '</div>' +
      '<div class="diff-actions">' +
        artifactGroup +
        '<button class="action-button compact" data-action="toggle-diff-context"' + contextDisabled + '>' + escapeHtml(contextLabel) + '</button>' +
      '</div>' +
    '</div>';
  }

  function artifactButton(label, artifactPath) {
    if (!artifactPath) {
      return '';
    }
    return '<button class="artifact-button" data-action="open-artifact" data-artifact-path="' +
      escapeHtml(artifactPath) + '" title="' + escapeHtml(artifactPath) + '">' + escapeHtml(label) + '</button>';
  }

  function renderArtifactOnlyToolbar(stage) {
    const artifactButtons = [
      artifactButton('Open before artifact', stage.artifacts?.beforePath),
      artifactButton('Open after artifact', stage.artifacts?.afterPath),
      artifactButton('Open diagnostics', stage.artifacts?.diagnosticsPath)
    ].filter(Boolean).join('');
    return artifactButtons
      ? '<div class="diff-toolbar"><div class="diff-actions"><div class="artifact-toolbar" aria-label="Diff artifacts"><span class="toolbar-label">Artifacts</span>' + artifactButtons + '</div></div></div>'
      : '';
  }

  function requestStageArtifactsIfNeeded(stage) {
    if (!isMissingArtifactIr(stage) && !(stage.artifacts?.diagnosticsPath && !stage.diagnostics)) {
      return;
    }
    if (pendingArtifactLoads.has(stage.index)) {
      return;
    }
    if (attemptedArtifactLoads.has(stage.index)) {
      return;
    }
    attemptedArtifactLoads.add(stage.index);
    pendingArtifactLoads.add(stage.index);
    vscode.postMessage({
      type: 'requestStageArtifacts',
      stageIndex: stage.index
    });
  }

  function isMissingArtifactIr(stage) {
    return Boolean((stage.artifacts?.beforePath && !stage.irBefore) ||
      (stage.artifacts?.afterPath && !stage.irAfter));
  }

  function renderSourceLine(label, artifactPath, text, options = {}) {
    const source = artifactPath
      ? 'artifact: ' + artifactPath
      : text ? 'inline ' + label : 'missing ' + label;
    const open = artifactPath && options.open !== false
      ? '<button class="artifact-open" data-action="open-artifact" data-artifact-path="' + escapeHtml(artifactPath) + '">Open ' + escapeHtml(label) + '</button>'
      : '';
    return '<div class="source-line"><span class="source-path" title="' + escapeHtml(source) + '">' +
      escapeHtml(source) + '</span>' + open + '</div>';
  }

  function diffStats(rows, renderedRows) {
    const added = rows.filter((row) => row.kind === 'add').length;
    const deleted = rows.filter((row) => row.kind === 'del').length;
    const changed = rows.filter((row) => row.kind === 'changed').length;
    const shown = renderedRows.filter((row) => row.kind !== 'context').length;
    const unchangedHidden = renderedRows
      .filter((row) => row.kind === 'context' && row.hiddenKind === 'unchanged')
      .reduce((total, row) => total + row.hidden, 0);
    const boundedHidden = renderedRows
      .filter((row) => row.kind === 'context' && row.hiddenKind === 'bounded')
      .reduce((total, row) => total + row.hidden, 0);
    return {
      added: added + changed,
      deleted: deleted + changed,
      shown,
      total: rows.length,
      hidden: unchangedHidden + boundedHidden,
      unchangedHidden,
      boundedHidden
    };
  }

  function collapseUnchangedRows(rows, context = 3) {
    if (showFullDiff || rows.length <= 80) {
      return rows;
    }
    const collapsed = [];
    let index = 0;
    while (index < rows.length) {
      if (rows[index].kind !== 'same') {
        collapsed.push(rows[index]);
        index++;
        continue;
      }
      const start = index;
      while (index < rows.length && rows[index].kind === 'same') {
        index++;
      }
      const run = rows.slice(start, index);
      if (run.length <= context * 2 + 3) {
        collapsed.push(...run);
        continue;
      }
      collapsed.push(...run.slice(0, context));
      collapsed.push({
        kind: 'context',
        hidden: run.length - context * 2,
        hiddenKind: 'unchanged',
        message: run.length - context * 2 + ' unchanged line(s) hidden'
      });
      collapsed.push(...run.slice(-context));
    }
    return collapsed;
  }

  function boundDiffRows(rows) {
    if (rows.length <= maxRenderedDiffRows) {
      return rows;
    }
    const head = rows.slice(0, diffEdgeRows);
    const tail = rows.slice(-diffEdgeRows);
    const omittedRows = rows.slice(head.length, rows.length - tail.length);
    const omitted = omittedRows.reduce((total, row) => total + representedRowCount(row), 0);
    return [
      ...head,
      {
        kind: 'context',
        hidden: omitted,
        hiddenKind: 'bounded',
        message: omitted + ' diff row(s) omitted by render cap'
      },
      ...tail
    ];
  }

  function representedRowCount(row) {
    return row.kind === 'context' && typeof row.hidden === 'number' ? row.hidden : 1;
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
  
    const a = beforeText.split(/\r?\n/);
    const b = afterText.split(/\r?\n/);
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
