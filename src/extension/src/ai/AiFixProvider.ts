import * as vscode from 'vscode';
import { Finding } from '../core/types';
import { createChatCompletion } from './OpenAiCompatibleClient';
import * as output from '../core/OutputLogger';

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
    const settings = this.getAiSettings();
    const debugEnabled = settings.debugLogging;

    if (debugEnabled) {
      output.showOutputLogger(true);
      output.info(
        `[AI] generateFix rule_id=${finding.rule_id} severity=${finding.severity} provider=${settings.provider}`
      );
    }

    if (settings.provider === 'disabled') {
      throw new Error('AI provider is disabled. Set "gitai.sast.ai.provider" to enable AI fixes.');
    }

    const prompts = this.buildPrompts(finding, codeSnippet, context);

    if (settings.provider === 'vscode') {
      const model = await this.ensureVsCodeLanguageModel();
      const prompt = `${prompts.system}\n\n${prompts.user}`.trim();

      if (debugEnabled) {
        output.debug(`[AI] provider=vscode prompt=${truncateForLog(prompt, settings.debugMaxChars)}`);
      }

      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(prompt),
      ];

      const response = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );

      const textParts: string[] = [];
      for await (const part of response.text) {
        textParts.push(part);
      }
      const text = textParts.join('');

      if (debugEnabled) {
        output.debug(`[AI] provider=vscode response=${truncateForLog(text, settings.debugMaxChars)}`);
      }

      return {
        suggestion: text,
        code: this.extractCode(text),
        provider: 'vscode-lm',
      };
    }

    if (debugEnabled) {
      output.debug(`[AI] provider=openaiCompatible apiUrl=${settings.apiUrl} model=${settings.modelName}`);
      output.debug(`[AI] system=${truncateForLog(prompts.system, settings.debugMaxChars)}`);
      output.debug(`[AI] user=${truncateForLog(prompts.user, settings.debugMaxChars)}`);
    }

    const text = await createChatCompletion(
      {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        model: settings.modelName,
        temperature: settings.temperature,
        timeoutMs: settings.requestTimeoutMs,
        debugLog: debugEnabled ? (line) => output.debug(line) : undefined,
        debugMaxChars: settings.debugMaxChars,
      },
      [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ]
    );

    if (debugEnabled) {
      output.debug(`[AI] provider=openaiCompatible content=${truncateForLog(text, settings.debugMaxChars)}`);
    }

    return {
      suggestion: text,
      code: this.extractCode(text),
      provider: 'openai-compatible',
    };
  }

  /**
   * 构建提示（system + user）
   */
  private buildPrompts(
    finding: Finding,
    codeSnippet: string,
    context?: any
  ): { system: string; user: string } {
    const settings = this.getAiSettings();

    const defaultSystem =
      [
        '你是一名资深应用安全（AppSec）工程师。请基于提供的代码片段给出安全、最小化且可落地的修复方案。',
        '',
        '输出要求：',
        '- 解释部分使用中文输出，但所有专业术语使用英文（例如 vulnerability type、attack vector、threat model、root cause、taint flow、source/sink/sanitizer、input validation、encoding/escaping、SQL injection、XSS、CSRF、SSRF、RCE、CWE/OWASP、以及库名/API/函数/类名等）。',
        '- 修复代码放在最后，并且只输出一个 ``` 代码块（不要输出 diff）。',
        '- 代码块内保持目标语言的常见格式与正确缩进；尽量最小改动，不引入新问题。',
        '- 如果上下文不足，请说明你的假设，并给出最小可行修复（minimal viable fix）。',
      ].join('\n');

    const variables: Record<string, string> = {
      rule_id: finding.rule_id,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      code_snippet: codeSnippet,
      context: context ? JSON.stringify(context, null, 2) : '',
    };

    const system = (settings.systemPrompt?.trim() || defaultSystem).trim();

    if (settings.userPromptTemplate?.trim()) {
      return {
        system,
        user: renderTemplate(settings.userPromptTemplate, variables).trim(),
      };
    }

    let user = `请修复下面的安全问题，并按要求输出。\n\n`;
    user += `## Vulnerability\n`;
    user += `- Rule ID: ${finding.rule_id}\n`;
    user += `- Severity: ${finding.severity}\n`;
    user += `- Title: ${finding.title}\n`;
    user += `- Description: ${finding.description}\n`;
    user += `\n## Code Snippet\n`;
    user += `\`\`\`\n${codeSnippet}\n\`\`\`\n`;

    if (context) {
      user += `\n## Context\n`;
      user += `${JSON.stringify(context, null, 2)}\n`;
    }

    user += `\n## Instructions\n`;
    user += `1. 用中文解释：root cause、可能的 attack scenario、修复思路与 trade-offs（专业术语用英文，不要翻译）。\n`;
    user += `2. 给出修复后的代码（仅一个代码块），保证缩进/格式正确，可直接替换或粘贴。\n`;
    user += `3. 尽量保持最小改动；不要引入与该问题无关的重构。\n`;

    return { system, user: user.trim() };
  }

  /**
   * 提取代码块
   */
  private extractCode(text: string): string {
    // 提取 ``` 到 ``` 之间的代码
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = text.match(codeBlockRegex);

    if (!match) {
      return text;
    }

    // 注意：不能用 trim()，否则会误删代码第一行的缩进（例如函数体内片段）。
    let extracted = match[1];
    extracted = extracted.replace(/^\n+/, '');
    extracted = extracted.replace(/\s+$/, '');
    return extracted;
  }

  /**
   * 检查 AI 是否可用
   */
  async checkAvailability(): Promise<boolean> {
    const settings = this.getAiSettings();

    if (settings.provider === 'disabled') {
      this.languageModel = null;
      return false;
    }

    if (settings.provider === 'openaiCompatible') {
      this.languageModel = null;
      return Boolean(settings.apiUrl.trim() && settings.modelName.trim());
    }

    try {
      const models = await vscode.lm.selectChatModels();
      this.languageModel = models[0] || null;
      return this.languageModel !== null;
    } catch {
      this.languageModel = null;
      return false;
    }
  }

  private async ensureVsCodeLanguageModel(): Promise<vscode.LanguageModelChat> {
    if (this.languageModel) {
      return this.languageModel;
    }

    const models = await vscode.lm.selectChatModels();
    this.languageModel = models[0] || null;

    if (!this.languageModel) {
      throw new Error(
        'No VS Code AI chat model available. Install/enable a provider (e.g. GitHub Copilot Chat) or switch "gitai.sast.ai.provider" to "openaiCompatible".'
      );
    }

    return this.languageModel;
  }

  private getAiSettings(): AiSettings {
    const config = vscode.workspace.getConfiguration('gitai.sast.ai');

    const providerRaw = config.get<string>('provider', 'vscode');
    const provider: AiProvider = isAiProvider(providerRaw) ? providerRaw : 'vscode';

    return {
      provider,
      apiUrl: config.get<string>('apiUrl', '') || '',
      apiKey: config.get<string>('apiKey', '') || '',
      modelName: config.get<string>('modelName', '') || '',
      temperature: config.get<number>('temperature', 0.2),
      requestTimeoutMs: config.get<number>('requestTimeoutMs', 60000),
      systemPrompt: config.get<string>('systemPrompt', '') || '',
      userPromptTemplate: config.get<string>('userPromptTemplate', '') || '',
      debugLogging: config.get<boolean>('debugLogging', false),
      debugMaxChars: Math.max(1000, config.get<number>('debugMaxChars', 12000)),
    };
  }
}

type AiProvider = 'disabled' | 'vscode' | 'openaiCompatible';

interface AiSettings {
  provider: AiProvider;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  requestTimeoutMs: number;
  systemPrompt: string;
  userPromptTemplate: string;
  debugLogging: boolean;
  debugMaxChars: number;
}

function isAiProvider(value: string): value is AiProvider {
  return value === 'disabled' || value === 'vscode' || value === 'openaiCompatible';
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (typeof key !== 'string') {
      return match;
    }
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}

/**
 * AI 修复结果
 */
export interface AiFixResult {
  suggestion: string;
  code: string;
  provider: string;
}

function truncateForLog(text: string, maxChars: number): string {
  const normalized = text ?? '';
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}…(truncated, total=${normalized.length})`;
}
