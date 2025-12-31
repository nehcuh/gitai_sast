import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 缓存项
 */
interface CacheItem {
  uri: string;
  findings: Finding[];
  timestamp: number;
  checksum: string;
}

/**
 * 诊断缓存 - 缓存扫描结果
 */
export class DiagnosticCache {
  private static readonly CACHE_KEY = 'gitai.sast.cache.diagnostics';
  private static readonly MAX_AGE_MS = 5 * 60 * 1000; // 5 分钟
  private static readonly MAX_SIZE = 100;

  private cache: Map<string, CacheItem> = new Map();
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadCache();
  }

  /**
   * 获取缓存的诊断信息
   */
  get(uri: vscode.Uri, checksum: string): Finding[] | null {
    const key = this.getCacheKey(uri);
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - item.timestamp > DiagnosticCache.MAX_AGE_MS) {
      this.cache.delete(key);
      this.saveCache();
      return null;
    }

    // 检查 checksum 是否匹配
    if (item.checksum !== checksum) {
      this.cache.delete(key);
      this.saveCache();
      return null;
    }

    return item.findings;
  }

  /**
   * 设置缓存
   */
  set(uri: vscode.Uri, findings: Finding[], checksum: string): void {
    const key = this.getCacheKey(uri);

    // 检查缓存大小
    if (this.cache.size >= DiagnosticCache.MAX_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      uri: uri.fsPath,
      findings,
      timestamp: Date.now(),
      checksum,
    });

    this.saveCache();
  }

  /**
   * 清除缓存
   */
  clear(uri?: vscode.Uri): void {
    if (uri) {
      const key = this.getCacheKey(uri);
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }

    this.saveCache();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; oldest: number; newest: number } {
    if (this.cache.size === 0) {
      return { size: 0, oldest: 0, newest: 0 };
    }

    const timestamps = Array.from(this.cache.values()).map(i => i.timestamp);

    return {
      size: this.cache.size,
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
    };
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(uri: vscode.Uri): string {
    return uri.fsPath;
  }

  /**
   * 淘汰最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Number.MAX_VALUE;

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 加载缓存
   */
  private loadCache(): void {
    const data = this.context.globalState.get<Record<string, CacheItem>>(
      DiagnosticCache.CACHE_KEY
    );

    if (data) {
      this.cache = new Map(Object.entries(data));
    }
  }

  /**
   * 保存缓存
   */
  private saveCache(): void {
    const data = Object.fromEntries(this.cache.entries());
    void this.context.globalState.update(
      DiagnosticCache.CACHE_KEY,
      data
    );
  }
}
