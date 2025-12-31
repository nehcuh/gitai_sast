import * as vscode from 'vscode';

type SemgrepConfigKey =
  | 'path'
  | 'metrics'
  | 'useExperimentalLS'
  | 'ignoreCliVersion'
  | 'scan.configuration';

interface SemgrepSettingsBackupV1 {
  version: 1;
  target: vscode.ConfigurationTarget;
  values: Record<SemgrepConfigKey, unknown>;
}

function isSemgrepDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  const source = (diagnostic.source || '').trim().toLowerCase();
  return source === 'semgrep';
}

export class SemgrepBridge implements vscode.Disposable {
  private static readonly SEMGREP_EXTENSION_ID = 'semgrep.semgrep';
  private static readonly WORKSPACE_ENABLED_KEY = 'gitai.sast.semgrep.enabled';
  private static readonly WORKSPACE_BACKUP_KEY = 'gitai.sast.semgrep.backup.v1';

  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  isSemgrepInstalled(): boolean {
    return Boolean(vscode.extensions.getExtension(SemgrepBridge.SEMGREP_EXTENSION_ID));
  }

  async maybeEnableOpengrepBackend(): Promise<void> {
    if (!this.isSemgrepInstalled()) {
      return;
    }

    const enabled = this.context.workspaceState.get<boolean>(
      SemgrepBridge.WORKSPACE_ENABLED_KEY,
      false
    );

    if (enabled) {
      return;
    }

    const selection = await vscode.window.showInformationMessage(
      'GitAI 可复用 Semgrep 插件作为 Opengrep 的 LSP Client 来提供实时 Diagnostics（会写入工作区的 Semgrep 设置）。是否启用？',
      '启用',
      '稍后'
    );

    if (selection !== '启用') {
      return;
    }

    await this.enableOpengrepBackend({ silent: false });
    await this.context.workspaceState.update(SemgrepBridge.WORKSPACE_ENABLED_KEY, true);
  }

  async enableOpengrepBackend(options?: { silent?: boolean; opengrepPath?: string }): Promise<void> {
    if (!this.isSemgrepInstalled()) {
      await vscode.window.showWarningMessage(
        '未检测到 Semgrep 插件（semgrep.semgrep）。请先安装后再启用实时扫描复用。'
      );
      return;
    }

    const semgrepConfig = vscode.workspace.getConfiguration('semgrep');
    const target = vscode.ConfigurationTarget.Workspace;

    await this.backupSemgrepSettingsOnce(semgrepConfig, target);

    const opengrepPath = (options?.opengrepPath || 'opengrep').trim() || 'opengrep';

    await semgrepConfig.update('path', opengrepPath, target);
    await semgrepConfig.update('metrics', false, target);
    await semgrepConfig.update('useExperimentalLS', false, target);
    await semgrepConfig.update('ignoreCliVersion', true, target);

    const existingConfigurations = semgrepConfig.get<unknown>('scan.configuration');
    if (!Array.isArray(existingConfigurations) || existingConfigurations.length === 0) {
      await semgrepConfig.update('scan.configuration', ['auto'], target);
    }

    await this.restartSemgrepLanguageServer({ silent: options?.silent ?? false });
  }

  async restoreSemgrepBackend(options?: { silent?: boolean }): Promise<void> {
    const backup = this.context.workspaceState.get<SemgrepSettingsBackupV1 | undefined>(
      SemgrepBridge.WORKSPACE_BACKUP_KEY
    );

    if (!backup) {
      if (!options?.silent) {
        await vscode.window.showInformationMessage('未找到可恢复的 Semgrep 设置备份。');
      }
      return;
    }

    const semgrepConfig = vscode.workspace.getConfiguration('semgrep');
    const target = backup.target ?? vscode.ConfigurationTarget.Workspace;

    const keys: SemgrepConfigKey[] = [
      'path',
      'metrics',
      'useExperimentalLS',
      'ignoreCliVersion',
      'scan.configuration',
    ];

    for (const key of keys) {
      const value = backup.values[key];
      await semgrepConfig.update(key, value as any, target);
    }

    await this.context.workspaceState.update(SemgrepBridge.WORKSPACE_BACKUP_KEY, undefined);
    await this.context.workspaceState.update(SemgrepBridge.WORKSPACE_ENABLED_KEY, false);

    await this.restartSemgrepLanguageServer({ silent: options?.silent ?? false });
  }

  subscribeDiagnostics(callback: (diags: vscode.Diagnostic[], uri: vscode.Uri) => void): vscode.Disposable {
    const disposable = vscode.languages.onDidChangeDiagnostics((event) => {
      for (const uri of event.uris) {
        const semgrepDiagnostics = vscode.languages
          .getDiagnostics(uri)
          .filter(isSemgrepDiagnostic);
        if (semgrepDiagnostics.length > 0) {
          callback(semgrepDiagnostics, uri);
        }
      }
    });

    this.disposables.push(disposable);
    return disposable;
  }

  private async backupSemgrepSettingsOnce(
    semgrepConfig: vscode.WorkspaceConfiguration,
    target: vscode.ConfigurationTarget
  ): Promise<void> {
    const existing = this.context.workspaceState.get<SemgrepSettingsBackupV1 | undefined>(
      SemgrepBridge.WORKSPACE_BACKUP_KEY
    );
    if (existing) {
      return;
    }

    const keys: SemgrepConfigKey[] = [
      'path',
      'metrics',
      'useExperimentalLS',
      'ignoreCliVersion',
      'scan.configuration',
    ];

    const values: Record<SemgrepConfigKey, unknown> = {
      path: semgrepConfig.get('path'),
      metrics: semgrepConfig.get('metrics'),
      useExperimentalLS: semgrepConfig.get('useExperimentalLS'),
      ignoreCliVersion: semgrepConfig.get('ignoreCliVersion'),
      'scan.configuration': semgrepConfig.get('scan.configuration'),
    };

    await this.context.workspaceState.update(SemgrepBridge.WORKSPACE_BACKUP_KEY, {
      version: 1,
      target,
      values,
    } satisfies SemgrepSettingsBackupV1);
  }

  private async restartSemgrepLanguageServer(options?: { silent?: boolean }): Promise<void> {
    try {
      const commands = await vscode.commands.getCommands(true);
      if (commands.includes('semgrep.restartLanguageServer')) {
        await vscode.commands.executeCommand('semgrep.restartLanguageServer');
        if (!options?.silent) {
          await vscode.window.showInformationMessage('已更新 Semgrep 设置并重启 Language Server。');
        }
        return;
      }
    } catch (error) {
      console.error('[GitAI SAST] Failed to restart Semgrep language server:', error);
    }

    if (!options?.silent) {
      await vscode.window.showInformationMessage(
        '已更新 Semgrep 设置。若未生效，请执行 “Developer: Reload Window”。'
      );
    }
  }
}
