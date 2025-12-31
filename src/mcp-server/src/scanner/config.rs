use crate::core::types::{ScanConfig as BaseScanConfig, RemoteSastConfig};
use crate::scanner::ScanError;
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::str::FromStr;
use tracing::{info, warn};

/// 扫描器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannerConfig {
    /// 基础扫描配置
    #[serde(default = "default_scan_config")]
    pub scan: BaseScanConfig,
    
    /// 远程 SAST 配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteSastConfig>,
    
    /// Opengrep 配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opengrep: Option<OpengrepConfig>,
}

/// Opengrep 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpengrepConfig {
    /// Opengrep 可执行文件路径
    pub path: Option<String>,
    
    /// 是否自动下载
    #[serde(default)]
    pub auto_download: bool,
    
    /// 下载版本
    #[serde(default = "default_opengrep_version")]
    pub version: String,
}

fn default_opengrep_version() -> String {
    "v1.13.2".to_string()
}

fn default_scan_config() -> BaseScanConfig {
    BaseScanConfig {
        severity_threshold: "ERROR".to_string(),
        enable_opengrep: true,
        include_snippets: true,
        max_concurrent_scans: 1,
        timeout_seconds: 300,
        enable_remote_scan: false,
        remote_url: String::new(),
        remote_user_id: String::new(),
        remote_allow_invalid_certs: false,
        remote_ca_cert_path: String::new(),
    }
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            scan: default_scan_config(),
            remote: None,
            opengrep: Some(OpengrepConfig {
                path: None,
                auto_download: true,
                version: default_opengrep_version(),
            }),
        }
    }
}

impl ScannerConfig {
    /// 从文件加载配置
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, ScanError> {
        let path = path.as_ref();
        info!("Loading scanner config from: {}", path.display());
        
        let content = std::fs::read_to_string(path)
            .map_err(|e| ScanError::Config(format!("Failed to read config file: {}", e)))?;
        
        // 根据扩展名选择反序列化格式
        let config: ScannerConfig = match path.extension().and_then(|ext| ext.to_str()) {
            Some("json") => serde_json::from_str(&content)?,
            Some("toml") => toml::from_str(&content)?,
            Some("yaml") | Some("yml") => serde_yaml::from_str(&content)?,
            _ => return Err(ScanError::Config(
                "Unsupported config file format. Supported: json, toml, yaml".to_string()
            )),
        };
        
        // 验证配置
        config.validate()?;
        
        info!("Scanner config loaded successfully");
        Ok(config)
    }
    
    /// 从环境变量加载配置
    pub fn from_env() -> Result<Self, ScanError> {
        let mut config = Self::default();
        
        // 扫描配置
        if let Ok(severity) = std::env::var("SCAN_SEVERITY_THRESHOLD") {
            config.scan.severity_threshold = severity;
        }
        
        if let Ok(timeout) = std::env::var("SCAN_TIMEOUT_SECONDS") {
            config.scan.timeout_seconds = timeout
                .parse()
                .map_err(|e| ScanError::Config(format!("Invalid SCAN_TIMEOUT_SECONDS: {}", e)))?;
        }
        
        if let Ok(max_concurrent) = std::env::var("SCAN_MAX_CONCURRENT") {
            config.scan.max_concurrent_scans = max_concurrent
                .parse()
                .map_err(|e| ScanError::Config(format!("Invalid SCAN_MAX_CONCURRENT: {}", e)))?;
        }
        
        // 远程配置
        if let Ok(enable) = std::env::var("SCAN_ENABLE_REMOTE") {
            config.scan.enable_remote_scan = enable
                .parse()
                .map_err(|e| ScanError::Config(format!("Invalid SCAN_ENABLE_REMOTE: {}", e)))?;
        }
        
        if let Ok(url) = std::env::var("SCAN_REMOTE_URL") {
            let remote_config = config.remote.get_or_insert_with(Default::default);
            remote_config.url = url;
        }
        
        if let Ok(user_id) = std::env::var("SCAN_REMOTE_USER_ID") {
            let remote_config = config.remote.get_or_insert_with(Default::default);
            remote_config.user_id = user_id;
        }
        
        // Opengrep 配置
        if let Ok(path) = std::env::var("SCAN_OPENGREP_PATH") {
            let opengrep_config = config.opengrep.get_or_insert_with(Default::default);
            opengrep_config.path = Some(path);
        }
        
        // 验证配置
        config.validate()?;
        
        info!("Scanner config loaded from environment variables");
        Ok(config)
    }
    
    /// 合并配置（环境变量覆盖文件配置）
    pub fn merge_with_env(mut self) -> Result<Self, ScanError> {
        if let Ok(env_config) = Self::from_env() {
            self = self.merge(env_config);
        }
        Ok(self)
    }
    
    /// 合并两个配置
    pub fn merge(mut self, other: Self) -> Self {
        // 合并扫描配置
        if other.scan.severity_threshold != default_scan_config().severity_threshold {
            self.scan.severity_threshold = other.scan.severity_threshold;
        }
        
        if other.scan.timeout_seconds != default_scan_config().timeout_seconds {
            self.scan.timeout_seconds = other.scan.timeout_seconds;
        }
        
        // 合并远程配置
        if other.remote.is_some() {
            self.remote = other.remote;
        }
        
        // 合并 Opengrep 配置
        if other.opengrep.is_some() {
            self.opengrep = other.opengrep;
        }
        
        self
    }
    
