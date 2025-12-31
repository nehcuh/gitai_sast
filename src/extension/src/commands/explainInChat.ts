import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 注册 Explain in Chat 命令
 */
export function registerExplainInChatCommand(
  context: vscode.ExtensionContext
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.explainInChat',
      async (uri: vscode.Uri, finding: Finding) => {
        if (!uri || !finding) {
          vscode.window.showErrorMessage(
            'Missing vulnerability context for explanation'
          );
          return;
        }

        // 发送到 Copilot Chat（如果可用）
        // 构建提示
        const prompt = `@sast explain vulnerability ${finding.rule_id} in ${uri.fsPath}`;

        try {
          // 打开 Chat 窗口并输入提示
          await vscode.commands.executeCommand(
            'workbench.action.chat.open',
            prompt
          );

          vscode.window.showInformationMessage(
            'Chat opened with explanation request'
          );
        } catch (error) {
          // 如果 Chat 不可用，显示错误
          vscode.window.showErrorMessage(
            'Chat is not available. Please ensure Copilot Chat is installed.'
          );
        }
      }
    )
  );
}
