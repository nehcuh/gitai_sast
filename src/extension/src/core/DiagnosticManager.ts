import * as vscode from 'vscode';
import { Finding, SastDiagnostic } from './types';

/**
 * 诊断管理器 - 管理扫描发现的 Diagnostics
 */
export class DiagnosticManager {
  private diagnostics = vscode.languages.createDiagnosticCollection('SAST');
  private currentFindings = new Map<string, Finding[]>();

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
      new vscode.Position(finding.location.line - 1, finding.location.column || 100)
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      finding.title,
      this.toSeverity(finding.severity)
    );

    diagnostic.source = 'SAST';
    diagnostic.code = finding.rule_id;
    diagnostic.message = `${finding.description}\n\nSeverity: ${finding.severity}\nProvider: ${finding.provider}`;

    // 添加 code actions
    diagnostic.relatedInformation = [];

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
}
