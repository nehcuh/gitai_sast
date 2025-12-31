import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Checksum 管理器 - 计算文件内容的校验和
 */
export class ChecksumManager {
  /**
   * 计算字符串的 checksum
   */
  static calculate(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * 计算 VS Code 文档的 checksum
   */
  static calculateDocument(
    document: vscode.TextDocument
  ): string {
    const text = document.getText();
    return this.calculate(text);
  }
}
