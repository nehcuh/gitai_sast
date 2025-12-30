import { McpClient } from './McpClient';
import { ScanRequest, ScanResponse, Finding } from './types';

/**
 * SAST 扫描器 - 封装 MCP 调用
 */
export class SastScanner {
  constructor(private mcpClient: McpClient) {}

  /**
   * 扫描文件
   */
  async scanFile(root: string, fileUri: string, fileContent: string): Promise<ScanResponse> {
    const request: ScanRequest = {
      version: 1,
      root,
      files: {
        [fileUri]: fileContent,
      },
      ignores: [],
      config: {
        severity_threshold: 'medium',
        enable_opengrep: true,
        include_snippets: true,
        max_concurrent_scans: 1,
        timeout_seconds: 120,
      },
    };

    return await this.mcpClient.callTool('scan', request);
  }

  /**
   * 扫描工作区
   */
  async scanWorkspace(root: string, files: Record<string, string>): Promise<ScanResponse> {
    const request: ScanRequest = {
      version: 1,
      root,
      files,
      ignores: [],
      config: {
        severity_threshold: 'medium',
        enable_opengrep: true,
        include_snippets: true,
        max_concurrent_scans: 3,
        timeout_seconds: 300,
      },
    };

    return await this.mcpClient.callTool('scan', request);
  }
}
