# VSCode SAST AI 插件设计规范

**版本**: v1.0  
**日期**: 2025-01-29  
**作者**: GitAI Team  
**路径**: `/Users/huchen/Projects/gitai/`

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [核心数据流与交互场景](#3-核心数据流与交互场景)
4. [自动扫描与性能优化](#4-自动扫描与性能优化)
5. [Prompt 工程与上下文结构化](#5-prompt-工程与上下文结构化)
6. [MCP 工具定义与接口规范](#6-mcp-工具定义与接口规范)
7. [远程 SAST API 集成](#7-远程-sast-api-集成)
8. [VSCode Extension 实现架构](#8-vscode-extension-实现架构)
9. [测试策略](#9-测试策略)
10. [部署方案](#10-部署方案)
11. [后续开发路线图](#11-后续开发路线图)

---

## 1. 项目概述

### 1.1 目标

开发一个集成了 AI 能力的 SAST（静态分析）VSCode 插件，实现：

- **精确的漏洞检测**：结合本地引擎和远程 SAST 平台
- **智能的修复建议**：利用 VSCode AI 能力，基于深度上下文生成修复方案
- **无缝的开发体验**：通过 LSP（复用 Semgrep 插件驱动 Opengrep）+ AI Tool，支持实时守护、保存触发、提交前扫描

### 1.2 设计原则

1. **对外 MCP 输入/输出严格 JSON（版本化）**
2. **Server 默认策略用 TOML（可注释、可理解）**
3. **LSP 提供基础能力，AI Tool 提供增强能力**
4. **性能分层**：实时扫描走 LSP（复用 Semgrep 插件驱动 Opengrep） + MCP 深度扫描（保存/手动/提交前）

---

## 2. 整体架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VSCode Extension Layer                      │
│  ┌─────────────────────────┐  ┌──────────────────────┐              │
│  │ GitAI SAST Extension (TS)│  │   VSCode AI Bridge   │              │
│  │  - AI Fix/Explain        │  │   - LanguageModel API│              │
│  │  - Chat Participant      │  │   - Tool Registration│              │
│  │  - Commit Gate / Ignore  │  │   - Context Provider │              │
│  └──────────┬──────────────┘  └──────────┬───────────┘              │
│             │                              │                         │
│  ┌──────────▼───────────┐                  │                         │
│  │  Semgrep Extension    │                  │                         │
│  │  (LSP Client + UI)    │                  │                         │
│  │  - Diagnostics (live) │                  │                         │
│  └──────────┬───────────┘                  │                         │
└─────────────┼──────────────────────────┼───────────────────────────┘
              │                          │
              │   JSON-RPC (via MCP)     │
              │                          │
┌─────────────┼──────────────────────────┼───────────────────────────┐
│             │                          │                           │
│  ┌──────────▼──────────────────────────▼───────────┐               │
│  │           MCP Server (Rust - gitai-mcp)          │               │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │               │
│  │  │ Local    │  │ Remote   │  │ Context & CFG  │ │               │
│  │  │ Scanner  │  │ Scanner  │  │ Engine         │ │               │
│  │  │ (Opengrep│  │ (3 modes)│  │ (AST/Tree-sitter)│            │
│  │  │ + Native)│  │          │  │ (CodeQL integration)│          │
│  │  └──────────┘  └──────────┘  └────────────────┘ │               │
│  └─────────────────────────────────────────────────┘               │
└───────────────────────────────────────────────────────────────────┘

Semgrep Extension (LSP client)  ───────►  Opengrep (LSP server / CLI)
```

### 2.2 核心组件职责

| 组件                 | 职责                                            |
| -------------------- | ----------------------------------------------- |
| **GitAI VSCode Extension** | UI 层（AI/忽略/阻断）、AI 调用桥接、配置管理 |
| **Semgrep VSCode Extension** | 复用其 LSP Client + 现成 UI，提供实时 Diagnostics（后端切到 Opengrep） |
| **MCP Server**       | 扫描引擎（本地/远程）、上下文提取、CFG/污点分析 |
| **远程 SAST 平台**   | 深度扫描（CodeQL）、完整代码库分析              |

### 2.3 CodeQL 集成边界（可选）

#### 2.3.1 集成基本结论

- VSCode 的 CodeQL 插件通常不提供稳定、公开的编程 API 供第三方直接调用内部逻辑
- 轻量融合可以走 `vscode.commands.executeCommand('codeQL.*')` 做 UI 联动，但难以拿到结构化返回（不适合 AI 修复依赖的路径/节点数据）
- 若要获取结构化 CFG/数据流/路径信息，推荐直接调用 **CodeQL CLI** 产出 **SARIF**，从 `codeFlows` 提取路径信息

#### 2.3.2 两种融合方式（按推荐度排序）

**方式 A：命令联动（轻量、可选）**
- 目标：让用户“一键打开/跳转”到 CodeQL 结果/视图，提升融合感
- 手段：`vscode.commands.executeCommand('codeQL.runLocalQueryFromFileTab')` 等
- 局限：无法稳定获得结构化结果数据（不适合做 AI Fix 上下文）

**方式 B：CLI 联动（专业、推荐）**
- 目标：在 MCP 内通过 CLI 得到 SARIF（JSON），可稳定解析为 `taint_path`/`cfg` 等结构化上下文
- 产物：`.sarif`（重点字段：`runs[].results[].codeFlows` / `threadFlows` / `locations`）

#### 2.3.3 CodeQL CLI 路径探测策略（GitAI 不负责自动下载）

**必须显式配置**：仅使用 `sast.settings.json` 的 `codeql.cliPath`。

- 若 `codeql.enabled=true` 但 `codeql.cliPath` 为空：视为未启用 CodeQL 能力，并给出明确提示（fail-open）
- GitAI **不**尝试从 CodeQL 插件配置或系统 `PATH` 里自动探测 `codeql` 路径，以保证行为可控、可复现

#### 2.3.4 数据库复用与创建（P0 仅覆盖 JS/TS + Python）

**数据库来源（复用优先）：**
1. 用户通过 `sast.settings.json` 指定 `codeql.databasePath`（指向已存在 database 目录）
2. GitAI 维护缓存库：`~/.cache/gitai/codeql/<workspace-hash>/<language>/db`（不写入仓库）
3. 自动发现（可选）：在工作区内搜索 `codeql-database.yml` 所在目录；若仅命中一个 database，则提示用户确认后复用

**创建策略（仅对 JS/TS/Python 友好）：**
- JS/TS：`codeql database create <db> --language=javascript --source-root=<workspace>`
- Python：`codeql database create <db> --language=python --source-root=<workspace>`
- 更新策略：默认按需重建（例如当 `HEAD` 变化或用户手动触发“刷新数据库”）

> 说明：编译型语言（Java/C/C++/Go 等）往往需要 `--command` 构建步骤，成本和环境依赖更高，建议作为后续阶段单独设计。

#### 2.3.5 运行分析与 SARIF 解析（提取 `codeFlows`）

**运行分析（示例）：**
- `codeql database analyze <db> <suite.qls> --format=sarif-latest --output <out.sarif>`
- 为获得路径，需确保查询为 `@kind path-problem`（CodeQL security suite 中大量规则满足）

**SARIF → `taint_path` 的提取规则：**
- 遍历 `runs[].results[]`
- 从 `result.codeFlows[].threadFlows[].locations[]` 读取路径节点
- 节点位置：`location.physicalLocation.artifactLocation.uri` + `region.startLine/startColumn`
- 路径角色：默认 `第 1 个节点=source`、`最后 1 个节点=sink`、中间为 `flow`（可结合 `location.message.text` 做增强）

#### 2.3.6 与 GitAI Finding 的对齐与复用

- CodeQL 结果的 `ruleId`（查询 id）可作为 `rule_id`；可选从 `runs[].tool.driver.rules[]` 的 `tags/properties` 富化 CWE/严重性
- 当用户选中一个 Opengrep/远程 Finding 做 AI Fix 时：
  - 优先使用同源提供的污点路径（远程 `issueContent` 或本地 dataflow traces）
  - 若启用 CodeQL：用 `file+line`（或邻近范围）在 SARIF 里匹配最近结果，提取其 `codeFlows` 作为补充上下文
- 性能建议：CodeQL 分析仅在“手动深度扫描 / AI Fix / Explain”时触发，不作为 onSave/onCommit 的默认路径

#### 2.3.7 授权与合规提示

- CodeQL CLI/查询包的授权与分发在不同使用场景（开源/闭源/商业）可能存在约束，落地前需确认组织的许可策略
- GitAI 默认不下载/分发 CodeQL bundle：由用户/组织提供已安装的 CodeQL 环境

---

## 3. 核心数据流与交互场景

### 3.1 扫描触发时机

| 场景         | 触发时机                | 扫描引擎              | 预期延迟   |
| ------------ | ----------------------- | --------------------- | ---------- |
| **实时守护** | 文档变更（防抖 500ms）  | Semgrep 插件（Opengrep LSP） | 100-1000ms（取决于规则集/文件大小） |
| **保存触发** | `onDidSaveTextDocument` | MCP 本地深度扫描（Opengrep JSON） | 200-2000ms |
| **手动触发** | 用户命令/Quick Fix      | MCP 本地+远程（可选） | 200-2000ms |
| **提交前阻断** | Git `pre-commit` hook | Opengrep CLI（默认仅阻断本次改动引入的新问题） | 1-60s（可配置） |
| **后台扫描** | 工作区打开/空闲时       | MCP 批量扫描          | 异步       |

### 3.2 AI 修复流程

```
用户点击漏洞 → Quick Fix 菜单 → "AI Fix with SAST Context"
    ↓
获取上下文（代码片段/依赖/污点路径；CFG 如可用）
    ↓
构建 Prompt（注入 Semgrep 规则映射）
    ↓
调用 VSCode LanguageModel API
    ↓
解析 AI 响应（分析+代码+说明）
    ↓
可选：调用 MCP patch_validate 验证
    ↓
应用修复到编辑器
```

### 3.3 误报处理流程

```
规则扫描发现漏洞（仍可能误报）
    ↓
用户点击 "Ignore (False Positive)"
    ↓
选择忽略原因 + 添加备注
    ↓
写入 .vscode/sast.ignores.json
    ↓
后续扫描携带忽略列表进行过滤
```

---

## 4. 自动扫描与性能优化

### 4.1 配置系统 (`.vscode/sast.settings.json`)

```json
{
  "version": 1,
  "autoScan": {
    "onSave": {
      "enabled": true,
      "mode": "local",
      "debounceMs": 1000,
      "minLinesChanged": 5
    },
    "onCommit": {
      "enabled": true,
      "engine": "local",
      "blockPolicy": "new",
      "severityThreshold": "high",
      "maxWaitSeconds": 60,
      "failClosed": false
    }
  },
  "remoteScan": {
    "priority": {
      "critical": "always_remote",
      "high": "auto",
      "medium": "local_first",
      "low": "local_only"
    },
    "optimization": {
      "cacheEnabled": true,
      "batchRequests": true,
      "parallelScans": 3
    },
    "fallback": {
      "enabled": true,
      "fallbackToLocal": true
    }
  },
  "codeql": {
    "enabled": false,
    "cliPath": "",
    "databasePath": "",
    "cacheDir": "~/.cache/gitai/codeql",
    "analyze": {
      "maxWaitSeconds": 120,
      "threads": 0,
      "suite": {
        "javascript": "codeql-suites/javascript-security-and-quality.qls",
        "python": "codeql-suites/python-security-and-quality.qls"
      }
    }
  }
}
```

> 当 `codeql.enabled=true` 时，必须填写 `codeql.cliPath`，否则 GitAI 不会启用 CodeQL CLI/SARIF 链路。

### 4.2 性能优化策略

1. **实时扫描走 LSP**：复用 Semgrep 插件驱动 Opengrep LSP，避免在 Extension 内重复实现扫描器
2. **增量与去抖**：对 `onDidChangeTextDocument` 做防抖；保存/手动触发时仅扫描目标文件或变更文件集
3. **结果合并**：LSP 实时 Diagnostics（快） + MCP 深度扫描（富上下文/可远程）（慢）
4. **缓存与降级**：对同一文件+规则集的结果做短期缓存；超时/异常默认 fail-open（仅提示，不阻断）

### 4.3 复用 Semgrep 插件作为 Opengrep LSP Client（默认规则集选项 1）

> 说明：VS Code 插件市场目前只有 Semgrep 插件，没有官方 Opengrep 插件。本方案避免重复造轮子，复用 Semgrep 插件的 LSP Client + 结果面板，把其 CLI 指向 `opengrep`，从而获得实时 Diagnostics。

**Workspace settings（由命令 `GitAI: Enable Opengrep Backend` 写入 `.vscode/settings.json`，并可一键恢复）：**

```jsonc
{
  // Opengrep CLI 路径（示例：macOS/Linux）
  "semgrep.path": "${env:HOME}/.local/bin/opengrep",

  // 兼容性：Semgrep 插件在 metrics=true 时会向 LSP 传 --trace/--trace-endpoint，opengrep lsp 不支持
  "semgrep.metrics": false,

  // 兼容性：Semgrep 插件的 experimental LS 会传 --x-eio-ls，opengrep lsp 不支持
  "semgrep.useExperimentalLS": false,

  // 兼容性：Semgrep 插件会校验 CLI 版本；opengrep 的版本号格式不同
  "semgrep.ignoreCliVersion": true,

  // 默认规则集（选项 1）：高信噪比 + 覆盖 JS/TS/Python + Secrets
  "semgrep.scan.configuration": [
    "${env:HOME}/.cache/gitai/semgrep-rules/generic/secrets",
    "${env:HOME}/.cache/gitai/semgrep-rules/javascript/lang/security",
    "${env:HOME}/.cache/gitai/semgrep-rules/typescript/lang/security",
    "${env:HOME}/.cache/gitai/semgrep-rules/python/lang/security"
  ]
}
```

**生效方式：**
- 修改设置后执行 `semgrep.restartLanguageServer`（若命令不可用，则提示 Reload Window）。

### 4.4 提交前阻断（Commit Gate：默认只阻断“本次改动引入的新问题”）

**目标：**
- 默认仅阻断 *new findings*（相对 `HEAD` 基线新增），避免历史存量问题让团队无法提交
- 可通过配置切换为阻断 *all findings*

**安装方式：**
- 由 Extension 提供命令 `GitAI: Enable Commit Gate` 自动安装/维护 `.git/hooks/pre-commit`
- 若用户已有 `pre-commit`：默认不直接覆盖，采用“包装器”方式串联执行（旧 hook → GitAI hook），并提供一键回滚

**默认执行逻辑（本地 opengrep，不依赖 VSCode 是否开启）：**
1. 读取 staged 文件清单（`git diff --cached --name-only`），按语言/后缀过滤
2. 生成 staged 快照与基线快照（`HEAD`）的临时目录，仅写入需要扫描的文件
3. 分别运行 `opengrep scan`（同一套规则集 + ignores），产出 JSON 结果
4. 对 staged 结果做差分：`new = staged - baseline`（优先使用引擎 fingerprint；必要时做启发式匹配）
5. 若 `blockPolicy=new`：仅对 `new` 且 `severity>=severityThreshold` 的结果返回非 0；否则仅输出告警
6. 规则集来源：优先读取工作区 `semgrep.scan.configuration`（保证编辑器实时告警与提交阻断一致）；否则回退到 GitAI 默认规则集

**失败与超时策略：**
- 默认 fail-open：扫描失败/超时仅提示，不阻断提交（`failClosed=true` 时反之）
- 支持标准 `git commit --no-verify` 跳过 hooks

---

## 5. Prompt 工程与上下文结构化

### 5.1 Prompt 模板层级

```
系统默认模板 → 项目级 .vscode/sast.prompts.json → 用户级 settings.json
```

### 5.2 配置示例

```json
{
  "version": 1,
  "semgrepRuleMapping": {
    "sqlalchemy-sql-injection": {
      "template": "sql-injection",
      "requiredContext": ["taint_path", "sqlalchemy_api"]
    }
  },
  "cweMapping": {
    "CWE-89": "sql-injection",
    "CWE-79": "xss"
  },
  "templates": {
    "sql-injection": {
      "systemMessage": "你是 SQLAlchemy 安全专家...",
      "userMessage": "检测到 SQL 注入漏洞。\n\n## 污点路径\n{taint_path}\n\n## 代码片段\n{code_snippet}\n\n请提供使用 bind params 的修复方案。",
      "modelParams": {
        "temperature": 0.2,
        "maxTokens": 3000
      }
    }
  }
}
```

> 说明：远程 SAST `getResultList` 不一定直接提供 CWE 等标准字段（通常只有 `knowledgeId`/`category`/`issueZhName`/`issueContent`）。因此 Prompt 选型不应强依赖 CWE：优先用 `rule_id`（Semgrep 规则 ID 或远程 `knowledgeId`）与 `category` 做映射；如确有需要再通过额外接口做 CWE 富化或维护静态映射表。

### 5.3 Semgrep 规则映射

| Semgrep 规则 ID                                 | Prompt 模板        | 上下文要求                     |
| ----------------------------------------------- | ------------------ | ------------------------------ |
| `sqlalchemy-sql-injection`                      | `sql-injection`    | `taint_path`, `sqlalchemy_api` |
| `javascript.express.security.express-injection` | `xss`              | `taint_path`, `dom_operations` |
| `javascript.lang.security.hardcoded-secrets`    | `hardcoded-secret` | `secret_type`, `file_path`     |

---

## 6. MCP 工具定义与接口规范

### 6.1 工具清单

| 工具名           | 用途                              |
| ---------------- | --------------------------------- |
| `scan`           | 本地代码扫描                      |
| `scan_remote`    | 远程扫描（snippet/local_project/git_diff/full） |
| `get_context`    | 获取漏洞上下文（AST/依赖）        |
| `get_taint_path` | 获取污点路径（优先远程 issueContent；可选 CodeQL SARIF codeFlows） |
| `patch_validate` | 验证修复补丁                      |
| `list_ignores`   | 列出忽略项                        |
| `add_ignore`     | 添加忽略标记                      |
| `remove_ignore`  | 移除忽略标记                      |

### 6.2 关键工具规范

#### 6.2.1 `scan` - 本地扫描

**请求：**

```json
{
  "name": "scan",
  "arguments": {
    "version": 1,
    "root": "/path/to/workspace",
    "files": { "src/main.rs": "完整内容" },
    "ignores": [
      { "file": "src/config.ts", "line": 42, "rule_id": "hardcoded-secret" }
    ],
    "config": {
      "severity_threshold": "medium",
      "enable_opengrep": true,
      "include_snippets": true
    }
  }
}
```

**响应：**

```json
{
  "version": 1,
  "status": "success",
  "scan_envelope": { ... },
  "findings": [
    {
      "id": "vuln-001",
      "rule_id": "typescript.lang.security.sql-injection",
      "type": "sql-injection",
      "severity": "high",
      "title": "Unsanitized user input in SQL query",
      "location": { "file": "src/api/user.ts", "line": 42 }
    }
  ]
}
```

#### 6.2.2 `scan_remote` - 远程扫描

**请求：**

```json
{
  "name": "scan_remote",
  "arguments": {
    "version": 1,
    "mode": "snippet",
    "snippet": {
      "file": "src/api/user.ts",
      "code": "const query = `SELECT * FROM users WHERE name = '${input}'`;",
      "language": "typescript"
    },
    "config": {
      "timeout_seconds": 30,
      "enable_codeql": true
    }
  }
}
```

> 注意：`scan_remote.config.enable_codeql`（如保留）指远程平台侧是否启用 CodeQL 等后端能力；与本地 `codeql`（2.3/4.1）通过 CodeQL CLI 产出 SARIF 的链路是两条独立能力，避免混淆。

#### 6.2.3 `get_taint_path` - 污点路径（远程 issueContent / CodeQL SARIF）

**请求：**

```json
{
  "name": "get_taint_path",
  "arguments": {
    "version": 1,
    "root": "/path/to/workspace",
    "finding": {
      "provider": "local|remote|codeql",
      "id": "optional-id",
      "rule_id": "optional-rule-id",
      "location": { "file": "src/api/user.ts", "line": 42 }
    },
    "provider_preference": ["remote", "codeql"],
    "config": {
      "timeout_seconds": 30,
      "max_steps": 50
    }
  }
}
```

**响应：**

```json
{
  "version": 1,
  "status": "success",
  "taint_path": {
    "provider": "remote|codeql",
    "steps": [
      {
        "order": 1,
        "role": "source|flow|sink",
        "location": { "file": "src/api/user.ts", "line": 10, "column": 1 },
        "symbol": "req.body.id",
        "message": "变量/字段作为源头被污染"
      }
    ]
  }
}
```

#### 6.2.4 `patch_validate` - 补丁验证

**请求：**

```json
{
  "name": "patch_validate",
  "arguments": {
    "version": 1,
    "root": "/path/to/workspace",
    "diff": "--- src/api/user.ts\n+++ src/api/user.ts\n...",
    "policy": "strict",
    "findings_files": ["src/api/user.ts"]
  }
}
```

---

## 7. 远程 SAST API 集成

### 7.1 API 映射

| 功能     | 远程 API                              | MCP 工具        |
| -------- | ------------------------------------- | --------------- |
| 提交扫描 | `putGitSvnProject`, `putLocalProject` | `scan_remote`   |
| 获取结果 | `getScanResult`                       | 内部轮询        |
| 获取详情 | `getResultList`, `riskSearch`         | 解析为 findings |
| 签名生成 | MD5(timestamp + params)               | Rust 实现       |

### 7.2 扫描模式

| 模式         | 远程 API                         | 使用场景      |
| ------------ | -------------------------------- | ------------- |
| **snippet**  | `uploadFile` + `putLocalProject` | 当前文件/片段（快，但可能缺少完整污点路径） |
| **local_project** | `putLocalProject`           | 需要更完整污点路径/跨文件上下文（需显式授权） |
| **git_diff** | `putGitSvnProject` (commitId)    | 提交前扫描    |
| **full**     | `putGitSvnProject` (branch)      | 完整项目扫描  |

### 7.3 状态映射

| 远程状态 | 说明         | MCP 状态       |
| -------- | ------------ | -------------- |
| 1        | 空闲状态     | -              |
| 2        | 正在排队     | `queued`       |
| 3        | 正在检测     | `scanning`     |
| 4        | 检测成功     | `success`      |
| 5        | 扫描失败     | `failed`       |
| 8        | 正在拉取代码 | `pulling_code` |

### 7.4 `getResultList` 字段解析（远程仅提供污点路径为主）

> 关键事实：远程 SAST 接口通常只返回“污点路径（taint path）”相关信息，不保证提供完整的 `filePath` / `ruleId` / `CWE` 等标准字段；需要做解析与映射。

**1) 文件路径与行号：`issuePath`**
- 字段示例：`"/src/main/java/org/joychou/controller/SQLI.java(100)"`
- 解析：`/(.+)\\((\\d+)\\)$/` → `file` 与 `line`（行号为 1-based）
- 路径归一化：远程路径通常是“仓库根目录相对路径 + 前导 `/` + POSIX 分隔符”，落地到本地需 `join(workspaceRoot, issuePathWithoutLeadingSlash)` 并做平台兼容

**2) 规则标识：`knowledgeId` / `category`**
- 远程不保证返回 Semgrep 风格 `rule_id` 或标准 `CWE-xxx`
- 推荐将 `knowledgeId` 作为远程规则唯一标识（`rule_id`），并保留 `category` 作为分类字段

**3) 污点路径：`issueContent`**
- 字段为 JSON 字符串，结构类似：`sink1`（源头）→ `sink2...`（流转）→ `sink`（爆发点）
- 每一步常见字段：
  - `aly`：形如 `"SQLI.java(100) : getConnection"`（包含文件/行/符号，需要二次解析）
  - `aly_comment`：该步说明（source 污染、transform、sink 风险函数等）
- 解析建议：
  1. `JSON.parse(issueContent)` 得到对象
  2. 收集并排序 `sink\\d+`，最后追加 `sink`
  3. 将每一步映射为统一 `taint_path.steps[]`：`{order, role(source|flow|sink), file, line, symbol, comment}`

### 7.5 snippet → local_project 升级策略（为获取完整污点路径）

- 默认先用 `snippet`（快、数据小）；若结果缺少 `issueContent` 或路径不完整，则提示升级为 `local_project`
- `local_project` 需要上传更大范围代码：默认打包“git tracked + 未提交改动文件”，展示清单与大小预估，并提供“仅本工作区始终允许/随时撤销”的用户授权
- 非受信任工作区（Workspace Trust 未通过）默认禁用 `local_project` 上传，防止意外外传代码
---

## 8. VSCode Extension 实现架构

### 8.1 项目结构

```
vscode-sast-extension/
├── package.json
├── src/
│   ├── extension.ts           # 入口
│   ├── core/
│   │   ├── SastScanner.ts
│   │   ├── DiagnosticManager.ts
│   │   └── IgnoreManager.ts
│   ├── integrations/
│   │   └── SemgrepBridge.ts    # 复用 Semgrep 插件：配置 Opengrep 后端 & 读取实时 Diagnostics
│   ├── mcp/
│   │   ├── McpClient.ts
│   │   └── McpTransport.ts
│   ├── ai/
│   │   ├── LanguageModelBridge.ts
│   │   └── PromptBuilder.ts
│   ├── ui/
│   │   ├── CodeActionsProvider.ts
│   │   └── ChatParticipant.ts
│   └── auto/
│       ├── AutoScanner.ts
│       └── CommitScanner.ts
└── resources/
    └── icons/
```

### 8.2 核心模块

#### 8.2.1 SastScanner

```typescript
class SastScanner {
  async scanLocal(files: Record<string, string>): Promise<ScanResult>;
  async scanRemote(options: {
    mode;
    snippet;
    gitDiff;
    fullScan;
  }): Promise<ScanResult>;
  async scanGitDiff(options: { baseCommit; targetCommit }): Promise<ScanResult>;
  async getContext(findingId, file, line): Promise<Context>;
  async validatePatch(diff): Promise<ValidationResult>;
}
```

#### 8.2.2 McpClient

```typescript
class McpClient {
  async start(): Promise<void>;
  async stop(): Promise<void>;
  async callTool(request: ScanRequest): Promise<McpResponse>;
  async listTools(): Promise<ToolList>;
}
```

#### 8.2.3 LanguageModelBridge

```typescript
class LanguageModelBridge {
  async generateFix(finding: Vulnerability, context: Context): Promise<Fix>;
  async explainVulnerability(finding: Vulnerability): Promise<string>;
}
```

#### 8.2.4 SemgrepBridge（Opengrep 后端启用器）

- 探测 `semgrep.semgrep` 插件是否安装
- 通过 workspace settings 写入/恢复 Semgrep 配置（`semgrep.path`/`semgrep.scan.configuration` 等），使其后端切到 `opengrep`
- 订阅 VSCode Diagnostics（`vscode.languages.onDidChangeDiagnostics`），筛选 `source=Semgrep` 的告警并映射为统一 Finding，用于 AI Fix/Commit Gate/忽略列表过滤

---

## 9. 测试策略

### 9.1 测试金字塔

```
        E2E Tests (少量)
       ┌──────────┐
       │ UI & 流程 │
       └─────┬────┘
    Integration Tests (适量)
       ┌──────────┐
       │ MCP 通信  │
       └─────┬────┘
     Unit Tests (大量)
      ┌──────────┐
      │ 逻辑函数  │
      └──────────┘
```

### 9.2 单元测试

- 范围：`PromptBuilder`, `McpClient`, `SastScanner`, `IgnoreManager`, `SarifParser(CodeQL)`, `IssueContentParser(Remote)`
- 工具：Jest (TS) / Cargo Test (Rust)

### 9.3 集成测试

- Extension ↔ MCP Server 通信
- MCP Server ↔ Mock 远程 SAST
- MCP Server ↔ CodeQL CLI（可用 fixture SARIF 做离线测试，避免依赖真实数据库）
- 配置加载与合并

### 9.4 E2E 测试

- 工具：`@vscode/test-electron`
- 场景：扫描流程、Quick Fix 交互、忽略机制

---

## 10. 部署方案

### 10.1 MCP Server 打包

**支持平台：**

- Windows (x86_64)
- Linux (x86_64)
- macOS (x86_64, arm64)

**流程：**

1. 跨平台编译 Rust 二进制
2. 复制到 Extension 的 `bin/` 目录
3. Extension 启动时加载对应平台的二进制

### 10.2 Extension 打包与发布

1. 运行 `npm run compile`
2. 运行 `vsce package` 生成 `.vsix`
3. 发布到 VSCode Marketplace

### 10.3 配置管理

- 敏感信息（远程 SAST Token/API Key）存储在 VSCode `SecretStorage`（避免落盘到 `settings.json`）
- 非敏感配置存储在用户/工作区设置中（并避免提交到 Git）
- 首次启动向导引导用户输入

---

## 11. 后续开发路线图

### 第一阶段：基础扫描（P0）

- [ ] 实现本地扫描引擎
- [ ] 实现 MCP Server 基础框架
- [ ] Extension 基础 UI（Diagnostics + Code Actions）

### 第二阶段：AI 修复（P0）

- [ ] 实现 Prompt Builder 和模板系统
- [ ] 集成 VSCode LanguageModel API
- [ ] 实现修复生成和应用

### 第三阶段：远程扫描（P0）

- [ ] 实现远程 SAST API 客户端
- [ ] 集成签名生成和轮询逻辑
- [ ] 支持三种扫描模式

### 第四阶段：自动扫描（P1）

- [ ] 实现保存触发扫描
- [ ] 实现提交前扫描
- [ ] 实现配置系统

### 第五阶段：增强功能（P2）

- [ ] 实现 Chat Participant (@sast)
- [ ] 实现忽略管理面板
- [ ] 实现 CFG 和污点路径展示
- [ ] 可选：CodeQL CLI + SARIF(codeFlows) 上下文提取与复用

### 第六阶段：IDE 兼容（P3）

- [ ] 支持 Cursor
- [ ] 支持 JetBrains
- [ ] 支持 Antigravity

---

**文档结束**

**修改历史：**

- 2025-01-29: 初始版本
