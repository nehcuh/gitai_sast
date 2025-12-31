use serde::{Deserialize, Serialize};

// ============================================================
// MCP 协议类型
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub result: Option<serde_json::Value>,
    pub error: Option<McpError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// ============================================================
// Server 信息
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
// Tool 类型
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
    pub is_error: Option<bool>,
}

// ============================================================
// 扫描相关类型
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRequest {
    pub version: i32,
    pub root: String,
    pub files: std::collections::HashMap<String, String>,
    pub ignores: Vec<IgnoreItem>,
    pub config: ScanConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    pub severity_threshold: String,
    pub enable_opengrep: bool,
    pub include_snippets: bool,
    pub max_concurrent_scans: i32,
    pub timeout_seconds: i32,
    pub enable_remote_scan: bool,
    pub remote_url: String,
    pub remote_user_id: String,
    #[serde(default)]
    pub remote_allow_invalid_certs: bool,
    #[serde(default)]
    pub remote_ca_cert_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgnoreItem {
    pub file: String,
    pub line: Option<u32>,
    pub rule_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResponse {
    pub version: i32,
    pub status: ScanStatus,
    pub scan_envelope: ScanEnvelope,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanStatus {
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "cancelled")]
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanEnvelope {
    pub scan_id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub files_scanned: usize,
    pub total_lines: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub rule_id: String,
    pub r#type: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub location: Location,
    pub code_snippet: String,
    pub fix: Option<Fix>,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub file: String,
    pub line: u32,
    pub column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fix {
    pub suggestion: String,
    pub code: String,
}

// ============================================================
// 上下文相关类型
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContextRequest {
    pub version: i32,
    pub root: String,
    pub file: String,
    pub line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContextResponse {
    pub version: i32,
    pub context: CodeContext,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTaintPathRequest {
    pub version: i32,
    pub root: String,
    pub finding: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTaintPathResponse {
    pub version: i32,
    pub taint_path: TaintPath,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaintPath {
    pub steps: Vec<TaintStep>,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaintStep {
    pub file: String,
    pub line: u32,
    pub function: String,
    pub description: String,
}

// ============================================================
// 远程 SAST 相关类型
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSastConfig {
    pub url: String,
    pub user_id: String,
    pub signature_key: Option<String>,
    #[serde(default)]
    pub allow_invalid_certs: bool,
    #[serde(default)]
    pub ca_cert_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteUploadRequest {
    pub project_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_version_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub white_list: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issue_view_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteUploadResponse {
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteScanRequest {
    pub source_path: String,
    #[serde(flatten)]
    pub upload_request: RemoteUploadRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteScanResponse {
    pub project_id: String,
    pub project_version_id: String,
    pub status: i32,
    pub info: String,
    pub details_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteScanResultRequest {
    pub project_version_id: String,
    pub process_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteScanResultResponse {
    pub status: i32,
    pub info: String,
    pub scan_progress: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scan_log: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteResultListRequest {
    pub project_version_id: String,
    pub page_no: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteResultListResponse {
    pub total: i32,
    pub records: Vec<RemoteResultRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteResultRecord {
    pub issue_path: String,
    pub issue_zh_name: String,
    pub issue_en_name: String,
    pub category: String,
    pub process_type: i32,
    pub now_risk_level: i32,
    pub issue_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileCodeRequest {
    pub project_version_id: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileCodeResponse {
    pub code: String,
}

// ============================================================
// Server Error
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerError {
    #[serde(rename = "method_not_found")]
    MethodNotFound,
    #[serde(rename = "invalid_params")]
    InvalidParams,
    #[serde(rename = "internal_error")]
    InternalError,
}

impl ServerError {
    pub fn to_mcp_error(&self) -> McpError {
        match self {
            ServerError::MethodNotFound => McpError {
                code: -32601,
                message: "Method not found".to_string(),
                data: None,
            },
            ServerError::InvalidParams => McpError {
                code: -32602,
                message: "Invalid params".to_string(),
                data: None,
            },
            ServerError::InternalError => McpError {
                code: -32603,
                message: "Internal error".to_string(),
                data: None,
            },
        }
    }
}
