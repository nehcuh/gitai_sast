use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

// ============================================================
// MCP 协议相关类型
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: String,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

// ============================================================
// 工具相关类型
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResponse {
    pub content: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

// ============================================================
// 扫描相关类型
// ============================================================

/// 扫描请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRequest {
    pub version: i32,
    pub root: String,
    pub files: HashMap<String, String>,
    pub ignores: Vec<IgnoreItem>,
    pub config: ScanConfig,
}

/// 扫描配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    pub severity_threshold: String,
    pub enable_opengrep: bool,
    pub include_snippets: bool,
    pub max_concurrent_scans: usize,
    pub timeout_seconds: u64,
}

/// 忽略项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgnoreItem {
    pub file: String,
    pub line: Option<u32>,
    pub rule_id: Option<String>,
}

/// 扫描响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResponse {
    pub version: i32,
    pub status: ScanStatus,
    pub scan_envelope: ScanEnvelope,
    pub findings: Vec<Finding>,
}

/// 扫描状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanStatus {
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "cancelled")]
    Cancelled,
}

/// 扫描信封
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanEnvelope {
    pub scan_id: String,
    pub timestamp: DateTime<Utc>,
    pub files_scanned: usize,
    pub total_lines: usize,
    pub duration_ms: u64,
}

/// 发现的问题
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub rule_id: String,
    #[serde(rename = "type")]
    pub finding_type: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub location: Location,
    pub code_snippet: String,
    pub fix: Option<Fix>,
    pub provider: String,
}

/// 位置信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub file: String,
    pub line: u32,
    pub column: Option<u32>,
}

/// 修复建议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fix {
    pub suggestion: String,
    pub code: String,
}

// ============================================================
// 上下文相关类型
// ============================================================

/// 获取上下文请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContextRequest {
    pub version: i32,
    pub root: String,
    pub file: String,
    pub line: u32,
}

/// 获取上下文响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContextResponse {
    pub version: i32,
    pub context: CodeContext,
}

/// 代码上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeContext {
    pub file_path: String,
    pub code_snippet: String,
    pub function_name: Option<String>,
    pub imports: Vec<String>,
    pub dependencies: Vec<String>,
}

// ============================================================
// 污点路径相关类型
// ============================================================

/// 获取污点路径请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTaintPathRequest {
    pub version: i32,
    pub root: String,
    pub finding: Finding,
}

/// 获取污点路径响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTaintPathResponse {
    pub version: i32,
    pub taint_path: TaintPath,
}

/// 污点路径
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaintPath {
    pub steps: Vec<TaintStep>,
    pub provider: String,
}

/// 污点步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaintStep {
    pub order: u32,
    pub role: String, // "source" | "sink" | "flow"
    pub file: String,
    pub line: u32,
    pub symbol: String,
    pub comment: Option<String>,
}

// ============================================================
// 服务器信息
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
    pub capabilities: ServerCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerCapabilities {
    pub tools: ToolsCapability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolsCapability {
    pub list_changed: bool,
}

// ============================================================
// 错误类型
// ============================================================

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Tool not found: {0}")]
    ToolNotFound(String),

    #[error("Scan failed: {0}")]
    ScanFailed(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl ServerError {
    pub fn to_mcp_error(&self) -> McpError {
        McpError {
            code: match self {
                ServerError::InvalidRequest(_) => -32600,
                ServerError::ToolNotFound(_) => -32601,
                ServerError::ScanFailed(_) => -32000,
                ServerError::Timeout(_) => -32002,
                ServerError::Internal(_) => -32603,
            },
            message: self.to_string(),
            data: None,
        }
    }
}
