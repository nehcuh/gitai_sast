import * as vscode from 'vscode';
import { Finding } from '../core/types';
import {
  createChatCompletion,
  OpenAiCompatibleChatMessage,
} from './OpenAiCompatibleClient';
import { CopilotAgentProvider } from './CopilotAgentProvider';
import * as output from '../core/OutputLogger';

/**
 * AI 修复提供者
 */
export class AiFixProvider {
  private languageModel: vscode.LanguageModelChat | null = null;
  private activeProvider: AiProvider | null = null;

  constructor() {}

  /**
   * 生成修复建议
   */
  async generateFix(
    finding: Finding,
    codeSnippet: string,
    context?: any,
    options?: GenerateFixOptions
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
      throw new Error(
        'AI provider is disabled. Set "gitai.sast.ai.provider" to enable AI fixes.'
      );
    }

    // 确保可用性并设置 activeProvider
    if (!this.activeProvider) {
      const available = await this.checkAvailability();
      if (!available) {
        throw new Error('No AI provider is available.');
      }
    }

    const prompts = this.buildPrompts(finding, codeSnippet, context);

    if (this.activeProvider === 'vscode') {
      const model = await this.ensureVsCodeLanguageModel();
      const prompt = `${prompts.system}\n\n${prompts.user}`.trim();

      if (debugEnabled) {
        output.debug(
          `[AI] provider=vscode prompt=${truncateForLog(
            prompt,
            settings.debugMaxChars
          )}`
        );
      }

      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(prompt),
      ];

      const response = await model.sendRequest(messages, {}, options?.token);
      let responseText = '';

      for await (const chunk of response.text) {
        responseText += chunk;
        if (options?.onDelta) {
          options.onDelta({
            kind: 'content',
            text: chunk,
          });
        }
      }

