import * as vscode from 'vscode';
import { SastScanner } from '../core/SastScanner';
import { DiagnosticManager } from '../core/DiagnosticManager';
import { AiFixProvider } from '../ai/AiFixProvider';
import { registerShowResultsCommand } from './showResults';

/**
 * 注册扫描相关命令
 */
export function registerScanCommands(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager,
  aiFixProvider?: AiFixProvider
) {
  // 注册扫描当前文件命令
  const scanFileDisposable = vscode.commands.registerCommand(
    'gitai.sast.scan',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active text editor');
        return;
      }

      const document = editor.document;
      const uri = document.uri;

      if (!isSupportedFile(document)) {
        vscode.window.showInformationMessage('File type not supported for SAST');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'Scanning for security vulnerabilities...',
          cancellable: true,
        },
        async (progress, token) => {
          if (token.isCancellationRequested) {
            return;
          }

          try {
            const response = await scanner.scanFile(
              vscode.workspace.rootPath || '',
              uri.fsPath,
              document.getText()
            );

            diagnostics.updateDiagnostics(uri, response.findings);

            const findingCount = response.findings.length;
            if (findingCount > 0) {
              vscode.window.showInformationMessage(
                `Scan completed: ${findingCount} issue(s) found`
              );
            } else {
              vscode.window.showInformationMessage('No security issues found');
            }
          } catch (error) {
            vscode.window.showErrorMessage(`Scan failed: ${error}`);
          }
        }
      );
    }
  );

  // 注册扫描工作区命令
  const scanWorkspaceDisposable = vscode.commands.registerCommand(
    'gitai.sast.scanWorkspace',
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace folder found');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'Scanning workspace for security vulnerabilities...',
          cancellable: true,
        },
        async (progress, token) => {
          if (token.isCancellationRequested) {
            return;
          }

          try {
            // 收集所有支持的文件
            const files = await collectWorkspaceFiles(workspaceFolder.uri);
            const fileCount = Object.keys(files).length;
            
            if (fileCount === 0) {
              vscode.window.showInformationMessage('No supported files found');
              return;
            }

            progress.report({ 
              increment: 0,
              message: `Scanning ${fileCount} files...` 
            });

            const response = await scanner.scanWorkspace(
              workspaceFolder.uri.fsPath,
              files
            );

            // 更新每个文件的 diagnostics
            diagnostics.clearAll();
            for (const finding of response.findings) {
              const uri = vscode.Uri.file(finding.location.file);
              const existingFindings = diagnostics.getFindings(uri);
              diagnostics.updateDiagnostics(uri, [...existingFindings, finding]);
            }

            const findingCount = response.findings.length;
            if (findingCount > 0) {
              vscode.window.showInformationMessage(
                `Workspace scan completed: ${findingCount} issue(s) found`
              );
            } else {
              vscode.window.showInformationMessage('No security issues found');
            }
          } catch (error) {
            vscode.window.showErrorMessage(`Workspace scan failed: ${error}`);
          }
        }
      );
    }
  );

  // 注册显示结果命令
  registerShowResultsCommand(context, diagnostics);

  context.subscriptions.push(
    scanFileDisposable,
    scanWorkspaceDisposable
  );
}

/**
 * 收集工作区文件
 */
async function collectWorkspaceFiles(rootUri: vscode.Uri): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.rs'];

  // 查找所有支持的文件
  const fileUris = await vscode.workspace.findFiles(
    '**/*',
    '**/node_modules/**',
    1000 // 最大文件数
  );

  for (const uri of fileUris) {
    const fileName = uri.fsPath.toLowerCase();
    if (supportedExtensions.some(ext => fileName.endsWith(ext))) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        files[uri.fsPath] = Buffer.from(content).toString('utf-8');
      } catch (error) {
        console.error(`Failed to read file ${uri.fsPath}:`, error);
      }
    }
  }

  return files;
}

/**
 * 判断是否为支持的文件类型
 */
function isSupportedFile(document: vscode.TextDocument): boolean {
  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.rs'];
  const fileName = document.fileName.toLowerCase();
  
  return supportedExtensions.some(ext => fileName.endsWith(ext));
}
