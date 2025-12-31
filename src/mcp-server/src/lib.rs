pub mod core;
pub mod scanner;
pub mod tools;

use core::ServerInfo;
use tools::{ToolRegistry};

pub const SERVER_NAME: &str = "mcp-sast-server";
pub const SERVER_VERSION: &str = "0.1.0";

pub fn get_server_info() -> ServerInfo {
    ServerInfo {
        name: SERVER_NAME.to_string(),
        version: SERVER_VERSION.to_string(),
        capabilities: core::types::ServerCapabilities {
            tools: core::types::ToolsCapability {
                list_changed: false,
            },
        },
    }
}

pub fn create_tool_registry() -> ToolRegistry {
    ToolRegistry::new()
}

// Re-export types for convenience
pub use core::types::*;
pub use scanner::{OpengrepScanner, RemoteSastScanner, ScanResult};
