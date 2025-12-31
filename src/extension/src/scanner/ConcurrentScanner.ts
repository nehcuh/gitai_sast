import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * 扫描任务
 */
interface ScanTask {
  uri: vscode.Uri;
  document: vscode.TextDocument;
}

/**
 * 扫描结果
 */
interface ScanResult {
  uri: vscode.Uri;
  findings: Finding[];
  error?: Error;
}

/**
 * 并发扫描器 - 并发扫描多个文件
 */
export class ConcurrentScanner {
  private _maxConcurrency: number;
  private semaphore: number;

  constructor(maxConcurrency = 3) {
    this._maxConcurrency = maxConcurrency;
    this.semaphore = maxConcurrency;
  }

  /**
   * 并发扫描文件
   */
  async scanFiles(
    tasks: ScanTask[],
    onProgress?: (progress: number) => void
  ): Promise<Map<string, Finding[]>> {
    const results = new Map<string, Finding[]>();
    const total = tasks.length;
    let processed = 0;

    // 使用 Promise.all 实现并发
    const scanPromises = tasks.map((task) =>
      this.scanFileWithConcurrency(
        task,
        async (result) => {
          // 处理结果
          if (result.error) {
            console.error(
              `[ConcurrentScanner] Scan failed: ${task.uri.fsPath}`,
              result.error
            );
          } else {
            results.set(task.uri.fsPath, result.findings);
          }

          // 更新进度
          processed++;
          if (onProgress) {
            onProgress((processed / total) * 100);
          }
        }
      )
    );

    await Promise.all(scanPromises);

    return results;
  }

  /**
   * 扫描单个文件（带并发控制）
   */
  private async scanFileWithConcurrency(
    task: ScanTask,
    callback: (result: ScanResult) => void
  ): Promise<void> {
    // 等待信号量
    await this.acquireSemaphore();

    try {
      // TODO: 调用实际的扫描逻辑
      // const response = await scanner.scanFile(...);
      // callback({ uri: task.uri, findings: response.findings });

      // 占位符
      const findings: Finding[] = [];
      callback({ uri: task.uri, findings });
    } catch (error) {
      callback({
        uri: task.uri,
        findings: [],
        error:
          error instanceof Error
            ? error
            : new Error(String(error)),
      });
    } finally {
      // 释放信号量
      this.releaseSemaphore();
    }
  }

  /**
   * 获取信号量
   */
  private async acquireSemaphore(): Promise<void> {
    while (this.semaphore <= 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    this.semaphore--;
  }

  /**
   * 释放信号量
   */
  private releaseSemaphore(): void {
    this.semaphore++;
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrency(value: number): void {
    this._maxConcurrency = Math.max(1, value);
  }

  /**
   * 获取最大并发数
   */
  getMaxConcurrency(): number {
    return this._maxConcurrency;
  }
}
