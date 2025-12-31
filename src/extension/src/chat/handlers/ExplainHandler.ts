import * as vscode from 'vscode';
import { AiFixProvider } from '../../ai/AiFixProvider';
import { Finding } from '../../core/types';

/**
 * Explain 命令处理器
 */
export class ExplainHandler {
  constructor(private aiFixProvider: AiFixProvider) {}

  /**
   * 处理 Explain 命令
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

    // 获取当前文件的漏洞信息
    const findings = await this.getFindings(uri);
    if (findings.length === 0) {
      stream.markdown('✅ No vulnerabilities found in this file');
      return { metadata: { success: true } };
    }

    // 生成详细解释
    for (const finding of findings) {
      stream.progress('Analyzing vulnerability...');

      const explanation = await this.generateExplanation(finding, stream);
      stream.markdown(explanation);
      stream.markdown('---\n');
    }

    return { metadata: { success: true, findingCount: findings.length } };
  }

  /**
   * 获取 Findings
   */
  private async getFindings(uri: vscode.Uri): Promise<Finding[]> {
    // TODO: 从 DiagnosticManager 获取 findings
    // 暂时返回空列表
    return [];
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
