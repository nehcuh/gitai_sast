# GitAI SAST 统一任务清单（合并版）

> **目的**：把 `docs/tasks/*`（2025-01-29）与 `docs/implementation-roadmap.md`（2025-12-31）合并为**唯一可追踪**的开发任务清单，并在这里维护任务状态。

## 合并规则

- `P0/P1/P2/P3-*`：沿用 `docs/README.md` 的优先级任务编号。
- `PH1/PH2/PH3-*`：来自 `docs/implementation-roadmap.md` 的 Phase 任务。
- `GAP-*`：**新增**，来自 2026-01-01 差距分析（Gap Analysis）。

## 状态定义

- 📝 待开始：只有文档/占位，或未看到实现痕迹
- 🔄 进行中：已有部分实现，但**未接入主流程**或**未满足验收标准**
- 🚧 模拟/Mock：逻辑已联调，但核心实现是 Mock 的（需重点关注）
- ✅ 已完成：验收标准已满足，且已接入主流程（如 Extension `activate` / MCP tool 注册），可稳定使用
- ⏸️ 已暂停 / ❌ 已取消：按需要补充

## 任务清单（按优先级）

### P0（阻断性 - 核心路径）

| ID | 任务 | 状态 | 关键缺口（与验收差距） | 证据/入口 |
|---|---|---|---|---|
| P0-001 | 本地扫描引擎实现 | ⚠️ | 实现了基础 Opengrep 扫描，但**无并发控制**（资源风险）；内部增量逻辑缺失（依赖外部传入） | `src/mcp-server/src/scanner/opengrep.rs` |
| P0-002 | MCP Server 框架 | 🔄 | SSE 传输未做；`get_context` 仍为 TODO | `src/mcp-server/src/main.rs`, `src/mcp-server/src/tools/get_context.rs` |
| P0-003 | Extension 基础 UI | 🔄 | 基础 Webview 存在；忽略规则未贯穿 scan/auto-scan | `src/extension/src/extension.ts` |
| P0-004 | AI 修复功能 | ✅ | `@sast fix` 已连接 `AiFixProvider` 并真实调用 LLM；UI 基本可用 | `src/extension/src/ai/AiFixProvider.ts`, `src/extension/src/commands/aiFix.ts` |
| GAP-001 | **ExplainHandler 实现** | 🚧 | **严重**：`@sast explain` 目前是 Mock 实现，未调用 LLM；需对接 `AiFixProvider` | `src/extension/src/chat/handlers/ExplainHandler.ts` |
| P0-005 | 远程 SAST 集成 | 🔄 | 仅覆盖部分流程；多扫描模式/降级策略未齐 | `src/mcp-server/src/scanner/remote.rs` |

### P1（严重 - 体验与稳定性）

| ID | 任务 | 状态 | 关键缺口（与验收差距） | 证据/入口 |
|---|---|---|---|---|
| GAP-002 | **FixDiffViewer 健壮性** | 🔄 | 目前使用 Regex/String 匹配原文，对空白/格式敏感，容易匹配失败（"Best Effort" 风险） | `src/extension/src/ui/FixDiffViewer.ts` |
| GAP-003 | **Scanner 并发控制** | 📝 | `opengrep.rs` 使用 `spawn_blocking` 但无 Semaphore，大量文件扫描可能耗尽资源 | `src/mcp-server/src/scanner/opengrep.rs` |
| P1-001 | 自动扫描系统 | 🔄 | 目前主要是 onSave；后台/增量/策略化触发尚未齐 | `src/extension/src/extension.ts` |
| P1-003 | 配置管理系统 | 🔄 | 配置分散；缺少 `.vscode/sast.settings.json` 统一加载 | `src/extension/package.json` |
| P1-004 | 错误处理与降级 | 🔄 | 远程失败切本地、统一错误展示未系统化 | `src/mcp-server/src/scanner/error.rs` |

### P2（重要 - 功能完整性）

| ID | 任务 | 状态 | 关键缺口（与验收差距） | 证据/入口 |
|---|---|---|---|---|
| P2-001 | Chat Participant (@sast) | 🔄 | 框架已通；`Fix` 可用；`Explain` 需修复（GAP-001）；`Taint` 需验证 MCP 对接 | `src/extension/src/chat/SastChatParticipant.ts` |
| P2-002 | 忽略管理面板 | 🔄 | 已有 Ignore 规则文件与命令，缺少 UI 面板 | `src/extension/src/codeactions/IgnoreManager.ts` |
| P2-003 | 污点路径可视化 | 🔄 | `get_taint_path` 存在但需验证 MCP 返回格式 | `src/mcp-server/src/tools/get_taint_path.rs` |
| P2-007 | 数据安全设计 | 🔄 | 工作区信任/证书配置存在但未形成完整策略 | `src/extension/src/trust/TrustManager.ts` |

### P3（优化 - 长期规划）

| ID | 任务 | 状态 | 备注 |
|---|---|---|---|
| P3-001 | Cursor/JB 支持 | 📝 | 暂未开始 |
| P3-006 | CI/CD 集成 | 📝 | 暂未开始 |

---

## 2026-01-01 评审修正计划（GAP Fix Plan）

针对 Gap Analysis 发现的问题，建议优先执行以下任务（Priority Order）：

1.  **[P0] GAP-001: Implement ExplainHandler**
    -   目标：替换 Mock 实现，使用 `AiFixProvider` 生成真实的解释。
    -   验证：`@sast explain` 返回动态内容而非硬编码模板。

2.  **[P1] GAP-002: Enhance FixDiffViewer**
    -   目标：改进 `applyFix` 逻辑，支持模糊匹配或 AST 辅助匹配。
    -   验证：修改代码格式后，AI Fix 仍能正确应用。

3.  **[P1] GAP-003: OpengrepScanner Concurrency**
    -   目标：在 rust 层添加 `tokio::Semaphore` 限制并发扫描数（如 CPU 核数 * 2）。
    -   验证：扫描大量小文件时不导致系统卡顿。

4.  **[P2] Verify MCP Taint Tool**
    -   目标：确认 `get_taint_path` 能正确解析 opengrep/remote 结果并返回给 extension。
    -   验证：`@sast taint` 命令能展示有效路径。
