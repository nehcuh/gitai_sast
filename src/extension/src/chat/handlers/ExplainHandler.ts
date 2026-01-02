import * as vscode from 'vscode';
import { AiFixProvider } from '../../ai/AiFixProvider';
import { Finding } from '../../core/types';
import { DiagnosticManager } from '../../core/DiagnosticManager';

/**
 * Explain 命令处理器
 */
export class ExplainHandler {
  constructor(
    private aiFixProvider: AiFixProvider,
    private diagnostics: DiagnosticManager
  ) { }

  /**
   * 处理 Explain 命令
   */
  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    let uri: vscode.Uri | undefined;
    let targetRuleId: string | undefined;

    // 1. 尝试从 prompt 中解析 "vulnerability <ruleId> in <filePath>"
    // Regex matches: "vulnerability <id> in <path>"
    const match = request.prompt.match(/vulnerability\s+([^\s]+)\s+in\s+(.+)/i);
    if (match) {
      targetRuleId = match[1];
      const filePath = match[2].trim();
      try {
        uri = vscode.Uri.file(filePath);
      } catch (e) {
        stream.markdown(`⚠️ Invalid file path provided: ${filePath}\n\n`);
      }
    }

    // 2. 如果没有解析出 URI，回退到 activeTextEditor
    if (!uri) {
      uri = vscode.window.activeTextEditor?.document.uri;
    }

    if (!uri) {
      stream.markdown('❌ No active file selected and no file path provided in prompt.');
      return { metadata: { success: false } };
    }

    // 获取当前文件的漏洞信息
    const findings = await this.getFindings(uri);

    // 如果指定了 Rule ID，进行过滤
    const filteredFindings = targetRuleId
      ? findings.filter(f => f.rule_id === targetRuleId)
      : findings;

    if (filteredFindings.length === 0) {
      if (findings.length > 0) {
        stream.markdown(`✅ Vulnerability \`${targetRuleId}\` not found in ${uri.fsPath}, but other ${findings.length} findings exist.`);
      } else {
        stream.markdown(`✅ No vulnerabilities found in ${uri.fsPath}`);
      }
      return { metadata: { success: true } };
    }

    // 生成详细解释
    for (const finding of filteredFindings) {
      stream.progress('Analyzing vulnerability...');

      const explanation = await this.generateExplanation(finding, stream);
      stream.markdown(explanation);
      stream.markdown('---\n');
    }

    return { metadata: { success: true, findingCount: filteredFindings.length } };
  }

  /**
   * 获取 Findings
   */
  private async getFindings(uri: vscode.Uri): Promise<Finding[]> {
    return this.diagnostics.getFindings(uri);
  }

  /**
   * 生成解释
   */
  private async generateExplanation(
    finding: Finding,
    stream: vscode.ChatResponseStream
  ): Promise<string> {
    // TODO: 使用 AI 生成详细解释
    // 暂时返回基本描述
    return `### ${finding.title}\n\n**Rule ID:** \`${finding.rule_id}\`\n\n**Severity:** ${finding.severity}\n\n**Description:** ${finding.description}\n\n**Code Snippet:**\n\`\`\`${finding.code_snippet}\n\`\`\``;
  }
}
