import * as vscode from 'vscode';
import { SastScanner } from '../core/SastScanner';
import { Finding } from '../core/types';
import { DiagnosticCache } from '../cache/DiagnosticCache';
import { ChecksumManager } from '../cache/ChecksumManager';

/**
 * 增量扫描器 - 仅扫描变更的文件
 */
export class IncrementalScanner {
  private cache: DiagnosticCache;
  private scanner: SastScanner;
  private checksumManager = ChecksumManager;

  constructor(
    context: vscode.ExtensionContext,
    scanner: SastScanner
  ) {
    this.cache = new DiagnosticCache(context);
    this.scanner = scanner;
  }

  /**
   * 扫描文件（增量）
   */
  async scanFile(
    uri: vscode.Uri,
    document: vscode.TextDocument
  ): Promise<Finding[]> {
    // 计算 checksum
    const checksum = this.checksumManager.calculateDocument(document);

    // 尝试从缓存获取
    const cached = this.cache.get(uri, checksum);
    if (cached !== null) {
      console.log(`[IncrementalScanner] Cache hit: ${uri.fsPath}`);
      return cached;
    }

    // 执行扫描
    console.log(`[IncrementalScanner] Cache miss: ${uri.fsPath}`);
    const response = await this.scanner.scanFile(
      vscode.workspace.rootPath || '',
      uri.fsPath,
      document.getText()
    );

    // 更新缓存
    this.cache.set(uri, response.findings, checksum);

    return response.findings;
  }

  /**
   * 扫描工作区（增量）
   */
  async scanWorkspace(
    uris: vscode.Uri[],
    documents: Map<string, vscode.TextDocument>,
    onProgress?: (progress: number) => void
  ): Promise<Map<string, Finding[]>> {
    const results = new Map<string, Finding[]>();
    const total = uris.length;
    let processed = 0;

    for (const uri of uris) {
      const document = documents.get(uri.fsPath);
      if (!document) {
        // 文档未打开，跳过
        console.log(`[IncrementalScanner] Document not open: ${uri.fsPath}`);
        continue;
      }

      const findings = await this.scanFile(uri, document);
      results.set(uri.fsPath, findings);

      processed++;
      if (onProgress) {
        onProgress((processed / total) * 100);
      }
    }

    return results;
  }

  /**
   * 清除缓存
   */
  clearCache(uri?: vscode.Uri): void {
    this.cache.clear(uri);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    oldest: number;
    newest: number;
  } {
    return this.cache.getStats();
  }
}
