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
        if (!finding || !finding.location?.file) {
          vscode.window.showErrorMessage('Missing vulnerability details');
          return;
        }

        try {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(finding.location.file));
          // Import dynamically or assume it's available via module system
          const { getCodeSnippet } = require('../utils/fileUtils');

          const code = getCodeSnippet(document, finding);
          const suggestion = finding.description || 'No description available for this vulnerability.';

          await FixExplanationPanel.show(
            finding,
            suggestion,
            undefined, // thinking
            code
          );
        } catch (e) {
          console.error('[ShowDetails] Failed to load document:', e);
          // Fallback if file cannot be opened
          await FixExplanationPanel.show(
            finding,
            finding.description || '',
            undefined,
            finding.code_snippet || ''
          );
        }
      }
    )
  );
}
