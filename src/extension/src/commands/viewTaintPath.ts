import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { McpClient } from '../core/McpClient';

/**
 * 注册 View Taint Path 命令
 */
export function registerViewTaintPathCommand(
  context: vscode.ExtensionContext,
  mcpClient: McpClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.viewTaintPath',
      async (uri: vscode.Uri, finding: Finding) => {
        if (!finding) {
          vscode.window.showErrorMessage('Missing vulnerability context');
          return;
        }

        // 检查是否是远程扫描结果
        if (finding.provider !== 'remote') {
          vscode.window.showInformationMessage(
            'Taint path is only available for remote scan results'
          );
          return;
        }

        try {
          // 获取工作区根目录
          const root = vscode.workspace.rootPath;
          if (!root) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
          }

          // 确保 MCP 连接
          await mcpClient.ensureConnected();

          // 调用 MCP get_taint_path 工具
          const response = await mcpClient.callTool('get_taint_path', {
            version: 1,
            root,
            finding,
          });

          if (!response || !response.taint_path) {
            vscode.window.showInformationMessage(
              'No taint path found for this vulnerability'
            );
            return;
          }

          // 显示污点路径
          await displayTaintPath(finding, response.taint_path);
        } catch (error) {
          console.error('[GitAI SAST] Failed to view taint path:', error);
          vscode.window.showErrorMessage(
            `Failed to view taint path: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );
}

/**
 * 污点路径
 */
export interface TaintPath {
  steps: TaintStep[];
}

/**
 * 污点步骤
 */
export interface TaintStep {
  file: string;
  line: number;
  code: string;
  annotation?: string;
  icon?: string;
}

/**
 * 显示污点路径
 */
async function displayTaintPath(
  finding: Finding,
  taintPath: TaintPath
): Promise<void> {
  // 创建 Webview 面板
  const panel = vscode.window.createWebviewPanel(
    'sast.taintPath',
    `Taint Path: ${finding.title}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // 生成 HTML
  panel.webview.html = generateTaintPathHtml(finding, taintPath);
}

/**
 * 生成污点路径 HTML
 */
function generateTaintPathHtml(
  finding: Finding,
  taintPath: TaintPath
): string {
  const stepsHtml = taintPath.steps
    .map(
      (step) => `
        <div class="step">
          <div class="step-icon">${step.icon || '📍'}</div>
          <div class="step-content">
            <div class="step-file">${escapeHtml(step.file)}</div>
            <div class="step-line">Line ${step.line}</div>
            <div class="step-code">${escapeHtml(step.code)}</div>
            ${step.annotation
              ? `<div class="step-annotation">${escapeHtml(step.annotation)}</div>`
              : ''}
          </div>
        </div>
      `
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Taint Path</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    .header {
      margin-bottom: 20px;
    }

    .header h2 {
      margin: 0 0 10px 0;
      color: var(--vscode-textLink-foreground);
    }

    .header p {
      margin: 5px 0;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .step {
      display: flex;
      gap: 15px;
      padding: 15px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 5px;
    }

    .step-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .step-content {
      flex: 1;
    }

    .step-file {
      font-weight: bold;
      margin-bottom: 5px;
    }

    .step-line {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
    }

    .step-code {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 3px;
      overflow-x: auto;
      margin-bottom: 5px;
    }

    .step-annotation {
      color: var(--vscode-textLink-foreground);
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>🔍 Taint Path Analysis</h2>
    <p><strong>Vulnerability:</strong> ${escapeHtml(finding.title)}</p>
    <p><strong>Rule ID:</strong> ${escapeHtml(finding.rule_id)}</p>
  </div>

  <div class="steps">
    ${stepsHtml}
  </div>
</body>
</html>`;
}

/**
 * 转义 HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
