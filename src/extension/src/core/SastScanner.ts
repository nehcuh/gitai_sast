import { McpClient } from './McpClient';
import { ScanRequest, ScanResponse, Finding } from './types';
import * as vscode from 'vscode';

/**
 * SAST 扫描器 - 封装 MCP 调用
 */
export class SastScanner {
  constructor(private mcpClient: McpClient) {}

  /**
   * 扫描文件
   */
  async scanFile(root: string, fileUri: string, fileContent: string): Promise<ScanResponse> {
    await this.mcpClient.ensureConnected();

    const baseConfig = vscode.workspace.getConfiguration('gitai.sast');
    const remoteAllowInvalidCerts = baseConfig.get<boolean>('remoteAllowInsecureTls', false);
    const remoteCaCertPath = baseConfig.get<string>('remoteCaCertPath', '') || '';

    const request: ScanRequest = {
      version: 1,
      root,
      files: {
        [fileUri]: fileContent,
      },
      ignores: [],
      config: {
        severity_threshold: mapSeverityThreshold(
          vscode.workspace.getConfiguration('gitai.sast').get<string>('severityThreshold', 'medium')
        ),
        enable_opengrep: true,
        include_snippets: true,
        max_concurrent_scans: 1,
        timeout_seconds: 120,
        enable_remote_scan: baseConfig.get<boolean>('enableRemoteScan', false),
        remote_url: baseConfig.get<string>('remoteUrl', '') || '',
        remote_user_id: getRemoteUserId(),
        remote_allow_invalid_certs: remoteAllowInvalidCerts,
        remote_ca_cert_path: remoteCaCertPath,
      },
    };

    return await this.mcpClient.callTool('scan', request);
  }

  /**
   * 扫描工作区
   */
  async scanWorkspace(root: string, files: Record<string, string>): Promise<ScanResponse> {
    await this.mcpClient.ensureConnected();

    const baseConfig = vscode.workspace.getConfiguration('gitai.sast');
    const remoteAllowInvalidCerts = baseConfig.get<boolean>('remoteAllowInsecureTls', false);
    const remoteCaCertPath = baseConfig.get<string>('remoteCaCertPath', '') || '';

    const request: ScanRequest = {
      version: 1,
      root,
      files,
      ignores: [],
      config: {
        severity_threshold: mapSeverityThreshold(
          vscode.workspace.getConfiguration('gitai.sast').get<string>('severityThreshold', 'medium')
        ),
        enable_opengrep: true,
        include_snippets: true,
        max_concurrent_scans: 3,
        timeout_seconds: 300,
        enable_remote_scan: baseConfig.get<boolean>('enableRemoteScan', false),
        remote_url: baseConfig.get<string>('remoteUrl', '') || '',
        remote_user_id: getRemoteUserId(),
        remote_allow_invalid_certs: remoteAllowInvalidCerts,
        remote_ca_cert_path: remoteCaCertPath,
      },
    };

    return await this.mcpClient.callTool('scan', request);
  }
}

function getRemoteUserId(): string {
  const config = vscode.workspace.getConfiguration('gitai.sast');
  const explicit = config.get<string>('remoteUserId', '') || '';
  if (explicit.trim()) {
    return explicit.trim();
  }

  // Backward compatibility: older setting name.
  return (config.get<string>('remoteToken', '') || '').trim();
}

function mapSeverityThreshold(value: string): string {
  const normalized = (value || '').trim().toLowerCase();

  // Accept server/opengrep-native values directly.
  if (normalized === 'error' || normalized === 'warning' || normalized === 'info') {
    return normalized.toUpperCase();
  }

  // Extension-friendly values -> opengrep severities.
  switch (normalized) {
    case 'low':
      return 'INFO';
    case 'medium':
      return 'WARNING';
    case 'high':
    case 'critical':
      return 'ERROR';
    default:
      return 'WARNING';
  }
}
