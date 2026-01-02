# P0-005: 远程 SAST 集成

> **优先级**: P0  
> **状态**: 🔄 进行中（以 `docs/tasks/ROADMAP.md` 为准）  
> **预计工时**: 40 小时  
> **负责**: 待定  
> **阶段**: Phase 0

---

## 任务概述

实现远程 SAST 平台的完整集成，包括认证、签名、轮询、结果解析等，支持四种扫描模式（snippet/local_project/git_diff/full）。

---

## 依赖关系

- **前置依赖**: P0-002: MCP Server 框架
- **后续依赖**: 
  - P1-004: 错误处理与降级
  - P1-007: 用户配置向导
  - P1-008: 团队协作功能

---

## 验收标准

- [ ] 支持完整的 MD5 排序签名算法
- [ ] 支持四种扫描模式（snippet/local_project/git_diff/full）
- [ ] 支持轮询获取扫描结果（状态机）
- [ ] 支持污点路径解析（issueContent JSON）
- [ ] 支持降级策略（远程失败切本地）
- [ ] 支持获取模板列表、项目列表等元数据
- [ ] 支持错误处理和重试
- [ ] 编写集成测试

---

## 子任务列表

### 1. 设计远程 API 客户端架构 (4h)
- [ ] 定义 RemoteApiClient 接口
- [ ] 设计认证流程
- [ ] 设计轮询策略

### 2. 实现签名生成器 (MD5 排序) (6h)
- [ ] 实现 MD5 排序签名算法
- [ ] 实现参数序列化（去除空格、回车、换行）
- [ ] 实现时间戳 MD5 拼接
- [ ] 编写单元测试

### 3. 实现 AES 加密器 (userName) (4h)
- [ ] 实现 AES/CBC/NoPadding 加密
- [ ] 实现 PKCS#7 填充
- [ ] 实现 Base64 编码
- [ ] 编写单元测试

### 4. 实现 scan_remote MCP 工具 (8h)
- [ ] 实现四种扫描模式
- [ ] 实现 uploadFile 调用
- [ ] 实现 putLocalProject/putGitSvnProject 调用
- [ ] 实现请求参数构建

### 5. 实现结果轮询器（状态机） (6h)
- [ ] 实现轮询状态机（Idle/Queued/Scanning/PullingCode/Success/Failed）
- [ ] 实现指数退避重试
- [ ] 实现超时控制
- [ ] 实现状态更新通知

### 6. 实现 issueContent 解析器 (4h)
- [ ] 实现污点路径解析（sink1...sinkN → source/flow/sink）
- [ ] 实现文件路径和行号解析
- [ ] 实现代码片段提取
- [ ] 编写单元测试

### 7. 实现降级策略 (4h)
- [ ] 实现降级触发条件（远程超时/不可达）
- [ ] 实现降级到本地扫描
- [ ] 实现降级通知

### 8. 编写集成测试 (4h)
- [ ] 测试完整扫描流程
- [ ] 测试轮询流程
- [ ] 测试降级流程

---

## 技术方案

### 签名算法

```rust
pub fn generate_signature(params: &Map<String, Value>, timestamp: &str) -> String {
    // 1. 移除 signature 字段
    let mut sorted_params: BTreeMap<String, String> = BTreeMap::new();
    for (key, value) in params {
        if key != "signature" {
            sorted_params.insert(
                key.clone(),
                value.as_str().unwrap_or(&value.to_string()).to_string()
            );
        }
    }
    
    // 2. 拼接所有参数值（按字典序）
    let mut base_string = String::new();
    for (_, value) in &sorted_params {
        base_string.push_str(value);
    }
    
    // 3. 追加 MD5(timestamp)
    let timestamp_md5 = md5::compute(timestamp.as_bytes());
    base_string.push_str(&format!("{:x}", timestamp_md5));
    
    // 4. 计算 MD5 作为 signature
    let signature = md5::compute(base_string.as_bytes());
    format!("{:x}", signature)
}
```

### AES 加密

```rust
pub fn aes_encrypt(data: &str, key: &str, iv: &str) -> Result<String, CryptoError> {
    // PKCS#7 填充
    let padding_len = AES_BLOCK_SIZE - (data.len() % AES_BLOCK_SIZE);
    let mut padded_data = data.as_bytes().to_vec();
    padded_data.extend(std::iter::repeat(padding_len as u8).take(padding_len));
    
    // AES/CBC/NoPadding 加密
    let cipher = Aes128::new_from_slices(key.as_bytes(), iv.as_bytes())?;
    // ... 加密逻辑
    
    Ok(general_purpose::STANDARD.encode(encrypted))
}
```

