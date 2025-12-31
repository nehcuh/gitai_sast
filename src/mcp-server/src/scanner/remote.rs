use crate::core::types::{
    RemoteSastConfig, RemoteUploadRequest, RemoteScanRequest,
    RemoteScanResponse, RemoteScanResultResponse,
    RemoteResultListResponse, RemoteResultRecord,
    ScanEnvelope, Finding, Location, ScanStatus, IgnoreItem, ScanConfig
};
use crate::scanner::{ScanResult, ScanError, ScannerScanResult};
use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tracing::{info, debug, warn};
use uuid::Uuid;
use md5::{Md5, Digest};
use zip::{ZipWriter, write::SimpleFileOptions};
use futures::stream::{self, StreamExt};
use base64::Engine as _;

/// 远程 SAST 扫描器
pub struct RemoteSastScanner {
    config: RemoteSastConfig,
    client: reqwest::Client,
}

/// 轮询配置
#[derive(Debug, Clone)]
struct PollConfig {
    /// 最大轮询次数
    max_attempts: usize,
    /// 初始间隔
    initial_interval: Duration,
    /// 最大间隔
    max_interval: Duration,
    /// 每次轮询的总超时时间
    request_timeout: Duration,
}

impl Default for PollConfig {
    fn default() -> Self {
        Self {
            max_attempts: 120,
            initial_interval: Duration::from_secs(5),
            max_interval: Duration::from_secs(60),
            request_timeout: Duration::from_secs(30),
        }
    }
}

impl RemoteSastScanner {
    pub fn new(mut config: RemoteSastConfig) -> ScannerScanResult<Self> {
        config.url = normalize_remote_base_url(&config.url);
        info!("Creating remote SAST scanner with URL: {}", config.url);

        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(30))
            .pool_idle_timeout(Duration::from_secs(90));

        if config.allow_invalid_certs {
            builder = builder.danger_accept_invalid_certs(true);
        }

        let ca_cert_path = config.ca_cert_path.trim();
        if !ca_cert_path.is_empty() {
            let pem_bytes = std::fs::read(ca_cert_path).map_err(|e| {
                ScanError::Config(format!(
                    "Failed to read remote CA certificate file at {}: {}",
                    ca_cert_path, e
                ))
            })?;

            builder = add_root_certificates_from_pem_bytes(builder, &pem_bytes).map_err(|e| {
                ScanError::Config(format!(
                    "Failed to import remote CA certificate(s) from file {}: {}",
                    ca_cert_path, e
                ))
            })?;
        }

        let client = builder
            .build()
            .map_err(|e| ScanError::Execution(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { config, client })
    }
    
