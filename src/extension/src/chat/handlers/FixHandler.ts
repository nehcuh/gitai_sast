import * as vscode from 'vscode';
import { AiFixProvider } from '../../ai/AiFixProvider';
import { Finding } from '../../core/types';
import { FixExplanationPanel } from '../../ui/FixExplanationPanel';

/**
 * Fix 命令处理器
 */
export class FixHandler {
  constructor(private aiFixProvider: AiFixProvider) {}

  /**
   * 处理 Fix 命令
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

    // 生成修复建议
    for (const finding of findings) {
      stream.progress(`Generating fix for ${finding.title}...`);

      try {
        const result = await this.aiFixProvider.generateFix(
          finding,
          finding.code_snippet || ''
        );

        // 显示修复建议
        stream.markdown(`### Fix: ${finding.title}\n\n`);
        stream.markdown(`**Rule ID:** \`${finding.rule_id}\`\n\n`);
        stream.markdown(`**Fix Code:**\n\`\`\`\n${result.code}\n\`\`\`\n\n`);
        stream.markdown(`**Suggestion:** ${result.suggestion}\n\n`);

        if (result.thinking) {
          stream.markdown(`**Reasoning:**\n\`\`\`\n${result.thinking}\n\`\`\`\n\n`);
        }

        // 同时在侧边栏显示
        await FixExplanationPanel.show(
          finding,
          result.suggestion,
          result.thinking,
          result.code
        );
      } catch (error) {
        stream.markdown(
          `❌ Failed to generate fix for ${finding.title}: ${error}\n\n`
        );
      }
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
}
