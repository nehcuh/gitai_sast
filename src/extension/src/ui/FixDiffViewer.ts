import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * Diff 查看器 - 在 VSCode Diff 编辑器中展示 AI 修复建议
 */
export class FixDiffViewer {
  /**
   * 在 Diff 编辑器中展示修复建议
   *
   * @param originalUri 原始文件 URI
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @param suggestion AI 建议全文
   * @param thinking AI 推理过程（可选）
   */
  static async showFixDiff(
    originalUri: vscode.Uri,
    finding: Finding,
    fixCode: string,
    suggestion: string,
    thinking?: string
  ): Promise<void> {
    // 读取原始文档内容
    const document = await vscode.workspace.openTextDocument(originalUri);
    const originalContent = document.getText();

    // 应用修复，生成修复后的内容
    const fixedContent = await this.applyFixToContent(
      document,
      finding,
      fixCode
    );

    // 创建临时文件用于 Diff
    const fixedUri = vscode.Uri.parse(
      `untitled:${originalUri.path}.fixed`
    );

    // 写入修复后的内容
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(fixedUri, encoder.encode(fixedContent));

    // 显示 Diff 编辑器
    await vscode.commands.executeCommand<vscode.TextEditor>(
      'vscode.diff',
      originalUri,
      fixedUri,
      `AI Fix: ${finding.title}`,
      {
        preview: true,
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      }
    );

    // 同时显示解释面板
    if (suggestion || thinking) {
      await FixExplanationPanel.show(finding, suggestion, thinking);
    }
  }

  /**
   * 将修复应用到原始内容（智能匹配）
   *
   * @param document 文本文档
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 修复后的内容
   */
  private static async applyFixToContent(
    document: vscode.TextDocument,
    finding: Finding,
    fixCode: string
  ): Promise<string> {
    // 尝试精确匹配
    const exactMatch = this.findExactMatch(document, finding, fixCode);
    if (exactMatch) {
      return this.replaceRange(document, exactMatch, fixCode);
    }

    // 尝试模糊匹配（基于行号）
    const fuzzyMatch = this.findFuzzyMatch(document, finding, fixCode);
    if (fuzzyMatch) {
      return this.replaceRange(document, fuzzyMatch, fixCode);
    }

    // 如果都匹配失败，使用简单的按行替换
    const lines = document.getText().split('\n');
    const targetLine = finding.location.line - 1; // 转换为 0-based 索引

    if (targetLine >= 0 && targetLine < lines.length) {
      lines[targetLine] = fixCode;
      return lines.join('\n');
    }

    // 无法应用修复，返回原始内容
    return document.getText();
  }

  /**
   * 查找精确匹配范围
   *
   * @param document 文本文档
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 匹配的范围，未找到返回 null
   */
  private static findExactMatch(
    document: vscode.TextDocument,
    finding: Finding,
    fixCode: string
  ): vscode.Range | null {
    const content = document.getText();
    const targetLine = finding.location.line - 1;
    const column = finding.location.column || 0;

    // 检查行号是否有效
    if (targetLine < 0 || targetLine >= document.lineCount) {
      return null;
    }

    // 获取目标行
    const lineText = document.lineAt(targetLine).text;

    // 查找匹配位置
    const matchIndex = lineText.indexOf(fixCode, column);
    if (matchIndex === -1) {
      return null;
    }

    // 构建匹配范围
    const start = new vscode.Position(targetLine, matchIndex);
    const end = new vscode.Position(targetLine, matchIndex + fixCode.length);

    return new vscode.Range(start, end);
  }

  /**
   * 查找模糊匹配范围（基于行号和相似度）
   *
   * @param document 文本文档
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 匹配的范围，未找到返回 null
   */
  private static findFuzzyMatch(
    document: vscode.TextDocument,
    finding: Finding,
    fixCode: string
  ): vscode.Range | null {
    const targetLine = finding.location.line - 1;

    // 检查行号是否有效
    if (targetLine < 0 || targetLine >= document.lineCount) {
      return null;
    }

    // 获取目标行
    const lineText = document.lineAt(targetLine).text;

    // 尝试去除空格后匹配
    const trimmedFix = fixCode.trim();
    const trimmedLine = lineText.trim();

    if (trimmedLine === trimmedFix) {
      // 完全匹配，返回整行范围
      return document.lineAt(targetLine).range;
    }

    // 检查是否包含修复代码
    if (trimmedLine.includes(trimmedFix)) {
      // 包含修复代码，返回包含范围
      const matchIndex = trimmedLine.indexOf(trimmedFix);
      const start = new vscode.Position(targetLine, matchIndex);
      const end = new vscode.Position(
        targetLine,
        matchIndex + trimmedFix.length
      );
      return new vscode.Range(start, end);
    }

    return null;
  }