    /// 执行扫描（带超时控制）
    pub async fn scan(
        &self,
        root: String,
        files: HashMap<String, String>,
        ignores: Vec<IgnoreItem>,
        config: &ScanConfig,
    ) -> ScannerScanResult<ScanResult> {
        // 设置总扫描超时时间（根据文件数量动态调整）
        let files_count = files.len();
        let total_timeout = Duration::from_secs(
            300 + (files_count as u64 / 10) // 基础 5 分钟 + 每个文件 0.1 秒
        );
        
        info!("Starting remote SAST scan with {} files (timeout: {:?})", files_count, total_timeout);
        
        let scan_future = async {
            let start = Instant::now();
            let total_lines = files.values().map(|c| c.lines().count()).sum::<usize>();
            
            // 创建 ZIP 文件（带超时）
            let zip_bytes = tokio::time::timeout(
                Duration::from_secs(60),
                tokio::task::spawn_blocking({
                    let files = files.clone();
                    let root = root.clone();
                    move || Self::create_zip_static(&root, &files)
                })
            )
            .await
            .map_err(|_| ScanError::Timeout(Duration::from_secs(60)))?
            .map_err(|e| ScanError::Execution(format!("Failed to create ZIP: {}", e)))?
            .map_err(|e| ScanError::Execution(e.to_string()))?;
            
            let file_name = format!("scan_{}.zip", Uuid::new_v4());
            
            // 上传文件（带超时）
            info!("Uploading ZIP file ({} bytes)...", zip_bytes.len());
            let source_path = tokio::time::timeout(
                Duration::from_secs(120),
                self.upload_file(zip_bytes, file_name)
            )
            .await
            .map_err(|_| ScanError::Timeout(Duration::from_secs(120)))??;
            
            // 提交扫描请求（带超时）
            info!("Submitting scan request...");
            let scan_request = RemoteScanRequest {
                source_path,
                upload_request: RemoteUploadRequest {
                    project_name: format!("scan_{}", Uuid::new_v4()),
                    project_version_name: None,
                    version: None,
                    language: Some("ALL".to_string()),
                    description: None,
                    white_list: None,
                    issue_view_type: Some("1".to_string()),
                },
            };
            
            let scan_response = tokio::time::timeout(
                Duration::from_secs(30),
                self.submit_scan(scan_request)
            )
            .await
            .map_err(|_| ScanError::Timeout(Duration::from_secs(30)))??;
            
            let project_version_id = scan_response.project_version_id.clone();
            
            // 轮询扫描结果（改进的轮询机制）
            info!("Polling scan results for task: {}", project_version_id);
            let _scan_result = self.poll_scan_result(
                project_version_id.clone(),
                PollConfig::default()
            ).await?;
            
            // 获取结果列表（带超时）
            info!("Fetching results...");
            let result_list = tokio::time::timeout(
                Duration::from_secs(60),
                self.get_result_list(project_version_id.clone())
            )
            .await
            .map_err(|_| ScanError::Timeout(Duration::from_secs(60)))??;
            
            // 转换为 Finding（并发获取代码片段）
            info!("Processing {} findings...", result_list.total);
            let findings = tokio::time::timeout(
                Duration::from_secs(300),
                self.convert_to_findings(&root, result_list, &project_version_id)
            )
            .await
            .map_err(|_| ScanError::Timeout(Duration::from_secs(300)))??;
            
            // 构建扫描信封
            let envelope = ScanEnvelope {
                scan_id: Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now(),
                files_scanned: files_count,
                total_lines,
                duration_ms: start.elapsed().as_millis() as u64,
            };
            
            info!("Remote SAST scan completed: {} findings in {}ms", findings.len(), envelope.duration_ms);
            
            Ok(ScanResult {
                status: ScanStatus::Success,
                envelope,
                findings,
            })
        };
        
        // 执行扫描并应用总超时
        tokio::time::timeout(total_timeout, scan_future)
            .await
            .map_err(|_| ScanError::Timeout(total_timeout))?
    }
    
    /// 上传文件（带超时）
    async fn upload_file(&self, file_content: Vec<u8>, file_name: String) -> ScannerScanResult<String> {
        let url = format!("{}/oscap/sca-api/scap/scaProject/myapis/uploadFile", self.config.url);
        
        info!("Uploading file to remote SAST: {}", url);
        
        let part = reqwest::multipart::Part::bytes(file_content)
            .file_name(file_name.clone())
            .mime_str("application/zip")?;
        
        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("userId", self.config.user_id.clone());
        
        let response = self.client
            .post(&url)
            .multipart(form)
            .timeout(Duration::from_secs(120))
            .send()
            .await?;
        
        let response_bytes = response.bytes().await?;
        let response_json: Value = serde_json::from_slice(&response_bytes)?;
        
        if response_json["code"].as_str() != Some("1") {
            let msg = response_json["msg"].as_str().unwrap_or("Unknown error");
            return Err(ScanError::Upload(msg.to_string()));
        }
        
        let file_path = response_json["msg"].as_str()
            .context("Missing msg in upload response")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();
        
        info!("File uploaded successfully: {}", file_path);
        
        Ok(file_path)
    }
    
