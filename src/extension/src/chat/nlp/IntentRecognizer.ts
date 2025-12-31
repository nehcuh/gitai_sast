/**
 * 意图类型
 */
export enum Intent {
  Explain,
  Fix,
  Taint,
  Scan,
  Unknown,
}

import * as vscode from 'vscode';

/**
 * 意图识别结果
 */
export interface IntentResult {
  intent: Intent;
  params: Record<string, string>;
}

/**
 * 意图识别器 - 识别用户的自然语言意图
 */
export class IntentRecognizer {
  /**
   * 识别用户意图
   *
   * @param input 用户输入
   * @returns 意图识别结果
   */
  static recognize(input: string): IntentResult {
    const lower = input.toLowerCase();

    // 检查是否有明确的命令关键词
    if (this.hasKeywords(lower, ['explain', 'what is', 'describe'])) {
      return { intent: Intent.Explain, params: {} };
    }

    if (this.hasKeywords(lower, ['fix', 'repair', 'solve', 'patch'])) {
      return { intent: Intent.Fix, params: {} };
    }

    if (this.hasKeywords(lower, ['taint', 'path', 'flow', 'trace'])) {
      return { intent: Intent.Taint, params: {} };
    }

    if (this.hasKeywords(lower, ['scan', 'check', 'analyze', 'detect'])) {
      return { intent: Intent.Scan, params: {} };
    }

    // 默认未知
    return { intent: Intent.Unknown, params: {} };
  }

  /**
   * 提取漏洞上下文
   *
   * @param input 用户输入
   * @param document 文档
   * @returns 漏洞信息，未找到返回 null
   */
  static extractFindingContext(
    input: string,
    document: vscode.TextDocument
  ): any | null {
    // 尝试从输入中提取 Rule ID
    const ruleIdMatch = input.match(/rule\s*id\s*[:\s]*([a-z0-9.-]+)/i);
    if (ruleIdMatch) {
      const ruleId = ruleIdMatch[1];
      // TODO: 从 DiagnosticManager 获取 findings
      // 暂时返回 null
      return null;
    }

    // 如果没有指定 Rule ID，返回第一个 finding
    // TODO: 从 DiagnosticManager 获取 findings
    // 暂时返回 null
    return null;
  }

  /**
   * 检查是否包含关键词
   *
   * @param input 输入
   * @param keywords 关键词列表
   * @returns 是否包含关键词
   */
  private static hasKeywords(
    input: string,
    keywords: string[]
  ): boolean {
    return keywords.some((keyword) => input.includes(keyword));
  }

  /**
   * 提取参数
   *
   * @param input 输入
   * @param paramPatterns 参数模式
   * @returns 参数
   */
  static extractParams(
    input: string,
    paramPatterns: Record<string, RegExp>
  ): Record<string, string> {
    const params: Record<string, string> = {};

    for (const [paramName, pattern] of Object.entries(paramPatterns)) {
      const match = input.match(pattern);
      if (match && match[1]) {
        params[paramName] = match[1];
      }
    }

    return params;
  }
}
