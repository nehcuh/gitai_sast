import * as vscode from 'vscode';
import { McpClient } from '../../core/McpClient';
import { Finding } from '../../core/types';

/**
 * Taint 命令处理器
 */
export class TaintHandler {
  constructor(private mcpClient: McpClient) {}

  /**
   * 处理 Taint 命令
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

    // 仅处理远程扫描的 findings
    const remoteFindings = findings.filter(f => f.provider === 'remote');
    if (remoteFindings.length === 0) {
      stream.markdown('ℹ️ Taint paths are only available for remote scan results');
      return { metadata: { success: true } };
    }

    // 获取并显示污点路径
    for (const finding of remoteFindings) {
      stream.progress(`Fetching taint path for ${finding.title}...`);

      try {
        const taintPath = await this.getTaintPath(finding);
        stream.markdown(`### Taint Path: ${finding.title}\n\n`);
        stream.markdown(`**Rule ID:** \`${finding.rule_id}\`\n\n`);

        // 格式化显示污点路径
        const steps = taintPath.steps || [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          stream.markdown(`**Step ${i + 1}:** ${step.file}:${step.line}\n`);
          stream.markdown(`\`\`\`\n${step.code}\n\`\`\`\n`);

          if (step.annotation) {
            stream.markdown(`> ${step.annotation}\n\n`);
          }
        }

        stream.markdown('---\n');
      } catch (error) {
        stream.markdown(`❌ Failed to fetch taint path for ${finding.title}: ${error}\n\n`);
      }
    }

    return { metadata: { success: true, findingCount: remoteFindings.length } };
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
   * 获取污点路径
   */
  private async getTaintPath(finding: Finding): Promise<any> {
    // 获取工作区根目录
    const root = vscode.workspace.rootPath;
    if (!root) {
      throw new Error('No workspace folder found');
    }

    // 确保 MCP 连接
    await this.mcpClient.ensureConnected();

    // 调用 MCP get_taint_path 工具
    const response = await this.mcpClient.callTool('get_taint_path', {
      version: 1,
      root,
      finding,
    });

    if (!response || !response.taint_path) {
      throw new Error('No taint path found');
    }

    return response.taint_path;
  }
}
