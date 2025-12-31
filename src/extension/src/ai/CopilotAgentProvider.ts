import * as vscode from 'vscode';

/**
 * Copilot Agent Provider - 通过 Copilot Chat API 发送请求
 *
 * 注意：当前 Copilot Chat 没有公开 API
 * 这个实现是预留的，未来 API 公开后需要更新
 */
export class CopilotAgentProvider {
  /**
   * 发送请求到 Copilot Agent
   *
   * @param prompt 提示词
   * @param options 选项
   * @returns 响应文本
   */
  static async request(
    prompt: string,
    options?: {
      stream?: boolean;
      onDelta?: (delta: {
        kind: 'thinking' | 'content';
        text: string;
      }) => void;
    }
  ): Promise<string> {
    // 检查 Copilot Chat 是否安装
    const hasCopilot = vscode.extensions.getExtension(
      'GitHub.copilot-chat'
    );
    if (!hasCopilot) {
      throw new Error('Copilot Chat extension is not installed');
    }

    // 检查 API 是否可用
    const apiAvailable = await this.checkApiAvailable();
    if (!apiAvailable) {
      // 回退：打开 Chat 窗口并输入消息
      await vscode.commands.executeCommand(
        'workbench.action.chat.open',
        prompt
      );
      throw new Error(
        'Copilot Chat API is not yet available. ' +
        'Please use "vscode" or "openaiCompatible" provider.'
      );
    }

    // TODO: 当 API 公开后实现
    // const api = hasCopilot.exports.chatApi;
    // const response = await api.request(prompt, options);
    // return response.text;

    throw new Error('Copilot Chat API is not yet available');
  }

  /**
   * 检查 Copilot Agent 是否可用
   */
  static async checkAvailability(): Promise<boolean> {
    // 检查扩展是否安装
    const hasCopilot = vscode.extensions.getExtension(
      'GitHub.copilot-chat'
    );
    if (!hasCopilot) {
      return false;
    }

    // 检查 API 是否可用
    return await this.checkApiAvailable();
  }

  /**
   * 获取可用模型列表
   */
  static async getModels(): Promise<string[]> {
    // TODO: 当 API 公开后实现
    return [];
  }

  /**
   * 检查 API 是否可用
   */
  private static async checkApiAvailable(): Promise<boolean> {
    // TODO: 当 API 公开后实现检测逻辑
    return false;
  }
}