      return this.parseResponse(responseText, 'vscode');
    } else if (this.activeProvider === 'openaiCompatible') {
      const messages: OpenAiCompatibleChatMessage[] = [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ];

      const response = await createChatCompletion(
        {
          apiUrl: settings.apiUrl,
          apiKey: settings.apiKey,
          model: settings.modelName,
          temperature: settings.temperature,
          timeoutMs: settings.requestTimeoutMs,
          stream: options?.stream ?? settings.stream,
          onDelta: options?.onDelta
            ? (text: string) => {
                options.onDelta!({ kind: 'content', text });
              }
            : undefined,
          onThinkingDelta: settings.enableThinking
            ? (text: string) => {
                options?.onDelta?.({ kind: 'thinking', text });
              }
            : undefined,
          debugLog: debugEnabled
            ? (line: string) => {
                output.debug(`[AI] ${line}`);
              }
            : undefined,
          debugMaxChars: settings.debugMaxChars,
        },
        messages
      );

      return this.parseResponse(response, 'openaiCompatible');
    } else if (this.activeProvider === 'copilotAgent') {
      const prompt = `${prompts.system}\n\n${prompts.user}`.trim();
      const response = await CopilotAgentProvider.request(prompt, {
        stream: options?.stream ?? settings.stream,
        onDelta: options?.onDelta,
      });

      return this.parseResponse(response, 'copilotAgent');
    }

    throw new Error(`Unsupported provider: ${this.activeProvider}`);
  }

  /**
   * 检查 AI 是否可用
   */
  async checkAvailability(): Promise<boolean> {
    const settings = this.getAiSettings();

    if (settings.provider === 'disabled') {
      this.languageModel = null;
      this.activeProvider = null;
      return false;
    }

    if (settings.provider === 'auto') {
      // 按优先级检测可用的提供商
      for (const provider of settings.autoDetectPriority) {
        const available = await this.checkProviderAvailable(provider);
        if (available) {
          this.activeProvider = provider;
          return true;
        }
      }
      this.activeProvider = null;
      return false;
    }

    // 指定的提供商
    const available = await this.checkProviderAvailable(
      settings.provider
    );
    if (available) {
      this.activeProvider = settings.provider;
      return true;
    }
    this.activeProvider = null;
    return false;
  }

  /**
   * 检查特定提供商是否可用
   */
  private async checkProviderAvailable(provider: AiProvider): Promise<boolean> {
    switch (provider) {
      case 'copilotAgent':
        return await CopilotAgentProvider.checkAvailability();
      case 'vscode':
        return await this.checkVsCodeLmAvailable();
      case 'openaiCompatible':
        return await this.checkOpenAiCompatibleAvailable();
      default:
        return false;
    }
  }

  /**
   * 检查 VS Code Language Model 是否可用
   */
  private async checkVsCodeLmAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 检查 OpenAI Compatible API 是否可用
   */
  private async checkOpenAiCompatibleAvailable(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('gitai.sast.ai');
    return Boolean(
      config.get<string>('apiUrl')?.trim() &&
        config.get<string>('modelName')?.trim()
    );
  }

  private buildPrompts(
    finding: Finding,
    codeSnippet: string,
    context?: any
  ): { system: string; user: string } {
    const settings = this.getAiSettings();

    const systemPrompt =
      settings.systemPrompt ||
      'You are a security analyst and code reviewer. Your task is to analyze security vulnerabilities and provide remediation suggestions.';

    const userPromptTemplate =
      settings.userPromptTemplate ||
      '## Vulnerability\n\n**Rule ID:** {rule_id}\n**Severity:** {severity}\n**Title:** {title}\n**Description:** {description}\n\n## Code\n\n```{language}\n{code}\n```\n\nPlease provide a detailed explanation and a fix suggestion.';

    const userPrompt = renderTemplate(userPromptTemplate, {
      rule_id: finding.rule_id,
      severity: finding.severity,
      title: finding.title,
      description: finding.description || '',
      code: codeSnippet,
      language: 'plaintext',
    });

    return { system: systemPrompt, user: userPrompt };
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

  private parseResponse(response: string, provider: string): AiFixResult {
    // 尝试解析为 JSON
    try {
      const parsed = JSON.parse(response);

      if (parsed.suggestion && parsed.code) {
        return {
          suggestion: parsed.suggestion,
          code: parsed.code,
          provider,
          thinking: parsed.thinking,
        };
      }
    } catch {
      // 不是 JSON，继续处理
    }

    // 尝试提取代码块
    const codeMatch = response.match(
      /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/
    );
    const code = codeMatch ? codeMatch[1].trim() : '';

    return {
      suggestion: response,
      code,
      provider,
    };
  }

  private getAiSettings(): AiSettings {
    const config = vscode.workspace.getConfiguration('gitai.sast.ai');

    const providerRaw = config.get<string>('provider', 'auto');
    const provider: AiProvider = isAiProvider(providerRaw)
      ? providerRaw
      : 'auto';

    const autoDetectPriorityRaw = config.get<string[]>(
      'autoDetectPriority',
      ['copilotAgent', 'vscode', 'openaiCompatible']
    );
    const autoDetectPriority: AiProvider[] = autoDetectPriorityRaw.filter(
      (p): p is AiProvider => isAiProvider(p)
    );

    return {
      provider,
      autoDetectPriority,
      apiUrl: config.get<string>('apiUrl', '') || '',
      apiKey: config.get<string>('apiKey', '') || '',
      modelName: config.get<string>('modelName', '') || '',
      temperature: config.get<number>('temperature', 0.2),
      requestTimeoutMs: config.get<number>('requestTimeoutMs', 60000),
      stream: config.get<boolean>('stream', true),
      enableThinking: config.get<boolean>('enableThinking', false),
      systemPrompt: config.get<string>('systemPrompt', '') || '',
      userPromptTemplate:
        config.get<string>('userPromptTemplate', '') || '',
      debugLogging: config.get<boolean>('debugLogging', false),
      debugMaxChars: Math.max(
        1000,
        config.get<number>('debugMaxChars', 12000)
      ),
    };
  }
}

type AiProvider =
  | 'disabled'
  | 'vscode'
  | 'openaiCompatible'
  | 'copilotAgent'
  | 'auto';

interface AiSettings {
  provider: AiProvider;
  autoDetectPriority: AiProvider[];
  apiUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  requestTimeoutMs: number;
  stream: boolean;
  enableThinking: boolean;
  systemPrompt: string;
  userPromptTemplate: string;
  debugLogging: boolean;
  debugMaxChars: number;
}

function isAiProvider(value: string): value is AiProvider {
  return (
    value === 'disabled' ||
    value === 'vscode' ||
    value === 'openaiCompatible' ||
    value === 'copilotAgent' ||
    value === 'auto'
  );
}

function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (match, key) => {
      if (typeof key !== 'string') {
        return match;
      }
      return Object.prototype.hasOwnProperty.call(variables, key)
        ? variables[key]
        : match;
    }
  );
}

/**
 * AI 修复结果
 */
export interface AiFixResult {
  suggestion: string;
  code: string;
  provider: string;
  thinking?: string;
}

function truncateForLog(text: string, maxChars: number): string {
  const normalized = text ?? '';
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(
    0,
    maxChars
  )}…(truncated, total=${normalized.length})`;
}

export interface GenerateFixOptions {
  stream?: boolean;
  onDelta?: (delta: {
    kind: 'thinking' | 'content';
    text: string;
  }) => void;
  token?: vscode.CancellationToken;
}
