import * as vscode from 'vscode';
import { DiagnosticManager } from '../core/DiagnosticManager';
import { ResultsWebviewPanel } from '../webview';
import * as output from '../core/OutputLogger';

/**
 * 注册显示结果命令
 */
export function registerShowResultsCommand(
  context: vscode.ExtensionContext,
  diagnostics: DiagnosticManager
) {
  const disposable = vscode.commands.registerCommand(
    'gitai.sast.showResults',
    async () => {
      // 获取所有诊断
      const allFindings = diagnostics.getAllFindings();
      output.info(`[ShowResults] Found ${allFindings.length} findings to show.`);

      if (allFindings.length === 0) {
        vscode.window.showInformationMessage(
          'No security findings. Run a scan to detect vulnerabilities.'
        );
        return;
      }

      // 显示结果面板
      ResultsWebviewPanel.createOrShow(context.extensionUri, allFindings);
    }
  );

  context.subscriptions.push(disposable);

  // 监听诊断变化，更新面板
  diagnostics.onDidChangeDiagnostics((findings) => {
    ResultsWebviewPanel.getCurrentPanel()?.updateContent(findings);
  });
}
