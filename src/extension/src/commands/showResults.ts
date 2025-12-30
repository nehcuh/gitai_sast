import * as vscode from 'vscode';
import { DiagnosticManager } from '../core/DiagnosticManager';

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
      // TODO: 实现结果面板
      vscode.window.showInformationMessage('Results panel coming soon!');
    }
  );

  context.subscriptions.push(disposable);
}
