import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 通知类型
 */
enum NotificationType {
  ScanComplete,
  ScanError,
  AiFixComplete,
  AiFixError,
  NewVulnerability,
  CriticalVulnerability,
}

/**
 * 通知设置
 */
interface NotificationSettings {
  enabled: boolean;
  showProgress: boolean;
  showErrors: boolean;
  showWarnings: boolean;
  showNewVulnerabilities: boolean;
  showCriticalVulnerabilities: boolean;
}

/**
 * 通知管理器
 */
export class NotificationManager {
  private static notificationQueue: Map<
    NotificationType,
    () => Promise<void>
  > = new Map();
  private static isProcessing = false;

  /**
   * 显示扫描完成通知
   */
  static showScanComplete(
    findingCount: number,
    scanDuration: number
  ): void {
    const message =
      findingCount === 0
        ? '✅ Scan complete: No vulnerabilities found'
        : `🔍 Scan complete: ${findingCount} issue(s) found (${scanDuration}ms)`;

    this.addNotification(async () => {
      const action =
        findingCount > 0
          ? 'View Results'
          : undefined;
      await this.showMessage(
        message,
        'info',
        action
      );

      if (action === 'View Results') {
        await vscode.commands.executeCommand(
          'gitai.sast.showResults'
        );
      }
    });
  }

  /**
   * 显示扫描错误通知
   */
  static showScanError(error: string): void {
    this.addNotification(async () => {
      await this.showMessage(
        `❌ Scan failed: ${error}`,
        'error',
        'View Logs'
      );

      // TODO: 打开输出日志
    });
  }

  /**
   * 显示 AI 修复完成通知
   */
  static showAiFixComplete(
    finding: Finding,
    fixCode: string
  ): void {
    this.addNotification(async () => {
      const action = await this.showMessage(
        `✅ AI fix generated for: ${finding.title}`,
        'info',
        'Apply Fix',
        'View Diff'
      );

      if (action === 'Apply Fix') {
        await vscode.commands.executeCommand(
          'gitai.sast.aiFix',
          vscode.window.activeTextEditor?.document.uri,
          finding
        );
      } else if (action === 'View Diff') {
        await vscode.commands.executeCommand(
          'gitai.sast.showDiff',
          finding,
          fixCode
        );
      }
    });
  }

  /**
   * 显示 AI 修复错误通知
   */
  static showAiFixError(finding: Finding, error: string): void {
    this.addNotification(async () => {
      await this.showMessage(
        `❌ AI fix failed for: ${finding.title}`,
        'error',
        'Retry'
      );

      if (await this.showMessage('', 'info', 'Retry')) {
        await vscode.commands.executeCommand(
          'gitai.sast.aiFix',
          vscode.window.activeTextEditor?.document.uri,
          finding
        );
      }
    });
  }

  /**
   * 显示新漏洞通知
   */
  static showNewVulnerability(
    newFindings: Finding[],
    totalFindings: number
  ): void {
    const criticalCount = newFindings.filter(
      f => f.severity === 'critical'
    ).length;
    const message =
      criticalCount > 0
        ? `🚨 ${criticalCount} new critical vulnerability(s) found`
        : `🔔 ${newFindings.length} new vulnerability(s) found`;

    this.addNotification(async () => {
      const action = await this.showMessage(
        `${message} (Total: ${totalFindings})`,
        'warning',
        'View Results',
        'Dismiss'
      );

      if (action === 'View Results') {
        await vscode.commands.executeCommand(
          'gitai.sast.showResults'
        );
      }
    });
  }

  /**
   * 显示进度通知
   */
  static showProgress(
    message: string,
    cancellationToken?: vscode.CancellationToken
  ): vscode.Progress<{ message?: string; increment?: number }> | null {
    // TODO: 实现
    return null;
  }

  /**
   * 获取通知设置
   */
  private static getSettings(): NotificationSettings {
    const config = vscode.workspace.getConfiguration('gitai.sast');

    return {
      enabled: config.get<boolean>('notifications.enabled', true),
      showProgress: config.get<boolean>('notifications.showProgress', true),
      showErrors: config.get<boolean>('notifications.showErrors', true),
      showWarnings: config.get<boolean>('notifications.showWarnings', true),
      showNewVulnerabilities: config.get<boolean>(
        'notifications.showNewVulnerabilities',
        true
      ),
      showCriticalVulnerabilities: config.get<boolean>(
        'notifications.showCriticalVulnerabilities',
        true
      ),
    };
  }

  /**
   * 添加通知到队列
   */
  private static addNotification(
    notification: () => Promise<void>
  ): void {
    const settings = this.getSettings();

    if (!settings.enabled) {
      return;
    }

    this.notificationQueue.set(
      NotificationType.ScanComplete,
      notification
    );

    // 处理队列
    void this.processQueue();
  }

  /**
   * 处理通知队列
   */
  private static async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    for (const [_, notification] of this.notificationQueue) {
      try {
        await notification();
      } catch (error) {
        console.error('[NotificationManager] Error:', error);
      }

      // 等待一段时间再处理下一个
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.notificationQueue.clear();
    this.isProcessing = false;
  }

  /**
   * 显示消息
   */
  private static async showMessage(
    message: string,
    type: 'info' | 'warning' | 'error',
    ...actions: (string | undefined)[]
  ): Promise<string | undefined> {
    const validActions = actions.filter(
      (a): a is string => typeof a === 'string'
    );

    switch (type) {
      case 'info':
        return await vscode.window.showInformationMessage(
          message,
          ...validActions
        );
      case 'warning':
        return await vscode.window.showWarningMessage(
          message,
          ...validActions
        );
      case 'error':
        return await vscode.window.showErrorMessage(
          message,
          ...validActions
        );
    }
  }
}
