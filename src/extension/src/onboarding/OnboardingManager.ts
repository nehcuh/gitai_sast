import * as vscode from 'vscode';
import { AiFixProvider } from '../ai/AiFixProvider';

/**
 * Onboarding Manager - 首次使用引导
 */
export class OnboardingManager {
  private static readonly ONBOARDING_DONE_KEY =
    'gitai.sast.onboarding.done';

  /**
   * 显示首次使用引导
   */
  static async showOnboarding(
    context: vscode.ExtensionContext
  ): Promise<void> {
    // 检查是否已完成引导
    if (context.globalState.get(OnboardingManager.ONBOARDING_DONE_KEY)) {
      return;
    }

    // 显示欢迎消息
    const message =
      'Welcome to GitAI SAST! Would you like a quick tour of the extension?';

    const result = await vscode.window.showInformationMessage(
      message,
      'Start Tour',
      'Skip'
    );

    if (result === 'Skip') {
      // 标记为已完成
      await context.globalState.update(
        OnboardingManager.ONBOARDING_DONE_KEY,
        true
      );
      return;
    }

    if (result === 'Start Tour') {
      await this.startTour(context);
    }
  }

  /**
   * 开始引导
   */
  private static async startTour(
    context: vscode.ExtensionContext
  ): Promise<void> {
    // 步骤 1: 简介
    await this.showStep1();

    // 步骤 2: AI 配置
    await this.showStep2();

    // 步骤 3: 快捷键
    await this.showStep3();

    // 步骤 4: 完成
    await this.showStep4(context);
  }

  /**
   * 步骤 1: 简介
   */
  private static async showStep1(): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      '🚀 Step 1/4: GitAI SAST Introduction\n\n' +
        'GitAI SAST is an AI-powered static code analysis tool that helps you find and fix security vulnerabilities in your code.\n\n' +
        'Features:\n' +
        '• Real-time security scanning\n' +
        '• AI-powered fix suggestions\n' +
        '• Code Actions for quick fixes\n' +
        '• Copilot Chat integration\n\n' +
        'Ready to continue?',
      'Next',
      'Cancel'
    );

    if (result === 'Cancel') {
      throw new Error('Onboarding cancelled');
    }
  }

  /**
   * 步骤 2: AI 配置
   */
  private static async showStep2(): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      '🤖 Step 2/4: AI Configuration\n\n' +
        'GitAI SAST uses AI to generate fix suggestions. You can choose from multiple providers:\n\n' +
        '• VS Code built-in AI (Copilot Chat)\n' +
        '• OpenAI-compatible API\n' +
        '• Auto-detect (recommended)\n\n' +
        'Open Settings to configure your AI provider.',
      'Open Settings',
      'Skip'
    );

    if (result === 'Open Settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'gitai.sast.ai'
      );
    }
  }

  /**
   * 步骤 3: 快捷键
   */
  private static async showStep3(): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      '⌨️ Step 3/4: Keyboard Shortcuts\n\n' +
        'Common commands:\n' +
        '• Scan Current File: gitai.sast.scan\n' +
        '• Scan Workspace: gitai.sast.scanWorkspace\n' +
        '• Show Results: gitai.sast.showResults\n' +
        '• AI Fix: gitai.sast.aiFix\n\n' +
        'Open Keyboard Shortcuts to customize.',
      'Open Shortcuts',
      'Next'
    );

    if (result === 'Open Shortcuts') {
      await vscode.commands.executeCommand(
        'workbench.action.openGlobalKeybindings',
        'gitai.sast'
      );
    }
  }

  /**
   * 步骤 4: 完成
   */
  private static async showStep4(
    context: vscode.ExtensionContext
  ): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      '✅ Step 4/4: Ready to Go!\n\n' +
        'You\'re all set! GitAI SAST will automatically scan your files for security vulnerabilities.\n\n' +
        'Tips:\n' +
        '• Hover over findings to see details\n' +
        '• Use Code Actions (@sast in Chat) for quick fixes\n' +
        '• Use the Problems panel to view all findings\n\n' +
        'Happy coding!',
      'Got it'
    );

    // 标记为已完成
    await context.globalState.update(
      OnboardingManager.ONBOARDING_DONE_KEY,
      true
    );
  }

  /**
   * 重置引导状态
   */
  static async resetOnboarding(
    context: vscode.ExtensionContext
  ): Promise<void> {
    await context.globalState.update(
      OnboardingManager.ONBOARDING_DONE_KEY,
      undefined
    );
    vscode.window.showInformationMessage(
      'Onboarding has been reset. Restart the extension to see the tour again.'
    );
  }

  /**
   * 检查是否已完成引导
   */
  static isOnboardingDone(context: vscode.ExtensionContext): boolean {
    return context.globalState.get<boolean>(
      OnboardingManager.ONBOARDING_DONE_KEY,
      false
    );
  }
}
