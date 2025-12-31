use std::time::Duration;
use thiserror::Error;

/// 扫描器错误类型
#[derive(Debug, Error)]
pub enum ScanError {
    /// 配置错误
    #[error("Configuration error: {0}")]
    Config(String),
    
    /// 执行错误
    #[error("Scan execution error: {0}")]
    Execution(String),
    
    /// 超时错误
    #[error("Timeout error: operation exceeded {0:?}")]
    Timeout(Duration),
    
    /// 远程服务器错误
    #[error("Remote server error: {code} - {message}")]
    Remote { code: String, message: String },
    
    /// 网络错误
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    
    /// IO 错误
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    
    /// JSON 序列化/反序列化错误
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    
    /// TOML 反序列化错误
    #[error("TOML error: {0}")]
    Toml(#[from] toml::de::Error),
    
    /// YAML 反序列化错误
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    
    /// 签名验证错误
    #[error("Signature verification failed: {0}")]
    Signature(String),
    
    /// 上传失败
    #[error("Upload failed: {0}")]
    Upload(String),
    
    /// 扫描失败
    #[error("Scan failed: {0}")]
    ScanFailed(String),
    
    /// 结果获取失败
    #[error("Failed to get results: {0}")]
    Results(String),
}

/// 扫描器结果类型
pub type ScanResult<T> = std::result::Result<T, ScanError>;
