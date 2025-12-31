import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 忽略规则
 */
export interface IgnoreRule {
  file?: string;
  line?: number;
  column?: number;
  rule_id: string;
  comment?: string;
}

/**
 * 忽略列表
 */
export interface IgnoreList {
  ignores: IgnoreRule[];
}

/**
 * Ignore Manager - 管理忽略规则
 */
export class IgnoreManager {
  private static readonly IGNORES_FILE = '.vscode/sast.ignores.json';
  private static ignoreCache: Map<string, IgnoreRule[]> = new Map();

  /**
   * 忽略特定出现位置
   */
  static async addOccurrence(uri: vscode.Uri, finding: Finding): Promise<void> {
    const ignores = await this.loadIgnores(uri);

    const newIgnore: IgnoreRule = {
      file: uri.fsPath,
      line: finding.location.line,
      column: finding.location.column,
      rule_id: finding.rule_id,
      comment: `Ignored on ${new Date().toISOString()}`,
    };

    ignores.push(newIgnore);
    await this.saveIgnores(uri, ignores);

    // 清除缓存
    this.ignoreCache.delete(this.getCacheKey(uri));
  }

  /**
   * 忽略文件中的规则
   */
  static async addRuleInFile(uri: vscode.Uri, ruleId: string): Promise<void> {
    const ignores = await this.loadIgnores(uri);

    const newIgnore: IgnoreRule = {
      file: uri.fsPath,
      rule_id: ruleId,
      comment: `Ignored on ${new Date().toISOString()}`,
    };

    ignores.push(newIgnore);
    await this.saveIgnores(uri, ignores);

    // 清除缓存
    this.ignoreCache.delete(this.getCacheKey(uri));
  }

  /**
   * 全局忽略规则
   */
  static async addGlobalRule(ruleId: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    const uri = workspaceFolder.uri;
    const ignores = await this.loadIgnores(uri);

    const newIgnore: IgnoreRule = {
      rule_id: ruleId,
      comment: `Ignored globally on ${new Date().toISOString()}`,
    };

    ignores.push(newIgnore);
    await this.saveIgnores(uri, ignores);

    // 清除所有缓存（因为这是全局规则）
    this.ignoreCache.clear();
  }

  /**
   * 检查是否应该忽略某个 Finding
   */
  static shouldIgnore(uri: vscode.Uri, finding: Finding): boolean {
    const ignores = this.ignoreCache.get(this.getCacheKey(uri));

    if (!ignores || ignores.length === 0) {
      return false;
    }

    // 遍历所有忽略规则
    for (const ignore of ignores) {
      // 全局规则：只匹配 rule_id
      if (!ignore.file && ignore.rule_id === finding.rule_id) {
        return true;
      }

      // 文件规则：匹配 file 和 rule_id
      if (
        ignore.file === uri.fsPath &&
        !ignore.line &&
        ignore.rule_id === finding.rule_id
      ) {
        return true;
      }

      // 特定出现规则：匹配 file、line、column 和 rule_id
      if (
        ignore.file === uri.fsPath &&
        ignore.line === finding.location.line &&
        ignore.column === finding.location.column &&
        ignore.rule_id === finding.rule_id
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 加载忽略列表
   */
  private static async loadIgnores(uri: vscode.Uri): Promise<IgnoreRule[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return [];
    }

    const ignoresPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      IgnoreManager.IGNORES_FILE
    );

    try {
      const content = await vscode.workspace.fs.readFile(ignoresPath);
      const data: IgnoreList = JSON.parse(
        new TextDecoder().decode(content)
      );
      return data.ignores || [];
    } catch (error) {
      // 文件不存在或解析失败，返回空列表
      return [];
    }
  }

  /**
   * 预加载忽略列表到缓存
   */
  static async preloadIgnores(uri: vscode.Uri): Promise<void> {
    const cacheKey = this.getCacheKey(uri);
    if (this.ignoreCache.has(cacheKey)) {
      return;
    }

    const ignores = await this.loadIgnores(uri);
    this.ignoreCache.set(cacheKey, ignores);
  }

  /**
   * 获取缓存键
   */
  private static getCacheKey(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return uri.fsPath;
    }
    return workspaceFolder.uri.fsPath;
  }

  /**
   * 保存忽略列表
   */
  private static async saveIgnores(
    uri: vscode.Uri,
    ignores: IgnoreRule[]
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    const ignoresPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      IgnoreManager.IGNORES_FILE
    );

    const data: IgnoreList = { ignores };
    const content = JSON.stringify(data, null, 2);

    await vscode.workspace.fs.writeFile(
      ignoresPath,
      new TextEncoder().encode(content)
    );
  }
}
