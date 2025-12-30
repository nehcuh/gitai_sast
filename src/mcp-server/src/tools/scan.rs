use crate::core::types::{ScanRequest, ScanResponse};
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
                        "timeout_seconds": { "type": "integer" }
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
        
        // 执行扫描
        // TODO: 实现实际的扫描逻辑
        let scan_response = Self::execute_scan(scan_request).await?;
        
        // 返回结果
        let result = serde_json::to_value(scan_response)
            .map_err(|e| format!("Failed to serialize scan response: {}", e))?;
        
        Ok(ToolCallResponse {
            content: vec![result],
            is_error: Some(false),
        })
    }
}

impl ScanTool {
    async fn execute_scan(request: ScanRequest) -> Result<ScanResponse, String> {
        let start = std::time::Instant::now();
        
        info!("Starting scan for {} files", request.files.len());
        
        // 模拟扫描 - 实际实现需要调用 Opengrep CLI
        let findings = vec![];
        
        // 构建响应
        let response = ScanResponse {
            version: request.version,
            status: crate::core::types::ScanStatus::Success,
            scan_envelope: crate::core::types::ScanEnvelope {
                scan_id: uuid::Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now(),
                files_scanned: request.files.len(),
                total_lines: request.files.values().map(|c| c.lines().count()).sum(),
                duration_ms: start.elapsed().as_millis() as u64,
            },
            findings,
        };
        
        info!("Scan completed in {}ms", response.scan_envelope.duration_ms);
        
        Ok(response)
    }
}