    /// 提交扫描请求
    async fn submit_scan(&self, scan_request: RemoteScanRequest) -> ScannerScanResult<RemoteScanResponse> {
        let url = format!("{}/oscap/sca-api/scap/scaProject/myapis/putLocalProject", self.config.url);
        
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let mut request_body = json!(scan_request);
        request_body["timestamp"] = json!(timestamp);
        request_body["userId"] = json!(self.config.user_id.clone());
        let signature = Self::generate_signature_static(&request_body)?;
        request_body["signature"] = json!(signature);
        
        info!("Submitting scan request to remote SAST: {}", url);
        debug!("Request body: {}", request_body);
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        
        let response_bytes = response.bytes().await?;
        let response_json: Value = serde_json::from_slice(&response_bytes)?;
        
        if response_json["code"].as_str() != Some("1") {
            let msg = response_json["msg"].as_str().unwrap_or("Unknown error");
            return Err(ScanError::ScanFailed(msg.to_string()));
        }
        
        let result_info = response_json["resultInfo"].as_object()
            .context("Missing resultInfo in scan response")
            .map_err(|e| ScanError::Results(e.to_string()))?;

        let project_id = result_info
            .get("projectId")
            .and_then(|v| v.as_str())
            .context("Missing projectId")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();

        let project_version_id = result_info
            .get("projectVersionId")
            .and_then(|v| v.as_str())
            .context("Missing projectVersionId")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();

        let status = result_info
            .get("status")
            .and_then(|v| v.as_i64())
            .context("Missing status")
            .map_err(|e| ScanError::Results(e.to_string()))? as i32;

        let info_message = result_info
            .get("info")
            .and_then(|v| v.as_str())
            .context("Missing info")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();

        let details_url = result_info
            .get("detailsUrl")
            .and_then(|v| v.as_str())
            .context("Missing detailsUrl")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();
        
        let scan_response = RemoteScanResponse {
            project_id,
            project_version_id,
            status,
            info: info_message,
            details_url,
        };
        
        info!("Scan submitted successfully. Task ID: {}", scan_response.project_version_id);
        
        Ok(scan_response)
    }
    
    /// 获取扫描结果（带超时）
    async fn get_scan_result(&self, project_version_id: String) -> ScannerScanResult<RemoteScanResultResponse> {
        let url = format!("{}/oscap/sca-api/scap/scaProject/myapis/getScanResult", self.config.url);
        
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let mut request_body = json!({
            "projectVersionId": project_version_id,
            "timestamp": timestamp,
            "userId": self.config.user_id,
        });
        let signature = Self::generate_signature_static(&request_body)?;
        request_body["signature"] = json!(signature);
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        
        let response_bytes = response.bytes().await?;
        let response_json: Value = serde_json::from_slice(&response_bytes)?;
        
        if response_json["code"].as_str() != Some("1") {
            let msg = response_json["msg"].as_str().unwrap_or("Unknown error");
            return Err(ScanError::Results(format!("Get scan result failed: {}", msg)));
        }
        
        let result_info = response_json["resultInfo"].as_object()
            .context("Missing resultInfo")
            .map_err(|e| ScanError::Results(e.to_string()))?;
        
        Ok(RemoteScanResultResponse {
            status: result_info
                .get("status")
                .and_then(|v| v.as_i64())
                .context("Missing status")
                .map_err(|e| ScanError::Results(e.to_string()))? as i32,
            info: result_info
                .get("info")
                .and_then(|v| v.as_str())
                .context("Missing info")
                .map_err(|e| ScanError::Results(e.to_string()))?
                .to_string(),
            scan_progress: result_info
                .get("scanProgress")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
            scan_log: result_info
                .get("scanLog")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        })
    }
    
