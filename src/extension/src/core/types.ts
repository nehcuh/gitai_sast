/**
 * MCP 协议相关类型
 */

export interface McpRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params?: any;
}

export interface McpResponse {
  jsonrpc: string;
  id: string;
  result?: any;
  error?: McpError;
}

export interface McpError {
  code: number;
  message: string;
  data?: any;
}

/**
 * 扫描相关类型
 */

export interface ScanRequest {
  version: number;
  root: string;
  files: Record<string, string>;
  ignores: IgnoreItem[];
  config: ScanConfig;
}

export interface ScanConfig {
  severity_threshold: string;
  enable_opengrep: boolean;
  include_snippets: boolean;
  max_concurrent_scans: number;
  timeout_seconds: number;
  enable_remote_scan: boolean;
  remote_url: string;
  remote_user_id: string;
  remote_allow_invalid_certs?: boolean;
  remote_ca_cert_path?: string;
  opengrep_path?: string;
  opengrep_rules?: string;
}

export interface IgnoreItem {
  file: string;
  line?: number;
  rule_id?: string;
}

export interface ScanResponse {
  version: number;
  status: ScanStatus;
  scan_envelope: ScanEnvelope;
  findings: Finding[];
}

export type ScanStatus = 'success' | 'error' | 'cancelled';

export interface ScanEnvelope {
  scan_id: string;
  timestamp: string;
  files_scanned: number;
  total_lines: number;
  duration_ms: number;
}

export interface Finding {
  id: string;
  rule_id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  location: Location;
  code_snippet: string;
  fix?: Fix;
  issue_content?: string;
  provider: string;
}

export interface Location {
  file: string;
  line: number;
  column?: number;
}

export interface Fix {
  suggestion: string;
  code: string;
}

/**
 * VSCode 相关类型
 */

export interface SastDiagnostic {
  uri: string;
  finding: Finding;
}
