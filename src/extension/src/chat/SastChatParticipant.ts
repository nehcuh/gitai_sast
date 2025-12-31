import * as vscode from 'vscode';
import { AiFixProvider } from '../ai/AiFixProvider';
import { McpClient } from '../core/McpClient';
import { SastScanner } from '../core/SastScanner';
import { DiagnosticManager } from '../core/DiagnosticManager';
import { IntentRecognizer, Intent } from './nlp/IntentRecognizer';
import { ExplainHandler } from './handlers/ExplainHandler';
import { FixHandler } from './handlers/FixHandler';
import { TaintHandler } from './handlers/TaintHandler';
import { ScanHandler } from './handlers/ScanHandler';

/**
 * SAST Chat Participant - Copilot Chat 参与者
 */
export class SastChatParticipant {
  private static readonly ID = 'gitai.sast.chatParticipant';

  private explainHandler: ExplainHandler;
  private fixHandler: FixHandler;
  private taintHandler: TaintHandler;
  private scanHandler: ScanHandler;

  constructor(
    private aiFixProvider: AiFixProvider,
    private mcpClient: McpClient,
    private scanner: SastScanner,
    private diagnostics: DiagnosticManager
  ) {
    // 初始化命令处理器
    this.explainHandler = new ExplainHandler(aiFixProvider);
    this.fixHandler = new FixHandler(aiFixProvider);
    this.taintHandler = new TaintHandler(mcpClient);
    this.scanHandler = new ScanHandler(scanner, diagnostics);
  }

  /**
   * 注册 Chat Participant
   */
  register(context: vscode.ExtensionContext): void {
    const participant = vscode.chat.createChatParticipant(
      SastChatParticipant.ID,
      this.handleRequest.bind(this)
    );

    // 设置图标
    participant.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      'resources',
      'sast-icon.png'
    );

    // 设置 Follow-up 提示
    participant.followupProvider = this.getFollowupProvider();

    // 注册到订阅列表
    context.subscriptions.push(participant);

    console.log('[GitAI SAST] Chat Participant registered');
  }

  /**
   * 处理 Chat 请求
   */
  private async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const command = request.command;
    const input = request.prompt;

    console.log(
      `[GitAI SAST] Chat request: command=${command}, prompt=${input}`
    );

    try {
      switch (command) {
        case 'explain':
          return await this.handleExplain(request, context, stream, token);
        case 'fix':
          return await this.handleFix(request, context, stream, token);
        case 'taint':
          return await this.handleTaint(request, context, stream, token);
        case 'scan':
          return await this.handleScan(request, context, stream, token);
        default:
          return await this.handleNaturalLanguage(
            request,
            context,
            stream,
            token
          );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      stream.markdown(`❌ Error: ${message}`);
      return { metadata: { success: false } };
    }
  }

  /**
   * 处理 Explain 命令
   */
  private async handleExplain(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    return await this.explainHandler.handle(request, context, stream, token);
  }

  /**
   * 处理 Fix 命令
   */
  private async handleFix(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    return await this.fixHandler.handle(request, context, stream, token);
  }

  /**
   * 处理 Taint 命令
   */
  private async handleTaint(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    return await this.taintHandler.handle(request, context, stream, token);
  }

  /**
   * 处理 Scan 命令
   */
  private async handleScan(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    return await this.scanHandler.handle(request, context, stream, token);
  }

  /**
   * 处理自然语言请求
   */
  private async handleNaturalLanguage(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const result = IntentRecognizer.recognize(request.prompt);

    switch (result.intent) {
      case Intent.Explain:
        return await this.handleExplain(request, context, stream, token);
      case Intent.Fix:
        return await this.handleFix(request, context, stream, token);
      case Intent.Taint:
        return await this.handleTaint(request, context, stream, token);
      case Intent.Scan:
        return await this.handleScan(request, context, stream, token);
      case Intent.Unknown:
      default:
        // 默认回复
        return this.handleUnknown(request, stream);
    }
  }

  /**
   * 处理未知请求
   */
  private handleUnknown(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
  ): vscode.ChatResult {
    stream.markdown(
      `I can help you with security analysis. Here are some things you can ask:\n\n`
    );
    stream.markdown(
      `- \`@sast explain\`: Explain vulnerabilities in current file\n`
    );
    stream.markdown(
      `- \`@sast fix\`: Generate AI fixes\n`
    );
    stream.markdown(
      `- \`@sast taint\`: View taint paths\n`
    );
    stream.markdown(
      `- \`@sast scan\`: Scan current file or workspace\n`
    );

    return { metadata: { success: true } };
  }

  /**
   * 获取 Follow-up 提示提供者
   */
  private getFollowupProvider(): vscode.ChatFollowupProvider {
    return {
      provideFollowups: (
        result: vscode.ChatResult,
        context: vscode.ChatContext,
        token: vscode.CancellationToken
      ) => {
        return [
          {
            prompt: 'Explain this vulnerability in detail',
            label: 'Explain Vulnerability',
            // kind: vscode.ChatFollowupKind.Action, // 注释掉，可能不存在
          },
          {
            prompt: 'Generate a fix with code',
            label: 'Generate Fix',
            // kind: vscode.ChatFollowupKind.Action,
          },
          {
            prompt: 'Show me the taint path',
            label: 'View Taint Path',
            // kind: vscode.ChatFollowupKind.Action,
          },
        ];
      },
    };
  }
}
