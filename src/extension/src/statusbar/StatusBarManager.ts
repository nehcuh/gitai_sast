import * as vscode from 'vscode';
import { AiFixProvider } from '../ai/AiFixProvider';

/**
 * 状态栏项
 */
enum StatusBarItemId {
  Status = 'gitai.sast.statusbar.status',
  Scan = 'gitai.sast.statusbar.scan',
  Fix = 'gitai.sast.statusbar.fix',
}

/**
 * 状态栏管理器
 */
export class StatusBarManager {
  private static items: Map<StatusBarItemId, vscode.StatusBarItem> =
    new Map();

  /**
   * 初始化状态栏
   */
  static initialize(context: vscode.ExtensionContext): void {
    // 创建状态栏项
    this.createItem(
      StatusBarItemId.Status,
      vscode.StatusBarAlignment.Left,
      100
    );
    this.createItem(
      StatusBarItemId.Scan,
      vscode.StatusBarAlignment.Right,
      200
    );
    this.createItem(
      StatusBarItemId.Fix,
      vscode.StatusBarAlignment.Right,
      300
    );

    // 设置默认状态
    this.updateStatus('Ready', 'gitai.sast.scan');

    // 注册到订阅列表
    context.subscriptions.push(...Array.from(this.items.values()));

    console.log('[GitAI SAST] StatusBar initialized');
  }

  /**
   * 创建状态栏项
   */
  private static createItem(
    id: StatusBarItemId,
    alignment: vscode.StatusBarAlignment,
    priority: number
  ): void {
    if (this.items.has(id)) {
      return;
    }

    const item = vscode.window.createStatusBarItem(
      id,
      alignment,
      priority
    );
    this.items.set(id, item);
  }

  /**
   * 更新状态
   */
  static updateStatus(text: string, command?: string): void {
    const item = this.items.get(StatusBarItemId.Status);
    if (!item) {
      return;
    }

    item.text = text;
    if (command) {
      item.command = command;
    }
    item.show();
  }

  /**
   * 更新扫描按钮
   */
  static updateScanButton(text: string, command?: string): void {
    const item = this.items.get(StatusBarItemId.Scan);
    if (!item) {
      return;
    }

    item.text = text;
    if (command) {
      item.command = command;
    }
    item.show();
  }

  /**
   * 更新修复按钮
   */
  static updateFixButton(text: string, command?: string): void {
    const item = this.items.get(StatusBarItemId.Fix);
    if (!item) {
      return;
    }

    item.text = text;
    if (command) {
      item.command = command;
    }
    item.show();
  }

  /**
   * 显示扫描中状态
   */
  static showScanning(): void {
    this.updateStatus('$(sync~spin) Scanning...');
  }

  /**
   * 显示扫描完成状态
   */
  static showScanComplete(count: number): void {
    if (count === 0) {
      this.updateStatus('$(check) No issues');
    } else {
      this.updateStatus(`$(error) ${count} issue(s)`);
    }
  }

  /**
   * 显示 AI 修复中状态
   */
  static showFixing(): void {
    this.updateStatus('$(sync~spin) AI Fixing...');
  }

  /**
   * 显示 AI 状态
   */
  static async updateAiStatus(aiFixProvider: AiFixProvider): Promise<void> {
    const available = await aiFixProvider.checkAvailability();

    if (available) {
      this.updateStatus('$(sparkle) AI Ready');
    } else {
      this.updateStatus('$(warning) AI Not Ready');
    }
  }

  /**
   * 隐藏所有状态栏项
   */
  static hideAll(): void {
    for (const item of this.items.values()) {
      item.hide();
    }
  }

  /**
   * 显示所有状态栏项
   */
  static showAll(): void {
    for (const item of this.items.values()) {
      item.show();
    }
  }
}
