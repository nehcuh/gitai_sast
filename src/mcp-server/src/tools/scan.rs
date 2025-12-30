use crate::core::types::ScanRequest;
use crate::scanner::opengrep::{OpengrepScanner, ScanResult};
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
        let scan_result = Self::execute_scan(scan_request).await?;
        
        // 返回结果
        let result = serde_json::to_value(scan_result)
            .map_err(|e| format!("Failed to serialize scan response: {}", e))?;
        
        Ok(ToolCallResponse {
            content: vec![result],
            is_error: Some(false),
        })
    }
}

impl ScanTool {
    async fn execute_scan(request: ScanRequest) -> Result<ScanResult, String> {
        info!("Starting scan for {} files", request.files.len());
        
        // 创建 Opengrep 扫描器
        let scanner = OpengrepScanner::new(None);
        
        // 执行扫描
        let scan_result = scanner.scan(
            &request.root,
            request.files,
            request.ignores,
            &request.config,
        ).await.map_err(|e| format!("Scan failed: {}", e))?;
        
        info!("Scan completed: {} findings", scan_result.findings.len());
        
        Ok(scan_result)
    }
}
