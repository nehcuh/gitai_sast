import * as vscode from 'vscode';
import { Finding, SastDiagnostic } from './types';

/**
 * 诊断管理器 - 管理扫描发现的 Diagnostics
 */
export class DiagnosticManager {
  private diagnostics = vscode.languages.createDiagnosticCollection('SAST');
  private currentFindings = new Map<string, Finding[]>();
  private codeActionProvider: SastCodeActionProvider | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.codeActionProvider = new SastCodeActionProvider(this);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        this.codeActionProvider
      )
    );
  }

  /**
   * 更新 Diagnostics
   */
  updateDiagnostics(uri: vscode.Uri, findings: Finding[]): void {
    const vscodeDiagnostics = findings.map(finding => this.toVsCodeDiagnostic(uri, finding));
    
    this.diagnostics.set(uri, vscodeDiagnostics);
    this.currentFindings.set(uri.toString(), findings);
  }

  /**
   * 获取指定文件的 Findings
   */
  getFindings(uri: vscode.Uri): Finding[] {
    return this.currentFindings.get(uri.toString()) || [];
  }

  /**
   * 清除所有 Diagnostics
   */
  clearAll(): void {
    this.diagnostics.clear();
    this.currentFindings.clear();
  }

  /**
   * 清除指定文件的 Diagnostics
   */
  clear(uri: vscode.Uri): void {
    this.diagnostics.delete(uri);
    this.currentFindings.delete(uri.toString());
  }

  /**
   * 转换为 VSCode Diagnostic
   */
  private toVsCodeDiagnostic(uri: vscode.Uri, finding: Finding): vscode.Diagnostic {
    const range = new vscode.Range(
      new vscode.Position(finding.location.line - 1, finding.location.column || 0),
      new vscode.Position(finding.location.line - 1, (finding.location.column || 0) + 100)
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      finding.title,
      this.toSeverity(finding.severity)
    );

    diagnostic.source = 'SAST';
    diagnostic.code = finding.rule_id;
    diagnostic.message = `${finding.description}\n\nSeverity: ${finding.severity}\nProvider: ${finding.provider}`;

    return diagnostic;
  }

  /**
   * 转换严重级别
   */
  private toSeverity(severity: string): vscode.DiagnosticSeverity {
    const severityMap: Record<string, vscode.DiagnosticSeverity> = {
      'low': vscode.DiagnosticSeverity.Hint,
      'medium': vscode.DiagnosticSeverity.Warning,
      'high': vscode.DiagnosticSeverity.Error,
      'critical': vscode.DiagnosticSeverity.Error,
    };

    return severityMap[severity] || vscode.DiagnosticSeverity.Warning;
  }

  /**
   * 获取 Code Action 提供者
   */
  getCodeActionProvider(): SastCodeActionProvider | null {
    return this.codeActionProvider;
  }
}

/**
 * SAST Code Action 提供者
 */
class SastCodeActionProvider implements vscode.CodeActionProvider {
  private onDidChangeCodeActionsEmitter = new vscode.EventEmitter<vscode.CodeAction[]>();

  onDidChangeCodeActions = this.onDidChangeCodeActionsEmitter.event;

  constructor(private diagnosticManager: DiagnosticManager) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    // 只为 SAST Diagnostics 提供 AI 修复
    const sastDiagnostics = context.diagnostics.filter(d => d.source === 'SAST');
    
    if (sastDiagnostics.length > 0) {
      // TODO: 实现 AI 修复功能
      const aiFixAction = new vscode.CodeAction(
        'AI Fix (Coming soon)',
        vscode.CodeActionKind.QuickFix
      );
      aiFixAction.diagnostics = sastDiagnostics;
      aiFixAction.isPreferred = true;
      actions.push(aiFixAction);
    }

    return actions;
  }
}