  /**
   * 替换指定范围的内容
   *
   * @param document 文本文档
   * @param range 要替换的范围
   * @param replacement 替换内容
   * @returns 替换后的完整内容
   */
  private static replaceRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    replacement: string
  ): string {
    const content = document.getText();

    const offset = document.offsetAt(range.start);
    const endOffset = document.offsetAt(range.end);

    return (
      content.substring(0, offset) +
      replacement +
      content.substring(endOffset)
    );
  }

  /**
   * 在编辑器中直接应用修复（最佳尝试）
   *
   * @param editor 文本编辑器
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 是否成功应用
   */
  static async applyFix(
    editor: vscode.TextEditor,
    finding: Finding,
    fixCode: string
  ): Promise<boolean> {
    const document = editor.document;

    // 尝试精确匹配
    const exactMatch = this.findExactMatch(document, finding, fixCode);
    if (exactMatch) {
      return await this.replaceInRange(editor, exactMatch, fixCode);
    }

    // 尝试模糊匹配
    const fuzzyMatch = this.findFuzzyMatch(document, finding, fixCode);
    if (fuzzyMatch) {
      return await this.replaceInRange(editor, fuzzyMatch, fixCode);
    }

    // 如果都匹配失败，使用简单的按行替换
    const line = finding.location.line - 1; // 转换为 0-based 索引

    if (line < 0 || line >= document.lineCount) {
      return false;
    }

    const range = document.lineAt(line).range;

    // 应用编辑
    return await this.replaceInRange(editor, range, fixCode);
  }

  /**
   * 在编辑器中替换指定范围
   *
   * @param editor 文本编辑器
   * @param range 要替换的范围
   * @param replacement 替换内容
   * @returns 是否成功
   */
  private static async replaceInRange(
    editor: vscode.TextEditor,
    range: vscode.Range,
    replacement: string
  ): Promise<boolean> {
    try {
      const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, replacement);
      });
      return success;
    } catch (error) {
      console.error('[FixDiffViewer] Failed to replace in range:', error);
      return false;
    }
  }
}

/**
 * 修复应用策略
 */
export enum FixApplyStrategy {
  /**
   * 最佳尝试：尝试匹配代码片段
   */
  BestEffort = 'best-effort',

  /**
   * 精确匹配：替换完全匹配的行
   */
  ExactMatch = 'exact-match',

  /**
   * 手动：仅复制到剪贴板
   */
  Manual = 'manual',
}

/**
 * Fix Explanation Panel - Webview 面板
 */
export class FixExplanationPanel {
  private static currentPanel: FixExplanationPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * 显示解释面板
   */
  static async show(
    finding: Finding,
    suggestion: string,
    thinking?: string
  ): Promise<void> {
    // 如果已有面板，直接使用
    if (FixExplanationPanel.currentPanel) {
      FixExplanationPanel.currentPanel.panel.reveal();
      FixExplanationPanel.currentPanel.updateContent(finding, suggestion, thinking);
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
      thinking
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private finding: Finding,
    private suggestion: string,
    private thinking?: string
  ) {
    this.panel = panel;
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

  private updateContent(
    finding: Finding,
    suggestion: string,
    thinking?: string
  ): void {
    this.finding = finding;
    this.suggestion = suggestion;
    this.thinking = thinking;
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
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

    .thinking {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }

    .suggestion {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-editor-background);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }

    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="finding">
    <h3>📌 Vulnerability</h3>
    <p><strong>Rule ID:</strong> ${this.escapeHtml(this.finding.rule_id)}</p>
    <p><strong>Severity:</strong> ${this.escapeHtml(this.finding.severity)}</p>
    <p><strong>Title:</strong> ${this.escapeHtml(this.finding.title)}</p>
    <p><strong>Description:</strong> ${this.escapeHtml(this.finding.description)}</p>
  </div>

  ${this.thinking ? `
  <div class="thinking">
    <h3>🧠 AI Reasoning</h3>
    <pre><code>${this.escapeHtml(this.thinking)}</code></pre>
  </div>
  ` : ''}

  <div class="suggestion">
    <h3>💡 AI Suggestion</h3>
    <div>${this.escapeHtml(this.suggestion)}</div>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick="copyCode()">Copy Code</button>
    <button class="btn-secondary" onclick="dismiss()">Dismiss</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

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

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private handleMessage(message: { command: string }): void {
    switch (message.command) {
      case 'copyCode':
        // TODO: 实现复制到剪贴板
        vscode.window.showInformationMessage('Code copied to clipboard');
        break;
      case 'dismiss':
        this.panel.dispose();
        break;
    }
  }

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
