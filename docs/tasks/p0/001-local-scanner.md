# P0-001: 本地扫描引擎实现

> **优先级**: P0  
> **状态**: 🔄 进行中  
> **预计工时**: 40 小时  
> **负责**: 待定  
> **阶段**: Phase 0

---

## 任务概述

实现基于 Opengrep 的本地代码扫描引擎，支持多语言、规则过滤、增量扫描等功能，作为 MCP Server 的核心扫描能力提供者。

---

## 依赖关系

- **前置依赖**: 无
- **后续依赖**: 
  - P0-002: MCP Server 框架
  - P0-003: Extension 基础 UI
  - P1-001: 自动扫描系统
  - P1-002: 提交前阻断 (Commit Gate)

---

## 验收标准

### 必须满足
- [ ] 支持 JavaScript/TypeScript/Python/Java/Rust 等主流语言
- [ ] 支持规则集配置和过滤（基于 severity、language、tags）
- [ ] 支持增量扫描（只扫描变更文件，基于文件哈希）
- [ ] 支持忽略列表功能（.vscode/sast.ignores.json）
- [ ] 扫描结果符合 MCP 工具规范（统一 Finding 格式）
- [ ] 支持并发扫描限制（防止 CPU 占用过高）
- [ ] 支持扫描超时和取消

### 期望满足
- [ ] 支持自定义规则（YAML 格式）
- [ ] 支持规则热更新（无需重启）
- [ ] 提供扫描性能指标（扫描文件数、耗时等）

---

## 子任务列表

### 1. 设计扫描引擎架构 (4h)
- [ ] 定义 Scanner 接口
- [ ] 设计规则集管理器
- [ ] 设计文件变更检测器
- [ ] 设计结果过滤和合并逻辑

### 2. 实现 Opengrep CLI 调用封装 (8h)
- [ ] 实现 Opengrep CLI 调用器
- [ ] 实现 JSON 结果解析
- [ ] 实现错误处理和重试
- [ ] 实现并发控制（限制同时运行的扫描数）

### 3. 实现规则集管理器 (6h)
- [ ] 实现规则集加载（从工作区/全局）
- [ ] 实现规则集过滤（按 severity、language、tags）
- [ ] 实现规则集缓存（避免重复加载）
- [ ] 实现规则集验证（检查规则格式）

### 4. 实现文件变更检测 (6h)
- [ ] 实现文件哈希计算
- [ ] 实现增量扫描逻辑（对比 HEAD/缓存）
- [ ] 实现文件过滤（按后缀、路径）
- [ ] 实现缓存失效策略

### 5. 实现结果过滤和合并 (6h)
- [ ] 实现忽略列表匹配
- [ ] 实现重复检测（基于 fingerprint）
- [ ] 实现结果合并（本地 + 远程）
- [ ] 实现结果排序和分页

### 6. 编写单元测试 (8h)
- [ ] 测试 Opengrep CLI 调用
- [ ] 测试规则集管理
- [ ] 测试文件变更检测
- [ ] 测试结果过滤和合并
- [ ] 测试错误处理和重试

### 7. 编写集成测试 (2h)
- [ ] 测试完整扫描流程
- [ ] 测试增量扫描流程

---

## 技术方案

### 架构设计

```
Scanner (Trait)
├── OpengrepScanner (Impl)
│   ├── OpengrepCaller
│   ├── RuleSetManager
│   ├── FileChangeDetector
│   └── ResultProcessor
└── HybridScanner (Local + Remote)
```

### 核心接口

```rust
pub trait Scanner {
    async fn scan(&self, request: ScanRequest) -> Result<ScanResponse>;
    async fn get_rules(&self) -> Result<Vec<Rule>>;
    async fn reload_rules(&self) -> Result<()>;
}
```

### 扫描请求格式

```json
{
  "version": 1,
  "root": "/path/to/workspace",
  "files": {
    "src/main.ts": "完整文件内容",
    "src/helper.ts": "完整文件内容"
  },
  "ignores": [
    { "file": "src/config.ts", "line": 42, "rule_id": "hardcoded-secret" }
  ],
  "config": {
    "severity_threshold": "medium",
    "enable_opengrep": true,
    "include_snippets": true,
    "max_concurrent_scans": 3,
    "timeout_seconds": 120
  }
}
```

### 扫描响应格式

```json
{
  "version": 1,
  "status": "success",
  "scan_envelope": {
    "scan_id": "scan-12345",
    "timestamp": "2025-01-29T10:00:00Z",
    "files_scanned": 10,
    "total_lines": 12345,
    "duration_ms": 1500
  },
  "findings": [
    {
      "id": "vuln-001",
      "rule_id": "typescript.lang.security.sql-injection",
      "type": "sql-injection",
      "severity": "high",
      "title": "Unsanitized user input in SQL query",
      "description": "用户输入未转义直接用于 SQL 查询",
      "location": { "file": "src/api/user.ts", "line": 42, "column": 1 },
      "code_snippet": "const query = `SELECT * FROM users WHERE name = '${input}';`;",
      "fix": {
        "suggestion": "使用参数化查询",
        "code": "const query = `SELECT * FROM users WHERE name = $1;`;\ndb.query(query, [input]);"
      },
      "provider": "local"
    }
  ]
}
```

---

## 实现细节

### Opengrep CLI 调用

```rust
pub struct OpengrepCaller {
    opengrep_path: PathBuf,
    timeout: Duration,
    max_concurrent: usize,
}

impl OpengrepCaller {
    pub async fn call(&self, args: Vec<String>, input: Option<String>) -> Result<String> {
        // 实现 CLI 调用逻辑
        // 支持超时和并发控制
    }
}
```

### 规则集管理

```rust
pub struct RuleSetManager {
    rule_sets: Vec<RuleSet>,
    cache: HashMap<String, Vec<Rule>>,
}

impl RuleSetManager {
    pub fn load(&mut self, paths: Vec<PathBuf>) -> Result<()> {
        // 从工作区/全局加载规则集
        // 支持 YAML 格式规则
    }
    
    pub fn filter(&self, filters: ScanFilters) -> Vec<Rule> {
        // 按 severity、language、tags 过滤规则
    }
}
```

### 增量扫描

```rust
pub struct FileChangeDetector {
    cache: Arc<RwLock<HashMap<String, String>>>, // file -> hash
}

impl FileChangeDetector {
    pub async fn detect_changes(&self, root: &Path) -> Result<Vec<String>> {
        // 检测变更文件
        // 对比缓存或 HEAD
    }
}
```

---

## 测试策略

### 单元测试
- 测试 Opengrep CLI 调用（Mock）
- 测试规则集加载和过滤
- 测试文件变更检测
- 测试结果过滤和合并

### 集成测试
- 测试完整扫描流程（使用真实 Opengrep CLI）
- 测试增量扫描流程

---

## 风险和挑战

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Opengrep CLI 不稳定 | 高 | 实现重试机制和错误恢复 |
| 扫描性能不足 | 中 | 实现并发控制和增量扫描 |
| 规则集格式不兼容 | 中 | 实现规则转换器 |
| 文件哈希冲突 | 低 | 使用 SHA256 哈希 |

---

## 参考资料

- [Opengrep 文档](https://github.com/opengrep/opengrep)
- [Semgrep 规则格式](https://semgrep.dev/docs/writing-rules/overview/)
- [MCP 工具规范](../02-mcp-spec.md)
- [扫描架构设计](../01-architecture.md)

---

**创建时间**: 2025-01-29  
**最后更新**: 2025-01-29
