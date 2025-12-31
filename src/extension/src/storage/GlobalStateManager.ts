import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 全局状态键
 */
export enum GlobalStateKey {
  OnboardingDone = 'gitai.sast.onboarding.done',
  ScanHistory = 'gitai.sast.scan.history',
  IgnoreRules = 'gitai.sast.ignores.rules',
  ActiveProvider = 'gitai.sast.ai.activeProvider',
  UserSettings = 'gitai.sast.user.settings',
  SessionState = 'gitai.sast.session.state',
}

/**
 * 扫描历史项
 */
export interface ScanHistoryItem {
  id: string;
  timestamp: number;
  type: 'file' | 'workspace';
  uri?: string;
  findingCount: number;
  duration: number;
  findings: Finding[];
}

/**
 * 全局状态管理器 - 管理插件的持久化状态
 */
export class GlobalStateManager {
  private static instance: GlobalStateManager;
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 获取单例实例
   */
  static getInstance(context: vscode.ExtensionContext): GlobalStateManager {
    if (!GlobalStateManager.instance) {
      GlobalStateManager.instance = new GlobalStateManager(context);
    }
    return GlobalStateManager.instance;
  }

  /**
   * 获取状态
   */
  get<T>(key: GlobalStateKey): T | undefined {
    return this.context.globalState.get<T>(key);
  }

  /**
   * 设置状态
   */
  async set<T>(key: GlobalStateKey, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  /**
   * 删除状态
   */
  async delete(key: GlobalStateKey): Promise<void> {
    await this.context.globalState.update(key, undefined);
  }

  /**
   * 获取所有状态
   */
  getAllState(): Record<string, any> {
    const state: Record<string, any> = {};

    // 遍历所有全局状态键
    for (const key of Object.values(GlobalStateKey)) {
      const value = this.context.globalState.get(key);
      if (value !== undefined) {
        state[key] = value;
      }
    }

    return state;
  }

  /**
   * 清除所有状态
   */
  async clearAllState(): Promise<void> {
    for (const key of Object.values(GlobalStateKey)) {
      await this.delete(key);
    }
  }

  /**
   * 检查状态是否存在
   */
  has(key: GlobalStateKey): boolean {
    return this.context.globalState.get(key) !== undefined;
  }

  /**
   * 获取状态大小
   */
  getStateSize(key: GlobalStateKey): number {
    const value = this.get(key);
    return JSON.stringify(value).length;
  }

  /**
   * 获取所有状态的大小
   */
  getAllStateSize(): number {
    return JSON.stringify(this.getAllState()).length;
  }
}
