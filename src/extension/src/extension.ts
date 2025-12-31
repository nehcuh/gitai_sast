import * as vscode from 'vscode';

// Core modules
import { McpClient } from './core/McpClient';
import { SastScanner } from './core/SastScanner';
import { DiagnosticManager } from './core/DiagnosticManager';
import { initOutputLogger } from './core/OutputLogger';

// AI modules
import { AiFixProvider } from './ai/AiFixProvider';

// Commands modules
import { registerScanCommands } from './commands/scan';
import { registerAiFixCommand } from './commands/aiFix';
import { registerShowResultsCommand } from './commands/showResults';
import { registerShowDetailsCommand } from './commands/showDetails';
import { registerExplainInChatCommand } from './commands/explainInChat';
import { registerViewTaintPathCommand } from './commands/viewTaintPath';
import { registerIgnoreCommands } from './commands/ignore';
import { registerRefreshDiagnosticsCommand } from './commands/refreshDiagnostics';

// UI modules
import { FixDiffViewer } from './ui/FixDiffViewer';
import { FixExplanationPanel } from './ui/FixExplanationPanel';

// Integrations modules
import { SemgrepBridge } from './integrations/SemgrepBridge';

/**
 * Extension 激活
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('[GitAI SAST] Extension is activating...');

  // 初始化输出日志
  initOutputLogger(context);

  // 获取配置
  const config = vscode.workspace.getConfiguration('gitai.sast');
  const mcpServerPath = config.get<string>('mcpServerPath') || '';

  // 初始化核心组件
  const mcpClient = new McpClient(mcpServerPath);
  const sastScanner = new SastScanner(mcpClient);
  const diagnosticManager = new DiagnosticManager(context);
  const aiFixProvider = new AiFixProvider();

  // 初始化 Semgrep Bridge
  const semgrepBridge = new SemgrepBridge(context);

  // 注册命令
  registerScanCommands(context, sastScanner, diagnosticManager, aiFixProvider);
  registerAiFixCommand(context, aiFixProvider, mcpClient);
  registerShowResultsCommand(context, diagnosticManager);
  registerShowDetailsCommand(context);
  registerExplainInChatCommand(context);
  registerViewTaintPathCommand(context, mcpClient);
  registerIgnoreCommands(context);
  registerRefreshDiagnosticsCommand(context, sastScanner, diagnosticManager);

  // 注册 Diff 查看器和解释面板命令
  registerDiffViewerCommands(context, aiFixProvider);

  // 注册自动扫描
  registerAutoScan(context, sastScanner, diagnosticManager);

  // 尝试复用 Semgrep 插件（作为 Opengrep LSP Client）
  void semgrepBridge.maybeEnableOpengrepBackend();
  context.subscriptions.push(semgrepBridge);

  // 检查 AI 可用性（不阻塞激活）
  void aiFixProvider.checkAvailability().then((aiAvailable) => {
    if (!aiAvailable) {
      console.log('[GitAI SAST] AI not available');
    } else {
      console.log('[GitAI SAST] AI available');
    }
  });

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

  console.log('[GitAI SAST] Extension activated successfully.');
}

/**
 * Extension 停用
 */
export function deactivate() {
  console.log('[GitAI SAST] Extension is deactivating...');
  // 清理资源
  // Note: FixExplanationPanel instances are managed automatically
}

/**
 * 注册 Diff 查看器命令
 */
function registerDiffViewerCommands(
  context: vscode.ExtensionContext,
  aiFixProvider: AiFixProvider
): void {
  // View Diff 命令
  const viewDiffDisposable = vscode.commands.registerCommand(
    'gitai.sast.viewDiff',
    async (finding: any) => {
      if (!finding || !finding.uri) {
        vscode.window.showErrorMessage('No vulnerability selected for diff view');
        return;
      }

      try {
        const suggestion = await aiFixProvider.generateFix(
          finding,
          finding.code_snippet || ''
        );

        await FixDiffViewer.showFixDiff(
          finding.uri,
          finding,
          suggestion.code,
          suggestion.suggestion
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
      }
    }
  );
  context.subscriptions.push(viewDiffDisposable);

  // Show Explanation 命令
  const showExplanationDisposable = vscode.commands.registerCommand(
    'gitai.sast.showExplanation',
    async (finding: any) => {
      if (!finding || !finding.uri) {
        vscode.window.showErrorMessage('No vulnerability selected for explanation');
        return;
      }

      try {
        const suggestion = await aiFixProvider.generateFix(
          finding,
          finding.code_snippet || ''
        );

        await FixExplanationPanel.show(finding, suggestion.suggestion);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show explanation: ${error}`);
      }
    }
  );
  context.subscriptions.push(showExplanationDisposable);
}

/**
 * 注册自动扫描
 */
function registerAutoScan(
  context: vscode.ExtensionContext,
  sastScanner: SastScanner,
  diagnosticManager: DiagnosticManager
): void {
  const autoScanEnabled = vscode.workspace
    .getConfiguration('gitai.sast')
    .get<boolean>('enableAutoScan', true);

  if (!autoScanEnabled) {
    return;
  }

  const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    // 只扫描支持的文件类型
    if (!isSupportedFile(document)) {
      return;
    }

    console.log(`[GitAI SAST] Auto-scanning ${document.fileName}...`);

    try {
      const response = await sastScanner.scanFile(
        vscode.workspace.rootPath || '',
        document.uri.fsPath,
        document.getText()
      );

      diagnosticManager.updateDiagnostics(document.uri, response.findings);

      const findingCount = response.findings.length;
      if (findingCount > 0) {
        vscode.window.showInformationMessage(
          `Scan completed: ${findingCount} issue(s) found`
        );
      }
    } catch (error) {
      console.error(`[GitAI SAST] Auto-scan failed for ${document.fileName}:`, error);
    }
  });

  context.subscriptions.push(disposable);
}

/**
 * 判断是否为支持的文件类型
 */
function isSupportedFile(document: vscode.TextDocument): boolean {
  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.rs'];
  const fileName = document.fileName.toLowerCase();

  return supportedExtensions.some(ext => fileName.endsWith(ext));
}
