import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 结果 Webview 面板
 */
export class ResultsWebviewPanel {
  private static currentPanel: ResultsWebviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private findings: Finding[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    findings: Finding[]
  ): ResultsWebviewPanel {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (ResultsWebviewPanel.currentPanel) {
      ResultsWebviewPanel.currentPanel.panel.reveal(column);
      ResultsWebviewPanel.currentPanel.updateContent(findings);
      return ResultsWebviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitaiSastResults',
      'GitAI SAST Results',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview', 'src')],
        retainContextWhenHidden: true,
      }
    );

    ResultsWebviewPanel.currentPanel = new ResultsWebviewPanel(
      panel,
      extensionUri,
      findings
    );
    return ResultsWebviewPanel.currentPanel;
  }

  public static getCurrentPanel(): ResultsWebviewPanel | undefined {
    return ResultsWebviewPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    findings: Finding[]
  ) {
    this.panel = panel;
    this.findings = findings;

    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case 'openFile':
            this.openFile(message.fileUri, message.line);
            break;
          case 'applyFix':
            this.applyFix(message.fileUri, message.line, message.fix);
            break;
          case 'copyToClipboard':
            vscode.env.clipboard.writeText(message.text);
            break;
          case 'refresh':
            // 触发刷新
            vscode.commands.executeCommand('gitai.sast.refreshDiagnostics');
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public updateContent(findings: Finding[]) {
    this.findings = findings;
    this.panel.webview.postMessage({
      type: 'updateFindings',
      findings: this.findings,
    });
  }

  private openFile(fileUri: string, line: number) {
    const uri = vscode.Uri.file(fileUri);
    vscode.workspace.openTextDocument(uri).then((doc) => {
      vscode.window.showTextDocument(doc).then((editor) => {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      });
    });
  }

  private async applyFix(fileUri: string, line: number, fix?: any) {
    if (!fix) {
      vscode.window.showInformationMessage('No fix available for this issue');
      return;
    }

    const uri = vscode.Uri.file(fileUri);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      const position = new vscode.Position(line - 1, 0);
      const lineText = doc.lineAt(position).text;

      // 简单的替换逻辑（实际可能需要更复杂的修复）
      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(position, new vscode.Position(position.line, lineText.length));
      edit.replace(uri, range, fix.code || lineText);

      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage('Fix applied successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to apply fix: ${error}`);
    }
  }

  private getHtmlForWebview(): string {
    const nonce = this.getNonce();

    // 内嵌 CSS
    const css = `
      :root {
        --bg-primary: #1e1e1e;
        --bg-secondary: #252526;
        --bg-tertiary: #2d2d2d;
        --text-primary: #cccccc;
        --text-secondary: #969696;
        --border-color: #3c3c3c;
        --accent-color: #007acc;
        --accent-hover: #005f9e;

        /* Severity colors */
        --critical-color: #f85149;
        --critical-bg: rgba(248, 81, 73, 0.1);
        --high-color: #da3633;
        --high-bg: rgba(218, 54, 51, 0.1);
        --medium-color: #d29922;
        --medium-bg: rgba(210, 153, 34, 0.1);
        --low-color: #3fb950;
        --low-bg: rgba(63, 185, 80, 0.1);
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-primary);
        background-color: var(--bg-primary);
        overflow: hidden;
        height: 100vh;
      }

      #app {
        height: 100vh;
        display: flex;
        flex-direction: column;
      }

      /* Stats Container */
      .stats-container {
        display: flex;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
      }

      .stat-card {
        flex: 1;
        padding: 12px;
        border-radius: 6px;
        text-align: center;
        min-width: 80px;
      }

      .stat-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-secondary);
        margin-bottom: 4px;
      }

      .stat-value {
        font-size: 24px;
        font-weight: 600;
      }

      .stat-critical {
        background-color: var(--critical-bg);
        color: var(--critical-color);
      }

      .stat-high {
        background-color: var(--high-bg);
        color: var(--high-color);
      }

      .stat-medium {
        background-color: var(--medium-bg);
        color: var(--medium-color);
      }

      .stat-low {
        background-color: var(--low-bg);
        color: var(--low-color);
      }

      .stat-total {
        background-color: var(--bg-tertiary);
        color: var(--text-primary);
      }

      /* Filters Container */
      .filters-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
        gap: 12px;
      }

      .filter-group {
        display: flex;
        gap: 8px;
        flex: 1;
      }

      .filter-select,
      .search-input {
        background-color: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 8px 12px;
        border-radius: 4px;
        outline: none;
        font-size: 13px;
      }

      .filter-select {
        min-width: 150px;
      }

      .search-input {
        flex: 1;
      }

      .filter-select:focus,
      .search-input:focus {
        border-color: var(--accent-color);
      }

      /* Buttons */
      .btn {
        padding: 8px 16px;
        border-radius: 4px;
        border: none;
        font-size: 13px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
        background-color: var(--bg-tertiary);
        color: var(--text-primary);
      }

      .btn:hover {
        background-color: var(--border-color);
      }

      /* Findings List */
      .findings-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }

      .finding-card {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .finding-card:hover {
        border-color: var(--accent-color);
        background-color: var(--bg-tertiary);
      }

      .finding-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 8px;
      }

      .severity-badge {
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .severity-badge.critical {
        background-color: var(--critical-bg);
        color: var(--critical-color);
      }

      .severity-badge.high {
        background-color: var(--high-bg);
        color: var(--high-color);
      }

      .severity-badge.medium {
        background-color: var(--medium-bg);
        color: var(--medium-color);
      }

      .severity-badge.low {
        background-color: var(--low-bg);
        color: var(--low-color);
      }

      .finding-title {
        flex: 1;
        font-weight: 500;
        font-size: 14px;
        color: var(--text-primary);
      }

      .finding-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 8px;
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .finding-description {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 8px;
        line-height: 1.4;
      }

      .code-snippet {
        background-color: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 8px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 12px;
        overflow-x: auto;
        margin-bottom: 8px;
        white-space: pre;
        color: #d4d4d4;
      }

      .finding-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .action-link {
        color: var(--accent-color);
        text-decoration: none;
        font-size: 13px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 3px;
        transition: background 0.2s;
      }

      .action-link:hover {
        background-color: var(--accent-color);
        color: white;
      }

      /* Empty State */
      .empty-state {
        flex: 1;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: var(--text-secondary);
      }

      .empty-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .empty-title {
        font-size: 18px;
        font-weight: 500;
        margin-bottom: 8px;
        color: var(--text-primary);
      }

      .empty-description {
        font-size: 14px;
        opacity: 0.7;
      }
    `;

    // 内嵌 JS
    const js = `
      let allFindings = ${JSON.stringify(this.findings)};
      let filteredFindings = [...allFindings];

      document.addEventListener('DOMContentLoaded', () => {
        render();
        bindEventListeners();
      });

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'updateFindings') {
          allFindings = message.findings || [];
          applyFilters();
        }
      });

      function bindEventListeners() {
        document.getElementById('severity-filter').addEventListener('change', applyFilters);
        document.getElementById('search-input').addEventListener('input', applyFilters);
        document.getElementById('refresh-btn').addEventListener('click', () => {
          if (window.vscode) {
            window.vscode.postMessage({ type: 'refresh' });
          }
        });
      }

      function applyFilters() {
        const severityFilter = document.getElementById('severity-filter').value;
        const searchTerm = document.getElementById('search-input').value.toLowerCase();

        filteredFindings = allFindings.filter((finding) => {
          if (severityFilter !== 'all' && finding.severity.toLowerCase() !== severityFilter) {
            return false;
          }

          if (searchTerm) {
            const searchFields = [finding.title, finding.description, finding.rule_id, finding.location.file].join(' ').toLowerCase();
            if (!searchFields.includes(searchTerm)) {
              return false;
            }
          }

          return true;
        });

        render();
      }

      function render() {
        updateStats();
        renderFindingsList();
        updateEmptyState();
      }

      function updateStats() {
        const stats = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

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

      function renderFindingsList() {
        const container = document.getElementById('findings-list');
        container.innerHTML = '';

        filteredFindings.forEach((finding) => {
          const card = createFindingCard(finding);
          container.appendChild(card);
        });
      }

      function createFindingCard(finding) {
        const card = document.createElement('div');
        card.className = 'finding-card';
        card.onclick = () => openFile(finding.location.file, finding.location.line);

        const severityClass = finding.severity.toLowerCase();

        card.innerHTML = \`
          <div class="finding-header">
            <span class="severity-badge \${severityClass}">\${finding.severity}</span>
            <span class="finding-title">\${escapeHtml(finding.title)}</span>
          </div>
          <div class="finding-meta">
            <span class="meta-item">📁 \${escapeHtml(getShortFileName(finding.location.file))}</span>
            <span class="meta-item">📍 Line \${finding.location.line}</span>
            <span class="meta-item">🔍 \${escapeHtml(finding.rule_id)}</span>
          </div>
          <div class="finding-description">\${escapeHtml(finding.description)}</div>
          \${finding.code_snippet ? \`<pre class="code-snippet">\${escapeHtml(finding.code_snippet)}</pre>\` : ''}
          <div class="finding-actions">
            <span class="action-link" onclick="event.stopPropagation(); openFile('\${escapeHtml(finding.location.file)}', \${finding.location.line})">Open File</span>
            \${finding.fix ? \`<span class="action-link" onclick="event.stopPropagation(); applyFix('\${escapeHtml(finding.location.file)}', \${finding.location.line})">Apply Fix</span>\` : ''}
          </div>
        \`;

        return card;
      }

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

      function openFile(fileUri, line) {
        if (window.vscode) {
          window.vscode.postMessage({ type: 'openFile', fileUri, line });
        }
      }

      function applyFix(fileUri, line) {
        const finding = allFindings.find((f) => f.location.file === fileUri && f.location.line === line);
        if (finding && finding.fix && window.vscode) {
          window.vscode.postMessage({ type: 'applyFix', fileUri, line, fix: finding.fix });
        }
      }

      function getShortFileName(filePath) {
        const parts = filePath.split(/[/\\\\]/);
        return parts[parts.length - 1] || filePath;
      }

      function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitAI SAST Results</title>
  <style>${css}</style>
</head>
<body>
  <div id="app">
    <div class="stats-container">
      <div class="stat-card stat-critical">
        <div class="stat-label">Critical</div>
        <div class="stat-value" id="critical-count">0</div>
      </div>
      <div class="stat-card stat-high">
        <div class="stat-label">High</div>
        <div class="stat-value" id="high-count">0</div>
      </div>
      <div class="stat-card stat-medium">
        <div class="stat-label">Medium</div>
        <div class="stat-value" id="medium-count">0</div>
      </div>
      <div class="stat-card stat-low">
        <div class="stat-label">Low</div>
        <div class="stat-value" id="low-count">0</div>
      </div>
      <div class="stat-card stat-total">
        <div class="stat-label">Total</div>
        <div class="stat-value" id="total-count">0</div>
      </div>
    </div>

    <div class="filters-container">
      <div class="filter-group">
        <select id="severity-filter" class="filter-select">
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input type="text" id="search-input" class="search-input" placeholder="Search findings...">
      </div>
      <div class="actions">
        <button id="refresh-btn" class="btn">🔄 Refresh</button>
      </div>
    </div>

    <div id="findings-list" class="findings-list"></div>

    <div id="empty-state" class="empty-state">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">No Findings</div>
      <div class="empty-description">No security vulnerabilities found</div>
    </div>
  </div>

  <script nonce="${nonce}">
    window.vscode = acquireVsCodeApi();
    window.initialFindings = ${JSON.stringify(this.findings)};
    ${js}
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose() {
    ResultsWebviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
