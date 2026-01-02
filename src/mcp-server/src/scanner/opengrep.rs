use crate::core::types::{Finding, ScanEnvelope, Location, IgnoreItem, ScanConfig, ScanStatus};
use crate::scanner::{ScanResult, ScanError};
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tracing::{info, error, debug};
use uuid::Uuid;
use tokio::sync::Semaphore;

/// Global semaphore to limit concurrent Opengrep scans to prevent resource exhaustion
static SCAN_SEMAPHORE: Semaphore = Semaphore::const_new(4);

/// Opengrep 扫描器
pub struct OpengrepScanner {
    opengrep_path: String,
    opengrep_rules: Option<String>,
}

impl OpengrepScanner {
    pub fn new(opengrep_path: Option<String>, opengrep_rules: Option<String>) -> Self {
        let opengrep_path = opengrep_path.unwrap_or_else(|| {
            // 尝试从 PATH 中查找 opengrep
            if let Ok(path) = which::which("opengrep") {
                path.to_string_lossy().to_string()
            } else {
                // 使用缓存目录中的 opengrep
                let cache_dir = dirs::cache_dir().unwrap_or_else(|| Path::new(".cache").to_path_buf());
                let opengrep_dir = cache_dir.join("opengrep/v1.13.2/opengrep.bin");
                if opengrep_dir.exists() {
                    opengrep_dir.to_string_lossy().to_string()
                } else {
                    "opengrep".to_string()
                }
            }
        });

        info!("Using opengrep at: {}", opengrep_path);
        if let Some(ref rules) = opengrep_rules {
            info!("Using opengrep rules from: {}", rules);
        } else {
            info!("Using default opengrep rules (auto)");
        }

        Self {
            opengrep_path,
            opengrep_rules,
        }
    }
    
    /// 执行扫描（带超时控制）
    pub async fn scan(
        &self,
        root: &str,
        files: HashMap<String, String>,
        ignores: Vec<IgnoreItem>,
        config: &ScanConfig,
    ) -> Result<ScanResult, ScanError> {
        let start = Instant::now();
        let files_count = files.len();
        let total_lines = files.values().map(|c| c.lines().count()).sum::<usize>();
        
        info!("Starting scan with {} files", files_count);

        // 计算总超时时间（根据文件数量动态调整）
        let total_timeout = Duration::from_secs(
            60 + (files_count as u64 / 5) // 基础 1 分钟 + 每个文件 0.2 秒
        );

        let scan_future = async {
            // 构建忽略规则（使用 HashSet 优化）
            let ignore_set = self.build_ignore_set(&ignores);

            // Acquire permit to limit concurrency
            // This waits if there are too many concurrent scans
            let _permit = SCAN_SEMAPHORE.acquire().await.map_err(|e| {
                ScanError::Execution(format!("Failed to acquire scan permit: {}", e))
            })?;

            // 执行 opengrep 扫描（带超时）
            let findings = tokio::time::timeout(
                total_timeout,
                self.run_opengrep(root, files, ignore_set, config)
            )
            .await
            .map_err(|_| ScanError::Timeout(total_timeout))??;
            
            // 过滤忽略列表
            let filtered_findings = self.filter_ignores_optimized(findings, &ignores);
            
            // 构建扫描信封
            let envelope = ScanEnvelope {
                scan_id: Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now(),
                files_scanned: files_count,
                total_lines,
                duration_ms: start.elapsed().as_millis() as u64,
            };
            
            info!("Scan completed: {} findings in {}ms", filtered_findings.len(), envelope.duration_ms);
            
            Ok(ScanResult {
                status: ScanStatus::Success,
                envelope,
                findings: filtered_findings,
            })
        };
        
        // 执行扫描并应用总超时
        tokio::time::timeout(total_timeout, scan_future)
            .await
            .map_err(|_| ScanError::Timeout(total_timeout))?
    }
    
    /// 运行 opengrep CLI（带超时控制）
    async fn run_opengrep(
        &self,
        root: &str,
        files: HashMap<String, String>,
        _ignore_set: std::collections::HashSet<(String, Option<u32>, Option<String>)>,
        config: &ScanConfig,
    ) -> Result<Vec<Finding>, ScanError> {
        // 计算扫描超时时间（根据文件数量）
        let scan_timeout = Duration::from_secs(60 + (files.len() as u64 / 5));
        
        // 在线程池中执行扫描（避免阻塞异步运行时）
        let result = tokio::time::timeout(
            scan_timeout,
            tokio::task::spawn_blocking({
                let opengrep_path = self.opengrep_path.clone();
                let root = root.to_string();
                let files = files.clone();
                let severity_threshold = config.severity_threshold.clone();
                let opengrep_rules = self.opengrep_rules.clone();
                
                move || {
                    Self::run_opengrep_blocking(
                        &opengrep_path,
                        &root,
                        files,
                        &severity_threshold,
                        opengrep_rules,
                    )
                }
            })
        )
        .await
        .map_err(|_| ScanError::Timeout(scan_timeout))?
        .map_err(|e| {
            // 处理任务失败（panic 或取消）
            ScanError::Execution(format!("Scan task failed: {}", e))
        })?
        .map_err(|e| ScanError::Execution(e.to_string()))?;
        
        Ok(result)
    }
    
