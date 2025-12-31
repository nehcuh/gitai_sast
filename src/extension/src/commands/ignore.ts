import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { IgnoreManager } from '../codeactions/IgnoreManager';

/**
 * 注册 Ignore 命令
 */
export function registerIgnoreCommands(context: vscode.ExtensionContext) {
  // Ignore this occurrence
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.ignoreOccurrence',
      async (uri: vscode.Uri, finding: Finding) => {
        if (!uri || !finding) {
          vscode.window.showErrorMessage(
            'Missing vulnerability context for ignoring'
          );
          return;
        }

        try {
          await IgnoreManager.addOccurrence(uri, finding);

          // 更新诊断信息（需要实现）
          await vscode.commands.executeCommand(
            'gitai.sast.refreshDiagnostics'
          );

          vscode.window.showInformationMessage(
            'Ignored this occurrence'
          );
        } catch (error) {
          console.error('[GitAI SAST] Failed to ignore occurrence:', error);
          vscode.window.showErrorMessage(
            `Failed to ignore occurrence: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  // Ignore rule in file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.ignoreInFile',
      async (uri: vscode.Uri, finding: Finding) => {
        if (!uri || !finding) {
          vscode.window.showErrorMessage(
            'Missing vulnerability context for ignoring'
          );
          return;
        }

        try {
          await IgnoreManager.addRuleInFile(uri, finding.rule_id);

          // 更新诊断信息（需要实现）
          await vscode.commands.executeCommand(
            'gitai.sast.refreshDiagnostics'
          );

          vscode.window.showInformationMessage(
            `Ignored rule ${finding.rule_id} in this file`
          );
        } catch (error) {
          console.error('[GitAI SAST] Failed to ignore in file:', error);
          vscode.window.showErrorMessage(
            `Failed to ignore in file: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  // Ignore rule globally
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.ignoreGlobally',
      async (finding: Finding) => {
        if (!finding) {
          vscode.window.showErrorMessage(
            'Missing vulnerability context for ignoring'
          );
          return;
        }

        try {
          await IgnoreManager.addGlobalRule(finding.rule_id);

          // 更新诊断信息（需要实现）
          await vscode.commands.executeCommand(
            'gitai.sast.refreshDiagnostics'
          );

          vscode.window.showInformationMessage(
            `Ignored rule ${finding.rule_id} globally`
          );
        } catch (error) {
          console.error('[GitAI SAST] Failed to ignore globally:', error);
          vscode.window.showErrorMessage(
            `Failed to ignore globally: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );
}
