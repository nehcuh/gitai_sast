import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { McpClient } from '../core/McpClient';
import * as fs from 'fs';
import * as path from 'path';

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

          // 补充代码片段 (因为 MCP 可能只返回路径)
          if (response.taint_path.steps) {
            for (const step of response.taint_path.steps) {
              if (step.file) {
                try {
                  // Normalize path and create URI
                  let fileUri = vscode.Uri.file(step.file);

                  // Check if file exists first to avoid unnecessary errors
                  if (!fs.existsSync(fileUri.fsPath)) {
                    // Start of fallback logic
                    if (path.basename(step.file) === path.basename(finding.location.file)) {
                      const potentialPath = vscode.Uri.file(finding.location.file);
                      if (fs.existsSync(potentialPath.fsPath)) {
                        step.file = finding.location.file;
                        fileUri = potentialPath;
                      }
                    }
                  }

                  if (fs.existsSync(fileUri.fsPath)) {
                    const doc = await vscode.workspace.openTextDocument(fileUri);
                    const line = Math.max(0, step.line - 1);
                    const range = new vscode.Range(
                      Math.max(0, line - 2), 0,
                      Math.min(doc.lineCount - 1, line + 3), 0
                    );
                    step.code = doc.getText(range).trim();
                  } else {
                    step.code = `// File not found: ${step.file}`;
                  }
                } catch (e: any) {
                  console.warn(`Failed to read code for ${step.file}: ${e.message}`);
                  step.code = `// Code not available: ${e.message}`;
                }
              }
            }
          }

          // 显示污点路径
          await displayTaintPath(finding, response.taint_path);
        } catch (error) {
          console.error('[GitAI SAST] Failed to view taint path:', error);
          vscode.window.showErrorMessage(
            `Failed to view taint path: ${error instanceof Error ? error.message : String(error)
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

  // 处理 Webview 消息 (跳转)
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'openFile':
          try {
            const uri = vscode.Uri.file(message.file);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

            const line = Math.max(0, message.line - 1);
            const range = new vscode.Range(line, 0, line, 0);

            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to open file: ${e.message}`);
          }
          return;
      }
    },
    undefined,
    []
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
      (step, index) => `
        <div class="step" onclick="openFile('${escapeHtml(step.file)}', ${step.line})">
          <div class="step-icon">${step.icon || '📍'}</div>
          <div class="step-content">
            <div class="step-header">
                <span class="step-file">${escapeHtml(step.file)}</span>
                <span class="step-line">Line ${step.line}</span>
            </div>
            
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
      cursor: pointer;
      transition: background 0.2s;
      border: 1px solid transparent;
    }

    .step:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }

    .step-icon {
      font-size: 24px;
      flex-shrink: 0;
      padding-top: 5px;
    }

    .step-content {
      flex: 1;
      overflow: hidden;
    }
    
    .step-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .step-file {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
      word-break: break-all;
    }

    .step-line {
      color: var(--vscode-descriptionForeground);
      margin-left: 10px;
      flex-shrink: 0;
    }

    .step-code {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 3px;
      overflow-x: auto;
      margin-bottom: 8px;
      font-family: var(--vscode-editor-font-family);
      white-space: pre-wrap;
    }

    .step-annotation {
      color: var(--vscode-textLink-foreground);
      font-style: italic;
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding-left: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>🔍 Taint Path Analysis</h2>
    <p><strong>Vulnerability:</strong> ${escapeHtml(finding.title)}</p>
    <p><strong>Rule ID:</strong> ${escapeHtml(finding.rule_id)}</p>
    <p><small style="color: var(--vscode-descriptionForeground)">Click on any step to jump to code.</small></p>
  </div>

  <div class="steps">
    ${stepsHtml}
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function openFile(file, line) {
        vscode.postMessage({
            command: 'openFile',
            file: file,
            line: line
        });
    }
  </script>
</body>
</html>`;
}

/**
 * 转义 HTML
 */
function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
