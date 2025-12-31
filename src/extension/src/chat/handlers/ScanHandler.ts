import * as vscode from 'vscode';
import { SastScanner } from '../../core/SastScanner';
import { DiagnosticManager } from '../../core/DiagnosticManager';

/**
 * Scan 命令处理器
 */
export class ScanHandler {
  constructor(
    private scanner: SastScanner,
    private diagnostics: DiagnosticManager
  ) {}

  /**
   * 处理 Scan 命令
   */
  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      stream.markdown('❌ No active file selected');
      return { metadata: { success: false } };
    }

    const prompt = request.prompt.toLowerCase();

    // 检查是否需要扫描工作区
    if (prompt.includes('workspace') || prompt.includes('all files')) {
      return await this.scanWorkspace(stream);
    } else {
      return await this.scanFile(uri, stream);
    }
  }

  /**
   * 扫描当前文件
   */
  private async scanFile(
    uri: vscode.Uri,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      stream.markdown('❌ No active editor');
      return { metadata: { success: false } };
    }

    const document = editor.document;

    stream.progress('Scanning current file...');

    try {
      // 执行扫描
      const response = await this.scanner.scanFile(
        vscode.workspace.rootPath || '',
        uri.fsPath,
        document.getText()
      );

      // 更新诊断信息
      this.diagnostics.updateDiagnostics(uri, response.findings);

      // 显示结果
      const findingCount = response.findings.length;
      if (findingCount === 0) {
        stream.markdown('✅ No vulnerabilities found in current file');
      } else {
        stream.markdown(`🔍 Scan completed: ${findingCount} issue(s) found\n\n`);

        // 显示漏洞列表
        for (const finding of response.findings) {
          stream.markdown(`### ${finding.title}\n\n`);
          stream.markdown(`- **Rule ID:** \`${finding.rule_id}\`\n`);
          stream.markdown(`- **Severity:** ${finding.severity}\n`);
          stream.markdown(`- **Line:** ${finding.location.line}\n`);
          stream.markdown(`- **Description:** ${finding.description}\n\n`);
        }
      }

      return { metadata: { success: true, findingCount } };
    } catch (error) {
      stream.markdown(`❌ Scan failed: ${error}`);
      return { metadata: { success: false } };
    }
  }

  /**
   * 扫描工作区
   */
  private async scanWorkspace(
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    stream.progress('Scanning workspace...');

    // TODO: 实现工作区扫描
    // 暂时显示占位符
    stream.markdown(
      'ℹ️ Workspace scanning is not yet implemented. Please use the scan command from the command palette to scan individual files.'
    );

    return { metadata: { success: false } };
  }
}
