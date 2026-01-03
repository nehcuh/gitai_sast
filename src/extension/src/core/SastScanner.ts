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
   * Scan a single file using opengrep CLI
   */
  async scanFile(root: string, fileUri: string, fileContent: string): Promise<ScanResponse> {
    // Use ConfigManager to get configuration
    const opengrepPath = ConfigManager.get<string>('opengrepPath', 'opengrep');
    const opengrepRules = ConfigManager.get<string>('opengrepRules', 'auto');

    // Write content to a temp file to ensure we scan the latest buffer content
    // (Opengrep usually scans from disk, so we need to mock the file if it's dirty, or save it)
    // For simplicity/safety with current architecture, let's dump to a temp file with same extension
    const ext = path.extname(fileUri);
    const tempFile = path.join(os.tmpdir(), `gitai_scan_${Date.now()}${ext}`);

    try {
      fs.writeFileSync(tempFile, fileContent);

      const args = ['scan', '--json', '--config', opengrepRules, tempFile];
      output.info(`[SastScanner] Running: ${opengrepPath} ${args.join(' ')}`);

      const { stdout, stderr } = await this.execPromise(opengrepPath, args, { cwd: root });

      if (stderr && stderr.length > 0) {
        output.info(`[SastScanner] stderr: ${stderr}`);
      }

      const runResult = JSON.parse(stdout);
      return this.parseOpengrepOutput(runResult, fileUri);

    } catch (e: any) {
      output.error(`[SastScanner] Scan failed: ${e.message}`);
      if (e.stdout) output.info(`[SastScanner] stdout: ${e.stdout}`);
      // Return empty response on failure to avoid crashing UI
      return this.createEmptyResponse();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * Scan workspace
   */
  async scanWorkspace(root: string, files: Record<string, string>): Promise<ScanResponse> {
    // For workspace scan, we simply run on the root directory
    // Use ConfigManager to get configuration
    const opengrepPath = ConfigManager.get<string>('opengrepPath', 'opengrep');
    const opengrepRules = ConfigManager.get<string>('opengrepRules', 'auto');

    try {
      const args = ['scan', '--json', '--config', opengrepRules, root];
      output.info(`[SastScanner] Workspace Scan: ${opengrepPath} ${args.join(' ')}`);

      const { stdout } = await this.execPromise(opengrepPath, args, { cwd: root });
      const runResult = JSON.parse(stdout);

      // Note: passing fileUri as empty or root acts as context
      return this.parseOpengrepOutput(runResult, '');
    } catch (e: any) {
      output.error(`[SastScanner] Workspace scan failed: ${e.message}`);
      return this.createEmptyResponse();
    }
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

