import { McpRequest, McpResponse } from './types';

/**
 * MCP 客户端 - 通过 stdio 与 MCP Server 通信
 */
export class McpClient {
  private requestId = 0;
  private process: any | null = null;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();

  constructor(private serverPath: string) {}

  /**
   * 连接到 MCP Server
   */
  async connect(): Promise<void> {
    const { spawn } = require('child_process');
    
    this.process = spawn(this.serverPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process) {
      throw new Error('Failed to spawn MCP Server process');
    }

    // 监听 stdout (响应)
    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const response: McpResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          console.error('Failed to parse MCP response:', error, line);
        }
      }
    });

    // 监听 stderr (日志)
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[MCP Server]', data.toString());
    });

    // 监听退出
    this.process.on('close', (code: number) => {
      console.log(`[MCP Server] Exited with code ${code}`);
    });

    // 等待服务器启动
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  /**
   * 发送请求
   */
  async sendRequest(method: string, params?: any): Promise<any> {
    const id = (++this.requestId).toString();
    
    const request: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      this.process?.stdin.write(JSON.stringify(request) + '\n', (error: any) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * 处理响应
   */
  private handleResponse(response: McpResponse): void {
    const pending = this.pendingRequests.get(response.id);
    
    if (!pending) {
      console.error('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
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
  }
}
