use crate::core::types::{GetTaintPathRequest, GetTaintPathResponse, TaintPath};
use crate::tools::{Tool, ToolCallRequest, ToolCallResponse};
use async_trait::async_trait;
use serde_json::json;
use tracing::{info};

pub struct GetTaintPathTool;

#[async_trait]
impl Tool for GetTaintPathTool {
    fn name(&self) -> &str {
        "get_taint_path"
    }
    
    fn description(&self) -> &str {
        "Get taint path for a specific finding"
    }
    
    fn input_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "version": {
                    "type": "integer",
                    "description": "Taint path protocol version"
                },
                "root": {
                    "type": "string",
                    "description": "Root directory of project"
                },
                "finding": {
                    "type": "object",
                    "description": "Finding object"
                }
            },
            "required": ["version", "root", "finding"]
        })
    }
    
    async fn call(&self, request: ToolCallRequest) -> Result<ToolCallResponse, String> {
        info!("get_taint_path tool called with args: {}", request.arguments);
        
        // 解析请求
        let taint_request: GetTaintPathRequest = serde_json::from_value(request.arguments)
            .map_err(|e| format!("Failed to parse get_taint_path request: {}", e))?;
        
        let version = taint_request.version;
        
        // 获取污点路径
        let taint_path = Self::extract_taint_path(taint_request).await?;
        
        // 构建响应
        let response = GetTaintPathResponse {
            version,
            taint_path,
        };
        
        let result = serde_json::to_value(response)
            .map_err(|e| format!("Failed to serialize get_taint_path response: {}", e))?;
        
        Ok(ToolCallResponse {
            content: vec![result],
            is_error: Some(false),
        })
    }
}

impl GetTaintPathTool {
    async fn extract_taint_path(_request: GetTaintPathRequest) -> Result<TaintPath, String> {
        // TODO: 实现实际的污点路径提取逻辑
        // 需要调用 CodeQL CLI 或远程 SAST 平台
        Ok(TaintPath {
            steps: vec![],
            provider: "local".to_string(),
        })
    }
}
