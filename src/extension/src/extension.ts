import * as vscode from 'vscode';
import { McpClient } from './core/McpClient';
import { SastScanner } from './core/SastScanner';
import { DiagnosticManager } from './core/DiagnosticManager';
import { AiFixProvider } from './ai/AiFixProvider';
import { registerScanCommands } from './commands/scan';
import { registerAiFixCommand } from './commands/aiFix';
import { SemgrepBridge } from './integrations/SemgrepBridge';
import { initOutputLogger } from './core/OutputLogger';

/**
 * Extension 激活
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('[GitAI SAST] Extension is activating...');

  initOutputLogger(context);

  // 获取配置
  const config = vscode.workspace.getConfiguration('gitai.sast');
  const mcpServerPath = config.get<string>('mcpServerPath') || '';

  // 初始化 MCP Client
  const mcpClient = new McpClient(mcpServerPath);

  // 初始化核心组件
  const sastScanner = new SastScanner(mcpClient);
  const diagnosticManager = new DiagnosticManager(context);
  const aiFixProvider = new AiFixProvider();
  const semgrepBridge = new SemgrepBridge(context);

  // 注册命令
  registerScanCommands(context, sastScanner, diagnosticManager, aiFixProvider);
  registerAiFixCommand(context, aiFixProvider, mcpClient);

  // 注册自动扫描
  registerAutoScan(context, sastScanner, diagnosticManager);

  // 尝试复用 Semgrep 插件（作为 Opengrep LSP Client）
  void semgrepBridge.maybeEnableOpengrepBackend();
  context.subscriptions.push(semgrepBridge);

  // MCP Server: 配置变更时更新路径并尝试重连
  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration('gitai.sast.mcpServerPath')) {
      return;
    }

    const newPath = vscode.workspace
      .getConfiguration('gitai.sast')
      .get<string>('mcpServerPath') || '';

    mcpClient.updateServerPath(newPath);

    if (newPath.trim()) {
      void mcpClient.connect().then(
        () => console.log('[GitAI SAST] MCP Server connected'),
        (error) => console.error('[GitAI SAST] Failed to connect to MCP Server:', error)
      );
    }
  });
  context.subscriptions.push(configDisposable);

  // MCP Server: 若已配置则后台连接（不阻塞激活/命令注册）
  if (mcpServerPath.trim()) {
    void mcpClient.connect().then(
      () => console.log('[GitAI SAST] MCP Server connected'),
      (error) => console.error('[GitAI SAST] Failed to connect to MCP Server:', error)
    );
  } else {
    console.log('[GitAI SAST] MCP Server path not configured; scan commands will prompt when used.');
  }

  // 清理资源
  context.subscriptions.push({
    dispose: () => {
      void mcpClient.disconnect();
    },
  });

  // 检查 AI 可用性（不阻塞激活）
  void aiFixProvider.checkAvailability().then(
    (aiAvailable) => {
      if (!aiAvailable) {
        console.log('[GitAI SAST] AI model not available; AI fix features disabled');
      } else {
        console.log('[GitAI SAST] AI model available');
      }
    },
    (error) => {
      console.error('[GitAI SAST] Failed to check AI availability:', error);
    }
  );

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
