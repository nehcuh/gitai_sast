import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { Finding } from '../core/types';

/**
 * Fix Explanation Panel - Webview 面板，显示 AI 修复解释
 */
export class FixExplanationPanel {
  private static currentPanel: FixExplanationPanel | undefined;
  private static readonly markdownIt = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private mode: 'ai_fix' | 'details' = 'ai_fix';
  private fixCode: string = '';

  /**
   * 显示解释面板
   */
  static async show(
    finding: Finding,
    suggestion: string,
    thinking?: string,
    fixCode?: string,
    mode: 'ai_fix' | 'details' = 'ai_fix'
  ): Promise<void> {
    if (FixExplanationPanel.currentPanel) {
      FixExplanationPanel.currentPanel.panel.reveal();
      FixExplanationPanel.currentPanel.updateContent(
        finding,
        suggestion,
        thinking,
        fixCode,
        mode
      );
      return;
    }

    const title = mode === 'details' ? `Details: ${finding.title}` : `AI Fix: ${finding.title}`;
    const panel = vscode.window.createWebviewPanel(
      'sast.aiFixExplanation',
      title,
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
      fixCode,
      mode
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private finding: Finding,
    private suggestion: string,
    private thinking?: string,
    fixCode?: string,
    mode: 'ai_fix' | 'details' = 'ai_fix'
  ) {
    this.panel = panel;
    this.mode = mode;
    this.fixCode = fixCode || this.extractCodeFromSuggestion(suggestion) || '';
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  private updateContent(
    finding: Finding,
    suggestion: string,
    thinking?: string,
    fixCode?: string,
    mode: 'ai_fix' | 'details' = 'ai_fix'
  ): void {
    this.finding = finding;
    this.suggestion = suggestion;
    this.thinking = thinking;
    this.mode = mode;
    this.fixCode = fixCode || this.extractCodeFromSuggestion(suggestion) || '';
    this.panel.title = mode === 'details' ? `Details: ${finding.title}` : `AI Fix: ${finding.title}`;
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const thinkingHtml = this.thinking
      ? `
  <div class="thinking">
    <h3>🧠 AI Reasoning</h3>
    <pre><code>${this.escapeHtml(this.thinking)}</code></pre>
  </div>
  `
      : '';

    // Only show "Fix Code" section if we have code AND (it's AI fix mode OR explicitly provided in details mode)
    // For details mode, we might typically only show if it's a specific remediation snippet, not the original code.
    // However, currently we pass original code as 'fixCode' in showDetails.
    // If mode is 'details', we label it 'Code Context' unless it's a fix.

    // Dedent the code for display
    const displayedCode = this.dedent(this.fixCode);

    const fixCodeLabel = this.mode === 'details' ? '📄 Code Context' : '🔧 Fix Code';
    const fixCodeHtml = this.fixCode
      ? `
  <div>
    <h3>${fixCodeLabel}</h3>
    <pre><code>${this.escapeHtml(displayedCode)}</code></pre>
  </div>
  `
      : '';

    // Only show "Apply Fix" / "Preview Fix" if in AI Fix mode
    const actionsHtml = (this.fixCode && this.mode === 'ai_fix')
      ? `
    <button class="btn-secondary" onclick="previewFix()">Preview Fix</button>
    <button class="btn-primary" onclick="applyFix()">Apply Fix</button>
    `
      : '';

    // In details mode, if suggestion == description, don't show "AI Suggestion" block if it's redundant
    const showSuggestion = this.mode === 'ai_fix' || (this.suggestion && this.suggestion !== this.finding.description);
    const suggestionHtml = showSuggestion ? `
  <div class="suggestion">
    <h3>💡 AI Suggestion</h3>
    <div class="markdown-body">${this.renderMarkdown(this.suggestion)}</div>
  </div>` : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Fix Explanation</title>
  <style>
    /* ... styles ... */
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .finding { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid var(--vscode-editorInfo-foreground); }
    .finding h3 { margin: 0 0 10px 0; color: var(--vscode-editorInfo-foreground); }
    .finding p { margin: 5px 0; }
    .finding strong { color: var(--vscode-foreground); }
    .thinking { background: var(--vscode-editor-inactiveSelectionBackground); padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .thinking h3 { margin: 0 0 10px 0; color: var(--vscode-editor-foreground); }
    .suggestion { background: var(--vscode-textLink-foreground); color: var(--vscode-editor-background); padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .suggestion h3 { margin: 0 0 10px 0; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; margin: 10px 0; }
    code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
    .actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
    button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-family: var(--vscode-font-family); transition: opacity 0.2s; }
    button:hover { opacity: 0.9; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-right: 5px; }
    .tag.severity-high { background: #f44336; color: white; }
    .tag.severity-medium { background: #ff9800; color: white; }
    .tag.severity-low { background: #4caf50; color: white; }
    .tag.severity-critical { background: #d32f2f; color: white; }
    .info { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 10px; }
  </style>
</head>
<body>
  <div class="finding">
    <h3>📌 Vulnerability</h3>
    <p><span class="tag severity-${this.finding.severity}">${this.finding.severity.toUpperCase()}</span> <strong>Rule ID:</strong> ${this.escapeHtml(this.finding.rule_id)}</p>
    <p><strong>Title:</strong> ${this.escapeHtml(this.finding.title)}</p>
    <p><strong>Description:</strong> ${this.escapeHtml(this.finding.description)}</p>
  </div>

  ${thinkingHtml}
  ${suggestionHtml}
  ${fixCodeHtml}

  <div class="actions">
    ${actionsHtml}
    <button class="btn-secondary" onclick="copyCode()">Copy Code</button>
    <button class="btn-secondary" onclick="dismiss()">Dismiss</button>
  </div>

  <div class="info">
    ${this.mode === 'ai_fix' ? 'Click "Apply Fix" to automatically apply fix to editor.' : ''}
  </div>


  <script>
    const vscode = acquireVsCodeApi();

    function applyFix() {
      vscode.postMessage({ command: 'applyFix' });
    }

    function previewFix() {
      vscode.postMessage({ command: 'previewFix' });
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

  private renderMarkdown(markdown: string): string {
    try {
      return FixExplanationPanel.markdownIt.render(markdown || '');
    } catch (error) {
      console.warn('[FixExplanationPanel] Failed to render markdown:', error);
      return `<pre><code>${this.escapeHtml(markdown || '')}</code></pre>`;
    }
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
      case 'previewFix':
        this.handlePreviewFix();
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
   * 处理预览修复 (Diff View)
   */
  private async handlePreviewFix(): Promise<void> {
    if (!this.fixCode) return;

    // 导入 FixDiffViewer
    const { FixDiffViewer } = await import('./FixDiffViewer');

    // 我们需要原始文档的 URI
    // 尝试解析 finding.location.file
    // 注意：finding.location.file 可能是 fsPath
    const uri = vscode.Uri.file(this.finding.location.file);

    await FixDiffViewer.showFixDiff(
      uri,
      this.finding,
      this.fixCode,
      this.suggestion, // Pass suggestion to keep panel open/updated
      this.thinking
    );
  }

  /**
   * 处理应用修复
   */
  private async handleApplyFix(): Promise<void> {
    if (!this.fixCode) {
      vscode.window.showWarningMessage('No fix code available');
      return;
    }

    // 获取对应文件的编辑器
    let editor = vscode.window.activeTextEditor;

    // 如果当前活动的编辑器不是目标文件，尝试找到已打开的对应文件
    if (!editor || (editor.document.uri.fsPath !== this.finding.location.file && editor.document.uri.path !== this.finding.location.file)) {
      // 1. 尝试在可见编辑器中查找
      const visible = vscode.window.visibleTextEditors.find(e =>
        e.document.uri.fsPath === this.finding.location.file || e.document.uri.path === this.finding.location.file
      );

      if (visible) {
        editor = visible;
      } else {
        // 2. 尝试打开文档
        try {
          const doc = await vscode.workspace.openTextDocument(this.finding.location.file);
          editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        } catch (e) {
          vscode.window.showErrorMessage(`Could not open file: ${this.finding.location.file}`);
          return;
        }
      }
    }

    if (!editor) {
      vscode.window.showWarningMessage('Could not find editor for this file');
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

    return null;
  }

  private dedent(str: string): string {
    const lines = str.split('\n');
    if (lines.length === 0) return str;

    // Find minimum indentation of non-empty lines
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const indent = line.search(/\S/);
      if (indent !== -1 && indent < minIndent) {
        minIndent = indent;
      }
    }

    if (minIndent === Infinity || minIndent === 0) return str;

    return lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.slice(minIndent);
    }).join('\n');
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
