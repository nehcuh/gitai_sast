import * as vscode from 'vscode';
import { Finding, SastDiagnostic } from './types';
import { EnhancedCodeActionProvider } from '../codeactions/EnhancedCodeActionProvider';
import * as output from '../core/OutputLogger';

/**
 * 诊断管理器 - 管理扫描发现的 Diagnostics
 */
export class DiagnosticManager {
  private diagnostics = vscode.languages.createDiagnosticCollection('SAST');
  private currentFindings = new Map<string, Finding[]>();
  private diagnosticToFinding = new WeakMap<vscode.Diagnostic, Finding>();
  private codeActionProvider: vscode.CodeActionProvider | null = null;
  private onDidChangeDiagnosticsEmitter = new vscode.EventEmitter<Finding[]>();

  constructor(context: vscode.ExtensionContext) {
    this.codeActionProvider = new EnhancedCodeActionProvider(this);
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
    output.info(`[DiagnosticManager] Updating diagnostics for ${uri.fsPath}. Count: ${safeFindings.length}`);

    const vscodeDiagnostics = safeFindings.map(finding => this.toVsCodeDiagnostic(uri, finding));

    this.diagnostics.set(uri, vscodeDiagnostics);
    this.currentFindings.set(uri.toString(), safeFindings);

    // 触发 Diagnostics 变化事件
    this.onDidChangeDiagnosticsEmitter.fire(this.getAllFindings());
  }

  /**
   * 获取指定文件的 Findings
   */
  getFindings(uri: vscode.Uri): Finding[] {
    return this.currentFindings.get(uri.toString()) || [];
  }

  /**
   * 模糊查找 Findings (通过 fsPath)
   * 解决手动构造 URI 可能导致的 toString() 不一致问题
   */
  getFindingsFuzzy(targetUri: vscode.Uri): Finding[] {
    // 1. 尝试精确匹配
    const exact = this.currentFindings.get(targetUri.toString());
    if (exact) return exact;

    // 2. 尝试 fsPath 匹配
    // 注意：这将遍历所有缓存的文件，性能稍差但更健壮
    for (const [key, findings] of this.currentFindings) {
      try {
        const cachedUri = vscode.Uri.parse(key);
        if (cachedUri.fsPath === targetUri.fsPath) {
          return findings;
        }
      } catch (e) {
        // ignore invalid keys
      }
    }

    return [];
  }

  /**
   * 获取所有 Findings
   */
  getAllFindings(): Finding[] {
    const allFindings: Finding[] = [];
    this.currentFindings.forEach((findings, key) => {
      output.info(`[DiagnosticManager] getAllFindings: Key=${key}, Count=${findings.length}`);
      allFindings.push(...findings);
    });
    return allFindings;
  }

  /**
   * Diagnostics 变化事件
   */
  readonly onDidChangeDiagnostics = this.onDidChangeDiagnosticsEmitter.event;

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
  getCodeActionProvider(): vscode.CodeActionProvider | null {
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
    if (source === 'semgrep' || source === 'opengrep') {
      return this.toFindingFromExternalDiagnostic(uri, diagnostic, source);
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
