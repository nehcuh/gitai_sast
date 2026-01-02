use crate::core::types::{GetTaintPathRequest, GetTaintPathResponse, TaintPath, TaintStep};
use crate::tools::{Tool, ToolCallRequest, ToolCallResponse};
use async_trait::async_trait;
use regex::Regex;
use serde_json::json;
use serde_json::Value;
use std::path::Path;
use tracing::{info};

pub struct GetTaintPathTool;

#[async_trait]
impl Tool for GetTaintPathTool {
    fn name(&self) -> &str {
        "get_taint_path"
    }
    
    fn description(&self) -> &str {
        "Get taint path for a specific finding"
    }
    
    fn input_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "version": {
                    "type": "integer",
                    "description": "Taint path protocol version"
                },
                "root": {
                    "type": "string",
                    "description": "Root directory of project"
                },
                "finding": {
                    "type": "object",
                    "description": "Finding object"
                }
            },
            "required": ["version", "root", "finding"]
        })
    }
    
    async fn call(&self, request: ToolCallRequest) -> Result<ToolCallResponse, String> {
        info!("get_taint_path tool called with args: {}", request.arguments);
        
        // 解析请求
        let taint_request: GetTaintPathRequest = serde_json::from_value(request.arguments)
            .map_err(|e| format!("Failed to parse get_taint_path request: {}", e))?;
        
        let version = taint_request.version;
        
        // 获取污点路径
        let taint_path = Self::extract_taint_path(taint_request).await?;
        
        // 构建响应
        let response = GetTaintPathResponse {
            version,
            taint_path,
        };
        
        let result = serde_json::to_value(response)
            .map_err(|e| format!("Failed to serialize get_taint_path response: {}", e))?;
        
        Ok(ToolCallResponse {
            content: vec![result],
            is_error: Some(false),
        })
    }
}

