mod core;
mod tools;
mod scanner;

use core::types::{McpRequest, McpResponse, ServerInfo, ServerCapabilities, ToolsCapability, McpError, ToolCallRequest};
use tools::ToolRegistry;
use tools::scan::ScanTool;
use tools::get_context::GetContextTool;
use tools::get_taint_path::GetTaintPathTool;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{info, error};
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    
    info!("Starting MCP Server v0.1.0");
    
    // 创建工具注册表
    let mut registry = ToolRegistry::new();
    registry.register(Box::new(ScanTool));
    registry.register(Box::new(GetContextTool));
    registry.register(Box::new(GetTaintPathTool));
    
    let registry = Arc::new(registry);
    
    // 启动 stdio 模式
    info!("Starting stdio mode");
    run_stdio(registry).await?;
    
    Ok(())
}

async fn run_stdio(registry: Arc<ToolRegistry>) -> anyhow::Result<()> {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    
    let mut reader = BufReader::new(stdin);
    let mut stdout = stdout;
    
    loop {
        // 读取请求
        let mut request_str = String::new();
        reader.read_line(&mut request_str).await?;
        
        let request_str = request_str.trim();
        if request_str.is_empty() {
            continue;
        }
        
        info!("Received request: {}", request_str);
        
        // 解析请求
        let request: McpRequest = serde_json::from_str(request_str)
            .map_err(|e| anyhow::anyhow!("Failed to parse request: {}", e))?;
        
        // 处理请求
        let response = handle_request(&request, &registry).await;
        
        // 发送响应
        let response_str = serde_json::to_string(&response)?;
        stdout.write_all(response_str.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
        
        info!("Sent response");
    }
}

async fn handle_request(request: &McpRequest, registry: &ToolRegistry) -> McpResponse {
    match request.method.as_str() {
        "initialize" => {
            let server_info = ServerInfo {
                name: "gitai-sast-mcp-server".to_string(),
                version: "0.1.0".to_string(),
                capabilities: ServerCapabilities {
                    tools: ToolsCapability {
                        list_changed: true,
                    },
                },
            };
            
            McpResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: Some(serde_json::to_value(server_info).unwrap()),
                error: None,
            }
        }
        
        "tools/list" => {
            let tools = registry.list();
            
            McpResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: Some(serde_json::json!({
                    "tools": tools
                })),
                error: None,
            }
        }
        
        "tools/call" => {
            if let Some(params) = &request.params {
                let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let arguments = params.get("arguments").cloned().unwrap_or(serde_json::Value::Null);
                
                info!("Calling tool: {}", tool_name);
                
                match registry.call(ToolCallRequest {
                    name: tool_name.to_string(),
                    arguments,
                }).await {
                    Ok(result) => {
                        McpResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id.clone(),
                            result: Some(serde_json::json!({
                                "content": result.content
                            })),
                            error: None,
                        }
                    }
                    Err(e) => {
                        error!("Tool call failed: {}", e);
                        McpResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id.clone(),
                            result: None,
                            error: Some(McpError {
                                code: -32000,
                                message: e,
                                data: None,
                            }),
                        }
                    }
                }
            } else {
                error!("Missing params in tools/call request");
                McpResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id.clone(),
                    result: None,
                    error: Some(McpError {
                        code: -32602,
                        message: "Invalid params".to_string(),
                        data: None,
                    }),
                }
            }
        }
        
        _ => {
            error!("Unknown method: {}", request.method);
            McpResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: None,
                error: Some(McpError {
                    code: -32601,
                    message: format!("Method not found: {}", request.method),
                    data: None,
                }),
            }
        }
    }
}
