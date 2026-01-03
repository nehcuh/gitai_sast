import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { FixExplanationPanel } from './FixExplanationPanel';

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

    // 应用修复，生成修复后的内容
    const fixedContent = await this.applyFixToContent(
      document,
      finding,
      fixCode
    );

    // 创建临时文档用于 Diff（保持语言一致，便于语法高亮）
    const fixedDocument = await vscode.workspace.openTextDocument({
      language: document.languageId,
      content: fixedContent,
    });

    // 显示 Diff 编辑器
    await vscode.commands.executeCommand<vscode.TextEditor>(
      'vscode.diff',
      originalUri,
      fixedDocument.uri,
      `AI Fix: ${finding.title}`,
      {
        preview: true,
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      }
    );

    // 同时显示解释面板
    if (suggestion || thinking) {
      await FixExplanationPanel.show(finding, suggestion, thinking, fixCode);
    }
  }

  /**
   * 将修复应用到原始内容（智能匹配）
   *
   * @param document 文本文档
   * @param finding 漏洞信息
   * @param fixCode 修复代码
   * @returns 修复后的内容
   */
  private static async applyFixToContent(
    document: vscode.TextDocument,
    finding: Finding,
    fixCode: string
  ): Promise<string> {
    // 尝试片段匹配
    const snippetMatch = this.findSnippetMatch(document, finding);
    let range: vscode.Range;

    if (snippetMatch) {
      range = snippetMatch;
    } else {
      // Fallback Logic
      // CRITICAL CHANGE: Do NOT blindly replace the whole line if snippet was provided but not found.
      // This prevents data loss when fuzzy match fails.

      const line = finding.location.line - 1;

      // Safety check: If snippet is provided but not matched, check if we should abort.
      if (finding.code_snippet && finding.code_snippet.trim().length > 0) {
        console.warn(`[FixDiffViewer] safe abort: snippet provided '${finding.code_snippet}' but no match found in document.`);
        // Return original content to indicate no-op/failure to apply safely
        return document.getText();
      }

      // Only fallback to line replacement if NO snippet was provided (rare case, maybe range-based finding)
      if (line < 0 || line >= document.lineCount) {
        return document.getText();
      }
      range = document.lineAt(line).range;
    }

    const normalizedCode = this.adjustIndentation(fixCode, document, range);
    return this.replaceRange(document, range, normalizedCode);
  }

  /**
   * Escape regex special characters
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 查找代码片段匹配范围
   * 优先查找 code_snippet，如果有多个匹配，选择距离 location 最近的
   *
   * @param document 文本文档
   * @param finding 漏洞信息
   * @returns 匹配的范围，未找到返回 null
   */
  private static findSnippetMatch(
    document: vscode.TextDocument,
    finding: Finding
  ): vscode.Range | null {
    if (!finding.code_snippet) {
      return null;
    }

    const docText = document.getText();
    const snippet = finding.code_snippet;

    // 1. Try Exact Match
    let offsets = this.findOffsetsExact(docText, snippet);

    // 2. Try Fuzzy Match (ignore whitespace differences)
    if (offsets.length === 0) {
      offsets = this.findOffsetsFuzzy(docText, snippet);
    }

    if (offsets.length === 0) {
      return null;
    }

    // Convert offsets to Ranges
    const ranges = offsets.map(([start, end]) => new vscode.Range(
      document.positionAt(start),
      document.positionAt(end)
    ));

    // 如果只有一个匹配，直接返回
    if (ranges.length === 1) {
      return ranges[0];
    }

    // 如果有多个匹配，找到距离 finding.location 最近的那个
    const targetLine = finding.location.line - 1;
    const targetColumn = finding.location.column || 0;
    const targetPos = new vscode.Position(targetLine, targetColumn);
    const targetOffset = document.offsetAt(targetPos);

    let bestRange = ranges[0];
    // offsets[0][0] is the start offset
    let minDistance = Math.abs(targetOffset - offsets[0][0]);

    for (let i = 1; i < ranges.length; i++) {
      const distance = Math.abs(targetOffset - offsets[i][0]);
      if (distance < minDistance) {
        minDistance = distance;
        bestRange = ranges[i];
      }
    }

    return bestRange;
  }

  // Helper to find matches returning offsets [start, end]
  private static findOffsetsExact(text: string, snippet: string): [number, number][] {
    const offsets: [number, number][] = [];
    let pos = text.indexOf(snippet);
    while (pos !== -1) {
      offsets.push([pos, pos + snippet.length]);
      pos = text.indexOf(snippet, pos + 1);
    }
    return offsets;
  }

  private static findOffsetsFuzzy(text: string, snippet: string): [number, number][] {
    // Split snippet into tokens (words and symbols), ignoring whitespace
    const tokens = snippet.split(/\s+/).filter(s => s.length > 0);
    if (tokens.length === 0) return [];

    // Construct regex: token1 \s* token2 \s* ...
    // escape tokens
    const pattern = tokens.map(this.escapeRegExp).join('\\s*');
    const regex = new RegExp(pattern, 'g');

    const offsets: [number, number][] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      offsets.push([match.index, match.index + match[0].length]);
    }
    return offsets;
  }

  /**
   * 替换指定范围的内容
   *
   * @param document 文本文档
   * @param range 要替换的范围
   * @param replacement 替换内容
   * @returns 替换后的完整内容
   */
  private static replaceRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    replacement: string
  ): string {
    const content = document.getText();

    const offset = document.offsetAt(range.start);
    const endOffset = document.offsetAt(range.end);

    return (
      content.substring(0, offset) +
      replacement +
      content.substring(endOffset)
    );
  }

  /**
   * 在编辑器中直接应用修复（智能匹配）
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
    const document = editor.document;

    // 尝试片段匹配
    // 尝试片段匹配
    const snippetMatch = this.findSnippetMatch(document, finding);
    let range: vscode.Range;

    if (snippetMatch) {
      range = snippetMatch;
    } else {
      // fallback: 简单的按行替换
      // CRITICAL: Apply same safety check as applyFixToContent
      const line = finding.location.line - 1; // 转换为 0-based 索引

      if (finding.code_snippet && finding.code_snippet.trim().length > 0) {
        console.warn(`[FixDiffViewer] safe abort: snippet provided but not found.`);
        return false;
      }

      if (line < 0 || line >= document.lineCount) {
        return false;
      }
      range = document.lineAt(line).range;
    }

    // 调整缩进
    const normalizedCode = this.adjustIndentation(fixCode, document, range);

    // 应用编辑
    return await this.replaceInRange(editor, range, normalizedCode);
  }



  /**
   * 调整代码缩进以匹配目标上下文
   */
  private static adjustIndentation(code: string, document: vscode.TextDocument, range: vscode.Range): string {
    // 1. Dedent (移除公共前缀空格)
    const lines = code.split('\n');
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const indent = line.search(/\S/);
      if (indent !== -1 && indent < minIndent) {
        minIndent = indent;
      }
    }

    let dedentedLines = lines;
    if (minIndent !== Infinity && minIndent > 0) {
      dedentedLines = lines.map(line => {
        if (line.trim().length === 0) return '';
        return line.substring(minIndent);
      });
    }

    // 2. 获取目标行的缩进
    const startLineText = document.lineAt(range.start.line).text;
    const targetIndentMatch = startLineText.match(/^\s*/);
    const targetIndent = targetIndentMatch ? targetIndentMatch[0] : '';
    const indentLen = targetIndent.length;

    // 3. 重新应用缩进

    // check if range visually starts at the beginning of the line (ignoring whitespace)
    const isLineStart = range.start.character === 0 || startLineText.substring(0, range.start.character).trim() === '';

    // check if the existing indentation is preserved (i.e., range starts AFTER indentation)
    const indentationIsPreserved = range.start.character >= indentLen;

    return dedentedLines.map((line, index) => {
      // Empty lines might need to be preserved empty or indented? Usually empty is fine.
      if (line.length === 0) return '';

      // For the first line:
      if (index === 0) {
        // If inline (mid-text), don't add indent
        if (!isLineStart) return line;

        // If line start:
        // If indentation is already there (outside range), don't add it (avoid double indent)
        if (indentationIsPreserved) return line;

        // If indentation is overwritten (inside range), restore it.
        return targetIndent + line;
      }

      // For subsequent lines, always add targetIndent to the dedented content
      return targetIndent + line;
    }).join('\n');
  }

  /**
   * 在编辑器中替换指定范围
   */
  private static async replaceInRange(
    editor: vscode.TextEditor,
    range: vscode.Range,
    replacement: string
  ): Promise<boolean> {
    try {
      const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, replacement);
      });
      return success;
    } catch (error) {
      console.error('[FixDiffViewer] Failed to replace in range:', error);
      return false;
    }
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
