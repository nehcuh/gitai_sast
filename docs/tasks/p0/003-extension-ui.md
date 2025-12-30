# P0-003: Extension 基础 UI

> **优先级**: P0  
> **状态**: 📝 待开始  
> **预计工时**: 24 小时  
> **负责**: 待定  
> **阶段**: Phase 0

---

## 任务概述

实现 VSCode Extension 的基础 UI 功能，包括诊断信息显示、Code Actions、问题列表等，与 Semgrep Extension 集成（复用其 LSP Client 驱动 Opengrep）。

---

## 依赖关系

- **前置依赖**: P0-002: MCP Server 框架
- **后续依赖**: 
  - P0-004: AI 修复功能
  - P1-001: 自动扫描系统
  - P1-007: 用户配置向导

---

## 验收标准

- [ ] 支持显示扫描发现的 Diagnostics（source=SAST）
- [ ] 支持 Quick Fix 菜单（AI Fix、Ignore 等）
- [ ] 支持忽略问题功能（写入 .vscode/sast.ignores.json）
- [ ] 支持查看问题详情面板
- [ ] 与 Semgrep Extension 集成（复用其 LSP Client）
- [ ] 支持实时 Diagnostics（通过 Semgrep LSP）
- [ ] 编写 E2E 测试

---

## 子任务列表

### 1. 设计 Extension 架构 (4h)
- [ ] 定义模块结构
- [ ] 定义核心组件接口
- [ ] 设计 Semgrep 集成方案

### 2. 实现 DiagnosticManager (4h)
- [ ] 实现诊断信息收集（来自 MCP Server + Semgrep LSP）
- [ ] 实现诊断信息显示
- [ ] 实现诊断信息过滤和排序

### 3. 实现 CodeActionsProvider (4h)
- [ ] 实现 AI Fix Code Action
- [ ] 实现 Ignore Code Action
- [ ] 实现 View Details Code Action

### 4. 实现 IgnoreManager (4h)
- [ ] 实现忽略项添加
- [ ] 实现忽略项删除
- [ ] 实现忽略列表持久化

### 5. 实现 SemgrepBridge (4h)
- [ ] 实现 Semgrep 插件探测
- [ ] 实现 Workspace Settings 写入（配置 Opengrep）
- [ ] 实现实时 Diagnostics 订阅

### 6. 实现结果面板 Webview (4h)
- [ ] 实现结果列表展示
- [ ] 实现问题详情展示
- [ ] 实现搜索和过滤

### 7. 编写 E2E 测试 (4h)

---

## 技术方案

### 架构设计

```
VSCode Extension (TS)
├── Core
│   ├── SastScanner (MCP Client)
│   ├── DiagnosticManager
│   └── IgnoreManager
├── Integrations
│   └── SemgrepBridge
├── UI
│   ├── CodeActionsProvider
│   └── ResultPanel (Webview)
└── Auto
    ├── AutoScanner
    └── CommitScanner
```

### 核心组件

```typescript
// src/core/DiagnosticManager.ts
class DiagnosticManager {
  updateDiagnostics(uri: Uri, findings: Finding[]): void;
  getDiagnostics(uri: Uri): Diagnostic[];
  filterDiagnostics(filters: DiagnosticFilters): Diagnostic[];
}

// src/integrations/SemgrepBridge.ts
class SemgrepBridge {
  enableOpengrepBackend(): Promise<void>;
  restoreSemgrepBackend(): Promise<void>;
  subscribeDiagnostics(callback: (diags: Diagnostic[]) => void): void;
}

// src/ui/CodeActionsProvider.ts
class SastCodeActionsProvider implements CodeActionProvider {
  provideCodeActions(document: TextDocument, range: Range): CodeAction[];
}
```

---

## 参考资料

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Semgrep Extension](https://github.com/semgrep/semgrep-vscode)
- [MCP Client 实现](../../src/mcp/McpClient.ts)

---

**创建时间**: 2025-01-29
