use crate::core::types::{GetContextRequest, GetContextResponse, CodeContext};
use crate::tools::{Tool, ToolCallRequest, ToolCallResponse};
use async_trait::async_trait;
use serde_json::json;
use tracing::{info};

pub struct GetContextTool;

#[async_trait]
impl Tool for GetContextTool {
    fn name(&self) -> &str {
        "get_context"
    }
    
    fn description(&self) -> &str {
        "Get code context for a specific location"
    }
    
    fn input_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "version": {
                    "type": "integer",
                    "description": "Context protocol version"
                },
                "root": {
                    "type": "string",
                    "description": "Root directory of project"
                },
                "file": {
                    "type": "string",
                    "description": "Path to the file"
                },
                "line": {
                    "type": "integer",
                    "description": "Line number"
                }
            },
            "required": ["version", "root", "file", "line"]
        })
    }
    
    async fn call(&self, request: ToolCallRequest) -> Result<ToolCallResponse, String> {
        info!("get_context tool called with args: {}", request.arguments);
        
        // 解析请求
        let context_request: GetContextRequest = serde_json::from_value(request.arguments)
            .map_err(|e| format!("Failed to parse get_context request: {}", e))?;
        
        let version = context_request.version;
        
        // 获取上下文
        let context = Self::extract_context(context_request).await?;
        
        // 构建响应
        let response = GetContextResponse {
            version,
            context,
        };
        
        let result = serde_json::to_value(response)
            .map_err(|e| format!("Failed to serialize get_context response: {}", e))?;
        
        Ok(ToolCallResponse {
            content: vec![result],
            is_error: Some(false),
        })
    }
}

impl GetContextTool {
    async fn extract_context(request: GetContextRequest) -> Result<CodeContext, String> {
        // TODO: 实现实际的上下文提取逻辑
        Ok(CodeContext {
            file_path: request.file,
            code_snippet: String::new(),
            function_name: None,
            imports: vec![],
            dependencies: vec![],
        })
    }
}