### 轮询状态机

```rust
pub enum RemoteScanStatus {
    Idle,           // 1: 空闲状态
    Queued,         // 2: 正在排队
    Scanning,       // 3: 正在检测
    PullingCode,    // 8: 正在拉取代码
    Success,        // 4: 检测成功
    Failed,         // 5: 扫描失败
    SubmitFailed,   // 7: 提交检测失败
}

pub struct RemoteScanPoller {
    interval_ms: u64,
    max_attempts: usize,
    current_attempt: usize,
}
```

### issueContent 解析

```rust
pub fn parse_issue_content(issue_content: &str) -> Result<TaintPath, ParseError> {
    let root: Value = serde_json::from_str(issue_content)?;
    
    // 收集所有 sink 字段并排序
    let mut sinks: Vec<&str> = root.as_object()?
        .keys()
        .filter(|k| *k == "sink" || k.starts_with("sink"))
        .collect();
    sinks.sort();
    
    // 映射为 TaintStep
    let mut steps = Vec::new();
    for (idx, key) in sinks.iter().enumerate() {
        // ... 解析逻辑
    }
    
    Ok(TaintPath { steps })
}
```

---

## API 映射

| 功能 | 远程 API | MCP 工具 |
|------|----------|----------|
| 提交扫描 | `putGitSvnProject`, `putLocalProject` | `scan_remote` |
| 上传文件 | `uploadFile` | 内部使用 |
| Jenkins 扫描 | `uploadFileByJenkins` | 内部使用（推荐） |
| 获取结果 | `getScanResult` | 内部轮询 |
| 获取结果列表 | `getScanResultList` | 历史查询 |
| 获取缺陷详情 | `getResultList`, `riskSearch` | 结果解析 |
| 获取文件代码 | `getFileCode` | 远程结果展示 |
| 获取模板列表 | `getStandardNameList` | `get_remote_standards` |
| 获取项目列表 | `getProjectList` | 避免重复创建 |
| 获取任务列表 | `getTaskList` | 历史查询 |
| 导出报告 | `reportExport` | `export_report` |
| 获取用户信息 | `getUserInfo` | 用户认证 |
| 修改项目信息 | `editProject` | 项目管理 |
| 获取部门信息 | `getDepartInfo` | 团队信息 |

---

## 扫描模式

| 模式 | 远程 API | 使用场景 | projectType |
|------|----------|----------|-------------|
| **snippet** | `uploadFile` + `putLocalProject` | 当前文件/片段 | 1 (本地上传) |
| **local_project** | `putLocalProject` | 需要完整污点路径 | 5 (IDE插件) |
| **git_diff** | `putGitSvnProject` (commitId) | 提交前扫描 | 7 (接口提交) |
| **full** | `putGitSvnProject` (branch) | 完整项目扫描 | 2 (Git下载) |

---

## 状态映射

| 远程状态 | 说明 | MCP 状态 |
|----------|------|----------|
| 1 | 空闲状态 | - |
| 2 | 正在排队 | `queued` |
| 3 | 正在检测 | `scanning` |
| 4 | 检测成功 | `success` |
| 5 | 扫描失败 | `failed` |
| 7 | 提交检测失败 | `submit_failed` |
| 8 | 正在拉取代码 | `pulling_code` |

---

## 测试策略

### 单元测试
- 测试签名生成器
- 测试 AES 加密/解密
- 测试 issueContent 解析器
- 测试轮询状态机

### 集成测试
- 测试完整扫描流程
- 测试轮询流程
- 测试降级流程
- 使用 Mock Server 或真实 API

---

## 风险和挑战

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 签名算法复杂 | 中 | 完整的单元测试 |
| 轮询超时 | 中 | 指数退避重试 |
| issueContent 格式不统一 | 高 | 健壮的解析器 + 容错处理 |
| 远程 API 不稳定 | 高 | 降级策略 + 缓存 |

---

## 参考资料

- [远程 SAST API 文档](../api/remote-sast-api.md)
- [远程 API 集成设计](../03-remote-api-integration.md)
- [MCP 工具规范](../02-mcp-spec.md)

---

**创建时间**: 2025-01-29