impl GetTaintPathTool {
    async fn extract_taint_path(request: GetTaintPathRequest) -> Result<TaintPath, String> {
        let provider = request
            .finding
            .get("provider")
            .and_then(|v| v.as_str())
            .unwrap_or("local");

        if provider == "remote" {
            let issue_content = request
                .finding
                .get("issue_content")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let fallback_file = request
                .finding
                .get("location")
                .and_then(|v| v.get("file"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let fallback_line = request
                .finding
                .get("location")
                .and_then(|v| v.get("line"))
                .and_then(|v| v.as_u64())
                .unwrap_or(1)
                .max(1) as u32;

            let steps = parse_remote_issue_content(
                issue_content,
                &request.root,
                &fallback_file,
                fallback_line,
            );

            return Ok(TaintPath {
                steps,
                provider: "remote".to_string(),
            });
        }

        Ok(TaintPath {
            steps: vec![],
            provider: provider.to_string(),
        })
    }
}

fn parse_remote_issue_content(
    issue_content: &str,
    workspace_root: &str,
    fallback_file: &str,
    fallback_line: u32,
) -> Vec<TaintStep> {
    let trimmed = issue_content.trim();
    if trimmed.is_empty() {
        return vec![];
    }

    let root_value: Value = match serde_json::from_str(trimmed) {
        Ok(value) => value,
        Err(_) => return vec![],
    };

    let obj = match root_value.as_object() {
        Some(obj) => obj,
        None => return vec![],
    };

    let mut sink_keys: Vec<&str> = obj
        .keys()
        .map(|k| k.as_str())
        .filter(|k| *k == "sink" || k.starts_with("sink"))
        .collect();

    sink_keys.sort_by(|a, b| compare_sink_keys(a, b));

    let aly_regex =
        Regex::new(r"^(?P<file>.+?)\((?P<line>\d+)\)\s*(?::\s*(?P<symbol>.*))?$")
            .expect("invalid issueContent regex");

    let total = sink_keys.len();
    let mut steps = Vec::with_capacity(total);

    for (idx, key) in sink_keys.into_iter().enumerate() {
        let step_value = obj.get(key);
        let (aly, comment) = match step_value.and_then(|v| v.as_object()) {
            Some(map) => (
                map.get("aly").and_then(|v| v.as_str()).unwrap_or("").trim(),
                map.get("aly_comment")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim(),
            ),
            None => ("", ""),
        };

        let role = if idx == 0 {
            "source"
        } else if idx + 1 == total {
            "sink"
        } else {
            "flow"
        };

        let mut file = String::new();
        let mut line = fallback_line.max(1);
        let mut symbol = String::new();

        if let Some(captures) = aly_regex.captures(aly) {
            let remote_file = captures
                .name("file")
                .map(|m| m.as_str().trim())
                .unwrap_or("");
            if !remote_file.is_empty() {
                file = resolve_local_path(workspace_root, remote_file);
            }

            line = captures
                .name("line")
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .unwrap_or(line)
                .max(1);

            symbol = captures
                .name("symbol")
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
        }

        if file.is_empty() {
            file = resolve_local_path(workspace_root, fallback_file);
        }

        let description = if comment.is_empty() {
            role.to_string()
        } else {
            format!("{}: {}", role, comment)
        };

        steps.push(TaintStep {
            file,
            line,
            function: symbol,
            description,
        });
    }

    steps
}

fn compare_sink_keys(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    let a_is_sink = a == "sink";
    let b_is_sink = b == "sink";

    match (a_is_sink, b_is_sink) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        (false, false) => {
            let a_index = parse_sink_index(a);
            let b_index = parse_sink_index(b);

            match (a_index, b_index) {
                (Some(a_index), Some(b_index)) => a_index.cmp(&b_index),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => a.cmp(b),
            }
        }
    }
}

fn parse_sink_index(key: &str) -> Option<u32> {
    if key == "sink" {
        return None;
    }

    let rest = key.strip_prefix("sink")?;
    if rest.is_empty() {
        return None;
    }

    rest.parse::<u32>().ok()
}

fn resolve_local_path(root: &str, remote_path: &str) -> String {
    let trimmed_root = root.trim();
    let trimmed_remote = remote_path.trim();
    if trimmed_remote.is_empty() {
        return String::new();
    }
    if trimmed_root.is_empty() {
        return trimmed_remote.to_string();
    }

    let root_path = Path::new(trimmed_root);
    let remote_path_obj = Path::new(trimmed_remote);
    if remote_path_obj.strip_prefix(root_path).is_ok() {
        return trimmed_remote.to_string();
    }

    let remote_rel = trimmed_remote.trim_start_matches('/');
    root_path.join(remote_rel)
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::Tool;
    use serde_json::json;

    #[test]
    fn resolve_local_path_is_idempotent_for_local_paths() {
        assert_eq!(
            resolve_local_path("/repo", "/repo/src/main.rs"),
            "/repo/src/main.rs"
        );
    }

    #[tokio::test]
    async fn get_taint_path_parses_issue_content_from_remote_finding() {
        let issue_content = r#"{
          "sink1": {
            "aly": "/src/main/java/org/joychou/controller/SQLI.java(10) : req.getParameter",
            "aly_comment": "User-controlled input enters the program"
          },
          "sink2": {
            "aly": "/src/main/java/org/joychou/controller/SQLI.java(20) : id",
            "aly_comment": "Tainted data flows through variable assignment"
          },
          "sink": {
            "aly": "/src/main/java/org/joychou/controller/SQLI.java(30) : stmt.executeQuery",
            "aly_comment": "SQL query executed with tainted data"
          }
        }"#;

        let finding = json!({
            "provider": "remote",
            "issue_content": issue_content,
            "location": { "file": "/src/main/java/org/joychou/controller/SQLI.java", "line": 30 }
        });

        let request = crate::core::types::ToolCallRequest {
            name: "get_taint_path".to_string(),
            arguments: json!({
                "version": 1,
                "root": "/repo",
                "finding": finding
            }),
        };

        let tool = GetTaintPathTool;
        let result = tool.call(request).await.expect("tool call should succeed");

        let first = result.content.first().cloned().expect("missing tool content");
        let response: GetTaintPathResponse =
            serde_json::from_value(first).expect("failed to parse GetTaintPathResponse");

        assert_eq!(response.taint_path.provider, "remote");
        assert_eq!(response.taint_path.steps.len(), 3);
        assert_eq!(response.taint_path.steps[0].line, 10);
        assert!(response.taint_path.steps[0].description.contains("source"));
        assert_eq!(response.taint_path.steps[2].line, 30);
        assert!(response.taint_path.steps[2].description.contains("sink"));
    }
}