    /// 验证配置
    pub fn validate(&self) -> Result<(), ScanError> {
        // 验证远程 URL 格式
        if let Some(remote) = &self.remote {
            self.validate_remote_url(&remote.url)?;
        }
        
        // 验证严重性级别
        self.validate_severity(&self.scan.severity_threshold)?;
        
        info!("Scanner config validated successfully");
        Ok(())
    }
    
    /// 验证远程 URL 格式
    fn validate_remote_url(&self, url: &str) -> Result<(), ScanError> {
        if url.is_empty() {
            return Ok(()); // 允许空 URL
        }
        
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ScanError::Config(format!(
                "Invalid remote URL format: {}. Must start with http:// or https://",
                url
            )));
        }
        
        // 验证 URL 可以解析
        if url.parse::<reqwest::Url>().is_err() {
            return Err(ScanError::Config(format!(
                "Invalid remote URL: {}",
                url
            )));
        }
        
        Ok(())
    }
    
    /// 验证严重性级别
    fn validate_severity(&self, severity: &str) -> Result<(), ScanError> {
        let severity_upper = severity.to_uppercase();
        match severity_upper.as_str() {
            "ERROR" | "WARNING" | "INFO" => Ok(()),
            _ => Err(ScanError::Config(format!(
                "Invalid severity threshold: {}. Valid values: ERROR, WARNING, INFO",
                severity
            ))),
        }
    }
}

/// 实现 Default for RemoteSastConfig
impl Default for RemoteSastConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            user_id: String::new(),
            signature_key: None,
            allow_invalid_certs: false,
            ca_cert_path: String::new(),
        }
    }
}

/// 实现 Default for OpengrepConfig
impl Default for OpengrepConfig {
    fn default() -> Self {
        Self {
            path: None,
            auto_download: true,
            version: default_opengrep_version(),
        }
    }
}

/// 配置加载器
pub struct ConfigLoader {
    /// 默认配置
    default: ScannerConfig,
    /// 配置文件路径
    config_path: Option<String>,
}

impl ConfigLoader {
    pub fn new() -> Self {
        Self {
            default: ScannerConfig::default(),
            config_path: None,
        }
    }
    
    /// 设置配置文件路径
    pub fn with_config_path(mut self, path: String) -> Self {
        self.config_path = Some(path);
        self
    }
    
    /// 加载配置
    pub fn load(self) -> Result<ScannerConfig, ScanError> {
        // 1. 从文件加载（如果指定）
        let config = if let Some(path) = &self.config_path {
            Self::load_from_file_with_fallback(path)?
        } else {
            self.default
        };
        
        // 2. 合并环境变量
        let config = config.merge_with_env()?;
        
        // 3. 验证配置
        config.validate()?;
        
        Ok(config)
    }
    
    /// 从文件加载，如果失败则使用默认配置
    fn load_from_file_with_fallback(path: &str) -> Result<ScannerConfig, ScanError> {
        match ScannerConfig::from_file(path) {
            Ok(config) => Ok(config),
            Err(e) => {
                warn!("Failed to load config from file '{}': {}. Using default config.", path, e);
                Ok(ScannerConfig::default())
            }
        }
    }
}

impl Default for ConfigLoader {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = ScannerConfig::default();
        assert!(config.validate().is_ok());
    }
    
    #[test]
    fn test_validate_severity() {
        let mut config = ScannerConfig::default();
        
        // 有效值
        config.scan.severity_threshold = "error".to_string();
        assert!(config.validate().is_ok());
        
        config.scan.severity_threshold = "warning".to_string();
        assert!(config.validate().is_ok());
        
        config.scan.severity_threshold = "info".to_string();
        assert!(config.validate().is_ok());
        
        // 无效值
        config.scan.severity_threshold = "invalid".to_string();
        assert!(config.validate().is_err());
    }
    
    #[test]
    fn test_validate_remote_url() {
        let mut config = ScannerConfig::default();
        config.remote = Some(RemoteSastConfig {
            url: "https://example.com".to_string(),
            user_id: "user123".to_string(),
            signature_key: None,
            allow_invalid_certs: false,
            ca_cert_path: String::new(),
        });
        
        assert!(config.validate().is_ok());
        
        // 无效 URL
        config.remote.as_mut().unwrap().url = "invalid-url".to_string();
        assert!(config.validate().is_err());
    }
    
    #[test]
    fn test_merge_config() {
        let config1 = ScannerConfig {
            scan: BaseScanConfig {
                severity_threshold: "error".to_string(),
                timeout_seconds: 300,
                ..default_scan_config()
            },
            remote: None,
            opengrep: None,
        };
        
        let config2 = ScannerConfig {
            scan: BaseScanConfig {
                severity_threshold: "warning".to_string(),
                timeout_seconds: 600,
                ..default_scan_config()
            },
            remote: Some(RemoteSastConfig {
                url: "https://example.com".to_string(),
                user_id: "user123".to_string(),
                signature_key: None,
                allow_invalid_certs: false,
                ca_cert_path: String::new(),
            }),
            opengrep: None,
        };
        
        let merged = config1.merge(config2);
        
        assert_eq!(merged.scan.severity_threshold, "warning");
        assert_eq!(merged.scan.timeout_seconds, 600);
        assert!(merged.remote.is_some());
    }
}
