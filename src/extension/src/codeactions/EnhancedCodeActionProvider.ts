import * as vscode from 'vscode';
import { Finding } from '../core/types';
import {
  SAST_CODE_ACTIONS,
  SastCodeActionKind,
  SastCodeActionMetadata,
} from './types';

type FindingLookup = {
  getFindingFromDiagnostic(
    uri: vscode.Uri,
    diagnostic: vscode.Diagnostic
  ): Finding | undefined;
};

/**
 * Enhanced Code Action Provider - 增强的 Code Action 提供者
 */
export class EnhancedCodeActionProvider
  implements vscode.CodeActionProvider {
  private diagnosticManager?: FindingLookup; // DiagnosticManager-like (avoid circular import)

  constructor(diagnosticManager?: FindingLookup) {
    this.diagnosticManager = diagnosticManager;
  }

  /**
   * 提供 Code Actions
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    // 筛选支持的诊断
    const supportedDiagnostics = context.diagnostics.filter((d) =>
      this.isSupportedDiagnostic(d.source)
    );

    // Group diagnostics by Rule ID and start line to deduplicate
    const groups = new Map<string, { finding: Finding; diagnostics: vscode.Diagnostic[] }>();

    for (const diagnostic of supportedDiagnostics) {
      const finding = this.getFindingFromDiagnostic(document.uri, diagnostic);
      if (!finding) {
        continue;
      }

      const key = `${finding.rule_id}:${finding.location.line}`;
      if (!groups.has(key)) {
        groups.set(key, { finding, diagnostics: [] });
      }

      const group = groups.get(key)!;
      group.diagnostics.push(diagnostic);

      // If the current finding has a code snippet and the existing one doesn't, upgrade to the better finding
      if (finding.code_snippet && !group.finding.code_snippet) {
        group.finding = finding;
      }
    }

    // Generate actions for each unique group
    for (const group of groups.values()) {
      const { finding, diagnostics } = group;

      // 为每个配置的 Action 创建 Code Action
      for (const actionMetadata of SAST_CODE_ACTIONS) {
        // 检查条件是否满足
        if (
          actionMetadata.condition &&
          !actionMetadata.condition(finding)
        ) {
          continue;
        }

        const action = this.createCodeAction(
          actionMetadata,
          document.uri,
          finding,
          diagnostics
        );

        if (action) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  /**
   * 创建 Code Action
   */
  private createCodeAction(
    metadata: SastCodeActionMetadata,
    uri: vscode.Uri,
    finding: Finding,
    diagnostics: vscode.Diagnostic[]
  ): vscode.CodeAction | null {
    // 替换标题中的占位符
    const rawTitle = metadata.title.replace('{title}', finding.title);
    const title = metadata.icon ? `${metadata.icon} ${rawTitle}` : rawTitle;

    // 创建 Code Action
    const action = new vscode.CodeAction(
      title,
      vscode.CodeActionKind.QuickFix
    );

    // 设置诊断 (Attach ALL duplicates)
    action.diagnostics = diagnostics;

    // 设置是否优先
    if (metadata.isPreferred) {
      action.isPreferred = true;
    }

    // 设置命令
    const command = this.getCommand(
      metadata.kind,
      uri,
      finding,
      diagnostics[0] // Use first diagnostic for command context if needed
    );

    if (command) {
      action.command = command;
    }

    return action;
  }

  /**
   * 获取命令
   */
  private getCommand(
    kind: SastCodeActionKind,
    uri: vscode.Uri,
    finding: Finding,
    diagnostic: vscode.Diagnostic
  ): vscode.Command | undefined {
    const args: any[] = [uri, finding];

    switch (kind) {
      case SastCodeActionKind.AiFix:
        return {
          command: 'gitai.sast.aiFix',
          title: 'AI Fix',
          arguments: args,
        };

      case SastCodeActionKind.ExplainInChat:
        return {
          command: 'gitai.sast.explainInChat',
          title: 'Explain in AI Chat',
          arguments: args,
        };

      case SastCodeActionKind.ShowDetails:
        return {
          command: 'gitai.sast.showDetails',
          title: 'Show Details',
          arguments: args,
        };

      case SastCodeActionKind.ViewTaintPath:
        return {
          command: 'gitai.sast.viewTaintPath',
          title: 'View Taint Path',
          arguments: args,
        };

      case SastCodeActionKind.IgnoreOccurrence:
        return {
          command: 'gitai.sast.ignoreOccurrence',
          title: 'Ignore Occurrence',
          arguments: args,
        };

      case SastCodeActionKind.IgnoreInFile:
        return {
          command: 'gitai.sast.ignoreInFile',
          title: 'Ignore in File',
          arguments: args,
        };

      case SastCodeActionKind.IgnoreGlobally:
        return {
          command: 'gitai.sast.ignoreGlobally',
          title: 'Ignore Globally',
          arguments: [finding],
        };

      default:
        return undefined;
    }
  }

  /**
   * 检查诊断是否支持
   */
  private isSupportedDiagnostic(source: string | undefined): boolean {
    if (!source) {
      return false;
    }

    const normalized = source.trim().toLowerCase();
    return normalized === 'sast' || normalized === 'semgrep' || normalized === 'opengrep';
  }

  /**
   * 从诊断获取 Finding
   */
  private getFindingFromDiagnostic(
    uri: vscode.Uri,
    diagnostic: vscode.Diagnostic
  ): Finding | null {
    const manager = this.diagnosticManager;
    if (!manager) {
      return null;
    }

    if (typeof manager.getFindingFromDiagnostic !== 'function') {
      return null;
    }

    return manager.getFindingFromDiagnostic(uri, diagnostic) || null;
  }

  /**
   * 设置 DiagnosticManager
   */
  setDiagnosticManager(diagnosticManager: FindingLookup): void {
    this.diagnosticManager = diagnosticManager;
  }
}
