use crate::core::types::ScanRequest;
use crate::core::types::ScanResponse;
use crate::core::types::RemoteSastConfig;
use crate::scanner::{OpengrepScanner, RemoteSastScanner, ScanResult, ScanError};
use crate::tools::{Tool, ToolCallRequest, ToolCallResponse};
use async_trait::async_trait;
use serde_json::json;
use tracing::{info};

pub struct ScanTool;

#[async_trait]
impl Tool for ScanTool {
    fn name(&self) -> &str {
        "scan"
    }
    
    fn description(&self) -> &str {
        "Scan code files for security vulnerabilities"
    }
    
    fn input_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "version": {
                    "type": "integer",
                    "description": "Scan protocol version"
                },
                "root": {
                    "type": "string",
                    "description": "Root directory of project"
                },
                "files": {
                    "type": "object",
                    "description": "Map of file path to file content"
                },
                "ignores": {
                    "type": "array",
                    "description": "List of ignore rules",
                    "items": {
                        "type": "object",
                        "properties": {
                            "file": { "type": "string" },
                            "line": { "type": "integer" },
                            "rule_id": { "type": "string" }
                        }
                    }
                },
                "config": {
                    "type": "object",
                    "properties": {
                        "severity_threshold": { "type": "string" },
                        "enable_opengrep": { "type": "boolean" },
                        "include_snippets": { "type": "boolean" },
                        "max_concurrent_scans": { "type": "integer" },
                        "timeout_seconds": { "type": "integer" },
                        "enable_remote_scan": { "type": "boolean" },
                        "remote_url": { "type": "string" },
                        "remote_user_id": { "type": "string" }
                    }
                }
            },
            "required": ["version", "root", "files"]
        })
    }
    
    async fn call(&self, request: ToolCallRequest) -> Result<ToolCallResponse, String> {
        info!("scan tool called with args: {}", request.arguments);
        
        // 解析请求
        let scan_request: ScanRequest = serde_json::from_value(request.arguments)
            .map_err(|e| format!("Failed to parse scan request: {}", e))?;
        let version = scan_request.version;
        
        // 执行扫描
        let scan_result = Self::execute_scan(scan_request).await;
        
        // 返回结果
        let result = match scan_result {
            Ok(result) => {
                let response = ScanResponse {
                    version,
                    status: result.status,
                    scan_envelope: result.envelope,
                    findings: result.findings,
                };

                serde_json::to_value(response)
                    .map_err(|e| format!("Failed to serialize scan response: {}", e))
            }
            Err(e) => {
                // 将 ScanError 转换为可读的错误消息
                let error_message = match &e {
                    ScanError::Timeout(duration) => {
                        format!("Scan timeout after {:?}", duration)
                    }
                    ScanError::Config(msg) => {
                        format!("Configuration error: {}", msg)
                    }
                    ScanError::Execution(msg) => {
                        format!("Scan execution error: {}", msg)
                    }
                    ScanError::Remote { code, message } => {
                        format!("Remote server error ({}): {}", code, message)
                    }
                    ScanError::Upload(msg) => {
                        format!("Upload failed: {}", msg)
                    }
                    ScanError::ScanFailed(msg) => {
                        format!("Scan failed: {}", msg)
                    }
                    ScanError::Results(msg) => {
                        format!("Failed to get results: {}", msg)
                    }
                    _ => format!("Scan error: {}", e),
                };
                
                return Ok(ToolCallResponse {
                    content: vec![json!({
                        "error": error_message,
                        "status": "failed"
                    })],
                    is_error: Some(true),
                });
            }
        };
        
        Ok(ToolCallResponse {
            content: vec![result?],
            is_error: Some(false),
        })
    }
}

impl ScanTool {
    async fn execute_scan(request: ScanRequest) -> Result<ScanResult, ScanError> {
        info!("Starting scan for {} files", request.files.len());
        
        // 检查是否启用远程扫描
        let enable_remote = request.config.enable_remote_scan;
        
        if enable_remote {
            // 使用远程 SAST 扫描器
            let remote_url = request.config.remote_url.clone();
            let remote_user_id = request.config.remote_user_id.clone();
            
            // 验证配置
            if remote_url.is_empty() || remote_user_id.is_empty() {
                return Err(ScanError::Config(
                    "Remote scan enabled but remote_url or remote_user_id not configured".to_string()
                ));
            }
            
            // 验证 URL 格式
            if !remote_url.starts_with("http://") && !remote_url.starts_with("https://") {
                return Err(ScanError::Config(
                    format!("Invalid remote URL format: {}", remote_url)
                ));
            }
            
            info!("Using remote SAST scanner at: {}", remote_url);
            
            let remote_config = RemoteSastConfig {
                url: remote_url,
                user_id: remote_user_id,
                signature_key: None,
                allow_invalid_certs: request.config.remote_allow_invalid_certs,
                ca_cert_path: request.config.remote_ca_cert_path.clone(),
            };
            
            let scanner = RemoteSastScanner::new(remote_config)?;
            
            return scanner.scan(
                request.root,
                request.files,
                request.ignores,
                &request.config,
            ).await;
        } else {
            // 使用本地 Opengrep 扫描器
            info!("Using local Opengrep scanner");
            
            let scanner = OpengrepScanner::new(
                request.config.opengrep_path.clone(),
                request.config.opengrep_rules.clone(),
            );
            
            return scanner.scan(
                &request.root,
                request.files,
                request.ignores,
                &request.config,
            ).await.map_err(|e| {
                // 将 anyhow::Error 转换为 ScanError
                ScanError::Execution(e.to_string())
            });
        }
    }
}
