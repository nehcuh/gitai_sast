pub mod opengrep;
pub mod remote;
pub mod error;
pub mod config;

pub use opengrep::OpengrepScanner;
pub use remote::RemoteSastScanner;
pub use error::{ScanError, ScanResult as ScannerScanResult};
pub use config::{ScannerConfig, ConfigLoader};

use crate::core::types::{ScanEnvelope, Finding, ScanStatus};

/// 统一扫描结果类型（用于 MCP 返回）
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScanResult {
    pub status: ScanStatus,
    pub envelope: ScanEnvelope,
    pub findings: Vec<Finding>,
}
