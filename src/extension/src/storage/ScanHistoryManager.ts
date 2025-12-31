import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { GlobalStateManager, GlobalStateKey, ScanHistoryItem } from './GlobalStateManager';

/**
 * 扫描历史管理器
 */
export class ScanHistoryManager {
  private stateManager: GlobalStateManager;
  private readonly MAX_HISTORY = 100;

  constructor(context: vscode.ExtensionContext) {
    this.stateManager = GlobalStateManager.getInstance(context);
  }

  /**
   * 添加扫描历史
   */
  async addScanHistory(
    type: 'file' | 'workspace',
    uri: string | undefined,
    findingCount: number,
    duration: number,
    findings: Finding[]
  ): Promise<void> {
    const history = this.getScanHistory();

    const item: ScanHistoryItem = {
      id: this.generateId(),
      timestamp: Date.now(),
      type,
      uri,
      findingCount,
      duration,
      findings,
    };

    // 添加到历史
    history.unshift(item);

    // 限制历史大小
    if (history.length > this.MAX_HISTORY) {
      history.splice(this.MAX_HISTORY);
    }

    await this.stateManager.set(GlobalStateKey.ScanHistory, history);
  }

  /**
   * 获取扫描历史
   */
  getScanHistory(): ScanHistoryItem[] {
    return this.stateManager.get<ScanHistoryItem[]>(
      GlobalStateKey.ScanHistory
    ) || [];
  }

  /**
   * 获取最近的扫描历史
   */
  getRecentScanHistory(limit: number): ScanHistoryItem[] {
    const history = this.getScanHistory();
    return history.slice(0, limit);
  }

  /**
   * 获取文件的扫描历史
   */
  getFileScanHistory(uri: string): ScanHistoryItem[] {
    const history = this.getScanHistory();
    return history.filter(item => item.uri === uri);
  }

  /**
   * 获取扫描统计
   */
  getScanStats(): {
    totalScans: number;
    totalFindings: number;
    averageDuration: number;
    scansByType: { file: number; workspace: number };
  } {
    const history = this.getScanHistory();

    if (history.length === 0) {
      return {
        totalScans: 0,
        totalFindings: 0,
        averageDuration: 0,
        scansByType: { file: 0, workspace: 0 },
      };
    }

    const totalScans = history.length;
    const totalFindings = history.reduce(
      (sum, item) => sum + item.findingCount,
      0
    );
    const averageDuration =
      history.reduce((sum, item) => sum + item.duration, 0) /
      totalScans;
    const scansByType = history.reduce(
      (acc, item) => {
        acc[item.type]++;
        return acc;
      },
      { file: 0, workspace: 0 }
    );

    return {
      totalScans,
      totalFindings,
      averageDuration,
      scansByType,
    };
  }

  /**
   * 清除扫描历史
   */
  async clearScanHistory(): Promise<void> {
    await this.stateManager.delete(GlobalStateKey.ScanHistory);
  }

  /**
   * 删除扫描历史项
   */
  async deleteScanHistoryItem(id: string): Promise<void> {
    const history = this.getScanHistory();
    const newHistory = history.filter(item => item.id !== id);
    await this.stateManager.set(GlobalStateKey.ScanHistory, newHistory);
  }

  /**
   * 导出扫描历史
   */
  exportScanHistory(): string {
    const history = this.getScanHistory();
    return JSON.stringify(history, null, 2);
  }

  /**
   * 导入扫描历史
   */
  async importScanHistory(data: string): Promise<void> {
    try {
      const history: ScanHistoryItem[] = JSON.parse(data);
      await this.stateManager.set(GlobalStateKey.ScanHistory, history);
    } catch (error) {
      throw new Error('Invalid scan history data');
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
