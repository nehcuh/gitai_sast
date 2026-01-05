import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as output from '../core/OutputLogger';
import { ConfigManager } from '../config/ConfigManager';
import { ScanResponse, Finding } from './types';
import { McpClient } from './McpClient'; // Kept for interface compatibility but not used for scanning anymore

/**
 * SAST Scanner - Native Opengrep Execution
 */
export class SastScanner {
  constructor(private mcpClient: McpClient) { }

  /**
   * Scan a single file using configured mode (local, remote, or both)
   */
  async scanFile(root: string, fileUri: string, fileContent: string): Promise<ScanResponse> {
    const provider = ConfigManager.get<string>('scannerProvider', 'local');
    output.info(`[SastScanner] scanFile provider=${provider} file=${fileUri}`);

    if (provider === 'remote') {
      return this.scanFileRemote(root, fileUri, fileContent);
    } else if (provider === 'both') {
      const [local, remote] = await Promise.all([
        this.scanFileLocal(root, fileUri, fileContent),
        this.scanFileRemote(root, fileUri, fileContent)
      ]);
      return this.mergeResponses(local, remote);
    } else {
      return this.scanFileLocal(root, fileUri, fileContent);
    }
  }

  /**
   * Scan workspace using configured mode
   */
  async scanWorkspace(root: string, files: Record<string, string>): Promise<ScanResponse> {
    const provider = ConfigManager.get<string>('scannerProvider', 'local');
    output.info(`[SastScanner] scanWorkspace provider=${provider} root=${root}`);

    if (provider === 'remote') {
      return this.scanWorkspaceRemote(root, files);
    } else if (provider === 'both') {
      const [local, remote] = await Promise.all([
        this.scanWorkspaceLocal(root),
        this.scanWorkspaceRemote(root, files)
      ]);
      return this.mergeResponses(local, remote);
    } else {
      return this.scanWorkspaceLocal(root);
    }
  }

  // --- Internal Implementation ---

  private async scanFileRemote(root: string, fileUri: string, fileContent: string): Promise<ScanResponse> {
    try {
      const relativePath = fileUri.startsWith(root) ? path.relative(root, fileUri) : path.basename(fileUri);
      const files = { [relativePath]: fileContent };

      const scanResult = await this.mcpClient.callTool('scan', {
        version: 1,
        root,
        files,
        ignores: [],
        config: this.getRemoteScanConfig()
      });

      return scanResult as ScanResponse;
    } catch (e: any) {
      output.error(`[SastScanner] Remote scan file failed: ${e.message}`);
      return this.createEmptyResponse();
    }
  }

