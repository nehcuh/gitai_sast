import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * AI 修复提供者
 */
export class AiFixProvider {
  private languageModel: vscode.LanguageModelChat | null = null;

  constructor() {}

  /**
   * 生成修复建议
   */
  async generateFix(
    finding: Finding,
    codeSnippet: string,
    context?: any
  ): Promise<AiFixResult> {
    if (!this.languageModel) {
      throw new Error('Language model not available');
    }

    // 构建提示
    const prompt = this.buildPrompt(finding, codeSnippet, context);

    // 调用 AI 模型
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(prompt)
    ];

    const response = await this.languageModel.sendRequest(
      messages,
      {},
      new vscode.CancellationTokenSource().token
    );

    // 解析响应
    const textParts: string[] = [];
    for await (const part of response.text) {
      textParts.push(part);
    }
    const text = textParts.join('');
    
    return {
      suggestion: text,
      code: this.extractCode(text),
      provider: 'vscode-ai',
    };
  }

  /**
   * 构建提示
   */
  private buildPrompt(
    finding: Finding,
    codeSnippet: string,
    context?: any
  ): string {
    let prompt = `You are a security expert. Fix following security vulnerability:\n\n`;
    
    prompt += `## Vulnerability\n`;
    prompt += `- Rule ID: ${finding.rule_id}\n`;
    prompt += `- Severity: ${finding.severity}\n`;
    prompt += `- Title: ${finding.title}\n`;
    prompt += `- Description: ${finding.description}\n`;
    
    prompt += `\n## Code Snippet\n`;
    prompt += `\`\`\`\n${codeSnippet}\n\`\`\`\n`;
    
    if (context) {
      prompt += `\n## Context\n`;
      prompt += JSON.stringify(context, null, 2);
    }
    
    prompt += `\n## Instructions\n`;
    prompt += `1. Provide a fix for the vulnerability\n`;
    prompt += `2. Explain why the fix works\n`;
    prompt += `3. Return the fix as a code block\n`;
    
    return prompt;
  }

  /**
   * 提取代码块
   */
  private extractCode(text: string): string {
    // 提取 ``` 到 ``` 之间的代码
    const codeBlockRegex = /```(?:[\w]+)?\n([\s\S]*?)\n```/;
    const match = text.match(codeBlockRegex);
    
    return match ? match[1].trim() : text;
  }

  /**
   * 检查 AI 是否可用
   */
  async checkAvailability(): Promise<boolean> {
    const models = await vscode.lm.selectChatModels();
    this.languageModel = models[0] || null;
    
    return this.languageModel !== null;
  }
}

/**
 * AI 修复结果
 */
export interface AiFixResult {
  suggestion: string;
  code: string;
  provider: string;
}
