import * as vscode from 'vscode';
import * as path from 'path';
import { GlobalStateManager } from './GlobalStateManager';
import { ScanHistoryManager } from './ScanHistoryManager';
import { IgnoreRulesManager } from './IgnoreRulesManager';
import { UserSettingsManager } from './UserSettingsManager';

/**
 * 导出数据
 */
export interface ExportData {
  version: string;
  timestamp: number;
  scanHistory: any[];
  ignoreRules: any[];
  userSettings: any;
}

/**
 * 状态管理器 - 统一管理所有状态
 */
export class StateManager {
  private globalStateManager: GlobalStateManager;
  private scanHistoryManager: ScanHistoryManager;
  private ignoreRulesManager: IgnoreRulesManager;
  private userSettingsManager: UserSettingsManager;
  private readonly CURRENT_VERSION = '1.0.0';

  constructor(context: vscode.ExtensionContext) {
    this.globalStateManager = GlobalStateManager.getInstance(context);
    this.scanHistoryManager = new ScanHistoryManager(context);
    this.ignoreRulesManager = new IgnoreRulesManager(context);
    this.userSettingsManager = new UserSettingsManager(context);
  }

  /**
   * 导出状态
   */
  async exportState(uri?: vscode.Uri): Promise<vscode.Uri> {
    const data: ExportData = {
      version: this.CURRENT_VERSION,
      timestamp: Date.now(),
      scanHistory: this.scanHistoryManager.getScanHistory(),
      ignoreRules: this.ignoreRulesManager.getIgnoreRules(),
      userSettings: this.userSettingsManager.getUserSettings(),
    };

    const json = JSON.stringify(data, null, 2);

    // 确定导出路径
    let exportUri: vscode.Uri | undefined = uri;

    if (!exportUri) {
      const defaultUri = vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders?.[0].uri ||
          vscode.Uri.file(path.join(process.env.HOME || '', 'Desktop')),
        `gitai-sast-export-${Date.now()}.json`
      );
      exportUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          JSON: ['json'],
        },
      });
    }

    if (!exportUri) {
      throw new Error('Export cancelled');
    }

    // 写入文件
    await vscode.workspace.fs.writeFile(
      exportUri,
      new TextEncoder().encode(json)
    );

    return exportUri;
  }

  /**
   * 导入状态
   */
  async importState(uri: vscode.Uri): Promise<void> {
    // 读取文件
    const data = await vscode.workspace.fs.readFile(uri);
    const json = new TextDecoder().decode(data);

    // 解析数据
    const importData: ExportData = JSON.parse(json);

    // 验证版本
    if (importData.version !== this.CURRENT_VERSION) {
      const result = await vscode.window.showWarningMessage(
        `Imported data version (${importData.version}) does not match current version (${this.CURRENT_VERSION}). Continue anyway?`,
        'Continue',
        'Cancel'
      );

      if (result !== 'Continue') {
        throw new Error('Import cancelled');
      }
    }

    // 导入数据
    await this.scanHistoryManager.importScanHistory(
      JSON.stringify(importData.scanHistory)
    );
    await this.ignoreRulesManager.importIgnoreRules(
      JSON.stringify(importData.ignoreRules)
    );
    await this.userSettingsManager.importSettings(
      JSON.stringify(importData.userSettings)
    );

    vscode.window.showInformationMessage(
      'State imported successfully. Reload window to apply changes.'
    );
  }

  /**
   * 清除所有状态
   */
  async clearAllState(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      'This will clear all stored data (scan history, ignore rules, settings). Are you sure?',
      'Clear',
      'Cancel'
    );

    if (result !== 'Clear') {
      return;
    }

    await this.globalStateManager.clearAllState();
    await this.scanHistoryManager.clearScanHistory();
    await this.ignoreRulesManager.clearIgnoreRules();
    await this.userSettingsManager.resetSettings();

    vscode.window.showInformationMessage(
      'All state cleared. Reload window to apply changes.'
    );
  }

  /**
   * 获取状态统计
   */
  getStateStats(): {
    scanHistory: { total: number; file: number; workspace: number };
    ignoreRules: { total: number; file: number; global: number };
    userSettings: { size: number };
    globalState: { size: number };
  } {
    const scanHistory = this.scanHistoryManager.getScanHistory();
    const ignoreRules = this.ignoreRulesManager.getIgnoreRules();
    const userSettings = this.userSettingsManager.getUserSettings();

    return {
      scanHistory: {
        total: scanHistory.length,
        file: scanHistory.filter(h => h.type === 'file').length,
        workspace: scanHistory.filter(h => h.type === 'workspace').length,
      },
      ignoreRules: {
        total: ignoreRules.length,
        file: ignoreRules.filter(r => r.file).length,
        global: ignoreRules.filter(r => !r.file).length,
      },
      userSettings: {
        size: JSON.stringify(userSettings).length,
      },
      globalState: {
        size: this.globalStateManager.getAllStateSize(),
      },
    };
  }
}