    /// 阻塞式执行 opengrep 扫描
    fn run_opengrep_blocking(
        opengrep_path: &str,
        root: &str,
        files: HashMap<String, String>,
        severity_threshold: &str,
        opengrep_rules: Option<String>,
    ) -> Result<Vec<Finding>, ScanError> {
        fn normalize_path_key(path: &str) -> String {
            path.replace('\\', "/")
        }

        fn virtual_path(root: &str, original_path: &str, index: usize) -> PathBuf {
            if !root.trim().is_empty() {
                let root_path = Path::new(root);
                if let Ok(relative) = Path::new(original_path).strip_prefix(root_path) {
                    if !relative.as_os_str().is_empty() {
                        return relative.to_path_buf();
                    }
                }
            }

            let file_name = Path::new(original_path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file");

            PathBuf::from("__virtual__").join(format!("{:04}-{}", index, file_name))
        }

        // 创建临时目录
        let temp_dir = tempfile::tempdir()
            .map_err(|e| ScanError::Execution(format!("Failed to create temp dir: {}", e)))?;

        // 写入虚拟文件系统，并记录路径映射（opengrep 输出的 path -> 原始文件路径）
        let mut path_map: HashMap<String, String> = HashMap::new();
        for (index, (original_path, content)) in files.into_iter().enumerate() {
            let relative_path = virtual_path(root, &original_path, index);
            let temp_path = temp_dir.path().join(&relative_path);

            if let Some(parent) = temp_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    ScanError::Execution(format!(
                        "Failed to create temp dir for {}: {}",
                        temp_path.display(),
                        e
                    ))
                })?;
            }

            std::fs::write(&temp_path, content)
                .map_err(|e| ScanError::Execution(format!("Failed to write temp file: {}", e)))?;

            let relative_key = normalize_path_key(&relative_path.to_string_lossy());
            let absolute_key = normalize_path_key(&temp_path.to_string_lossy());

