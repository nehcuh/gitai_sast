use crate::core::types::{Finding, ScanEnvelope, Location, IgnoreItem, ScanConfig, ScanStatus};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;
use tracing::{info, error, debug};
use uuid::Uuid;

/// Opengrep 扫描器
pub struct OpengrepScanner {
    opengrep_path: String,
}

impl OpengrepScanner {
    pub fn new(opengrep_path: Option<String>) -> Self {
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
        
        Self { opengrep_path }
    }
    
    /// 执行扫描
    pub async fn scan(
        &self,
        root: &str,
        files: HashMap<String, String>,
        ignores: Vec<IgnoreItem>,
        config: &ScanConfig,
    ) -> Result<ScanResult> {
        let start = Instant::now();
        let files_count = files.len();
        let total_lines = files.values().map(|c| c.lines().count()).sum::<usize>();
        
        info!("Starting scan with {} files", files_count);
        
        // 构建忽略规则
        let ignore_rules = self.build_ignore_rules(&ignores);
        
        // 执行 opengrep 扫描
        let findings = self.run_opengrep(root, files, ignore_rules, config).await?;
        
        // 过滤忽略列表
        let filtered_findings = self.filter_ignores(findings, &ignores);
        
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
    }
    
    /// 运行 opengrep CLI
    async fn run_opengrep(
        &self,
        root: &str,
        files: HashMap<String, String>,
        _ignore_rules: Vec<String>,
        config: &ScanConfig,
    ) -> Result<Vec<Finding>> {
        let temp_dir = tempfile::tempdir()?;
        let temp_file = temp_dir.path().join("scan-input.json");
        
        // 将文件内容写入临时文件
        let input_json = json!({
            "files": files
        });
        std::fs::write(&temp_file, serde_json::to_string_pretty(&input_json)?)?;
        
        // 构建命令
        let severity_threshold = config.severity_threshold.to_uppercase();
        let severity_arg = format!("--severity={}", severity_threshold);
        let input_arg = format!("--input={}", temp_file.display());
        
        let args = vec![
            "scan",
            "--json",
            &severity_arg,
            "--config=auto",
            &input_arg,
        ];
        
        debug!("Running opengrep with args: {:?}", args);
        
        // 执行命令
        let output = Command::new(&self.opengrep_path)
            .args(&args)
            .current_dir(root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Opengrep failed: {}", stderr);
            return Err(anyhow::anyhow!("Opengrep failed: {}", stderr));
        }
        
        // 解析输出
        let stdout = String::from_utf8_lossy(&output.stdout);
        let opengrep_results: OpengrepResults = serde_json::from_str(&stdout)?;
        
        // 转换为 Finding
        let findings = opengrep_results.results.into_iter()
            .filter_map(|r| self.convert_to_finding(r))
            .collect();
        
        Ok(findings)
    }
    
    /// 构建忽略规则
    fn build_ignore_rules(&self, ignores: &[IgnoreItem]) -> Vec<String> {
        ignores.iter()
            .filter_map(|ignore| {
                if let Some(rule_id) = &ignore.rule_id {
                    Some(format!("{}.{}:{}", ignore.file, ignore.line.unwrap_or(0), rule_id))
                } else {
                    None
                }
            })
            .collect()
    }
    
    /// 过滤忽略列表
    fn filter_ignores(&self, findings: Vec<Finding>, ignores: &[IgnoreItem]) -> Vec<Finding> {
        findings.into_iter()
            .filter(|finding| {
                !ignores.iter().any(|ignore| {
                    ignore.file == finding.location.file &&
                    ignore.line.map_or(true, |l| l == finding.location.line) &&
                    ignore.rule_id.as_ref().map_or(true, |r| r == &finding.rule_id)
                })
            })
            .collect()
    }
    
    /// 转换 Opengrep 结果为 Finding
    fn convert_to_finding(&self, result: OpengrepResult) -> Option<Finding> {
        Some(Finding {
            id: Uuid::new_v4().to_string(),
            rule_id: result.check_id,
            finding_type: result.check.category,
            severity: result.extra.severity.to_lowercase(),
            title: result.check.rich_id,
            description: result.message,
            location: Location {
                file: result.path,
                line: result.start.line,
                column: Some(result.start.col),
            },
            code_snippet: result.extra.lines,
            fix: None, // TODO: 实现 fix 生成
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
    message: String,
    check: Check,
}

#[derive(Debug, Deserialize)]
struct Position {
    line: u32,
    col: u32,
    offset: u32,
}

#[derive(Debug, Deserialize)]
struct Extra {
    lines: String,
    severity: String,
}

#[derive(Debug, Deserialize)]
struct Check {
    id: String,
    rich_id: String,
    category: String,
}

// ============================================================
// 扫描结果
// ============================================================

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub status: ScanStatus,
    pub envelope: ScanEnvelope,
    pub findings: Vec<Finding>,
}
