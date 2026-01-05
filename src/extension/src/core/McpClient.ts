import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as output from './OutputLogger';
import { McpRequest, McpResponse } from './types';
import { StringDecoder } from 'string_decoder';

/**
 * MCP 客户端 - 通过 stdio 与 MCP Server 通信
 */
export class McpClient {
  private requestId = 0;
  private process: ChildProcessWithoutNullStreams | null = null;
  private connecting: Promise<void> | null = null;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private buffer: string = '';
  private decoder = new StringDecoder('utf8');

  constructor(private serverPath: string) { }

  /**
   * 更新 MCP Server 路径（会断开已有连接）
   */
  updateServerPath(serverPath: string) {
    const next = serverPath.trim();
    if (next === this.serverPath) {
      return;
    }
    this.serverPath = next;
    void this.disconnect();
  }

  /**
   * 连接到 MCP Server
   */
  async connect(): Promise<void> {
    if (this.process) {
      return;
    }
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.doConnect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async doConnect(): Promise<void> {
    if (!this.serverPath) {
      throw new Error('MCP Server path is not configured. Set "gitai.sast.mcpServerPath" in Settings.');
    }

    const serverPath = this.serverPath.trim();
    output.info(`[MCP] Connecting to server: ${serverPath}`);

    const child = spawn(serverPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process = child;

    // 监听 stdout (响应) - 使用 buffering 处理分块数据
    child.stdout?.on('data', (data: Buffer) => {
      this.buffer += this.decoder.write(data);

      let newlineIndex;
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);

        if (!line) continue;

        try {
          const response: McpResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          // 如果是一行完整的但解析失败，可能是混入了非 JSON 日志或其他输出
          // 但这里的逻辑是假定只要有换行符就是一条完整的消息
          output.warn(`[MCP] Failed to parse response line: ${line.substring(0, 200)}...`);
        }
      }
    });

    // 监听 stderr (日志)
    child.stderr?.on('data', (data: Buffer) => {
      output.warn(`[MCP Server] ${data.toString().trim()}`);
    });

    // 监听退出
    child.on('close', (code: number) => {
      output.info(`[MCP Server] Exited with code ${code}`);
      this.process = null;
      this.rejectAllPendingRequests(new Error('MCP Server disconnected'));
    });

    // 处理启动阶段错误/过早退出
    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        child.off('error', onError);
        child.off('exit', onExit);
      };

      const onError = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        this.process = null;
        reject(new Error(`Failed to start MCP Server: ${error.message}`));
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        this.process = null;
        reject(new Error(`MCP Server exited during startup (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`));
      };

      child.once('error', onError);
      child.once('exit', onExit);

      // 等待服务器启动
      setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        output.info('[MCP] Connected to server');
        resolve();
      }, 500);
    });
  }

  /**
   * 确保已连接（未连接时尝试连接）
   */
  async ensureConnected(): Promise<void> {
    if (this.process) {
      return;
    }
    await this.connect();
  }

  /**
   * 发送请求
   */
  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.process || this.process.killed) {
      throw new Error('MCP Server is not connected. Configure "gitai.sast.mcpServerPath" and try again.');
    }

    const id = (++this.requestId).toString();
    const request: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.process?.stdin.write(JSON.stringify(request) + '\n', (error: any) => {
          if (error) {
            this.pendingRequests.delete(id);
            reject(error);
          }
        });
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * 处理响应
   */
  private handleResponse(response: McpResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      output.warn(`[MCP] Received response for unknown request: ${response.id}`);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message || 'MCP Server error'));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: any): Promise<any> {
    output.debug(`[MCP] Calling tool: ${name}`);
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return this.unwrapToolCallResult(name, result);
  }

  private unwrapToolCallResult(toolName: string, result: any): any {
    if (!result || typeof result !== 'object') {
      return result;
    }

    const maybeContent = (result as any).content;
    if (!Array.isArray(maybeContent)) {
      return result;
    }

    const isError = (result as any).is_error === true;
    if (isError) {
      throw new Error(this.formatToolError(toolName, maybeContent));
    }

    if (maybeContent.length === 0) {
      return undefined;
    }

    const first = maybeContent[0];
    if (first && typeof first === 'object' && (first as any).type === 'text' && typeof (first as any).text === 'string') {
      return (first as any).text;
    }

    return first;
  }

  private formatToolError(toolName: string, content: any[]): string {
    const messageParts: string[] = [];

    for (const item of content) {
      if (typeof item === 'string') {
        messageParts.push(item);
        continue;
      }

      if (item && typeof item === 'object') {
        const asAny = item as any;
        if (typeof asAny.error === 'string' && asAny.error.trim()) {
          messageParts.push(asAny.error.trim());
          continue;
        }
        if (asAny.type === 'text' && typeof asAny.text === 'string' && asAny.text.trim()) {
          messageParts.push(asAny.text.trim());
          continue;
        }
      }

      try {
        messageParts.push(JSON.stringify(item));
      } catch {
        messageParts.push(String(item));
      }
    }

    const message = messageParts.filter(Boolean).join('\n').trim();
    return message ? `Tool "${toolName}" failed: ${message}` : `Tool "${toolName}" failed`;
  }

  /**
   * 获取工具列表
   */
  async listTools(): Promise<any[]> {
    const result = await this.sendRequest('tools/list');
    return result?.tools || [];
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    this.process?.kill();
    this.process = null;
    this.rejectAllPendingRequests(new Error('MCP Server disconnected'));
  }

  private rejectAllPendingRequests(error: Error) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
