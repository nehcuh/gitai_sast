// 全局变量
let allFindings = [];
let filteredFindings = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 从全局变量获取初始数据
  if (window.initialFindings) {
    allFindings = window.initialFindings;
    filteredFindings = allFindings;
    render();
  }

  // 监听消息更新
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'updateFindings') {
      allFindings = message.findings || [];
      applyFilters();
    }
  });

  // 绑定事件监听器
  bindEventListeners();
});

// 绑定事件监听器
function bindEventListeners() {
  // 严重程度过滤器
  const severityFilter = document.getElementById('severity-filter');
  severityFilter.addEventListener('change', applyFilters);

  // 搜索框
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', applyFilters);

  // 刷新按钮
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.addEventListener('click', () => {
    // 通知扩展刷新数据
    if (window.vscode) {
      window.vscode.postMessage({ type: 'refresh' });
    }
  });
}

// 应用过滤器
function applyFilters() {
  const severityFilter = document.getElementById('severity-filter').value;
  const searchTerm = document.getElementById('search-input').value.toLowerCase();

  filteredFindings = allFindings.filter((finding) => {
    // 严重程度过滤
    if (severityFilter !== 'all') {
      if (finding.severity.toLowerCase() !== severityFilter) {
        return false;
      }
    }

    // 搜索过滤
    if (searchTerm) {
      const searchFields = [
        finding.title,
        finding.description,
        finding.rule_id,
        finding.location.file,
      ].join(' ').toLowerCase();

      if (!searchFields.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  render();
}

// 渲染
function render() {
  updateStats();
  renderFindingsList();
  updateEmptyState();
}

// 更新统计
function updateStats() {
  const stats = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
  };

  allFindings.forEach((finding) => {
    const severity = finding.severity.toLowerCase();
    if (severity === 'critical') stats.critical++;
    else if (severity === 'high') stats.high++;
    else if (severity === 'medium') stats.medium++;
    else if (severity === 'low') stats.low++;
    stats.total++;
  });

  document.getElementById('critical-count').textContent = stats.critical;
  document.getElementById('high-count').textContent = stats.high;
  document.getElementById('medium-count').textContent = stats.medium;
  document.getElementById('low-count').textContent = stats.low;
  document.getElementById('total-count').textContent = stats.total;
}

// 渲染查找结果列表
function renderFindingsList() {
  const container = document.getElementById('findings-list');
  container.innerHTML = '';

  filteredFindings.forEach((finding) => {
    const card = createFindingCard(finding);
    container.appendChild(card);
  });
}

// 创建查找结果卡片
function createFindingCard(finding) {
  const card = document.createElement('div');
  card.className = 'finding-card';
  card.onclick = () => openFile(finding);

  const severityClass = finding.severity.toLowerCase();

  card.innerHTML = `
    <div class="finding-header">
      <span class="severity-badge ${severityClass}">${finding.severity}</span>
      <span class="finding-title">${escapeHtml(finding.title)}</span>
    </div>
    <div class="finding-meta">
      <span class="meta-item">
        <span class="meta-icon">📁</span>
        <span>${escapeHtml(getShortFileName(finding.location.file))}</span>
      </span>
      <span class="meta-item">
        <span class="meta-icon">📍</span>
        <span>Line ${finding.location.line}</span>
      </span>
      <span class="meta-item">
        <span class="meta-icon">🔍</span>
        <span>${escapeHtml(finding.rule_id)}</span>
      </span>
    </div>
    <div class="finding-description">${escapeHtml(finding.description)}</div>
    ${finding.code_snippet ? `<pre class="code-snippet">${escapeHtml(finding.code_snippet)}</pre>` : ''}
    <div class="finding-actions">
      <span class="action-link" onclick="event.stopPropagation(); openFile('${escapeHtml(finding.location.file)}', ${finding.location.line})">
        Open File
      </span>
      ${finding.fix ? `
        <span class="action-link" onclick="event.stopPropagation(); applyFix('${escapeHtml(finding.location.file)}', ${finding.location.line})">
          Apply Fix
        </span>
      ` : ''}
    </div>
  `;

  return card;
}

// 更新空状态
function updateEmptyState() {
  const emptyState = document.getElementById('empty-state');
  const findingsList = document.getElementById('findings-list');

  if (filteredFindings.length === 0) {
    emptyState.style.display = 'flex';
    findingsList.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    findingsList.style.display = 'block';
  }
}

// 打开文件
function openFile(fileUri, line) {
  if (window.vscode) {
    window.vscode.postMessage({
      type: 'openFile',
      fileUri: fileUri,
      line: line,
    });
  }
}

// 应用修复
function applyFix(fileUri, line) {
  const finding = allFindings.find(
    (f) => f.location.file === fileUri && f.location.line === line
  );

  if (finding && finding.fix) {
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'applyFix',
        fileUri: fileUri,
        line: line,
        fix: finding.fix,
      });
    }
  }
}

// 获取短文件名
function getShortFileName(filePath) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

// HTML 转义
function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }

  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 复制到剪贴板
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // 显示复制成功提示
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'copyToClipboard',
        text: text,
      });
    }
  });
}
