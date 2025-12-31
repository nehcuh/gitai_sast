import * as vscode from 'vscode';
import { GlobalStateManager, GlobalStateKey } from './GlobalStateManager';

/**
 * 忽略规则
 */
export interface IgnoreRule {
  id: string;
  file?: string;
  line?: number;
  column?: number;
  rule_id: string;
  comment?: string;
  timestamp: number;
}

/**
 * 忽略规则管理器
 */
export class IgnoreRulesManager {
  private stateManager: GlobalStateManager;

  constructor(context: vscode.ExtensionContext) {
    this.stateManager = GlobalStateManager.getInstance(context);
  }

  /**
   * 获取忽略规则
   */
  getIgnoreRules(): IgnoreRule[] {
    return (
      this.stateManager.get<IgnoreRule[]>(
        GlobalStateKey.IgnoreRules
      ) || []
    );
  }

  /**
   * 添加忽略规则
   */
  async addIgnoreRule(rule: Omit<IgnoreRule, 'id' | 'timestamp'>): Promise<void> {
    const rules = this.getIgnoreRules();

    const newRule: IgnoreRule = {
      ...rule,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    rules.push(newRule);
    await this.stateManager.set(GlobalStateKey.IgnoreRules, rules);
  }

  /**
   * 删除忽略规则
   */
  async deleteIgnoreRule(id: string): Promise<void> {
    const rules = this.getIgnoreRules();
    const newRules = rules.filter(rule => rule.id !== id);
    await this.stateManager.set(GlobalStateKey.IgnoreRules, newRules);
  }

  /**
   * 清除忽略规则
   */
  async clearIgnoreRules(): Promise<void> {
    await this.stateManager.delete(GlobalStateKey.IgnoreRules);
  }

  /**
   * 检查是否应该忽略
   */
  shouldIgnore(
    file: string,
    rule_id: string,
    line?: number,
    column?: number
  ): boolean {
    const rules = this.getIgnoreRules();

    // 检查特定出现
    if (line !== undefined && column !== undefined) {
      const match = rules.find(
        rule =>
          rule.file === file &&
          rule.line === line &&
          rule.column === column &&
          rule.rule_id === rule_id
      );
      if (match) {
        return true;
      }
    }

    // 检查文件级别
    const fileMatch = rules.find(
      rule =>
        rule.file === file &&
        !rule.line &&
        !rule.column &&
        rule.rule_id === rule_id
    );
    if (fileMatch) {
      return true;
    }

    // 检查全局规则
    const globalMatch = rules.find(
      rule => !rule.file && rule.rule_id === rule_id
    );
    if (globalMatch) {
      return true;
    }

    return false;
  }

  /**
   * 获取文件的忽略规则
   */
  getFileIgnoreRules(file: string): IgnoreRule[] {
    const rules = this.getIgnoreRules();
    return rules.filter(rule => rule.file === file);
  }

  /**
   * 获取全局忽略规则
   */
  getGlobalIgnoreRules(): IgnoreRule[] {
    const rules = this.getIgnoreRules();
    return rules.filter(rule => !rule.file);
  }

  /**
   * 导出忽略规则
   */
  exportIgnoreRules(): string {
    const rules = this.getIgnoreRules();
    return JSON.stringify(rules, null, 2);
  }

  /**
   * 导入忽略规则
   */
  async importIgnoreRules(data: string): Promise<void> {
    try {
      const rules: IgnoreRule[] = JSON.parse(data);
      await this.stateManager.set(GlobalStateKey.IgnoreRules, rules);
    } catch (error) {
      throw new Error('Invalid ignore rules data');
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
