import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { FixExplanationPanel } from '../ui/FixExplanationPanel';

/**
 * 注册 Show Details 命令
 */
export function registerShowDetailsCommand(
  context: vscode.ExtensionContext
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.showDetails',
      async (uri: vscode.Uri, finding: Finding) => {
        if (!finding) {
          vscode.window.showErrorMessage('Missing vulnerability details');
          return;
        }

        // 使用 FixExplanationPanel 显示详情
        const suggestion =
          finding.description ||
          'No description available for this vulnerability.';
        const code = finding.code_snippet || '';

        await FixExplanationPanel.show(
          finding,
          suggestion,
          undefined, // thinking
          code // fixCode (使用 code_snippet 作为示例)
        );
      }
    )
  );
}
