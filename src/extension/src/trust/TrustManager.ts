import * as vscode from 'vscode';

/**
 * 信任设置
 */
interface TrustSettings {
  requireWorkspaceTrust: boolean;
  allowUntrustedScan: boolean;
}

/**
 * 信任管理器
 */
export class TrustManager {
  private static readonly TRUST_GRANTED_KEY =
    'gitai.sast.trust.granted';

  /**
   * 检查工作区是否受信任
   */
  static async checkWorkspaceTrust(): Promise<boolean> {
    // 获取当前工作区
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    // 检查 VS Code 工作区信任
    const isTrusted = workspaceFolder.uri.scheme === 'file'
      ? vscode.workspace.isTrusted
      : true;

    return isTrusted;
  }

  /**
   * 请求工作区信任
   */
  static async requestWorkspaceTrust(): Promise<boolean> {
    const result = await vscode.window.showWarningMessage(
      'This extension requires workspace trust to run security scans. Do you trust this workspace?',
      'Yes, I trust this workspace',
      'No'
    );

    if (result === 'Yes, I trust this workspace') {
      // TODO: 标记工作区为受信任（需要 API 支持）
      return true;
    }

    return false;
  }

  /**
   * 检查是否允许在不受信任的工作区中扫描
   */
  static async allowUntrustedScan(): Promise<boolean> {
    const settings = this.getSettings();

    if (!settings.requireWorkspaceTrust) {
      return true;
    }

    if (!settings.allowUntrustedScan) {
      const result = await vscode.window.showWarningMessage(
        'Workspace is not trusted. Running security scans in untrusted workspaces may be unsafe. Do you want to continue?',
        'Yes, I understand the risks',
        'No'
      );

      return result === 'Yes, I understand the risks';
    }

    return true;
  }

  /**
   * 获取信任设置
   */
  private static getSettings(): TrustSettings {
    const config = vscode.workspace.getConfiguration('gitai.sast');

    return {
      requireWorkspaceTrust: config.get<boolean>(
        'trust.requireWorkspaceTrust',
        true
      ),
      allowUntrustedScan: config.get<boolean>(
        'trust.allowUntrustedScan',
        false
      ),
    };
  }

  /**
   * 监听工作区信任变更（占位符）
   * 注意：VS Code API 可能不提供此事件
   */
  static onTrustChanged(
    callback: (isTrusted: boolean) => void
  ): vscode.Disposable {
    // TODO: 实现
    // 由于 VS Code 可能不提供 onDidChangeTrust 事件
    // 这里返回一个空的 Disposable
    return new vscode.Disposable(() => {
      // Empty dispose
    });
  }
}