    /// 获取结果列表（带超时）
    async fn get_result_list(&self, project_version_id: String) -> ScannerScanResult<RemoteResultListResponse> {
        let url = format!("{}/oscap/sca-api/scap/scaProject/myapis/getResultList", self.config.url);
        
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let mut request_body = json!({
            "projectVersionId": project_version_id,
            "timestamp": timestamp,
            "userId": self.config.user_id,
            "pageNo": 1,
            "pageSize": 1000,
        });
        let signature = Self::generate_signature_static(&request_body)?;
        request_body["signature"] = json!(signature);
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .timeout(Duration::from_secs(60))
            .send()
            .await?;
        
        let response_bytes = response.bytes().await?;
        let response_json: Value = serde_json::from_slice(&response_bytes)?;
        
        if response_json["code"].as_str() != Some("1") {
            let msg = response_json["msg"].as_str().unwrap_or("Unknown error");
            return Err(ScanError::Results(format!("Get result list failed: {}", msg)));
        }
        
        let result = response_json["result"].as_object()
            .context("Missing result")
            .map_err(|e| ScanError::Results(e.to_string()))?;

        let records_value = result
            .get("records")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()));
        let records: Vec<RemoteResultRecord> = if records_value.is_null() {
            Vec::new()
        } else {
            serde_json::from_value(records_value)
                .context("Failed to parse records")
                .map_err(|e| ScanError::Results(e.to_string()))?
        };

        let total = result
            .get("total")
            .and_then(|v| v.as_i64())
            .unwrap_or(records.len() as i64) as i32;

        Ok(RemoteResultListResponse { total, records })
    }
    
    /// 获取文件代码（带超时）
    async fn get_file_code(&self, project_version_id: String, file_path: String) -> ScannerScanResult<String> {
        let url = format!("{}/oscap/sca-api/scap/scaScanResult/myapis/getFileCode", self.config.url);
        
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let mut request_body = json!({
            "projectVersionId": project_version_id,
            "filePath": file_path,
            "timestamp": timestamp,
            "userId": self.config.user_id,
        });
        let signature = Self::generate_signature_static(&request_body)?;
        request_body["signature"] = json!(signature);
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        
        let response_bytes = response.bytes().await?;
        let response_json: Value = serde_json::from_slice(&response_bytes)?;
        
        if response_json["code"].as_str() != Some("1") {
            let msg = response_json["msg"].as_str().unwrap_or("Unknown error");
            return Err(ScanError::Results(format!("Get file code failed: {}", msg)));
        }
        
        let code = response_json["resultInfo"].as_str()
            .context("Missing resultInfo")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();
        
        Ok(code)
    }
    
    /// 改进的轮询扫描结果（指数退避）
    async fn poll_scan_result(
        &self,
        project_version_id: String,
        config: PollConfig,
    ) -> ScannerScanResult<RemoteScanResultResponse> {
        let mut interval = config.initial_interval;
        
        for attempt in 1..=config.max_attempts {
            // 每次轮询设置超时
            let result = tokio::time::timeout(
                config.request_timeout,
                self.get_scan_result(project_version_id.clone())
            )
            .await;
            
            match result {
                Ok(Ok(result)) => {
                    // status: 1=空闲, 2=排队, 3=检测中, 4=成功, 5=失败, 8=拉取代码
                    match result.status {
                        4 => {
                            info!("Scan completed successfully");
                            return Ok(result);
                        }
                        5 => {
                            let mut message = result.info.clone();
                            if let Some(log) = result.scan_log.as_deref() {
                                let trimmed = log.trim();
                                if !trimmed.is_empty() {
                                    message.push_str("\n");
                                    message.push_str(&truncate_scan_log(trimmed, 2000));
                                }
                            }
                            return Err(ScanError::ScanFailed(message));
                        }
                        _ => {
                            info!("Scan in progress (attempt {}/{}): status={}, info={}", 
                                  attempt, config.max_attempts, result.status, result.info);
                        }
                    }
                }
                Ok(Err(e)) => {
                    warn!("Failed to get scan result (attempt {}): {}", attempt, e);
                }
                Err(_) => {
                    warn!("Request timeout (attempt {})", attempt);
                }
            }
            
            // 计算下一次轮询的等待时间（指数退避）
            interval = std::cmp::min(interval * 2, config.max_interval);
            
            info!("Waiting {:?} before next poll...", interval);
            tokio::time::sleep(interval).await;
        }
        
        Err(ScanError::Timeout(Duration::from_secs(
            (config.max_attempts as u64) * config.max_interval.as_secs()
        )))
    }
    
    /// 并发转换为 Finding
    async fn convert_to_findings(
        &self,
        root: &str,
        result_list: RemoteResultListResponse,
        project_version_id: &str,
    ) -> ScannerScanResult<Vec<Finding>> {
        let client = self.client.clone();
        let config_url = self.config.url.clone();
        let user_id = self.config.user_id.clone();
        let project_version_id = project_version_id.to_string();
        let root_path = root.to_string();
        let concurrency_limit = 10; // 限制并发数量
        
        let findings = stream::iter(result_list.records)
            .map(move |record| {
                let client = client.clone();
                let config_url = config_url.clone();
                let user_id = user_id.clone();
                let project_version_id = project_version_id.clone();
                let root_path = root_path.clone();
                
                async move {
                    let remote_file_path = record.issue_path.split('(').next().unwrap_or("").to_string();
                    let line = record.issue_path
                        .split('(')
                        .nth(1)
                        .and_then(|s| s.split(')').next())
                        .and_then(|s| s.parse::<u32>().ok())
                        .unwrap_or(1)
                        .max(1);

                    let local_file_path = resolve_local_path(&root_path, &remote_file_path);
                    
                    // 并发获取代码片段（带超时）
                    let code_snippet = tokio::time::timeout(
                        Duration::from_secs(30),
                        Self::get_file_code_static(
                            &client,
                            &config_url,
                            &user_id,
                            &project_version_id,
                            remote_file_path.clone()
                        )
                    )
                    .await
                    .ok()
                    .and_then(|r| r.ok())
                    .map(|code| {
                        code.lines()
                            .skip(line.saturating_sub(12) as usize)
                            .take(25)
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_else(|| {
                        // 如果获取失败，使用空字符串
                        warn!("Failed to get code snippet for {}:{}", remote_file_path, line);
                        String::new()
                    });
                    
                    Finding {
                        id: Uuid::new_v4().to_string(),
                        rule_id: record.category.clone(),
                        r#type: "security".to_string(),
                        severity: Self::convert_severity_static(record.now_risk_level),
                        title: record.issue_zh_name.clone(),
                        description: record.issue_en_name.clone(),
                        location: Location {
                            file: local_file_path,
                            line,
                            column: None,
                        },
                        code_snippet,
                        fix: None,
                        provider: "remote".to_string(),
                    }
                }
            })
            .buffer_unordered(concurrency_limit)
            .collect::<Vec<_>>()
            .await;
        
        Ok(findings)
    }
    
    /// 静态方法：获取文件代码
    async fn get_file_code_static(
        client: &reqwest::Client,
        config_url: &str,
        user_id: &str,
        project_version_id: &str,
        file_path: String,
    ) -> ScannerScanResult<String> {
        let url = format!("{}/oscap/sca-api/scap/scaScanResult/myapis/getFileCode", config_url);
        
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let mut request_body = json!({
            "projectVersionId": project_version_id,
            "filePath": file_path,
            "timestamp": timestamp,
            "userId": user_id,
        });
        let signature = Self::generate_signature_static(&request_body)?;
        request_body["signature"] = json!(signature);
        
        let response = client
            .post(&url)
            .json(&request_body)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        
        let response_bytes = response.bytes().await?;
        let response_json: Value = serde_json::from_slice(&response_bytes)?;
        
        if response_json["code"].as_str() != Some("1") {
            let msg = response_json["msg"].as_str().unwrap_or("Unknown error");
            return Err(ScanError::Results(format!("Get file code failed: {}", msg)));
        }
        
        let code = response_json["resultInfo"].as_str()
            .context("Missing resultInfo")
            .map_err(|e| ScanError::Results(e.to_string()))?
            .to_string();
        
        Ok(code)
    }
    
    /// 静态方法：转换严重级别
    fn convert_severity_static(risk_level: i32) -> String {
        match risk_level {
            4 => "critical".to_string(),
            3 => "high".to_string(),
            2 => "medium".to_string(),
            1 => "low".to_string(),
            _ => "low".to_string(),
        }
    }
    
    /// 静态方法：改进的 ZIP 文件创建（带压缩级别）
    fn create_zip_static(root: &str, files: &HashMap<String, String>) -> Result<Vec<u8>, std::io::Error> {
        let mut buffer = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(&mut buffer);
        
        for (file_path, content) in files {
            let entry_path = resolve_zip_entry_path(root, file_path);
            
            // 根据文件大小选择压缩级别
            let options = if content.len() > 1024 * 1024 { // >1MB
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)
            } else {
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)
            };
            
            zip.start_file(entry_path, options)?;
            zip.write_all(content.as_bytes())?;
        }
        
        zip.finish()?;
        
        Ok(buffer.into_inner())
    }
    
    /// 静态方法：生成签名
    fn generate_signature_static(params: &Value) -> ScannerScanResult<String> {
        // Follows the platform spec: sort top-level keys, concatenate values (strings without quotes),
        // then append md5(timestamp), then md5(all).
        let obj = params
            .as_object()
            .context("Signature params must be a JSON object")
            .map_err(|e| ScanError::Signature(e.to_string()))?;

        let timestamp_value = obj
            .get("timestamp")
            .context("Missing timestamp for signature")
            .map_err(|e| ScanError::Signature(e.to_string()))?;
        let timestamp_str = value_as_signature_string(timestamp_value);

        let mut keys: Vec<&String> = obj.keys().collect();
        keys.retain(|k| k.as_str() != "signature");
        keys.sort();

        let mut base_string = String::new();
        for key in keys {
            if let Some(value) = obj.get(key) {
                append_value_for_signature(value, &mut base_string);
            }
        }

        let mut md5 = Md5::new();
        md5.update(timestamp_str.as_bytes());
        let timestamp_md5 = format!("{:x}", md5.finalize());
        base_string.push_str(&timestamp_md5);

        let mut md5 = Md5::new();
        md5.update(base_string.as_bytes());
        Ok(format!("{:x}", md5.finalize()))
    }
}