  private async scanFileLocal(root: string, fileUri: string, fileContent: string): Promise<ScanResponse> {
    const opengrepPath = ConfigManager.get<string>('opengrepPath', 'opengrep');
    const opengrepRules = ConfigManager.get<string>('opengrepRules', 'auto');

    const ext = path.extname(fileUri);
    const tempFile = path.join(os.tmpdir(), `gitai_scan_${Date.now()}${ext}`);

    try {
      fs.writeFileSync(tempFile, fileContent);

      const args = ['scan', '--json', '--config', opengrepRules, tempFile];
      output.info(`[SastScanner] Running Local: ${opengrepPath} ${args.join(' ')}`);

      const { stdout, stderr } = await this.execPromise(opengrepPath, args, { cwd: root });

      if (stderr && stderr.length > 0) {
        output.info(`[SastScanner] local stderr: ${stderr}`);
      }

      const runResult = JSON.parse(stdout);
      return this.parseOpengrepOutput(runResult, fileUri);

    } catch (e: any) {
      output.error(`[SastScanner] Local scan failed: ${e.message}`);
      // return empty response to be safe
      return this.createEmptyResponse();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  private async scanWorkspaceRemote(root: string, files: Record<string, string>): Promise<ScanResponse> {
    try {
      const scanResult = await this.mcpClient.callTool('scan', {
        version: 1,
        root,
        files,
        ignores: [],
        config: this.getRemoteScanConfig()
      });

      return scanResult as ScanResponse;
    } catch (e: any) {
      output.error(`[SastScanner] Remote workspace scan failed: ${e.message}`);
      return this.createEmptyResponse();
    }
  }

  private async scanWorkspaceLocal(root: string): Promise<ScanResponse> {
    const opengrepPath = ConfigManager.get<string>('opengrepPath', 'opengrep');
    const opengrepRules = ConfigManager.get<string>('opengrepRules', 'auto');

    try {
      const args = ['scan', '--json', '--config', opengrepRules, root];
      output.info(`[SastScanner] Running Local Workspace: ${opengrepPath} ${args.join(' ')}`);

      const { stdout } = await this.execPromise(opengrepPath, args, { cwd: root });
      const runResult = JSON.parse(stdout);

      return this.parseOpengrepOutput(runResult, '');
    } catch (e: any) {
      output.error(`[SastScanner] Local workspace scan failed: ${e.message}`);
      return this.createEmptyResponse();
    }
  }

  private getRemoteScanConfig() {
    return {
      severity_threshold: ConfigManager.get<string>('severityThreshold', 'medium'),
      enable_opengrep: false, // We are explicitly doing remote scan here
      include_snippets: true,
      max_concurrent_scans: 1,
      timeout_seconds: 600, // Default 10 minutes
      enable_remote_scan: true,
      remote_url: ConfigManager.get<string>('remoteUrl', ''),
      remote_user_id: ConfigManager.get<string>('remoteUserId', ''),
      remote_allow_invalid_certs: ConfigManager.get<boolean>('remoteAllowInsecureTls', false),
      remote_ca_cert_path: ConfigManager.get<string>('remoteCaCertPath', ''),
    };
  }

  private mergeResponses(r1: ScanResponse, r2: ScanResponse): ScanResponse {
    return {
      version: r1.version,
      status: 'success', // if either succeeded, we call it success for now
      scan_envelope: {
        scan_id: r1.scan_envelope.scan_id,
        timestamp: new Date().toISOString(),
        files_scanned: Math.max(r1.scan_envelope.files_scanned, r2.scan_envelope.files_scanned),
        total_lines: Math.max(r1.scan_envelope.total_lines, r2.scan_envelope.total_lines),
        duration_ms: Math.max(r1.scan_envelope.duration_ms, r2.scan_envelope.duration_ms)
      },
      findings: [...r1.findings, ...r2.findings]
    };
  }

  private parseOpengrepOutput(data: any, originalUri: string): ScanResponse {
    if (!data || !data.results) {
      return this.createEmptyResponse();
    }

    const findings: Finding[] = data.results.map((r: any) => {
      // Map opengrep severity to our types
      const severityMap: { [key: string]: 'info' | 'warning' | 'error' } = {
        'INFO': 'info',
        'WARNING': 'warning',
        'ERROR': 'error'
      };

      const location = {
        file: originalUri || r.path,
        line: r.start.line,
        // Convert to 0-indexed for VS Code compatibility usually, keeping 1-indexed here as system seems to expect it
        column: r.start.col,
      };

      return {
        id: r.fingerprint || `sast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        rule_id: r.check_id,
        type: 'sast', // generic type
        title: r.extra?.message || r.check_id,
        description: r.extra?.message || '',
        severity: severityMap[r.extra?.severity] || 'warning', // Opengrep defaults
        location: location,
        code_snippet: r.extra?.lines || '',
        provider: 'opengrep',
      } as Finding;
    });

    return {
      version: 1,
      status: 'success',
      scan_envelope: {
        scan_id: `scan-${Date.now()}`,
        timestamp: new Date().toISOString(),
        files_scanned: data.paths?.scanned?.length || 1,
        total_lines: 0,
        duration_ms: 0
      },
      findings
    };
  }

  private createEmptyResponse(): ScanResponse {
    return {
      version: 1,
      status: 'success',
      scan_envelope: {
        scan_id: `scan-${Date.now()}`,
        timestamp: new Date().toISOString(),
        files_scanned: 0,
        total_lines: 0,
        duration_ms: 0
      },
      findings: []
    };
  }

  private execPromise(command: string, args: string[], options: cp.ExecFileOptions): Promise<{ stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
      cp.execFile(command, args, options, (error, stdout, stderr) => {
        if (error) {
          // Opengrep returns exit code 1 if findings are found (sometimes), or on error.
          // We need to check if stdout is valid JSON before rejecting.
          const stdoutStr = stdout ? stdout.toString() : '';
          const stderrStr = stderr ? stderr.toString() : '';

          if (stdoutStr && stdoutStr.trim().startsWith('{')) {
            resolve({ stdout: stdoutStr, stderr: stderrStr });
          } else {
            reject({ error, stdout: stdoutStr, stderr: stderrStr });
          }
        } else {
          resolve({ stdout: stdout ? stdout.toString() : '', stderr: stderr ? stderr.toString() : '' });
        }
      });
    });
  }
}

