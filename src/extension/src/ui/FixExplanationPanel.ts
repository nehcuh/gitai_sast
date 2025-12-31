import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * Fix Explanation Panel - Webview 面板，显示 AI 修复解释
 */
export class FixExplanationPanel {
  private static currentPanel: FixExplanationPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private fixCode: string = '';

  /**
   * 显示解释面板
   *
   * @param finding 漏洞信息
   * @param suggestion AI 建议全文
   * @param thinking AI 推理过程（可选）
   * @param fixCode 修复代码（可选）
   */
  static async show(
    finding: Finding,
    suggestion: string,
    thinking?: string,
    fixCode?: string
  ): Promise<void> {
    // 如果已有面板，直接使用
    if (FixExplanationPanel.currentPanel) {
      FixExplanationPanel.currentPanel.panel.reveal();
      FixExplanationPanel.currentPanel.updateContent(
        finding,
        suggestion,
        thinking,
        fixCode
      );
      return;
    }

    // 创建新面板
    const panel = vscode.window.createWebviewPanel(
      'sast.aiFixExplanation',
      `AI Fix: ${finding.title}`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    FixExplanationPanel.currentPanel = new FixExplanationPanel(
      panel,
      finding,
      suggestion,
      thinking,
      fixCode
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private finding: Finding,
    private suggestion: string,
    private thinking?: string,
    fixCode?: string
  ) {
    this.panel = panel;
    this.fixCode = fixCode || this.extractCodeFromSuggestion(suggestion) || '';
    this.panel.webview.html = this.getHtml();

    // 监听面板关闭事件
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // 监听来自 Webview 的消息
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  /**
   * 更新面板内容
   */
  private updateContent(
    finding: Finding,
    suggestion: string,
    thinking?: string,
    fixCode?: string
  ): void {
    this.finding = finding;
    this.suggestion = suggestion;
    this.thinking = thinking;
    this.fixCode = fixCode || this.extractCodeFromSuggestion(suggestion) || '';
    this.panel.webview.html = this.getHtml();
  }

  /**
   * 生成 HTML 内容
   */
  private getHtml(): string {
    const thinkingHtml = this.thinking
      ? `
  <div class="thinking">
    <h3>🧠 AI Reasoning</h3>
    <pre><code>${this.escapeHtml(this.thinking)}</code></pre>
  </div>
  `
      : '';

    const fixCodeHtml = this.fixCode
      ? `
  <div>
    <h3>🔧 Fix Code</h3>
    <pre><code>${this.escapeHtml(this.fixCode)}</code></pre>
  </div>
  `
      : '';

    const applyFixButton = this.fixCode
      ? `
    <button class="btn-primary" onclick="applyFix()">Apply Fix</button>
    `
      : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Fix Explanation</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    .finding {
      background: var(--vscode-textBlockQuote-background);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
      border-left: 4px solid var(--vscode-editorInfo-foreground);
    }

    .finding h3 {
      margin: 0 0 10px 0;
      color: var(--vscode-editorInfo-foreground);
    }

    .finding p {
      margin: 5px 0;
    }

    .finding strong {
      color: var(--vscode-foreground);
    }

    .thinking {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }

    .thinking h3 {
      margin: 0 0 10px 0;
      color: var(--vscode-editor-foreground);
    }

    .suggestion {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-editor-background);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }

    .suggestion h3 {
      margin: 0 0 10px 0;
    }

    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
      white-space: pre-wrap;
      margin: 10px 0;
    }

    code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      transition: opacity 0.2s;
    }

    button:hover {
      opacity: 0.9;
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      margin-right: 5px;
    }

    .tag.severity-high {
      background: #f44336;
      color: white;
    }

    .tag.severity-medium {
      background: #ff9800;
      color: white;
    }

    .tag.severity-low {
      background: #4caf50;
      color: white;
    }

    .tag.severity-critical {
      background: #d32f2f;
      color: white;
    }

    .info {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="finding">
    <h3>📌 Vulnerability</h3>
    <p>
      <span class="tag severity-${this.finding.severity}">${this.finding.severity.toUpperCase()}</span>
      <strong>Rule ID:</strong> ${this.escapeHtml(this.finding.rule_id)}
    </p>
    <p><strong>Title:</strong> ${this.escapeHtml(this.finding.title)}</p>
    <p><strong>Description:</strong> ${this.escapeHtml(this.finding.description)}</p>
  </div>

  ${thinkingHtml}

  <div class="suggestion">
    <h3>💡 AI Suggestion</h3>
    <div>${this.escapeHtml(this.suggestion)}</div>
  </div>

  ${fixCodeHtml}

  <div class="actions">
    ${applyFixButton}
    <button class="btn-secondary" onclick="copyCode()">Copy Code</button>
    <button class="btn-secondary" onclick="dismiss()">Dismiss</button>
  </div>

  <div class="info">
    Click "Apply Fix" to automatically apply fix to editor.
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function applyFix() {
      vscode.postMessage({ command: 'applyFix' });
    }

    function copyCode() {
      vscode.postMessage({ command: 'copyCode' });
    }

    function dismiss() {
      vscode.postMessage({ command: 'dismiss' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * 转义 HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 处理来自 Webview 的消息
   */
  private handleMessage(message: { command: string }): void {
    switch (message.command) {
      case 'applyFix':
        this.handleApplyFix();
        break;
      case 'copyCode':
        this.handleCopyCode();
        break;
      case 'dismiss':
        this.panel.dispose();
        break;
    }
  }

  /**
   * 处理应用修复
   */
  private async handleApplyFix(): Promise<void> {
    if (!this.fixCode) {
      vscode.window.showWarningMessage('No fix code available');
      return;
    }

    // 获取当前活动的编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    // 导入 FixDiffViewer（避免循环依赖）
    const { FixDiffViewer } = await import('./FixDiffViewer');

    // 尝试应用修复
    const success = await FixDiffViewer.applyFix(
      editor,
      this.finding,
      this.fixCode
    );

    if (success) {
      vscode.window.showInformationMessage('Fix applied successfully');
    } else {
      vscode.window.showWarningMessage(
        'Failed to apply fix automatically. Please copy code and apply it manually.'
      );
    }
  }

  /**
   * 处理复制代码
   */
  private async handleCopyCode(): Promise<void> {
    if (!this.fixCode) {
      vscode.window.showWarningMessage('No code available to copy');
      return;
    }

    await vscode.env.clipboard.writeText(this.fixCode);
    vscode.window.showInformationMessage('Code copied to clipboard');
  }

  /**
   * 从建议中提取代码
   */
  private extractCodeFromSuggestion(suggestion: string): string | null {
    // 尝试匹配代码块
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // 如果没有代码块，返回整个建议（去除首尾空行）
    const trimmed = suggestion.trim();
    if (trimmed) {
      return trimmed;
    }

    return null;
  }

  /**
   * 清理资源
   */
  private dispose(): void {
    FixExplanationPanel.currentPanel = undefined;
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