fn value_as_signature_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Array(_) | Value::Object(_) => value.to_string(),
    }
}

fn append_value_for_signature(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => out.push_str(s),
        Value::Array(items) => {
            for item in items {
                append_value_for_signature(item, out);
            }
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                if let Some(value) = map.get(key) {
                    append_value_for_signature(value, out);
                }
            }
        }
    }
}

fn truncate_scan_log(log: &str, max_chars: usize) -> String {
    if log.len() <= max_chars {
        return log.to_string();
    }
    format!("{}...(truncated, total={})", &log[..max_chars], log.len())
}

fn resolve_zip_entry_path(root: &str, file_path: &str) -> String {
    let trimmed_root = root.trim();
    let file_path_obj = Path::new(file_path);

    let relative: PathBuf = if !trimmed_root.is_empty() {
        let root_path = Path::new(trimmed_root);
        file_path_obj
            .strip_prefix(root_path)
            .unwrap_or(file_path_obj)
            .to_path_buf()
    } else {
        file_path_obj.to_path_buf()
    };

    let mut entry = relative.to_string_lossy().replace('\\', "/");
    entry = entry.trim_start_matches('/').to_string();
    if entry.is_empty() {
        entry = "file".to_string();
    }
    entry
}

fn resolve_local_path(root: &str, remote_path: &str) -> String {
    let trimmed_root = root.trim();
    let trimmed_remote = remote_path.trim();
    if trimmed_root.is_empty() || trimmed_remote.is_empty() {
        return trimmed_remote.to_string();
    }

    let remote_rel = trimmed_remote.trim_start_matches('/');
    Path::new(trimmed_root).join(remote_rel).to_string_lossy().to_string()
}

