import * as vscode from 'vscode';

// Core modules
import { McpClient } from './core/McpClient';
import { SastScanner } from './core/SastScanner';
import { DiagnosticManager } from './core/DiagnosticManager';
import * as output from './core/OutputLogger';

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

// Chat modules
import { SastChatParticipant } from './chat';

// UI modules
import { FixDiffViewer } from './ui/FixDiffViewer';
import { FixExplanationPanel } from './ui/FixExplanationPanel';

// Integrations modules
import { OpengrepLspClient } from './integrations/OpengrepLspClient';

let mcpClient: McpClient;
let lspClient: OpengrepLspClient;

/**
 * Extension 激活
 */
export async function activate(context: vscode.ExtensionContext) {
  // 初始化 OutputLogger
  output.initOutputLogger(context);
  output.info('GitAI SAST extension activating...');

  // 获取配置
  const config = vscode.workspace.getConfiguration('gitai.sast');
  const mcpServerPath = config.get<string>('mcpServerPath') || '';

  // 初始化 MCP Client
  // 注意：McpClient 构造函数需要 serverPath
  mcpClient = new McpClient(mcpServerPath);

  // 尝试连接 MCP Server (如果路径已配置)
  if (mcpServerPath.trim()) {
    mcpClient.connect().then(
      () => output.info('[MCP] Connected to server'),
      (err) => output.error(`[MCP] Failed to connect: ${err}`)
    );
  } else {
    output.info('[MCP] Server path not configured');
  }

  // 初始化核心组件
  const sastScanner = new SastScanner(mcpClient);
  const diagnosticManager = new DiagnosticManager(context);
  const aiFixProvider = new AiFixProvider();

  const chatParticipant = new SastChatParticipant(
    aiFixProvider,
    mcpClient,
    sastScanner,
    diagnosticManager
  );

  // 初始化 Native Opengrep LSP Client
  lspClient = new OpengrepLspClient(context);

  // 监听配置变更以重启 LSP 和更新 MCP 路径
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      // Opengrep LSP 配置变更
      lspClient.handleConfigChange(e);

      // MCP Server 配置变更
      if (e.affectsConfiguration('gitai.sast.mcpServerPath')) {
        const newPath = vscode.workspace.getConfiguration('gitai.sast').get<string>('mcpServerPath') || '';
        mcpClient.updateServerPath(newPath);
        if (newPath.trim()) {
          mcpClient.connect().catch(err => output.error(`[MCP] Failed to reconnect: ${err}`));
        }
      }
    })
  );

  // 延迟启动 LSP Client 和其他组件
  setTimeout(() => {
    lspClient.start().catch(err => output.error(`Failed to start LSP: ${err}`));
  }, 1000);

  // 注册 LSP 重启命令
  context.subscriptions.push(
    vscode.commands.registerCommand('gitai.sast.restartLsp', () => {
      lspClient.restart();
    })
  );

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

  // 注册 Chat Participant
  if ((vscode as any).chat?.createChatParticipant) {
    chatParticipant.register(context);
  } else {
    output.info('[Chat] Chat API not available; skipping registration.');
  }

  // 检查 AI 可用性
  void aiFixProvider.checkAvailability().then((aiAvailable) => {
    output.info(`[AI] Fix Provider available: ${aiAvailable}`);
  });

  // 清理资源
  context.subscriptions.push({
    dispose: () => {
      void mcpClient.disconnect();
      void lspClient.stop();
    },
  });

  output.info('GitAI SAST extension activated successfully.');
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
      if (!finding || !finding.location?.file) {
        vscode.window.showErrorMessage('No vulnerability selected for explanation');
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(finding.location.file));
        const { getCodeSnippet } = require('./utils/fileUtils');
        const codeSnippet = getCodeSnippet(document, finding);

        const suggestion = await aiFixProvider.generateFix(
          finding,
          codeSnippet
        );

        await FixExplanationPanel.show(
          finding,
          suggestion.suggestion,
          suggestion.thinking,
          suggestion.code
        );
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

  let timeout: NodeJS.Timeout | undefined;

  const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    // 只扫描支持的文件类型
    if (!isSupportedFile(document)) {
      return;
    }

    // Debounce: Clear existing timer
    if (timeout) {
      clearTimeout(timeout);
    }

    // Set new timer (500ms)
    timeout = setTimeout(async () => {
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
          // Optional: Only show status bar or subtle notification instead of modal
          // vscode.window.setStatusBarMessage(`$(shield) SAST: ${findingCount} issues`, 3000);
        }
      } catch (error) {
        console.error(`[GitAI SAST] Auto-scan failed for ${document.fileName}:`, error);
      }
    }, 500);
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
