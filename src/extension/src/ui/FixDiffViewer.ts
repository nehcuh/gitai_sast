import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * Diff 查看器 - 在 VSCode Diff 编辑器中展示 AI 修复建议
 */
export class FixDiffViewer {
  /**
   * 在 Diff 编辑器中展示修复建议
   *
   * @param originalUri 原始文件 URI
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @param suggestion AI 建议全文
   * @param thinking AI 推理过程（可选）
   */
  static async showFixDiff(
    originalUri: vscode.Uri,
    finding: Finding,
    fixCode: string,
    suggestion: string,
    thinking?: string
  ): Promise<void> {
    // 读取原始文档内容
    const document = await vscode.workspace.openTextDocument(originalUri);
    const originalContent = document.getText();

    // 应用修复，生成修复后的内容
    const fixedContent = this.applyFixToContent(originalContent, finding, fixCode);

    // 创建临时文件用于 Diff
    const fixedUri = vscode.Uri.parse(`untitled:${originalUri.path}.fixed`);

    // 写入修复后的内容
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(fixedUri, encoder.encode(fixedContent));

    // 显示 Diff 编辑器
    const diffEditor = await vscode.commands.executeCommand<vscode.TextEditor>(
      'vscode.diff',
      originalUri,
      fixedUri,
      `AI Fix: ${finding.title}`,
      {
        preview: true,
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      }
    );

    // 同时显示解释面板
    if (suggestion || thinking) {
      await FixExplanationPanel.show(finding, suggestion, thinking);
    }
  }

  /**
   * 将修复应用到原始内容
   *
   * @param originalContent 原始内容
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 修复后的内容
   */
  private static applyFixToContent(
    originalContent: string,
    finding: Finding,
    fixCode: string
  ): string {
    // TODO: 实现智能替换逻辑
    // 目前使用简单的按行替换（仅用于 MVP）
    const lines = originalContent.split('\n');
    const targetLine = finding.location.line - 1; // 转换为 0-based 索引

    if (targetLine >= 0 && targetLine < lines.length) {
      lines[targetLine] = fixCode;
    }

    return lines.join('\n');
  }

  /**
   * 在编辑器中直接应用修复（最佳尝试）
   *
   * @param editor 文本编辑器
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 是否成功应用
   */
  static async applyFix(
    editor: vscode.TextEditor,
    finding: Finding,
    fixCode: string
  ): Promise<boolean> {
    // TODO: 实现智能匹配和替换
    // 目前使用简单的按行替换（仅用于 MVP）

    const document = editor.document;
    const line = finding.location.line - 1; // 转换为 0-based 索引
    const column = finding.location.column || 0;

    // 检查行号是否有效
    if (line < 0 || line >= document.lineCount) {
      return false;
    }

    const range = document.lineAt(line).range;

    // 应用编辑
    const success = await editor.edit(editBuilder => {
      editBuilder.replace(range, fixCode);
    });

    return success;
  }
}

/**
 * 修复应用策略
 */
export enum FixApplyStrategy {
  /**
   * 最佳尝试：尝试匹配代码片段
   */
  BestEffort = 'best-effort',

  /**
   * 精确匹配：替换完全匹配的行
   */
  ExactMatch = 'exact-match',

  /**
   * 手动：仅复制到剪贴板
   */
  Manual = 'manual',
}
