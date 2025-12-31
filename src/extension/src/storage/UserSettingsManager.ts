import * as vscode from 'vscode';
import { GlobalStateManager, GlobalStateKey } from './GlobalStateManager';

/**
 * 用户设置
 */
export interface UserSettings {
  version: string;
  syncEnabled: boolean;
  lastSyncTime: number;
  settings: Record<string, any>;
}

/**
 * 用户设置管理器
 */
export class UserSettingsManager {
  private stateManager: GlobalStateManager;
  private readonly CURRENT_VERSION = '1.0.0';

  constructor(context: vscode.ExtensionContext) {
    this.stateManager = GlobalStateManager.getInstance(context);
  }

  /**
   * 获取用户设置
   */
  getUserSettings(): UserSettings {
    const settings = this.stateManager.get<UserSettings>(
      GlobalStateKey.UserSettings
    );

    if (!settings) {
      return this.getDefaultSettings();
    }

    return settings;
  }

  /**
   * 设置用户设置
   */
  async setUserSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = this.getUserSettings();
    const updated = { ...current, ...settings };
    await this.stateManager.set(GlobalStateKey.UserSettings, updated);
  }

  /**
   * 获取设置值
   */
  getSetting(key: string): any {
    const settings = this.getUserSettings();
    return settings.settings[key];
  }

  /**
   * 设置值
   */
  async setSetting(key: string, value: any): Promise<void> {
    const current = this.getUserSettings();
    current.settings[key] = value;
    await this.setUserSettings(current);
  }

  /**
   * 同步设置（从 workspace 到 persistent）
   */
  async syncSettings(): Promise<void> {
    const workspaceSettings = this.getWorkspaceSettings();
    const current = this.getUserSettings();

    // 更新持久化设置
    const updated = {
      ...current,
      settings: {
        ...current.settings,
        ...workspaceSettings,
      },
      lastSyncTime: Date.now(),
    };

    await this.setUserSettings(updated);
  }

  /**
   * 恢复设置（从 persistent 到 workspace）
   */
  async restoreSettings(): Promise<void> {
    const userSettings = this.getUserSettings();
    const workspaceConfig = vscode.workspace.getConfiguration('gitai.sast');

    // 应用到 workspace
    for (const [key, value] of Object.entries(userSettings.settings)) {
      await workspaceConfig.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * 导出设置
   */
  exportSettings(): string {
    const settings = this.getUserSettings();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * 导入设置
   */
  async importSettings(data: string): Promise<void> {
    try {
      const settings: UserSettings = JSON.parse(data);
      await this.setUserSettings(settings);
    } catch (error) {
      throw new Error('Invalid user settings data');
    }
  }

  /**
   * 重置设置
   */
  async resetSettings(): Promise<void> {
    await this.setUserSettings(this.getDefaultSettings());
  }

  /**
   * 获取默认设置
   */
  private getDefaultSettings(): UserSettings {
    return {
      version: this.CURRENT_VERSION,
      syncEnabled: false,
      lastSyncTime: 0,
      settings: {},
    };
  }

  /**
   * 获取 workspace 设置
   */
  private getWorkspaceSettings(): Record<string, any> {
    const config = vscode.workspace.getConfiguration('gitai.sast');
    return {
      mcpServerPath: config.get<string>('mcpServerPath', ''),
      severityThreshold: config.get<string>('severityThreshold', 'medium'),
      enableAutoScan: config.get<boolean>('enableAutoScan', true),
      enableRemoteScan: config.get<boolean>('enableRemoteScan', false),
      remoteUrl: config.get<string>('remoteUrl', ''),
      remoteUserId: config.get<string>('remoteUserId', ''),
      // AI 设置
      ai: {
        provider: config.get<string>('ai.provider', 'auto'),
        autoDetectPriority: config.get<string[]>(
          'ai.autoDetectPriority',
          ['copilotAgent', 'vscode', 'openaiCompatible']
        ),
        apiUrl: config.get<string>('ai.apiUrl', ''),
        apiKey: config.get<string>('ai.apiKey', ''),
        modelName: config.get<string>('ai.modelName', ''),
        temperature: config.get<number>('ai.temperature', 0.2),
        requestTimeoutMs: config.get<number>('ai.requestTimeoutMs', 60000),
        stream: config.get<boolean>('ai.stream', true),
        enableThinking: config.get<boolean>('ai.enableThinking', false),
        systemPrompt: config.get<string>('ai.systemPrompt', ''),
        userPromptTemplate: config.get<string>('ai.userPromptTemplate', ''),
        debugLogging: config.get<boolean>('ai.debugLogging', false),
        debugMaxChars: config.get<number>('ai.debugMaxChars', 12000),
      },
    };
  }
}
