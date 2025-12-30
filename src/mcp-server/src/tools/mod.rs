use async_trait::async_trait;
use crate::core::types::{ToolCallRequest, ToolCallResponse, ToolDefinition};
use serde_json::Value;
use std::collections::HashMap;

pub mod scan;
pub mod get_context;
pub mod get_taint_path;

// ============================================================
// Tool Trait
// ============================================================

#[async_trait]
pub trait Tool: Send + Sync {
    /// 工具名称
    fn name(&self) -> &str;
    
    /// 工具描述
    fn description(&self) -> &str;
    
    /// 工具输入 Schema
    fn input_schema(&self) -> Value;
    
    /// 调用工具
    async fn call(&self, request: ToolCallRequest) -> Result<ToolCallResponse, String>;
    
    /// 获取工具定义
    fn to_definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.name().to_string(),
            description: self.description().to_string(),
            input_schema: self.input_schema(),
        }
    }
}

// ============================================================
// Tool Registry
// ============================================================

pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }
    
    pub fn register(&mut self, tool: Box<dyn Tool>) {
        let name = tool.name().to_string();
        self.tools.insert(name, tool);
    }
    
    pub fn get(&self, name: &str) -> Option<&Box<dyn Tool>> {
        self.tools.get(name)
    }
    
    pub fn list(&self) -> Vec<ToolDefinition> {
        self.tools
            .values()
            .map(|tool| tool.to_definition())
            .collect()
    }
    
    pub async fn call(&self, request: ToolCallRequest) -> Result<ToolCallResponse, String> {
        match self.get(&request.name) {
            Some(tool) => tool.call(request).await,
            None => Err(format!("Tool not found: {}", request.name)),
        }
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================
// Tool Result Helpers
// ============================================================

pub struct ToolResultBuilder;

impl ToolResultBuilder {
    pub fn success(content: Vec<Value>) -> ToolCallResponse {
        ToolCallResponse {
            content,
            is_error: Some(false),
        }
    }
    
    pub fn error(message: &str) -> ToolCallResponse {
        ToolCallResponse {
            content: vec![serde_json::json!({
                "type": "text",
                "text": format!("Error: {}", message)
            })],
            is_error: Some(true),
        }
    }
}
