import * as vscode from 'vscode';
import { SastScanner } from '../core/SastScanner';
import { DiagnosticManager } from '../core/DiagnosticManager';
import { IgnoreManager } from '../codeactions/IgnoreManager';

/**
 * 注册刷新诊断信息命令
 */
export function registerRefreshDiagnosticsCommand(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.refreshDiagnostics',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage(
            'No active file to refresh diagnostics'
          );
          return;
        }

        const uri = editor.document.uri;
        const document = editor.document;

        // 显示进度
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing diagnostics...',
            cancellable: false,
          },
          async () => {
            try {
              // 扫描当前文件
              const response = await scanner.scanFile(
                vscode.workspace.rootPath || '',
                uri.fsPath,
                document.getText()
              );

              // 过滤忽略的 findings
              const filteredFindings = response.findings.filter(
                (finding) => !IgnoreManager.shouldIgnore(uri, finding)
              );

              // 更新诊断信息
              diagnostics.updateDiagnostics(uri, filteredFindings);

              // 显示通知
              const findingCount = filteredFindings.length;
              if (findingCount > 0) {
                vscode.window.showWarningMessage(
                  `Refreshed diagnostics: ${findingCount} issue(s) found`
                );
              } else {
                vscode.window.showInformationMessage(
                  'Refreshed diagnostics: No issues found'
                );
              }
            } catch (error) {
              console.error(
                '[GitAI SAST] Failed to refresh diagnostics:',
                error
              );
              vscode.window.showErrorMessage(
                `Failed to refresh diagnostics: ${
                  error instanceof Error
                    ? error.message
                    : String(error)
                }`
              );
            }
          }
        );
      }
    )
  );

  // 注册刷新所有诊断信息命令（工作区）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.refreshAllDiagnostics',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage(
            'No active file to refresh diagnostics'
          );
          return;
        }

        // 询问用户确认
        const selection = await vscode.window.showWarningMessage(
          'Refresh diagnostics for all files in workspace? This may take a while.',
          'Refresh All',
          'Cancel'
        );

        if (selection !== 'Refresh All') {
          return;
        }

        // 显示进度
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing all diagnostics...',
            cancellable: true,
          },
          async (progress, token) => {
            try {
              // TODO: 实现工作区级别的扫描
              // 暂时仅显示提示
              vscode.window.showInformationMessage(
                'Workspace-level refresh is not yet implemented. Please refresh individual files.'
              );
            } catch (error) {
              console.error(
                '[GitAI SAST] Failed to refresh all diagnostics:',
                error
              );
              vscode.window.showErrorMessage(
                `Failed to refresh all diagnostics: ${
                  error instanceof Error
                    ? error.message
                    : String(error)
                }`
              );
            }
          }
        );
      }
    )
  );
}
