import * as vscode from 'vscode';
import { McpClient } from './core/McpClient';
import { SastScanner } from './core/SastScanner';
import { DiagnosticManager } from './core/DiagnosticManager';
import { registerScanCommands } from './commands/scan';

/**
 * Extension 激活
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('[GitAI SAST] Extension is activating...');

  // 获取配置
  const config = vscode.workspace.getConfiguration('gitai.sast');
  const mcpServerPath = config.get<string>('mcpServerPath') || '';

  // 初始化 MCP Client
  const mcpClient = new McpClient(mcpServerPath);
  
  try {
    await mcpClient.connect();
    console.log('[GitAI SAST] MCP Server connected');
  } catch (error) {
    console.error('[GitAI SAST] Failed to connect to MCP Server:', error);
    vscode.window.showErrorMessage('Failed to connect to MCP Server');
    return;
  }

  // 初始化核心组件
  const sastScanner = new SastScanner(mcpClient);
  const diagnosticManager = new DiagnosticManager();

  // 注册命令
  registerScanCommands(context, sastScanner, diagnosticManager);

  // 注册自动扫描
  registerAutoScan(context, sastScanner, diagnosticManager);

  console.log('[GitAI SAST] Extension activated');
}

/**
 * Extension 停用
 */
export function deactivate() {
  console.log('[GitAI SAST] Extension is deactivating...');
  // TODO: 清理资源
}

/**
 * 注册自动扫描
 */
function registerAutoScan(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager
) {
  const autoScanEnabled = vscode.workspace.getConfiguration('gitai.sast')
    .get<boolean>('enableAutoScan', true);

  if (!autoScanEnabled) {
    return;
  }

  // 监听文件保存事件
  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const uri = document.uri.toString();
    
    // 只扫描支持的文件类型
    if (!isSupportedFile(document)) {
      return;
    }

    console.log(`[GitAI SAST] Auto-scanning file: ${uri}`);

    try {
      const response = await scanner.scanFile(
        vscode.workspace.rootPath || '',
        document.uri.fsPath,
        document.getText()
      );

      diagnostics.updateDiagnostics(document.uri, response.findings);

      const findingCount = response.findings.length;
      if (findingCount > 0) {
        vscode.window.showInformationMessage(
          `Scan completed: ${findingCount} issue(s) found`
        );
      }
    } catch (error) {
      console.error('[GitAI SAST] Auto scan failed:', error);
    }
  });

  context.subscriptions.push(saveDisposable);
}

/**
 * 判断是否为支持的文件类型
 */
function isSupportedFile(document: vscode.TextDocument): boolean {
  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.rs'];
  const fileName = document.fileName.toLowerCase();
  
  return supportedExtensions.some(ext => fileName.endsWith(ext));
}
