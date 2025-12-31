import * as vscode from 'vscode';
import { Finding, SastDiagnostic } from './types';

/**
 * 诊断管理器 - 管理扫描发现的 Diagnostics
 */
export class DiagnosticManager {
  private diagnostics = vscode.languages.createDiagnosticCollection('SAST');
  private currentFindings = new Map<string, Finding[]>();
  private diagnosticToFinding = new WeakMap<vscode.Diagnostic, Finding>();
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
  updateDiagnostics(uri: vscode.Uri, findings: Finding[] | undefined): void {
    const safeFindings = Array.isArray(findings) ? findings : [];
    const vscodeDiagnostics = safeFindings.map(finding => this.toVsCodeDiagnostic(uri, finding));
    
    this.diagnostics.set(uri, vscodeDiagnostics);
    this.currentFindings.set(uri.toString(), safeFindings);
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

    this.diagnosticToFinding.set(diagnostic, finding);
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

  /**
   * 从 Diagnostic 获取对应 Finding（用于 CodeAction）
   */
  getFindingFromDiagnostic(uri: vscode.Uri, diagnostic: vscode.Diagnostic): Finding | undefined {
    const direct = this.diagnosticToFinding.get(diagnostic);
    if (direct) {
      return direct;
    }

    const source = (diagnostic.source || '').trim().toLowerCase();
    if (source === 'semgrep') {
      return this.toFindingFromExternalDiagnostic(uri, diagnostic, 'semgrep');
    }

    const code = diagnostic.code;
    const ruleId = typeof code === 'string' ? code : undefined;
    const line = diagnostic.range.start.line + 1;
    const column = diagnostic.range.start.character;

    const findings = this.getFindings(uri);
    if (!ruleId) {
      return findings.find(f => f.location.line === line) || undefined;
    }

    return (
      findings.find(f => f.rule_id === ruleId && f.location.line === line && (f.location.column || 0) === column) ||
      findings.find(f => f.rule_id === ruleId && f.location.line === line) ||
      findings.find(f => f.location.line === line) ||
      undefined
    );
  }

  private toFindingFromExternalDiagnostic(
    uri: vscode.Uri,
    diagnostic: vscode.Diagnostic,
    provider: string
  ): Finding {
    const ruleId = extractRuleId(diagnostic.code) || provider;

    const line = diagnostic.range.start.line + 1;
    const column = diagnostic.range.start.character;

    const title = (diagnostic.message || '').split('\n')[0].trim() || ruleId;

    return {
      id: `${provider}:${ruleId}:${uri.fsPath}:${line}:${column}`,
      rule_id: ruleId,
      type: 'security',
      severity: mapVsCodeSeverityToSastSeverity(diagnostic.severity),
      title,
      description: diagnostic.message || '',
      location: {
        file: uri.fsPath,
        line,
        column,
      },
      code_snippet: '',
      fix: undefined,
      provider,
    };
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

    // 为 GitAI(SAST) 以及 Semgrep 复用的 Diagnostics 提供 AI 修复
    const supportedDiagnostics = context.diagnostics.filter(d => isSupportedDiagnosticSource(d.source));
    
    for (const diagnostic of supportedDiagnostics) {
      const finding = this.diagnosticManager.getFindingFromDiagnostic(document.uri, diagnostic);
      if (!finding) {
        continue;
      }

      const aiFixAction = new vscode.CodeAction(
        `AI Fix: ${finding.title}`,
        vscode.CodeActionKind.QuickFix
      );
      aiFixAction.diagnostics = [diagnostic];
      aiFixAction.isPreferred = actions.length === 0;
      aiFixAction.command = {
        command: 'gitai.sast.aiFix',
        title: 'AI Fix',
        arguments: [document.uri, finding],
      };
      actions.push(aiFixAction);
    }

    return actions;
  }
}

function isSupportedDiagnosticSource(source: string | undefined): boolean {
  const normalized = (source || '').trim().toLowerCase();
  return normalized === 'sast' || normalized === 'semgrep';
}

function extractRuleId(code: vscode.Diagnostic['code']): string | undefined {
  if (!code) {
    return undefined;
  }

  if (typeof code === 'string') {
    return code.trim() || undefined;
  }

  if (typeof code === 'number') {
    return String(code);
  }

  if (typeof code === 'object') {
    const maybeValue = (code as any).value;
    if (typeof maybeValue === 'string' && maybeValue.trim()) {
      return maybeValue.trim();
    }
  }

  return undefined;
}

function mapVsCodeSeverityToSastSeverity(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'high';
    case vscode.DiagnosticSeverity.Warning:
      return 'medium';
    case vscode.DiagnosticSeverity.Information:
    case vscode.DiagnosticSeverity.Hint:
      return 'low';
    default:
      return 'medium';
  }
}