            path_map.insert(relative_key.clone(), original_path.clone());
            path_map.insert(format!("./{}", relative_key), original_path.clone());
            path_map.insert(absolute_key, original_path);
        }
        
        // 构建命令
        let severity_arg = format!("--severity={}", severity_threshold.to_uppercase());

        let mut command = Command::new(opengrep_path);
        command.arg("scan");
        command.arg("--json");
        command.arg("--quiet");
        command.arg(&severity_arg);
        command.arg("--max-target-bytes=10000000");  // 最大 10MB 文件
        command.arg("--timeout=120");  // 120 秒超时

        // 使用配置的规则路径
        if let Some(ref rules) = opengrep_rules {
            command.arg("--config");
            command.arg(rules);
        } else {
            command.arg("--config=auto");  // 使用默认规则配置
        }

        command.arg(temp_dir.path());

        if !root.trim().is_empty() {
            command.current_dir(root);
        }

        info!("Running opengrep with command: {:?}", command);

        // 执行命令（带超时控制）
        let output = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| {
                ScanError::Execution(format!("Failed to execute opengrep: {}", e))
            })?;
        
        // 检查退出状态
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);

            error!("Opengrep failed with exit code: {:?}", output.status.code());
            error!("Opengrep stderr: {}", stderr);
            error!("Opengrep stdout: {}", stdout);

            // 记录临时目录结构（用于调试）
            error!("Temp dir contents: {:?}", temp_dir.path());
            if let Ok(entries) = std::fs::read_dir(temp_dir.path()) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        error!("  - {:?}", entry.path());
                    }
                }
            }

            return Err(ScanError::Execution(format!(
                "Opengrep scan failed with exit code {:?}: {}",
                output.status.code(),
                stderr
            )));
        }

        // 解析输出
        let stdout = String::from_utf8_lossy(&output.stdout);
        info!("Opengrep raw output (first 500 chars): {}",
               stdout.chars().take(500).collect::<String>());

        if stdout.trim().is_empty() {
            info!("Opengrep returned no output - no vulnerabilities found");
            return Ok(vec![]);
        }

        let opengrep_results: OpengrepResults = serde_json::from_str(&stdout)
            .map_err(|e| {
                error!("Failed to parse opengrep output as JSON: {}", e);
                error!("Raw output: {}", stdout);
                ScanError::Execution(format!("Failed to parse opengrep output: {}", e))
            })?;
        
        // 转换为 Finding
        let findings = opengrep_results.results.into_iter()
            .filter_map(|r| Self::convert_to_finding_static(r, &path_map))
            .collect();
        
        Ok(findings)
    }
    
    /// 构建忽略规则集合（优化版，使用 HashSet）
    fn build_ignore_set(
        &self,
        ignores: &[IgnoreItem],
    ) -> std::collections::HashSet<(String, Option<u32>, Option<String>)> {
        ignores.iter()
            .filter_map(|ignore| {
                if let Some(rule_id) = &ignore.rule_id {
                    Some((
                        ignore.file.clone(),
                        ignore.line,
                        Some(rule_id.clone())
                    ))
                } else {
                    None
                }
            })
            .collect()
    }
    
    /// 过滤忽略列表（优化版）
    fn filter_ignores_optimized(&self, findings: Vec<Finding>, ignores: &[IgnoreItem]) -> Vec<Finding> {
        // 构建忽略规则的快速查找结构
        let ignore_set: std::collections::HashSet<(String, u32, String)> = ignores.iter()
            .filter_map(|ignore| {
                if let (Some(line), Some(rule_id)) = (ignore.line, &ignore.rule_id) {
                    Some((ignore.file.clone(), line, rule_id.clone()))
                } else {
                    None
                }
            })
            .collect();
        
        findings.into_iter()
            .filter(|finding| {
                !ignore_set.contains(&(
                    finding.location.file.clone(),
                    finding.location.line,
                    finding.rule_id.clone()
                ))
            })
            .collect()
    }
    
    /// 静态方法：转换 Opengrep 结果为 Finding
    fn convert_to_finding_static(result: OpengrepResult, path_map: &HashMap<String, String>) -> Option<Finding> {
        fn normalize_path_key(path: &str) -> String {
            path.replace('\\', "/")
        }

        fn map_severity(severity: &str) -> String {
            match severity.trim().to_uppercase().as_str() {
                "INFO" => "low".to_string(),
                "WARNING" => "medium".to_string(),
                "ERROR" => "high".to_string(),
                other if other.is_empty() => "medium".to_string(),
                other => other.to_lowercase(),
            }
        }

        let file_key = normalize_path_key(&result.path);
        let file = if let Some(path) = path_map.get(&file_key) {
            path.clone()
        } else {
            // 尝试通过后缀匹配 (处理 Mac 上 /var/folders vs /private/var/folders 的问题)
            if let Some(pos) = file_key.rfind("__virtual__") {
                let suffix = &file_key[pos..];
                // 尝试匹配 suffix
                 path_map.get(suffix).cloned().unwrap_or_else(|| result.path.clone())
            } else {
                result.path.clone()
            }
        };

        let message = result.extra.message.trim();
        let title = if message.is_empty() {
            result.check_id.clone()
        } else {
            message.to_string()
        };

        let category = result
            .extra
            .metadata
            .get("category")
            .and_then(|value| value.as_str())
            .unwrap_or("security")
            .to_string();

        Some(Finding {
            id: Uuid::new_v4().to_string(),
            rule_id: result.check_id,
            r#type: category,
            severity: map_severity(&result.extra.severity),
            title: title.clone(),
            description: title,
            location: Location {
                file,
                line: result.start.line,
                column: Some(result.start.col),
            },
            code_snippet: result.extra.lines,
            fix: None, // TODO: 实现 fix 生成
            issue_content: None,
            provider: "local".to_string(),
        })
    }
}

// ============================================================
// Opengrep 结果类型
// ============================================================

#[derive(Debug, Deserialize)]
struct OpengrepResults {
    results: Vec<OpengrepResult>,
}

#[derive(Debug, Deserialize)]
struct OpengrepResult {
    check_id: String,
    path: String,
    start: Position,
    end: Position,
    extra: Extra,
}

#[derive(Debug, Deserialize)]
struct Position {
    line: u32,
    col: u32,
    offset: u32,
}

#[derive(Debug, Deserialize)]
struct Extra {
    #[serde(default)]
    lines: String,
    #[serde(default)]
    severity: String,
    #[serde(default)]
    message: String,
    #[serde(default)]
    metadata: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_opengrep_json_and_converts_to_finding() {
        let payload = r#"
        {
          "version": "1.13.2",
          "results": [
            {
              "check_id": "test.rule",
              "path": "/tmp/a.js",
              "start": { "line": 2, "col": 10, "offset": 24 },
              "end": { "line": 2, "col": 17, "offset": 31 },
              "extra": {
                "lines": "  return eval(x)",
                "severity": "ERROR",
                "message": "eval usage",
                "metadata": { "category": "security" }
              }
            }
          ],
          "errors": []
        }
        "#;

        let mut results: OpengrepResults = serde_json::from_str(payload).expect("should parse opengrep JSON");
        assert_eq!(results.results.len(), 1);

        let mut path_map = HashMap::new();
        path_map.insert("/tmp/a.js".to_string(), "/original/a.js".to_string());

        let first = results.results.pop().expect("missing result");
        let finding = OpengrepScanner::convert_to_finding_static(first, &path_map)
            .expect("should convert");

        assert_eq!(finding.location.file, "/original/a.js");
        assert_eq!(finding.severity, "high");
        assert_eq!(finding.title, "eval usage");
        assert_eq!(finding.r#type, "security");
    }
}