fn add_root_certificates_from_pem_bytes(
    mut builder: reqwest::ClientBuilder,
    pem_bytes: &[u8],
) -> Result<reqwest::ClientBuilder, String> {
    // Try the simplest path first. This may succeed for a single certificate PEM.
    match reqwest::Certificate::from_pem(pem_bytes) {
        Ok(cert) => return Ok(builder.add_root_certificate(cert)),
        Err(single_error) => {
            // Fall back to parsing PEM bundles that contain multiple cert blocks or CRLF line endings.
            let ders = extract_der_certificates_from_pem(pem_bytes).map_err(|bundle_error| {
                format!(
                    "{} (single cert parse error: {})",
                    bundle_error, single_error
                )
            })?;

            for der in ders {
                let cert = reqwest::Certificate::from_der(&der).map_err(|e| e.to_string())?;
                builder = builder.add_root_certificate(cert);
            }

            Ok(builder)
        }
    }
}

fn extract_der_certificates_from_pem(pem_bytes: &[u8]) -> Result<Vec<Vec<u8>>, String> {
    let pem_string = std::str::from_utf8(pem_bytes).map_err(|e| format!("PEM is not valid UTF-8: {}", e))?;
    let normalized = pem_string.replace("\r\n", "\n").replace('\r', "\n");

    let begin = "-----BEGIN CERTIFICATE-----";
    let end = "-----END CERTIFICATE-----";

    let mut ders = Vec::new();
    let mut rest = normalized.as_str();

    while let Some(begin_idx) = rest.find(begin) {
        rest = &rest[begin_idx + begin.len()..];
        let Some(end_idx) = rest.find(end) else {
            break;
        };

        let b64_body = rest[..end_idx]
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<String>();

        let der = base64::engine::general_purpose::STANDARD
            .decode(b64_body.as_bytes())
            .map_err(|e| format!("Failed to decode PEM certificate base64: {}", e))?;
        ders.push(der);

        rest = &rest[end_idx + end.len()..];
    }

    if ders.is_empty() {
        return Err("No PEM certificate blocks found (expected 'BEGIN CERTIFICATE' / 'END CERTIFICATE')".to_string());
    }

    Ok(ders)
}

