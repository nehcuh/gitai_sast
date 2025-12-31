import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * AI 请求优化器 - 批量处理、缓存、压缩
 */
export class AiRequestOptimizer {
  private static requestCache = new Map<
    string,
    { result: string; timestamp: number }
  >();
  private static readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟

  /**
   * 批量生成修复建议
   */
  static async batchGenerateFix(
    findings: Finding[],
    generateFix: (
      finding: Finding,
      code: string
    ) => Promise<{ suggestion: string; code: string }>
  ): Promise<
    Array<{ finding: Finding; suggestion: string; code: string }>
  > {
    const results: Array<{
      finding: Finding;
      suggestion: string;
      code: string;
    }> = [];

    // 并发处理（限制并发数）
    const concurrency = 3;
    const batches = this.chunkArray(findings, concurrency);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (finding) => {
          const result = await generateFix(
            finding,
            finding.code_snippet || ''
          );

          return { finding, ...result };
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 缓存的修复生成
   */
  static async cachedGenerateFix(
    finding: Finding,
    code: string,
    generateFix: (
      finding: Finding,
      code: string
    ) => Promise<{ suggestion: string; code: string }>
  ): Promise<{ suggestion: string; code: string }> {
    const cacheKey = this.getCacheKey(finding, code);

    // 检查缓存
    const cached = this.requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('[AiRequestOptimizer] Cache hit');
      // 假设缓存的结果是 JSON
      return JSON.parse(cached.result);
    }

    // 生成结果
    const result = await generateFix(finding, code);

    // 更新缓存
    this.requestCache.set(cacheKey, {
      result: JSON.stringify(result),
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * 压缩请求内容
   */
  static compressPrompt(prompt: string): string {
    // 移除多余的空白
    let compressed = prompt.replace(/\s+/g, ' ').trim();

    // 移除注释
    compressed = compressed.replace(/\/\/.*/g, '');

    // 移除空行
    compressed = compressed.replace(/^\s*[\r\n]/gm, '');

    return compressed;
  }

  /**
   * 清理缓存
   */
  static clearCache(finding?: Finding): void {
    if (finding) {
      // 清理特定 finding 的缓存
      for (const [key] of this.requestCache.entries()) {
        if (key.startsWith(finding.id)) {
          this.requestCache.delete(key);
        }
      }
    } else {
      // 清理所有缓存
      this.requestCache.clear();
    }
  }

  /**
   * 获取缓存键
   */
  private static getCacheKey(
    finding: Finding,
    code: string
  ): string {
    // 使用 finding 的关键信息 + code 的 hash
    const content = `${finding.rule_id}:${finding.severity}:${code}`;
    return `fix:${content}`;
  }

  /**
   * 分块数组
   */
  private static chunkArray<T>(
    array: T[],
    chunkSize: number
  ): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 获取缓存统计
   */
  static getCacheStats(): {
    size: number;
    oldest: number;
    newest: number;
  } {
    if (this.requestCache.size === 0) {
      return { size: 0, oldest: 0, newest: 0 };
    }

    const timestamps = Array.from(
      this.requestCache.values()
    ).map((c) => c.timestamp);

    return {
      size: this.requestCache.size,
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
    };
  }
}
