import * as vscode from 'vscode';
import { GlobalStateManager, GlobalStateKey } from './GlobalStateManager';

/**
 * 会话状态
 */
export interface SessionState {
  id: string;
  startTime: number;
  lastActiveTime: number;
  activeUris: string[];
  openDiagnostics: Record<string, any>;
  activePanels: string[];
  chatHistory: any[];
}

/**
 * 会话管理器
 */
export class SessionManager {
  private stateManager: GlobalStateManager;
  private currentSession: SessionState;
  private sessionId: string;

  constructor(context: vscode.ExtensionContext) {
    this.stateManager = GlobalStateManager.getInstance(context);
    this.sessionId = this.generateSessionId();
    this.currentSession = this.createSessionState();
  }

  /**
   * 开始会话
   */
  async startSession(): Promise<void> {
    this.currentSession = this.createSessionState();
    await this.saveSession();

    console.log(`[SessionManager] Session started: ${this.sessionId}`);
  }

  /**
   * 恢复会话
   */
  async resumeSession(): Promise<void> {
    const savedSession = this.stateManager.get<SessionState>(
      GlobalStateKey.SessionState
    );

    if (savedSession) {
      this.currentSession = savedSession;
      this.sessionId = savedSession.id;

      // 恢复诊断信息
      await this.restoreDiagnostics();

      // 恢复打开的面板
      await this.restorePanels();

      console.log(`[SessionManager] Session resumed: ${this.sessionId}`);
    } else {
      // 开始新会话
      await this.startSession();
    }
  }

  /**
   * 更新会话状态
   */
  async updateSession(updates: Partial<SessionState>): Promise<void> {
    this.currentSession = {
      ...this.currentSession,
      ...updates,
      lastActiveTime: Date.now(),
    };

    await this.saveSession();
  }

  /**
   * 添加活跃 URI
   */
  async addActiveUri(uri: string): Promise<void> {
    if (!this.currentSession.activeUris.includes(uri)) {
      this.currentSession.activeUris.push(uri);
      await this.saveSession();
    }
  }

  /**
   * 移除活跃 URI
   */
  async removeActiveUri(uri: string): Promise<void> {
    this.currentSession.activeUris =
      this.currentSession.activeUris.filter(u => u !== uri);
    await this.saveSession();
  }

  /**
   * 添加打开的面板
   */
  async addActivePanel(panelId: string): Promise<void> {
    if (!this.currentSession.activePanels.includes(panelId)) {
      this.currentSession.activePanels.push(panelId);
      await this.saveSession();
    }
  }

  /**
   * 保存会话
   */
  private async saveSession(): Promise<void> {
    await this.stateManager.set(
      GlobalStateKey.SessionState,
      this.currentSession
    );
  }

  /**
   * 创建会话状态
   */
  private createSessionState(): SessionState {
    return {
      id: this.sessionId,
      startTime: Date.now(),
      lastActiveTime: Date.now(),
      activeUris: [],
      openDiagnostics: {},
      activePanels: [],
      chatHistory: [],
    };
  }

  /**
   * 恢复诊断信息
   */
  private async restoreDiagnostics(): Promise<void> {
    // TODO: 实现
    // const diagnostics = this.currentSession.openDiagnostics;
    // await vscode.commands.executeCommand('gitai.sast.restoreDiagnostics', diagnostics);
  }

  /**
   * 恢复面板
   */
  private async restorePanels(): Promise<void> {
    // TODO: 实现
    // for (const panelId of this.currentSession.activePanels) {
    //   await vscode.commands.executeCommand('gitai.sast.restorePanel', panelId);
    // }
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取会话统计
   */
  getSessionStats(): {
    id: string;
    duration: number;
    activeUris: number;
    activePanels: number;
  } {
    const now = Date.now();
    const duration = now - this.currentSession.startTime;

    return {
      id: this.sessionId,
      duration,
      activeUris: this.currentSession.activeUris.length,
      activePanels: this.currentSession.activePanels.length,
    };
  }
}