fn normalize_remote_base_url(raw: &str) -> String {
    let mut url = raw.trim().trim_end_matches('/').to_string();
    while url.ends_with("/oscap") {
        url = url.trim_end_matches("/oscap").trim_end_matches('/').to_string();
    }
    url
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_custom_ca_pem() {
        // A minimal PEM-encoded CA certificate should be accepted as a custom trust anchor.
        let pem = r#"-----BEGIN CERTIFICATE-----
MIICgTCCAiigAwIBAgIEaCr4JjAKBggqhkjOPQQDAjBAMQswCQYDVQQGEwJDTjEQ
MA4GA1UEChMHc2VjaWRlYTEJMAcGA1UECxMAMRQwEgYDVQQDEwtzZWNpZGVhLmNv
bTAeFw0yNTA1MTkwOTIxNDBaFw0yNjA1MTkwOTIxNDBaMEAxCzAJBgNVBAYTAkNO
MRAwDgYDVQQKEwdzZWNpZGVhMQkwBwYDVQQLEwAxFDASBgNVBAMTC3NlY2lkZWEu
Y29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwis8qUYNiq10dlKR
ak/4xwHeU8X7tbEzurA7F3udYPRrlhIxjCrn88Am24ex6ycn62TB88b+5eLr2AKC
sSOccVuaNBlt9HpK0E/cGFDfWYKsmqxVdId6/JxHWjLWwESr9mK60ipidY2h/yLF
nJhKc/3IVJWndbTVmgXce4oe0DvYHH+6lI0YJc9hAMMWDoO/0u43Mias0TjxzULZ
4k3YgDuCbHt28nQh4HOnlth8YiR6upul4sNAYh0SLqwkclCxoUTLHlk3bINgakcC
PLSy6bEzPGQh4n1rbIDkT0Lu5LAdfI9S/vkDYBHcbR23oHdi2FI7geqMlP6VjZ8J
q5UMawIDAQABo0UwQzAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0TAQH/BAgwBgEB/wIB
ADAdBgNVHQ4EFgQUFVfJfpZUc2SrWruF4iWTU8UundQwCgYIKoZIzj0EAwIDRwAw
RAIgQ8azRxgsKHS01mTk+rWfxkCdu7DLwBIIGn2uIxLnPT0CIBa1jfsmFQw4Ld6+
nITahhhOJAHngDtZXwEHo6OGCp4X
-----END CERTIFICATE-----"#;

        let cert = reqwest::Certificate::from_pem(pem.as_bytes());
        assert!(cert.is_ok(), "expected PEM to parse, got: {:?}", cert.err());
    }

    #[test]
    fn parses_custom_ca_pem_with_crlf() {
        let pem = "-----BEGIN CERTIFICATE-----\r\nMIICgTCCAiigAwIBAgIEaCr4JjAKBggqhkjOPQQDAjBAMQswCQYDVQQGEwJDTjEQ\r\nMA4GA1UEChMHc2VjaWRlYTEJMAcGA1UECxMAMRQwEgYDVQQDEwtzZWNpZGVhLmNv\r\nbTAeFw0yNTA1MTkwOTIxNDBaFw0yNjA1MTkwOTIxNDBaMEAxCzAJBgNVBAYTAkNO\r\nMRAwDgYDVQQKEwdzZWNpZGVhMQkwBwYDVQQLEwAxFDASBgNVBAMTC3NlY2lkZWEu\r\nY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwis8qUYNiq10dlKR\r\nak/4xwHeU8X7tbEzurA7F3udYPRrlhIxjCrn88Am24ex6ycn62TB88b+5eLr2AKC\r\nsSOccVuaNBlt9HpK0E/cGFDfWYKsmqxVdId6/JxHWjLWwESr9mK60ipidY2h/yLF\r\nnJhKc/3IVJWndbTVmgXce4oe0DvYHH+6lI0YJc9hAMMWDoO/0u43Mias0TjxzULZ\r\n4k3YgDuCbHt28nQh4HOnlth8YiR6upul4sNAYh0SLqwkclCxoUTLHlk3bINgakcC\r\nPLSy6bEzPGQh4n1rbIDkT0Lu5LAdfI9S/vkDYBHcbR23oHdi2FI7geqMlP6VjZ8J\r\nq5UMawIDAQABo0UwQzAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0TAQH/BAgwBgEB/wIB\r\nADAdBgNVHQ4EFgQUFVfJfpZUc2SrWruF4iWTU8UundQwCgYIKoZIzj0EAwIDRwAw\r\nRAIgQ8azRxgsKHS01mTk+rWfxkCdu7DLwBIIGn2uIxLnPT0CIBa1jfsmFQw4Ld6+\r\nnITahhhOJAHngDtZXwEHo6OGCp4X\r\n-----END CERTIFICATE-----\r\n";

        let builder = reqwest::Client::builder();
        let result = add_root_certificates_from_pem_bytes(builder, pem.as_bytes());
        assert!(result.is_ok(), "expected PEM to import, got: {:?}", result.err());
    }

    #[test]
    fn signature_matches_spec_example() {
        // Example from the platform API spec.
        let params = json!({
            "timestamp": 1460531942,
            "op": "Dispatch.list",
            "apikey": "fb097281c447a13c728f0766d8895841"
        });

        let signature = RemoteSastScanner::generate_signature_static(&params)
            .expect("signature generation should succeed");
        assert_eq!(signature, "daca148d62d5e4cac62856aed4b7f6c1");
    }
}
