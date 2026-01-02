import * as vscode from 'vscode';
import { SastScanner } from '../../core/SastScanner';
import { DiagnosticManager } from '../../core/DiagnosticManager';
import { Finding } from '../../core/types';

/**
 * Scan 命令处理器
 */
export class ScanHandler {
  constructor(
    private scanner: SastScanner,
    private diagnostics: DiagnosticManager
  ) {}

  /**
   * 处理 Scan 命令
   */
  async handle(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();

    // 检查是否需要扫描工作区
    if (prompt.includes('workspace') || prompt.includes('all files')) {
      return await this.scanWorkspace(stream, token);
    }

    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      stream.markdown('❌ No active file selected');
      return { metadata: { success: false } };
    }

    return await this.scanFile(uri, stream);
  }

  /**
   * 扫描当前文件
   */
  private async scanFile(
    uri: vscode.Uri,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      stream.markdown('❌ No active editor');
      return { metadata: { success: false } };
    }

    const document = editor.document;

    stream.progress('Scanning current file...');

    try {
      // 执行扫描
      const response = await this.scanner.scanFile(
        vscode.workspace.rootPath || '',
        uri.fsPath,
        document.getText()
      );

      // 更新诊断信息
      this.diagnostics.updateDiagnostics(uri, response.findings);

      // 显示结果
      const findingCount = response.findings.length;
      if (findingCount === 0) {
        stream.markdown('✅ No vulnerabilities found in current file');
      } else {
        stream.markdown(`🔍 Scan completed: ${findingCount} issue(s) found\n\n`);

        // 显示漏洞列表
        for (const finding of response.findings) {
          stream.markdown(`### ${finding.title}\n\n`);
          stream.markdown(`- **Rule ID:** \`${finding.rule_id}\`\n`);
          stream.markdown(`- **Severity:** ${finding.severity}\n`);
          stream.markdown(`- **Line:** ${finding.location.line}\n`);
          stream.markdown(`- **Description:** ${finding.description}\n\n`);
        }
      }

      return { metadata: { success: true, findingCount } };
    } catch (error) {
      stream.markdown(`❌ Scan failed: ${error}`);
      return { metadata: { success: false } };
    }
  }

  /**
   * 扫描工作区
   */
  private async scanWorkspace(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    stream.progress('Scanning workspace...');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      stream.markdown('❌ No workspace folder found');
      return { metadata: { success: false } };
    }

    if (token.isCancellationRequested) {
      stream.markdown('⚠️ Workspace scan cancelled');
      return { metadata: { success: false, cancelled: true } };
    }

    try {
      stream.progress('Collecting workspace files...');
      const files = await this.collectWorkspaceFiles(token);
      const fileCount = Object.keys(files).length;

      if (fileCount === 0) {
        stream.markdown('ℹ️ No supported files found in workspace');
        return { metadata: { success: true, findingCount: 0, fileCount } };
      }

      if (token.isCancellationRequested) {
        stream.markdown('⚠️ Workspace scan cancelled');
        return { metadata: { success: false, cancelled: true } };
      }

      stream.progress(`Scanning ${fileCount} files...`);
      const response = await this.scanner.scanWorkspace(
        workspaceFolder.uri.fsPath,
        files
      );

      const findings = Array.isArray(response?.findings)
        ? response.findings
        : [];

      // 更新诊断信息
      this.diagnostics.clearAll();
      const findingsByFile = groupFindingsByFile(findings);
      for (const [filePath, fileFindings] of findingsByFile) {
        this.diagnostics.updateDiagnostics(
          vscode.Uri.file(filePath),
          fileFindings
        );
      }

      // 显示结果
      const findingCount = findings.length;
      if (findingCount === 0) {
        stream.markdown('✅ No vulnerabilities found in workspace');
      } else {
        stream.markdown(
          `🔍 Workspace scan completed: ${findingCount} issue(s) found in ${findingsByFile.size} file(s)\n\n`
        );

        const maxToShow = 20;
        for (const finding of findings.slice(0, maxToShow)) {
          stream.markdown(`### ${finding.title}\n\n`);
          stream.markdown(`- **Rule ID:** \`${finding.rule_id}\`\n`);
          stream.markdown(`- **Severity:** ${finding.severity}\n`);
          stream.markdown(`- **File:** \`${finding.location.file}\`\n`);
          stream.markdown(`- **Line:** ${finding.location.line}\n`);
          stream.markdown(`- **Description:** ${finding.description}\n\n`);
        }

        if (findingCount > maxToShow) {
          stream.markdown(`…and ${findingCount - maxToShow} more.\n`);
        }
      }

      return { metadata: { success: true, findingCount, fileCount } };
    } catch (error) {
      stream.markdown(`❌ Workspace scan failed: ${error}`);
      return { metadata: { success: false } };
    }

  }

  private async collectWorkspaceFiles(
    token: vscode.CancellationToken
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const supportedExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.rs',
    ];

    const fileUris = await vscode.workspace.findFiles(
      '**/*',
      '**/node_modules/**',
      1000
    );

    for (const uri of fileUris) {
      if (token.isCancellationRequested) {
        break;
      }

      const fileName = uri.fsPath.toLowerCase();
      if (!supportedExtensions.some((ext) => fileName.endsWith(ext))) {
        continue;
      }

      try {
        const content = await vscode.workspace.fs.readFile(uri);
        files[uri.fsPath] = Buffer.from(content).toString('utf-8');
      } catch {
        // Best-effort file read; skip unreadable files.
      }
    }

    return files;
  }
}

function groupFindingsByFile(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();

  for (const finding of findings) {
    const file = finding?.location?.file;
    if (!file) {
      continue;
    }

    const current = map.get(file);
    if (current) {
      current.push(finding);
    } else {
      map.set(file, [finding]);
    }
  }

  return map;
}
